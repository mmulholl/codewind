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
if [[ -L $HOME/logs || -d $HOME/logs || -f $HOME/logs ]]; then
    echo "Warning: There is already a directory, symlink, or file at $HOME/logs"
    echo "Symlinking to $HOME/logs will fail and project logs will not show up"
fi

if [[ -L $HOME/app || -d $HOME/app || -f $HOME/app ]]; then
    echo "Error: There is already a directory, symlink, or file at $HOME/app"
    echo "Symlinking to $HOME/app will fail and cause the project to fail to build"
    exit 1;
fi

# Output a warning if the .log directory in /microclimate-workspace directory doesn't already exist
if [[ ! -d /microclimate-workspace/.logs/$LOG_FOLDER ]]; then
    echo "Warning: /microclimate-workspace/.logs/$LOG_FOLDER does not already exist, something may be wrong with the portal or file-watcher container."
    echo "Creating a folder at /microclimate-workspace/.logs/$LOG_FOLDER" 
	mkdir -p /microclimate-workspace/.logs/$LOG_FOLDER
fi

# Output a warning if the $PROJECT_NAME directory in /microclimate-workspace directory doesn't already exist
if [[ ! -d /microclimate-workspace/$PROJECT_NAME ]]; then
    echo "Error: /microclimate-workspace/$PROJECT_NAME does not already exist, something may be wrong with either the portal or file-watcher container."
    echo "Exiting, as there will be no project to build"
	exit 1;
fi

# Create symlinks to $HOME/logs and $HOME/app on the Liberty app container / pod
# Note that $PROJECT_NAME is an env-var defined and set in the liberty app's deployment.yaml
ln -s /microclimate-workspace/.logs/$LOG_FOLDER $HOME/logs
ln -s /microclimate-workspace/$PROJECT_NAME $HOME/app