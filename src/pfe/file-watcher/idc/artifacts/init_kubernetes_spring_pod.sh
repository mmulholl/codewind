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

# Output error messages if either of the directories / symlinks exist
if [[ -L /root/logs || -d /root/logs || -f /root/logs ]]; then
    echo "Warning: There is already a directory, symlink, or file at /root/logs"
    echo "Symlinking to /root/logs will fail and project logs will not show up"
fi

if [[ -L /root/app || -d /root/app || -f /root/app ]]; then
    echo "Error: There is already a directory, symlink, or file at /root/app"
    echo "Symlinking to /root/app will fail and cause the project to fail to build"
    exit 1;
fi

# Output a warning if the .log directory in /microclimate-workspace directory doesn't already exist
if [[ ! -d /microclimate-workspace/.logs ]]; then
    echo "Warning: /microclimate-workspace/.logs does not already exist, something may be wrong with the portal or file-watcher container."
    echo "Creating a folder at /microclimate-workspace/.logs" 
	mkdir -p /microclimate-workspace/.logs
fi

# Output a warning if the $PROJECT_NAME directory in /microclimate-workspace directory doesn't already exist
if [[ ! -d /microclimate-workspace/$PROJECT_NAME ]]; then
    echo "Error: /microclimate-workspace/$PROJECT_NAME does not already exist, something may be wrong with either the portal or file-watcher container."
    echo "Exiting, as there will be no project to build"
	exit 1;
fi

# Create symlinks to /root/logs and /root/app on the Liberty app container / pod
# Note that $PROJECT_NAME is an env-var defined and set in the liberty app's deployment.yaml
ln -s /microclimate-workspace/.logs /root/logs
ln -s /microclimate-workspace/$PROJECT_NAME /root/app