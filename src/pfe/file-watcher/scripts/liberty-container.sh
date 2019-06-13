#!/bin/bash
#*******************************************************************************
# Copyright (c) 2019 IBM Corporation and others.
# All rights reserved. This program and the accompanying materials
# are made available under the terms of the Eclipse Public License v2.0
# which accompanies this distribution, and is available at
# http://www.eclipse.org/legal/epl-v20.html
#
# Contributors:
#     IBM Corporation - initial API and implementation
#*******************************************************************************
source /file-watcher/scripts/.env

ROOT=$1
LOCAL_WORKSPACE=$2
PROJECT_ID=$3
COMMAND=$4
CONTAINER_NAME=$5
logName=$7
START_MODE=$8
DEBUG_PORT=$9
FOLDER_NAME=${11}
MAVEN_SETTINGS=${12}

WORKSPACE=/microclimate-workspace
APP_LOG=app
LOG_FOLDER=$WORKSPACE/.logs/$FOLDER_NAME

echo "*** JAVA"
echo "*** PWD = $PWD"
echo "*** ROOT = $ROOT"
echo "*** LOCAL_WORKSPACE = $LOCAL_WORKSPACE"
echo "*** PROJECT_ID = $PROJECT_ID"
echo "*** COMMAND = $COMMAND"
echo "*** CONTAINER_NAME = $CONTAINER_NAME"
echo "*** START_MODE = $START_MODE"
echo "*** DEBUG_PORT = $DEBUG_PORT"
echo "*** HOST_OS = $HOST_OS"
echo "*** MAVEN_SETTINGS = $MAVEN_SETTINGS"

# Import general constants
source /file-watcher/scripts/constants.sh

projectName=$( basename "$ROOT" )
util=/file-watcher/scripts/util.sh

cd "$ROOT"

# Create this directory because the generated Dockerfile expects
# it to exist
mkdir -p target/liberty/wlp/usr/shared/resources

function create() {
		# Set the initial state to stopped
	$util updateAppState $PROJECT_ID $APP_STATE_STOPPED

	# Check if artifacts.tar.gz is present in /file-watcher/idc/artifacts
	# If yes, do nothing. If not, archive /file-watcher/idc/artifacts
	# We save the archive one dir up, because s390x & ppc64 cannot
	# handle tar saving file to dir being archived, when archiving.
	# Archiving is done to preserve permissions of the script files 
	# since Websphere Liberty Docker images now run as non-root.
	if [ ! -f /file-watcher/idc/artifacts/artifacts.tar.gz ]; then
		echo "Archiving /file-watcher/idc/artifacts dir"
		tar czf /file-watcher/idc/artifacts.tar.gz -C /file-watcher/idc/artifacts .
		mv /file-watcher/idc/artifacts.tar.gz /file-watcher/idc/artifacts/artifacts.tar.gz
		chmod -R +rx /file-watcher/idc/artifacts/artifacts.tar.gz
	fi

	# Change owner of .logs and root dir to default/1001 user,
	# as Liberty docker image now runs as non-root(default user)
	# and we need logs and root dir owner to be default/1001
	# for init_kubernetes_pod.sh symlinks. Otherwise, mvn builds
	# will fail as it does not have perms to create target dir.
	echo "chown .logs and project root dir for user 1001"
	chown -R 1001 /microclimate-workspace/.logs
	chown -R 1001 "/microclimate-workspace/$projectName"

	# Give permission to the group (root group) since user 1001 may 
	# not exist in other workspace containers but belongs to the root 
	# group which other workspace containers' users belong to as well
	echo "chmod g=rwx the project root dir for user 1001"
	chmod -R g=rwx "/microclimate-workspace/$projectName"

	echo "First time setup of app $ROOT"
	
	# Check if the Liberty app / JDK image has finished downloading and is cached
	if [ -f $LOCAL_WORKSPACE/.logs/jdk_cache.log ] && [ ! "$(docker images -q mc-liberty-jdk-cache)" ]; then
		DOCKER_PS="ps | grep -v 'grep' | grep '$LIBERTY_BUILD_TEMPLATE'"
		if [ "$( eval $DOCKER_PS )" ]; then
			echo "Waiting for the Liberty app image to be downloaded $(date)"
			COUNTER=0
			while [ ! "$(docker images -q mc-liberty-jdk-cache)" ] && [ $COUNTER -le 300 ] && [ eval $DOCKER_PS ]; do
				sleep 1;
				COUNTER=$((COUNTER+1))
			done
			echo "The Liberty app image has been downloaded and cached $(date)"
		fi
	fi
	
	# Set IDC to dev mode
	/file-watcher/idc/idc dev
	
	# Setup IDC Options
	/file-watcher/idc/idc set --localWorkspaceOrigin=$LOCAL_WORKSPACE
	
	if [ $CONTAINER_NAME ]; then
		/file-watcher/idc/idc set --containerName=$CONTAINER_NAME
	fi
	
	# Setting logName with old hash logic, as portal is looking for logname in .inf for existing proj
	# Refer to projectUtil.js getLogName function for usage
	if [ $logName ]; then
		/file-watcher/idc/idc set --logName=$logName
	fi
	
	if [ $PROJECT_ID ]; then
		/file-watcher/idc/idc set --projectID=$PROJECT_ID
	else
		echo "Error: no project id passed in to liberty-container.sh for $projectName" >&2
	fi
	
	if [ "$HOST_OS" == "windows" ]; then
		/file-watcher/idc/idc set --hostOS=$HOST_OS
	fi

	if [[ ( "$IN_K8" == "true" ) && ($DOCKER_REGISTRY) ]]; then
		/file-watcher/idc/idc set --dockerRegistry=$DOCKER_REGISTRY
	fi

	if [[ -n $START_MODE ]]; then
		/file-watcher/idc/idc set --startMode=$START_MODE
	fi

	if [[ -n $DEBUG_PORT ]]; then
		/file-watcher/idc/idc set --debugPort=$DEBUG_PORT
	fi

	# Build the application for the first time
	echo "idc build started for $ROOT $(date)"
	/file-watcher/idc/idc build --mavenSettings="$MAVEN_SETTINGS"

	# get the status code of the build, if the build failed, update the status
	if [[ $? -ne 0 ]]; then
		echo "idc build failed for $ROOT $(date)"
    	$util updateBuildState $PROJECT_ID $BUILD_STATE_FAILED "containerBuildTask.containerBuildFailDockerfileGenerate"
	else
		echo "idc build finished for $ROOT $(date)"
		# Start the status tracker
		echo "idc status-tracker for $ROOT $(date)"
		/file-watcher/idc/idc status-tracker &
		echo "idc status-tracker started for $ROOT $(date)"

		echo -e "Touching application log file: "$LOG_FOLDER/$APP_LOG.log""
		touch "$LOG_FOLDER/$APP_LOG.log"
		echo -e "Triggering log file event for: application log"
 		$util newLogFileAvailable $PROJECT_ID "app"

		 # add the app logs
		echo -e "App log file "$LOG_FOLDER/$APP_LOG.log""
		if [ "$IN_K8" != "true" ]; then
			docker logs -f $CONTAINER_NAME >> "$LOG_FOLDER/$APP_LOG.log" &
		else
			kubectl logs -f $(kubectl get po -o name --selector=release=$CONTAINER_NAME) >> "$LOG_FOLDER/$APP_LOG.log" &
		fi
	fi
}

# Create the application image and container and start it
if [ "$COMMAND" == "create" ]; then
	create
# Update the application
elif [ "$COMMAND" == "update" ]; then
	echo "File changes detected for app $ROOT. Initiating update."

	if [[ -n $START_MODE ]]; then
		/file-watcher/idc/idc set --startMode=$START_MODE
	fi

	echo "idc build started for $ROOT $(date)"
	/file-watcher/idc/idc build --mavenSettings="$MAVEN_SETTINGS"
	echo "idc build finished for $ROOT $(date)"

# Stop the server
elif [ "$COMMAND" == "stop" ]; then
	echo "idc stop for $ROOT $(date)"
	/file-watcher/idc/idc stop
	echo "idc stop completed for $ROOT $(date)"

# Start the server
elif [ "$COMMAND" == "start" ]; then

	if [[ -n $START_MODE ]]; then
		/file-watcher/idc/idc set --startMode=$START_MODE
	fi

	echo "idc start for $ROOT $(date)"
	/file-watcher/idc/idc start
	echo "idc start completed for $ROOT $(date)"

# Remove the application
elif [ "$COMMAND" == "remove" ]; then
	echo "Removing the container for app $ROOT."
	/file-watcher/idc/idc container-remove

elif [ "$COMMAND" == "rebuild" ]; then
	echo "Removing the container for app $ROOT."
	/file-watcher/idc/idc container-remove
	echo "recreate the container for app $ROOT."
	create

else
	echo "ERROR: $COMMAND is not a recognized command" >&2
fi

cd -
