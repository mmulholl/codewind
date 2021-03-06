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
# Import general constants
source /file-watcher/scripts/constants.sh

export CONTAINER_NAME=$1

export CONTAINER_IMAGE_NAME=$2

export IDC_APP_BASE=$3

export MICROCLIMATE_WS_ORIGIN=$4

export PROJECT_ID=$5

export LOGFOLDER=$6

# The directory that contains this shell script (which is also the installation artifact/ dir)
export ARTIFACTS="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# App dir
export APPDIR=`pwd`

export APPNAME=$(dirname $APPDIR)

export PROJNAME=$(basename $APPDIR)

export LOGSDIR=$ARTIFACTS/.logs/$LOGFOLDER

export RELEASE_NAME=$CONTAINER_NAME

docker stop $CONTAINER_NAME
docker rm $CONTAINER_NAME

util=/file-watcher/scripts/util.sh

if [[ -z $PVC_NAME ]]; then
	# Only grab the PVC name if it wasn't passed in by the helm chart
	PVC_NAME="$( kubectl get pvc -o=custom-columns=NAME:.metadata.name | grep '\-ibm-microclimate' )";
fi

if [[ $MICROCLIMATE_WS_ORIGIN &&  $APPDIR == '/microclimate-workspace'* ]]
    then

		# The main MicroProfile directory is the parent of the microclimate workspace
		MICROCLIMATE_ORIGIN_DIR=${MICROCLIMATE_WS_ORIGIN%'/microclimate-workspace'}

		# The app directory is originally in the format /microclimate-workspace/<app name>
		APPDIR=$MICROCLIMATE_ORIGIN_DIR$APPDIR

		# The artifacts directory is in the main microprofile directory
		ARTIFACTS=$MICROCLIMATE_ORIGIN_DIR/docker/file-watcher/idc/artifacts

		LOGSDIR=$MICROCLIMATE_WS_ORIGIN/.logs/$LOGFOLDER
fi

# Create the log directory if it doesn't already exist, app dir will already exist
mkdir -p $LOGSDIR

# If there's a failed Helm release already, delete it. See https://github.com/helm/helm/issues/3353
if [[ "$( helm list $RELEASE_NAME --failed )" ]]; then
	echo "Deleting old failed helm release $RELEAE_NAME"
	helm delete $RELEASE_NAME --purge
fi

# Find the Helm chart folder, error out if it can't be found
if [[ -d "chart/$PROJNAME" ]] && [[ -f "chart/$PROJNAME/Chart.yaml" ]]; then
	chartDir="chart/$PROJNAME"
else
	chartDir="$(find . -type f -name '*Chart.yaml*' | sed -r 's|/[^/]+$||' | sort | uniq | head -n1)"
	if [[ ! -d "$chartDir" ]]; then
		echo "Exiting, unable to find the Helm chart for project $PROJNAME"
		$util updateBuildState $PROJECT_ID $BUILD_STATE_FAILED "buildscripts.noHelmChart"
		exit 1;
	fi
fi

chartName=$( basename $chartDir )
tmpChart=/tmp/$PROJNAME/$chartName

# Copy the chart to a temp location and make sure it doesn't exist already.
if [[ -d $tmpChart ]]; then
	rm -rf $tmpChart
fi
mkdir -p $tmpChart
cp -fR $chartDir/* $tmpChart
parentDir=$( dirname $tmpChart )

# Render the template yamls for the chart
helm template $tmpChart \
	--name $RELEASE_NAME \
	--values=/file-watcher/scripts/override-values-icp.yaml \
	--set image.repository=$DOCKER_REGISTRY/$CONTAINER_NAME \
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
/file-watcher/scripts/kubeScripts/modify-helm-chart.sh $deploymentFile $serviceFile $CONTAINER_NAME 

# Add the iterative-dev functionality to the chart
/file-watcher/scripts/kubeScripts/add-iterdev-to-chart.sh $deploymentFile $PROJNAME "/home/default/artifacts/new_entrypoint.sh" "/home/default/artifacts/init_kubernetes_pod.sh" $LOGFOLDER

# Tag and push the image to the registry
if [[ ! -z $DOCKER_REGISTRY ]]; then	
	# Tag and push the image
	docker tag $CONTAINER_NAME $DOCKER_REGISTRY/$CONTAINER_NAME
	docker push $DOCKER_REGISTRY/$CONTAINER_NAME
	
	echo "Running install command: helm upgrade --install $RELEASE_NAME --recreate-pods $tmpChart"
	helm upgrade \
		--install $RELEASE_NAME \
		--recreate-pods \
		$tmpChart 
else
	echo "Running install command: helm upgrade --install $RELEASE_NAME --recreate-pods $tmpChart"
	helm upgrade \
		--install $RELEASE_NAME \
		--recreate-pods \
		$tmpChart 
fi

# Don't proceed if the helm install failed
if [[ $? -ne 0 ]]; then
	echo "Failed to install Helm chart for release $RELEASE_NAME, exiting"
	exit 1;
fi

# Wait until the pod is up and running
POD_RUNNING=0
while [ $POD_RUNNING -eq 0 ]; do
	RESULT="$( kubectl get po --selector=release=$RELEASE_NAME )"
	if [[ $RESULT = *"Running"* ]]; then
		POD_RUNNING=1
	elif [[ -z "$RESULT" || $RESULT = *"Failure"* || $RESULT = *"Unknown"* || $RESULT = *"ImagePullBackOff"* || $RESULT = *"CrashLoopBackOff"* || $RESULT = *"PostStartHookError"* ]]; then
		echo "Error: Pod for Helm release $project failed to start"
		
		# Print the Helm status before deleting the release
		helm status $RELEASE_NAME
		
		helm delete $RELEASE_NAME --purge
		exit 1;
	fi
	sleep 1;
done

echo "The pod for helm release $RELEASE_NAME is now up"

# Delete any pods left that are terminating, to ensure they go away
/file-watcher/scripts/kubeScripts/clear-terminating-pods.sh $RELEASE_NAME

# List the deployment and pod ids for this helm release
kubectl get deployments --selector=release=$RELEASE_NAME -o=custom-columns=NAME:.metadata.name
kubectl get po --selector=release=$RELEASE_NAME | grep 'Running' | cut -d ' ' -f 1
echo $RELEASE_NAME