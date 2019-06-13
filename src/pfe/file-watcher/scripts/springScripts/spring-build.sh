#!/bin/bash
LOG_NAME=$1
PROJECT_NAME=$2
FOLDER_NAME=$3
MAVEN_SETTINGS=$4

echo "LOG_NAME=$LOG_NAME"
echo "FOLDER_NAME=$FOLDER_NAME"
echo "PROJECT_NAME=$PROJECT_NAME"
echo "MAVEN_SETTINGS=$MAVEN_SETTINGS"

MAVEN_BUILD=maven.build

# Kill the server running the springboot jar
pkill java

# Run a maven build to generate the new jar
cd /root/app
echo "Running Maven build for $PROJECT_NAME"
echo "mvn -Dmaven.repo.local=/root/app/.m2/repository -f ./pom.xml package -Dmaven.test.skip=true $MAVEN_SETTINGS --log-file "/root/logs/$FOLDER_NAME/$MAVEN_BUILD.log""
mvn -Dmaven.repo.local=/root/app/.m2/repository -f ./pom.xml package -Dmaven.test.skip=true $MAVEN_SETTINGS --log-file "/root/logs/$FOLDER_NAME/$MAVEN_BUILD.log"
if [[ $? -ne 0 ]]; then
    # Exit if maven build failed
    echo "Maven build failed for $PROJECT_NAME"
    exit 1;
fi
echo "Maven build successful for $PROJECT_NAME"

# Determine the jar to copy over
TARGET_JAR=$(sed -n -e 's/^.*Building jar: //p' /root/logs/$FOLDER_NAME/$MAVEN_BUILD.log)

# If we couldn't find the jar in the default location, see if there are any jars containing SNAPSHOT
if [[ ! -f $TARGET_JAR ]]; then
    TARGET_JAR=target/$(ls target/ | grep 'SNAPSHOT.jar' | head -n1)
fi

# If the target jar still isn't found, see if a jar containing the project name exists
if [[ ! -f $TARGET_JAR ]]; then
    TARGET_JAR=target/$(ls target/ | grep $PROJECT_NAME | head -n1)
fi

# Failover, grab the first jar under target
if [[ ! -f $TARGET_JAR ]]; then
    TARGET_JAR=target/$(ls target/*.jar | head -n1)
fi


# If there's already a Spring app running, kill it
APP_JAR=/root/app.jar
pkill -f "java -jar $APP_JAR"

# Copy the jar over
cp -rf $TARGET_JAR $APP_JAR
