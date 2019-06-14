#!groovy​

pipeline {
	agent any

	tools {
		maven  'apache-maven-3.6.1'
		jdk 'ibm-latest'
	}

    options {
        skipStagesAfterUnstable()
    }

	environment {
  		PRODUCT_NAME = 'codewind'
		PFE = 'pfe'  
		INITIALIZE = 'initialize'
		PERFORMANCE = 'performance';
	}

	stages {
		stage ('preBuild') {
			steps {
				echo 'Starting preBuild Stage.....'
				script {
					sh '''
					# Copy .env over to file-watcher
					SRC_DIR=$PWD/src
					if [ -f $PWD/.env ]; then
						cp $PWD/.env ${SRC_DIR}/${PFE}/file-watcher/scripts/.env
					fi

					echo "$(set)"

					# Copy the license files to the portal, performance, initialize
					cp -r $PWD/LICENSE.md ${SRC_DIR}/pfe/portal/
					cp -r $PWD/NOTICE.md ${SRC_DIR}/pfe/portal/
					cp -r $PWD/LICENSE ${SRC_DIR}/initialize/
					cp -r $PWD/NOTICE.md ${SRC_DIR}/initialize/
					cp -r $PWD/LICENSE.md ${SRC_DIR}/performance/
					cp -r $PWD/NOTICE.md ${SRC_DIR}/performance/

					# Copy the docs into portal
					cp -r $PWD/docs ${SRC_DIR}/pfe/portal/
					'''
				}
			}
		}	

		stage('Build') {
			steps {
				script {
					echo 'Starting build Stage......'
					sh '''
					ARCH=$(uname -m)
					# On intel, uname -m returns "x86_64", but the convention for our docker images is "amd64"
					if [ "$ARCH" == "x86_64" ]; then
						IMAGE_ARCH="amd64"
					else
						IMAGE_ARCH=$ARCH
					fi

					ALL_IMAGES="$PFE $PERFORMANCE $INITIALIZE"
					SRC_DIR=$PWD/src
					
					for image in $ALL_IMAGES
					do
						export IMAGE_NAME=codewind-$image-$IMAGE_ARCH
						echo "Building image $IMAGE_NAME"
						cd ${SRC_DIR}/${image};
						time sh build Dockerfile_${ARCH}
						if [ $? -eq 0 ]; then
							echo "+++   SUCCESSFULLY BUILT $IMAGE_NAME   +++"
						else 
							echo "+++   FAILED TO BUILD $IMAGE_NAME - exiting.   +++"
							exit 12;
						fi	
					done	
					'''  
				}
			}

		}
		
		stage('Test') {
            steps {
                echo 'Testing to be defined.'
            }
        }
        
        stage('Upload') {
			steps {
                echo 'Upload to be defined.'
            }

        }
	}
	
	post {
        success {
			echo 'Build SUCCESS'
        }
    }
}