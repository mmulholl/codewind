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

LOGNAME=$1
LIBERTY_ENV=$2
MAVEN_SETTINGS=$4

MAVEN_BUILD=maven.build

# Maven requires a JDK, the standard liberty image only includes a JRE
export JAVA_HOME=$HOME/java

# If the local m2 repository doesn't exist and a local dependency cache exists then prime it before the build
if [ ! -d $HOME/.m2/repository ] && [ -f $HOME/artifacts/localm2cache.zip ]; then
	echo "Initializing container m2 cache"
	echo "Extracting m2 cache for $LOGNAME $(date)"
	unzip -qq $HOME/artifacts/localm2cache.zip -d $HOME/
	echo "Finished extracting m2 cache for $LOGNAME $(date)"

	# Verify m2 cache was set up
	if [ -d $HOME/.m2/repository ]; then
		echo "m2 cache is set up for $LOGNAME"
	fi

fi

cd $HOME/app

if [ "$HOST_OS" == "windows" ]; then
	export MICROCLIMATE_OUTPUT_DIR=/tmp/liberty
else
	export MICROCLIMATE_OUTPUT_DIR=`pwd`/mc-target
fi
echo "Maven build output directory is set to $MICROCLIMATE_OUTPUT_DIR"

if [[ $1 && $1 == "prod" ]]; then
	echo "Start mvn package for production"
	echo "mvn -B package -DinstallDirectory=/opt/ibm/wlp"
	mvn -B package -DinstallDirectory=/opt/ibm/wlp
	exit 0
fi

if [ -f $SERVER_XML ]; then
	if [[ $3 && $3 == "config" ]]; then
		echo "Start mvn build with config change for $LOGNAME $(date)"
        echo "mvn -B package liberty:install-apps -DskipTests=true -DlibertyEnv=microclimate -DmicroclimateOutputDir=$MICROCLIMATE_OUTPUT_DIR $MAVEN_SETTINGS --log-file $HOME/logs/$MAVEN_BUILD.log"
        mvn -B package liberty:install-apps -DskipTests=true -DlibertyEnv=microclimate -DmicroclimateOutputDir=$MICROCLIMATE_OUTPUT_DIR $MAVEN_SETTINGS --log-file $HOME/logs/$MAVEN_BUILD.log
		echo "Finished mvn build with config change for $LOGNAME $(date)"
	else
		echo "Start mvn compile for $LOGNAME $(date)"
        echo "mvn -B compile -DskipTests=true -DlibertyEnv=microclimate -DmicroclimateOutputDir=$MICROCLIMATE_OUTPUT_DIR $MAVEN_SETTINGS --log-file $HOME/logs/$MAVEN_BUILD.log"
        mvn -B compile -DskipTests=true -DlibertyEnv=microclimate -DmicroclimateOutputDir=$MICROCLIMATE_OUTPUT_DIR $MAVEN_SETTINGS --log-file $HOME/logs/$MAVEN_BUILD.log
		echo "Finished mvn compile for $LOGNAME $(date)"
	fi
else
	echo "Start mvn package for $LOGNAME $(date)"
    echo "mvn -B package -DskipTests=true -DlibertyEnv=microclimate -DmicroclimateOutputDir=$MICROCLIMATE_OUTPUT_DIR $MAVEN_SETTINGS --log-file $HOME/logs/$MAVEN_BUILD.log"
    mvn -B package -DskipTests=true -DlibertyEnv=microclimate -DmicroclimateOutputDir=$MICROCLIMATE_OUTPUT_DIR $MAVEN_SETTINGS --log-file $HOME/logs/$MAVEN_BUILD.log
	echo "Finished mvn package for $LOGNAME $(date)"
fi

