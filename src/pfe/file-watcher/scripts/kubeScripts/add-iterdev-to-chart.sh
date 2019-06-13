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
# Adds the required iterative-dev functionality to the Helm chart.
# yq command format:
# `yq <operation> <flags> <file> -- <yaml path> <value>`

deploymentFile=$1
projectName=$2
entrypoint=$3
postStartHook=$4
logFolder=$5

# getIndex returns the number of entries at a given yaml path in the deployment yaml file.
function getIndex() {
    local yamlPath="$1"
    local values=$( yq r $deploymentFile -- "$yamlPath" )
    local index=0
    if [[ "$values" != "null" ]]; then
        index=$( echo "$values" | wc -l)
    fi
    echo -e $index
}

# Adds the entrypoint command and arg override to the deployment file
function addEntrypoint() {
    # Overwrite the entrypoint command for the container.
    # yq doesn't let us add multiple array values at once, so need to add them separately
    local commandPath="spec.template.spec.containers[0].command"
    yq w -i $deploymentFile -- $commandPath []
    yq w -i $deploymentFile -- $commandPath[0] "/bin/bash"
    yq w -i $deploymentFile -- $commandPath[1] "-c"
    yq w -i $deploymentFile -- $commandPath[2] "--"
    
    # Overwrite the entrypoint args for the container
    local argPath="spec.template.spec.containers[0].args"
    yq w -i $deploymentFile -- $argPath []
    yq w -i $deploymentFile -- $argPath[0] $entrypoint
}

# Adds in the volumes to the deployment and container
function addVolumeMount() {
    # Add in the volume mount to the container (note the first '+' is not a typo, it's required to append to the array)
    local volumeMountPath="spec.template.spec.containers[0].volumeMounts"
    local index=$(getIndex $volumeMountPath[*].name)
    yq w -i $deploymentFile -- $volumeMountPath[+].name shared-workspace
    yq w -i $deploymentFile -- $volumeMountPath[$index].mountPath /microclimate-workspace/
    yq w -i $deploymentFile -- $volumeMountPath[$index].subPath "$KUBE_NAMESPACE/projects"
    
    # Add the persistent volume to the deployment
    local volumesPath="spec.template.spec.volumes"
    local index=$(getIndex $volumesPath[*].name)
    yq w -i $deploymentFile -- $volumesPath[+].name shared-workspace
    yq w -i $deploymentFile -- $volumesPath[$index].persistentVolumeClaim.claimName $PVC_NAME
}

function addPostStartHook() {
    local hookCommandPath="spec.template.spec.containers[0].lifecycle.postStart.exec.command"
    yq w -i $deploymentFile -- $hookCommandPath []
    yq w -i $deploymentFile -- $hookCommandPath[0] "/bin/bash"
    yq w -i $deploymentFile -- $hookCommandPath[1] "-c"
    yq w -i $deploymentFile -- $hookCommandPath[2] $postStartHook
}

function addEnvVars() {
    # Append the project name environment variable
    local envPath="spec.template.spec.containers[0].env"
    index=$(getIndex "$envPath[*].name")
    yq w -i $deploymentFile -- $envPath[+].name PROJECT_NAME
    yq w -i $deploymentFile -- $envPath[$index].value $projectName

    index1=$(getIndex "$envPath[*].name")
    yq w -i $deploymentFile -- $envPath[+].name LOG_FOLDER
    yq w -i $deploymentFile -- $envPath[$index1].value $logFolder
}

addEntrypoint

addVolumeMount

addPostStartHook

addEnvVars