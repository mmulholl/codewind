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

ROOT=$1
LOCAL_WORKSPACE=$2
PROJECT_ID=$3
COMMAND=$4
CONTAINER_NAME=$5
AUTO_BUILD_ENABLED=$6
LOGNAME=$7
START_MODE=$8
DEBUG_PORT=$9
FORCE_ACTION=${10}
FOLDER_NAME=${11}

WORKSPACE=/microclimate-workspace

DOCKER_BUILD=docker.build
APP_LOG=app

LOG_FOLDER=$WORKSPACE/.logs/$FOLDER_NAME

echo "*** NODE.JS"
echo "*** PWD = $PWD"
echo "*** ROOT = $ROOT"
echo "*** LOCAL_WORKSPACE = $LOCAL_WORKSPACE"
echo "*** PROJECT_ID = $PROJECT_ID"
echo "*** COMMAND = $COMMAND"
echo "*** CONTAINER_NAME = $CONTAINER_NAME"
echo "*** AUTO_BUILD_ENABLED = $AUTO_BUILD_ENABLED"
echo "*** LOGNAME = $LOGNAME"
echo "*** START_MODE = $START_MODE"
echo "*** DEBUG_PORT = $DEBUG_PORT"
echo "*** FORCE_ACTION = $FORCE_ACTION"
echo "*** LOG_FOLDER = $LOG_FOLDER"

tag=microclimate-dev-nodejs
projectName=$( basename "$ROOT" )
project=$CONTAINER_NAME

# Cache constants
dockerfile=Dockerfile
dockerfileKey=DOCKERFILE_HASH
dockerfileTools=Dockerfile-tools
dockerfileToolsKey=DOCKERFILE_TOOLS_HASH
packageJson=package.json
packageJsonKey=PACKAGE_JSON_HASH
nodemonJson=nodemon.json
nodemonJsonKey=NODEMON_JSON_HASH
chartDir=chart
chartDirKey=CHARTDIRECTORY_HASH
cacheUtil=/file-watcher/scripts/cache-util.sh
util=/file-watcher/scripts/util.sh

#Import general constants
source /file-watcher/scripts/constants.sh

echo project=$project
cd "$ROOT"

set -o pipefail

function cleanContainer() {
	if [ "$IN_K8" != "true" ]; then
		if [ "$(docker ps -aq -f name=$project)" ]; then
			$util updateAppState $PROJECT_ID $APP_STATE_STOPPING
			docker rm -f $project
			docker rmi -f $project
		fi
	fi
}

function create() {
	# Run the project using either helm or docker run
	if [ "$IN_K8" == "true" ]; then
		deployK8s
	else
		deployLocal
	fi
}

function deployK8s() {
	# Find the Helm chart folder, error out if it can't be found
	if [[ -d "chart/$projectName" ]] && [[ -f "chart/$projectName/Chart.yaml" ]]; then
		chartDir="chart/$projectName"
	else
		chartDir="$(find . -type f -name '*Chart.yaml*' | sed -r 's|/[^/]+$||' | sort | uniq | head -n1)"
		if [[ ! -d "$chartDir" ]]; then
			echo "Exiting, Unable to find the Helm chart for project $projectName"
			$util updateBuildState $PROJECT_ID $BUILD_STATE_FAILED "buildscripts.noHelmChart"
			exit 1;
		fi
	fi
	chartName=$( basename $chartDir )
	tmpChart=/tmp/$projectName/$chartName

	# Copy project chart dir to a tmp location for chart modify and helm install
	echo "Copying chart dir $chartDir to $tmpChart"
	if [[ -d $tmpChart ]]; then
		rm -rf $tmpChart
	fi
	mkdir -p $tmpChart
	cp -fR $chartDir/* $tmpChart
	parentDir=$( dirname $tmpChart )

	echo "Modifying charts and running Helm install from $chartDir"

	# Render the template yamls for the chart
	helm template $tmpChart \
		--name $project \
		--values=/file-watcher/scripts/override-values-icp.yaml \
		--set image.repository=$DOCKER_REGISTRY/$project \
		--output-dir=$parentDir

	deploymentFile=$( /file-watcher/scripts/kubeScripts/find-kube-resource.sh $tmpChart Deployment )
	if [[ -z $deploymentFile ]]; then
		echo "Error, unable to find a deployment file in the Helm chart."
		$util updateBuildState $PROJECT_ID $BUILD_STATE_FAILED "buildscripts.noDeployment"
		exit 1
	fi
	serviceFile=$( /file-watcher/scripts/kubeScripts/find-kube-resource.sh $tmpChart Service )
	if [[ -z $serviceFile ]]; then
		echo "Error, unable to find a service file in the Helm chart."
		$util updateBuildState $PROJECT_ID $BUILD_STATE_FAILED "buildscripts.noService"
		exit 1
	fi

	# Add the necessary labels and serviceaccount to the chart
	/file-watcher/scripts/kubeScripts/modify-helm-chart.sh $deploymentFile $serviceFile $project

	# Push app container image to docker registry if one is set up
	if [[ ! -z $DOCKER_REGISTRY ]]; then

		# If the image already exists, remove it as well.
		# Fix for no nodemon in ICP.
		if [ "$( docker images -q $project )" ]; then
			docker rmi -f $project
		fi
		if [ "$( docker images -q $DOCKER_REGISTRY/$project )" ]; then
			docker rmi -f $DOCKER_REGISTRY/$project
		fi
		# If there's an existing failed Helm release, delete it. See https://github.com/helm/helm/issues/3353
		if [ "$( helm list $project --failed )" ]; then
			$util updateAppState $PROJECT_ID $APP_STATE_STOPPING
			helm delete $project --purge
		fi

		echo "$BUILD_IMAGE_INPROGRESS_MSG $projectName"
		$util updateBuildState $PROJECT_ID $BUILD_STATE_INPROGRESS "buildscripts.buildImage"

		echo -e "Touching docker container build log file: "$LOG_FOLDER/$DOCKER_BUILD.log""
		touch "$LOG_FOLDER/$DOCKER_BUILD.log"
		echo -e "Triggering log file event for: docker container build log"
 		$util newLogFileAvailable $PROJECT_ID "build"

		echo -e "Docker build log file "$LOG_FOLDER/$DOCKER_BUILD.log""
		docker build -t $project . |& tee "$LOG_FOLDER/$DOCKER_BUILD.log"
		exitCode=$?
		imageLastBuild=$(($(date +%s)*1000))
		if [ $exitCode -eq 0 ]; then
			echo "Docker build successful for $projectName"
			$util updateBuildState $PROJECT_ID $BUILD_STATE_SUCCESS " " "$imageLastBuild"
		else
			echo "$BUILD_IMAGE_FAILED_MSG $projectName" >&2
			$util updateBuildState $PROJECT_ID $BUILD_STATE_FAILED "buildscripts.buildFail"
			exit 1
		fi

		# Tag and push the image to the registry
		docker tag $project $DOCKER_REGISTRY/$project
		docker push $DOCKER_REGISTRY/$project

		if [ $? -eq 0 ]; then
			echo "Successfully tagged and pushed the application image $DOCKER_REGISTRY/$project"
		else
			echo "Error: $?, could not push application image $DOCKER_REGISTRY/$project" >&2
		fi

		# Install the application using helm.
		helm upgrade \
			--install $project \
			--recreate-pods \
			$tmpChart;
	else
		echo "$BUILD_IMAGE_INPROGRESS_MSG $projectName"
		$util updateBuildState $PROJECT_ID $BUILD_STATE_INPROGRESS "buildscripts.buildImage"

		echo -e "Touching docker container build log file: "$LOG_FOLDER/$DOCKER_BUILD.log""
		touch "$LOG_FOLDER/$DOCKER_BUILD.log"
		echo -e "Triggering log file event for: docker container build log"
 		$util newLogFileAvailable $PROJECT_ID "build"

		echo -e "Docker build log file "$LOG_FOLDER/$DOCKER_BUILD.log""
		docker build -t $project . |& tee "$LOG_FOLDER/$DOCKER_BUILD.log"
		exitCode=$?
		imageLastBuild=$(($(date +%s)*1000))
		if [ $exitCode -eq 0 ]; then
			echo "Docker build successful for $projectName"
			$util updateBuildState $PROJECT_ID $BUILD_STATE_SUCCESS " " "$imageLastBuild"
		else
			echo "$BUILD_IMAGE_FAILED_MSG $projectName" >&2
			$util updateBuildState $PROJECT_ID $BUILD_STATE_FAILED "buildscripts.buildFail"
			exit 1
		fi
		helm upgrade \
			--install $project \
			--recreate-pods \
			$tmpChart;
	fi

	if [ $? -eq 0 ]; then
		echo "Helm install successful for $projectName"
		$util updateBuildState $PROJECT_ID $BUILD_STATE_SUCCESS " "
		$util updateAppState $PROJECT_ID $APP_STATE_STARTING
	else
		echo "Helm install failed for $projectName with exit code $?, exiting" >&2
		$util updateBuildState $PROJECT_ID $BUILD_STATE_FAILED "buildscripts.buildFail"
		exit 1
	fi

	# Wait until the pod is up and running
	POD_RUNNING=0
	while [ $POD_RUNNING -eq 0 ]; do
		RESULT="$( kubectl get po --selector=release=$project )"
		if [[ $RESULT = *"Running"* ]]; then
			POD_RUNNING=1
		elif [[ -z "$RESULT" || $RESULT = *"Failure"* || $RESULT = *"Unknown"* || $RESULT = *"ImagePullBackOff"* || $RESULT = *"CrashLoopBackOff"* ]]; then
			echo "Error: Pod for Helm release $project failed to start" >&2
			errorMsg="Error starting project $projectName: pod for helm release $project failed to start"  # :NLS
			$util updateAppState $PROJECT_ID $APP_STATE_STOPPED "$errorMsg"

			# Print the Helm status before deleting the release
			helm status $project

			helm delete $project --purge
			exit 1;
		fi
		sleep 1;
	done

	echo "The pod for helm release $project is now up"

	# Delete any pods left that are terminating, to ensure they go away
	/file-watcher/scripts/kubeScripts/clear-terminating-pods.sh $project

	echo -e "Touching application log file: "$LOG_FOLDER/$APP_LOG.log""
	touch "$LOG_FOLDER/$APP_LOG.log"
	echo -e "Triggering log file event for: application log"
 	$util newLogFileAvailable $PROJECT_ID "app"

	# add the app logs
	echo -e "App log file "$LOG_FOLDER/$APP_LOG.log""
	kubectl logs -f $(kubectl get po -o name --selector=release=$project) >> "$LOG_FOLDER/$APP_LOG.log" &
}

function dockerRun() {
	# Map container to different port than the project is using
	dockerCmd="tail -F /output/container.log 2>/dev/null"
	# The NODE_HEAPDUMP_OPTIONS=nosignal environment variable is needed for nodemon to work due to the common use of SIGUSR2 between nodemon and appmetrics. See https://github.com/RuntimeTools/appmetrics/issues/517 for details
	heapdump="NODE_HEAPDUMP_OPTIONS=nosignal"

	# Remove container if it already exists (could be from a failed attempt)
	if [ "$(docker ps -aq -f name=$project)" ]; then
		docker rm -f $project
	fi

	# If the node module volume for the project doesn't already exist, create it.
	if [ ! "$(docker volume ls -q -f name=$project-nodemodules)" ]; then
		docker volume create $project-nodemodules
	fi

	docker run --network=microclimate_network -e $heapdump --name $project -p 127.0.0.1::$DEBUG_PORT -P -dt -v "$LOCAL_WORKSPACE/$projectName":/app -v $project-nodemodules:/app/node_modules $project /bin/bash -c "$dockerCmd";
}

function deployLocal() {
	echo "$BUILD_IMAGE_INPROGRESS_MSG $projectName"
	$util updateBuildState $PROJECT_ID $BUILD_STATE_INPROGRESS "buildscripts.buildImage"

	echo -e "Touching docker container build log file: "$LOG_FOLDER/$DOCKER_BUILD.log""
	touch "$LOG_FOLDER/$DOCKER_BUILD.log"
	echo -e "Triggering log file event for: docker container build log"
 	$util newLogFileAvailable $PROJECT_ID "build"

	echo -e "Docker build log file "$LOG_FOLDER/$DOCKER_BUILD.log""
	docker build -t $project . |& tee "$LOG_FOLDER/$DOCKER_BUILD.log"

	exitCode=$?
	imageLastBuild=$(($(date +%s)*1000))
	if [ $exitCode -eq 0 ]; then
		echo "$BUILD_IMAGE_SUCCESS_MSG $projectName"
	else
		echo "$BUILD_IMAGE_FAILED_MSG $projectName" >&2
		$util updateBuildState $PROJECT_ID $BUILD_STATE_FAILED "buildscripts.buildFail"
		exit 1
	fi

	echo "$project container does not exist. Starting container for $project..."
	dockerRun
	DOCKER_RUN_RC=$?
	if [ $DOCKER_RUN_RC -eq 0 ]; then
		echo "Start container stage succeeded for $project"
	else
		# Docker run can sometimes inexplicably fail with the following error:
		#   docker: Error response from daemon: driver failed programming external connectivity
		#   on endpoint <project>: Error starting userland proxy: listen tcp 0.0.0.0:43273: bind: address already in use.
		#
		# Workaround: Retry once if we hit this error.
		echo "Start container stage failed for $project with exit code $DOCKER_RUN_RC" >&2
		echo "Retrying start container stage"
		dockerRun
		DOCKER_RUN_RC=$?
		if [ $DOCKER_RUN_RC -ne 0 ]; then
			$util updateBuildState $PROJECT_ID $BUILD_STATE_FAILED "buildscripts.buildFail"
			exit 1
		fi
	fi
	docker cp /file-watcher/scripts/nodejsScripts $project:/scripts
	docker exec $project /scripts/noderun.sh start $AUTO_BUILD_ENABLED $START_MODE
	if [ $? -eq 0 ]; then
		# The build is now complete so send a success event
		$util updateBuildState $PROJECT_ID $BUILD_STATE_SUCCESS " " "$imageLastBuild"
		$util updateAppState $PROJECT_ID $APP_STATE_STARTING
	else
		$util updateBuildState $PROJECT_ID $BUILD_STATE_FAILED "buildscripts.buildFail"
		exit 1
	fi

	echo -e "Touching application log file: "$LOG_FOLDER/$APP_LOG.log""
	touch "$LOG_FOLDER/$APP_LOG.log"
	echo -e "Triggering log file event for: application log"
 	$util newLogFileAvailable $PROJECT_ID "app"

	# add the app logs
	echo -e "App log file "$LOG_FOLDER/$APP_LOG.log""
	docker logs -f $CONTAINER_NAME >> "$LOG_FOLDER/$APP_LOG.log" &
}

# Initialize the cache with the hash for select files.  Called from project-watcher.
function initCache() {
	# Cache the hash codes for main files
	echo "Initializing cache for: $projectName"
	dockerfileHash=$(sha256sum $dockerfile)
	dockerfileToolsHash=$(sha256sum $dockerfileTools)
	packageJsonHash=$(sha256sum $packageJson)
	nodemonJsonHash=$(sha256sum $nodemonJson)
	$cacheUtil "$PROJECT_ID" update $dockerfileKey "$dockerfileHash" $dockerfileToolsKey "$dockerfileToolsHash" $packageJsonKey "$packageJsonHash" $nodemonJsonKey "$nodemonJsonHash"
	if [ "$IN_K8" == "true" ]; then
		chartDirHash=$(find $chartDir -type f -name "*.yaml" -exec sha256sum {} + | awk '{print $1}' | sort | sha256sum)
		$cacheUtil "$PROJECT_ID" update $chartDirKey "$chartDirHash"
	fi
}

# Clear the node related cache files (anything that would get picked up on a node start/restart)
function clearNodeCache() {
	packageJsonHash=$(sha256sum $packageJson)
	nodemonJsonHash=$(sha256sum $nodemonJson)
	$cacheUtil "$PROJECT_ID" update $packageJsonKey "$packageJsonHash" $nodemonJsonKey "$nodemonJsonHash"
}

# Create the application image and container and start it
if [ "$COMMAND" == "create" ]; then
	# clean the container
	cleanContainer

	# Initialize the cache
	initCache

	# Set initial state to stopped
	$util updateAppState $PROJECT_ID $APP_STATE_STOPPED
	create

# Update the application as needed
elif [ "$COMMAND" == "update" ]; then
	dockerfileHash=$(sha256sum $dockerfile)
	dockerfileToolsHash=$(sha256sum $dockerfileTools)
	packageJsonHash=$(sha256sum $packageJson)
	nodemonJsonHash=$(sha256sum $nodemonJson)
	changedList=`$cacheUtil "$PROJECT_ID" getChanged $dockerfileKey "$dockerfileHash" $dockerfileToolsKey "$dockerfileToolsHash" $packageJsonKey "$packageJsonHash" $nodemonJsonKey "$nodemonJsonHash"`
	if [ "$IN_K8" == "true" ]; then
		chartDirHash=$(find $chartDir -type f -name "*.yaml" -exec sha256sum {} + | awk '{print $1}' | sort | sha256sum)
		changedListK8=`$cacheUtil "$PROJECT_ID" getChanged $chartDirKey "$chartDirHash"`
		changedList+=("${changedListK8[@]}")
	fi
	action=NONE
	if [ $FORCE_ACTION ] && [ "$FORCE_ACTION" != "NONE" ]; then
		action=$FORCE_ACTION
	else
		for item in ${changedList[@]}; do
			echo "$item changed"
			if [ "$item" == "$dockerfileKey" ] || [ "$item" == "$dockerfileToolsKey" ] || [ "$item" == "$chartDirKey" ]; then
				action=REBUILD
				break
			elif [ "$item" == "$packageJsonKey" ] || [ "$item" == "$nodemonJsonKey" ]; then
				action=RESTART
				# need to keep looking in case a Dockerfile was changed
			fi
		done
	fi
	echo "Action for project $projectName: $action"
	if [ "$action" == "REBUILD" ]; then
		echo "Rebuilding project: $projectName"
		cleanContainer
		create
	elif [ "$action" == "RESTART" ]; then
		if [ "$IN_K8" == "true" ]; then
			# Currently in ICP, changed files are only copied over through docker build
			echo "Rebuilding project: $projectName"
			create
		else
			echo "Restarting node/nodemon for changed config file"
			docker exec $project /scripts/noderun.sh stop
			$util updateAppState $PROJECT_ID $APP_STATE_STOPPING
			docker exec $project /scripts/noderun.sh start $AUTO_BUILD_ENABLED $START_MODE
			$util updateAppState $PROJECT_ID $APP_STATE_STARTING
		fi
	else
		if [ "$IN_K8" == "true" ]; then
			# No nodemon in ICP and changed files are only copied over through docker build
			echo "Rebuilding project: $projectName"
			create
		elif [ "$AUTO_BUILD_ENABLED" != "true" ]; then
			# If auto build disabled then not using nodemon and need to restart
			echo "Restarting node for changed file"
			docker exec $project /scripts/noderun.sh stop
			$util updateAppState $PROJECT_ID $APP_STATE_STOPPING
			docker exec $project /scripts/noderun.sh start $AUTO_BUILD_ENABLED $START_MODE
			$util updateAppState $PROJECT_ID $APP_STATE_STARTING
		fi
	fi

# Stop the application (not supported for ICP)
elif [ "$COMMAND" == "stop" ]; then
	echo "Stopping node.js project $projectName"
	docker exec $project /scripts/noderun.sh stop
	$util updateAppState $PROJECT_ID $APP_STATE_STOPPING
# Start the application (not supported for ICP)
elif [ "$COMMAND" == "start" ]; then
	echo "Starting node.js project $projectName"
	# Clear the cache since restarting node will pick up any changes to package.json or nodemon.json
	clearNodeCache
	docker exec $project /scripts/noderun.sh start $AUTO_BUILD_ENABLED $START_MODE
	$util updateAppState $PROJECT_ID $APP_STATE_STARTING
# Enable auto build
elif [ "$COMMAND" == "enableautobuild" ]; then
	echo "Enabling auto build for node.js project $projectName"
	# Wipe out any changes to package.json or nodemon.json since restarting node will take care of them
	clearNodeCache
	docker exec $project /scripts/noderun.sh stop
	$util updateAppState $PROJECT_ID $APP_STATE_STOPPING
	docker exec $project /scripts/noderun.sh start true $START_MODE
	$util updateAppState $PROJECT_ID $APP_STATE_STARTING
	echo "Auto build for node.js project $projectName enabled"
# Disable auto build
elif [ "$COMMAND" == "disableautobuild" ]; then
	echo "Disabling auto build for node.js project $projectName"
	docker exec $project /scripts/noderun.sh stop
	$util updateAppState $PROJECT_ID $APP_STATE_STOPPING
	docker exec $project /scripts/noderun.sh start false $START_MODE
	$util updateAppState $PROJECT_ID $APP_STATE_STARTING
	echo "Auto build for node.js project $projectName disabled"
# Remove the application
elif [ "$COMMAND" == "remove" ]; then
	echo "Removing the container for app $ROOT."

	if [ "$IN_K8" == "true" ]; then
		helm delete $project --purge
		if [[ "$(kubectl get images $CONTAINER_NAME)" ]]; then
			kubectl delete image $CONTAINER_NAME --force --grace-period=0
		fi
	else
		# Remove container
		if [ "$(docker ps -aq -f name=$project)" ]; then
			docker rm -f $project
		fi

		# Remove the node modules volume, as it needs to be deleted separately.
		if [ "$(docker volume ls -q -f name=$project-nodemodules)" ]; then
			docker volume rm $project-nodemodules
		fi
	fi

	# Remove image
	if [ "$(docker images -qa -f reference=$project)" ]; then
		docker rmi -f $project
	else
		echo The application image $project has already been removed.
	fi

	# Remove registry image and Kubernetes image
	if [ "$IN_K8" == "true" ]; then
		if [ "$( docker images -q $DOCKER_REGISTRY/$project )" ]; then
			docker rmi -f $DOCKER_REGISTRY/$project
		fi
	fi
# Rebuild the application
elif [ "$COMMAND" == "rebuild" ]; then
	echo "Rebuilding project: $projectName"
	cleanContainer
	create
else
	echo "ERROR: $COMMAND is not a recognized command" >&2

fi
