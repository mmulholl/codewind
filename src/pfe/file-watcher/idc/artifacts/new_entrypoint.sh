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

source $HOME/artifacts/envvars.sh
$HOME/artifacts/server_setup.sh

# Set up the local liberty feature cache
if [ ! -d $HOME/artifacts/libertyrepocache ] && [ -f $HOME/artifacts/libertyrepocache.zip ]; then
	echo "Initializing Liberty feature repository cache"
	echo "Extracting Liberty feature cache for $LOGNAME $(date)"
	unzip -qq $HOME/artifacts/libertyrepocache.zip -d $HOME/artifacts
    mkdir -p /opt/ibm/wlp/etc
    cp $HOME/artifacts/repositories.properties /opt/ibm/wlp/etc/repositories.properties
	echo "Finished extracting Liberty feature cache for $LOGNAME $(date)"
fi

if [ -d $HOME/artifacts/libertyrepocache ]; then
	echo "Liberty feature cache is setup."
fi

# Use the server log messages for container logs
mkdir -p $WLP_USER_DIR/servers/defaultServer/logs
touch $WLP_USER_DIR/servers/defaultServer/logs/messages.log
tail -f $WLP_USER_DIR/servers/defaultServer/logs/messages.log
