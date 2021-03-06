/*******************************************************************************
 * Copyright (c) 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *******************************************************************************/
"use strict";
import { exec } from "child_process";
import dockerode from "dockerode";
import path from "path";
import moment from "moment-timezone";
import * as processManager from "./processManager";
import { ProcessResult } from "./processManager";
import * as logger from "./logger";
import { ContainerStates } from "../projects/constants";
import { Stream } from "stream";
import { ProjectInfo } from "../projects/Project";
import { StartModes } from "../projects/constants";
import * as logHelper from "../projects/logHelper";

const docker = new dockerode();

export interface ContainerInfo {
  containerId: string;
  ip: string;
  serviceName: string;
  exposedPort: string;
  internalPort: string;
  exposedDebugPort: string;
  internalDebugPort: string;
  containerPorts: string[];
}

/**
 * @function
 * @description Get docker container information.
 *
 * @param projectInfo <Required | ProjectInfo> - The metadata information for a project.
 * @param containerName <Required | String> - The docker container name.
 *
 * @returns Promise<ContainerInfo>
 */
export async function getApplicationContainerInfo(projectInfo: ProjectInfo, containerName: string): Promise<ContainerInfo> {
  const info: ContainerInfo = {
    containerId: "",
    ip: "",
    serviceName: "",
    exposedPort: "",
    internalPort: "",
    exposedDebugPort: "",
    internalDebugPort: "",
    containerPorts: []
  };

  try {
    // docker inspect has a '/' prefixed to the name
    const searchName = "/" + containerName;
    const containers = await docker.listContainers();
    if (containers && containers.length > 0) {
      for (const containerInfo of containers) {
        const container = await docker.getContainer(containerInfo.Id);
        const data = await container.inspect();

        if (data.Name === searchName) {
          info.containerId = data.Id;

          // At the moment only Java has a different context root
          const networksObject = data.NetworkSettings.Networks;
          const networkKey = Object.keys(networksObject)[0];
          if (networksObject[networkKey] !== undefined && networksObject[networkKey] !== null) {
            const network = networksObject[networkKey];
            info.ip = network.IPAddress;
          }

          const portObject = data.NetworkSettings.Ports;
          const keys = Object.keys(portObject);
          const appPorts = projectInfo.appPorts;

          let appPortMatched = false;

          // iterate through the list of ports recieved to match with the internal ports
          for (let i = 0; i < appPorts.length; i++) {
            const port = appPorts[i];
            for (let j = 0; j < keys.length; j++) {
              const key = keys[j];
              // check if the appPort recieved matches any of the available ports
              if (key.split("/")[0] == port) {

                // set the internal port to be the matched appPort
                info.internalPort = port;
                // set the exposed port that matches the matched internal port
                info.exposedPort = portObject[key][0].HostPort;

                // set the app port to be matched only if the exposed port has been set
                appPortMatched = info.exposedPort ? true : false;

                // break out of the loop if the port has been assigned
                break;
              }
            }
            // if the app port had matched, break out of the outer loop
            if (appPortMatched) break;
          }

          // loop over to check for the debug port
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const port = key.split("/")[0];
            if ((projectInfo.startMode === StartModes.debug || projectInfo.startMode === StartModes.debugNoInit)
                && projectInfo.debugPort == port) {
              info.internalDebugPort = port;
              info.exposedDebugPort = portObject[key][0].HostPort;
              // break out of the loop if the debug port has been assigned
              break;
            }
          }

          // Use position to look for the app port for backwards compatibility.  If the first
          // port matches the debug port then try the second.
          if (!appPortMatched) {
            let firstKey = keys[0];
            const containerPort = firstKey.split("/")[0];
            if (projectInfo.debugPort && (projectInfo.debugPort == containerPort) && (keys.length > 1)) {
              firstKey = keys[1];
            }
            // Check if Docker container actually has a port allocated
            if (portObject[firstKey] !== undefined && portObject[firstKey] !== null) {
              const hostPort = portObject[firstKey][0].HostPort;
              info.exposedPort = hostPort;
              info.internalPort = firstKey.split("/")[0];
            }
          }

          // Loop through to get a list of all the exposed container ports
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const port = key.split("/")[0];
            info.containerPorts.push(port);
          }

          // log internalPorts and exposedPorts
          logger.logProjectInfo("Internal port: " + info.internalPort, projectInfo.projectID, projectInfo.projectName);
          logger.logProjectInfo("Exposed port: " + info.exposedPort, projectInfo.projectID, projectInfo.projectName);

          // log internal debug ports and exposed debug ports
          logger.logProjectInfo("Internal debug port: " + info.internalDebugPort, projectInfo.projectID, projectInfo.projectName);
          logger.logProjectInfo("Exposed debug port: " + info.exposedDebugPort, projectInfo.projectID, projectInfo.projectName);

          // log all the exposed container ports
          logger.logProjectInfo("All the exposed container ports: " + JSON.stringify(info.containerPorts), projectInfo.projectID, projectInfo.projectName);
        }
      }
    }
  } catch (err) {
    logger.logProjectError(err, projectInfo.projectID);
  }
  return info;
}

/**
 * @function
 * @description Find out if internal debug port has been changed for a running container.
 *
 * @param projectInfo <Required | ProjectInfo> - The metadata information for a project.
 * @param containerName <Required | String> - The docker container name.
 *
 * @returns Promise<boolean>
 */
export async function hasDebugPortChanged(projectInfo: ProjectInfo, containerName: string): Promise<boolean> {
  try {
    // docker inspect has a '/' prefixed to the name
    const searchName = "/" + containerName;
    const containers = await docker.listContainers();
    if (containers && containers.length > 0) {
      for (const containerInfo of containers) {
        const container = await docker.getContainer(containerInfo.Id);
        const data = await container.inspect();

        if (data.Name === searchName) {
          const portObject = data.NetworkSettings.Ports;
          const keys = Object.keys(portObject);
          // loop over to check for the debug port
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const port = key.split("/")[0];
            if (projectInfo.debugPort == port) {
              // found a match of the deug port for the current running project
              return false;
            }
          }
          return true;
        }
      }
    }
  } catch (err) {
    logger.logProjectError("Error occurred when trying to get the internal debug port for project. ", projectInfo.projectID);
    logger.logProjectError(err, projectInfo.projectID);
  }

  // default to return hasDebugPortChanged = true if error occurred when getting debug port
  // fw will rebuild the project
  return true;
}

/**
 * @function
 * @description Check if docker container is active.
 *
 * @param containerName <Required | String> - The docker container name.
 *
 * @returns Promise<any>
 */
export async function isContainerActive(containerName: string): Promise<any> {
  const opts = {
    "all": true,
    "filters": '{"name": ["' + containerName + '"]}'
  };
  const searchName = "/" + containerName;
  const containers = await docker.listContainers(opts);
  if (containers && containers.length > 0) {
    for (const containerInfo of containers) {
      for (const name of containerInfo.Names) {
        if (name === searchName) {
          const state = containerInfo.State;
          if (state === "created" || state === "restarting") {
            return { state: ContainerStates.containerStarting };
          } else if (state === "running") {
            return { state: ContainerStates.containerActive };
          } else {
            return { state: ContainerStates.containerStopped };
          }
        }
      }
    }
  }
  return { state: ContainerStates.containerNotFound };
}

/**
 * @function
 * @description Check if file exists in the container.
 *
 * @param projectID <Required | String> - An alphanumeric identifier for a project.
 * @param containerName <Required | String> - The docker container name.
 * @param fileLocation <Required | String> - The file location inside the container.
 * @param projectName <Required | String> - The project name.
 *
 * @returns Promise<Boolean>
 */
export async function fileExistInContainer(projectID: string, containerName: string, fileLocation: string, projectName: string): Promise<Boolean> {
  logger.logProjectInfo("Looking for file existency for " + fileLocation + " in container " + containerName, projectID, projectName);
  const container = docker.getContainer(containerName);
  const cmd = "[ -e " + fileLocation + " ]&& echo 'true' || echo 'false'";
  const options = {
    Cmd: ["sh", "-c", cmd],
    AttachStdout: true,
    AttachStderr: true
  };

  try {
    const data: string = await containerExec(options, container, projectID);
    const returnVal = Boolean(data.replace(/\W/g, "")); // remove nonalphanumeric Ascii chars
    logger.logProjectInfo("File exists in container: " + data, projectID, projectName);
    return returnVal;
  } catch (err) {
    const errMsg = "Error checking existence for " + fileLocation + " in container " + containerName;
    logger.logProjectError(errMsg, projectID);
    logger.logProjectError(err, projectID);
  }
}

/**
 * @function
 * @description Check for files in a docker container directory.
 *
 * @param projectID <Required | String> - An alphanumeric identifier for a project.
 * @param containerName <Required | String> - The docker container name.
 * @param fileLocation <Required | String> - The path to the files location.
 *
 * @returns Promise<Array<logHelper.LogFiles>>
 */
export async function getFilesInContainerWithTimestamp(projectID: string, containerName: string, fileLocation: string): Promise<Array<logHelper.LogFiles>> {
  logger.logProjectInfo("Looking for all log files in container " + containerName, projectID);
  const container = docker.getContainer(containerName);
  const cmd = "ls -lt " + fileLocation + " | tail -n +2";
  const options = {
    Cmd: ["sh", "-c", cmd],
    AttachStdout: true,
    AttachStderr: true
  };

  try {
    // get all data from the container exec
    const data: string = await containerExec(options, container, projectID);
    if (data.indexOf("No such file or directory") > -1) {
      logger.logFileWatcherInfo("No files were found");
      return [];
    } else {
      logger.logFileWatcherInfo("At least one file was found");
      const files = data.replace(/\n/g, " ").replace(/[^ -~]+/g, "").split(" ").filter((entry: string) => { return entry.trim() != ""; });
      const fileIndex = 8; // file is the 9th argument from the above command
      const filesTimestamp: Array<logHelper.LogFiles> = [];
      for (let index = fileIndex; index < files.length; index = index + fileIndex + 1) {
        const file = files[index];
        const dateString = files[index - 1] + " " + files[index - 2] + " " + files[index - 3];
        filesTimestamp.push({file: path.join(fileLocation, file), time: moment(dateString).unix()});
      }
      return filesTimestamp;
    }
  } catch (err) {
    const errMsg = "Error checking existence for " + fileLocation + " in container " + containerName;
    logger.logProjectError(errMsg, projectID);
    logger.logProjectError(err, projectID);
  }
  return;
}

/**
 * @function
 * @description Exec into the container.
 *
 * @param options <Required | Any> - Options to exec into the container.
 * @param container <Required | Any> - The container to exec into.
 * @param projectID <Required | String> - An alphanumeric identifier for a project.
 *
 * @returns Promise<string>
 */
const containerExec = function (options: any, container: any, projectID: string): Promise<string> {
  return new Promise((resolve, reject) => {
    container.exec(options, async (err: any, exec: any) => {
      if (err) {
        const errMsg = "Error getting docker container exec object";
        logger.logProjectError(errMsg, projectID);
        reject(err);
        return;
      }

      exec.start((err: Error, stream: Stream) => {
        if (err) {
          const errMsg = "Error getting container exec stream";
          logger.logProjectError(errMsg, projectID);
          reject(err);
          return;
        }
        let data: string = "";
        stream.on("data", (chunk: any) => {
          data += chunk.toString("utf-8");
        });
        stream.on("end", () => {
          resolve(data.trim());
        });
      });
    });
  });
};

/**
 * @function
 * @description Build the image for a project.
 *
 * @param projectID <Required | String> - An alphanumeric identifier for a project.
 * @param imageName <Required | String> - The name of the docker image.
 * @param buildOptions <Required | String[]> - List of options required for building the image.
 * @param pathOrURL <Required | String> - The path or url of the dockerfile.
 * @param liveStream <Optional | Boolean> - Should the docker build be live streamed.
 * @param logFile <Optional | String> - Docker build log file if log will be live streamed.
 *
 * @returns Promise<ProcessResult>
 */
export async function buildImage(projectID: string, imageName: string, buildOptions: string[], pathOrURL: string, liveStream?: boolean, logFile?: string): Promise<ProcessResult> {
  const args: string[] = ["build", "--label", "builtBy=microclimate", "-t", imageName]; // initial arguments
  for (let i = 0; i < buildOptions.length; i++) {
    args.push(buildOptions[i]);
  }

  if (liveStream && logFile) {
    logger.fileWatcherAssert(logFile != undefined, "Log file is a required parameter if live stream option is passed");
    const newArgs = [args.join(" "), pathOrURL, logFile, projectID];
    return await processManager.spawnDetachedAsync(projectID, "/file-watcher/scripts/dockerScripts/docker-build.sh", newArgs, {});
  } else {
    try {
      args.push(pathOrURL); // final argument is the docker file path or a URL
      return await runDockerCommand(projectID, args);
    } catch (err) {
      throw err;
    }
  }
}

/**
 * @function
 * @description Run a container.
 *
 * @param projectID <Required | String> - An alphanumeric identifier for a project.
 * @param containerName <Required | String> - The docker container name.
 *
 * @returns Promise<ProcessResult>
 */
export async function runContainer(projectID: string, containerName: string): Promise<ProcessResult> {
  const args: string[] = ["run", "--label", "builtBy=microclimate", "--name", containerName, "--network=microclimate_network", "-P", "-dt", containerName]; // initial arguments
  try {
    logger.logProjectInfo("Run docker container", projectID);
    return await runDockerCommand(projectID, args);
  } catch (err) {
    logger.logProjectError("Error running container", projectID);
    throw err;
  }
}

/**
 * @function
 * @description Remove the container.
 *
 * @param projectID <Required | String> - An alphanumeric identifier for a project.
 * @param containerName <Required | String> - The docker container name.
 *
 * @returns Promise<ProcessResult>
 */
export async function removeContainer(projectID: string, containerName: string): Promise<ProcessResult> {
  const rm: string[] = ["rm", "-f", containerName];
  let response: ProcessResult;

  // Remove container
  try {
    logger.logProjectInfo("Removing docker container", projectID);
    response = await runDockerCommand(projectID, rm);
  } catch (err) {
    logger.logProjectError("Error removing container", projectID);
    logger.logProjectError(err, projectID);
    throw err;
  }

  // Remove image
  try {
    response = await removeImage(projectID, containerName);
  } catch (err) {
    logger.logProjectError("Error removing image", projectID);
    logger.logProjectError(err, projectID);
    throw err;
  }
  return response;
}

/**
 * @function
 * @description Remove the image.
 *
 * @param projectID <Required | String> - An alphanumeric identifier for a project.
 * @param containerName <Required | String> - The docker container name.
 *
 * @returns Promise<ProcessResult>
 */
export async function removeImage(projectID: string, containerName: string): Promise<ProcessResult> {
  const rmi: string[] = ["rmi", "-f", containerName];
  let response: ProcessResult;

  // Remove image
  try {
    logger.logProjectInfo("Removing docker image", projectID);
    response = await runDockerCommand(projectID, rmi);
  } catch (err) {
    logger.logProjectError("Error removing image", projectID);
    logger.logProjectError(err, projectID);
    throw err;
  }
  return response;
}

/**
 * @function
 * @description Tag and push the image.
 *
 * @param projectID <Required | String> - An alphanumeric identifier for a project.
 * @param imageName <Required | String> - The docker image name.
 *
 * @returns Promise<ProcessResult>
 */
export async function tagAndPushImage(projectID: string, imageName: string): Promise<ProcessResult> {
  const dockerRegistry: string = process.env.DOCKER_REGISTRY;
  const tag: string[] = ["tag", imageName, dockerRegistry + "/" + imageName];
  const push: string[] = ["push", dockerRegistry + "/" + imageName];
  let response: ProcessResult;

  // Tag Image
  try {
    logger.logProjectInfo("Tagging docker image", projectID);
    response = await runDockerCommand(projectID, tag);
  } catch (err) {
    logger.logProjectError("Error tagging image", projectID);
    logger.logProjectError(err, projectID);
    throw err;
  }

  // Push image
  try {
    logger.logProjectInfo("Pushing docker image", projectID);
    response = await runDockerCommand(projectID, push);
  } catch (err) {
    logger.logProjectError("Error pushing image", projectID);
    logger.logProjectError(err, projectID);
    throw err;
  }
  return response;
}

/**
 * @function
 * @description Remove dangling images.
 *
 * @returns Promise<void>
 */
export async function removeDanglingImages(): Promise<void> {
  // remove any dangling images
  const dangling_cmd = "docker images --filter=\"dangling=true\" -q";
  exec(dangling_cmd, (err, stdout) => {
    // if there is an internal error with the command
    if (err) {
      logger.logFileWatcherError("An error was encountered while searching for dangling images.");
      logger.logFileWatcherError(err.message);
    } else if (stdout) { // if the dangling command returned list of dangling images
      exec("docker rmi -f $(" + dangling_cmd + ")", (err) => {
        if (err) {
          logger.logFileWatcherError("An error was encountered while deleting dangling images.");
          logger.logFileWatcherError(err.message);
        } else {
          logger.logFileWatcherInfo(`Successfully removed dangling images`);
        }
      });
    } else { // if no images were returned
      logger.logFileWatcherInfo("No dangling images were found.");
    }
  });
}

/**
 * @function
 * @description Run a docker command.
 *
 * @param projectID <Required | String> - An alphanumeric identifier for a project.
 * @param args <Required | String[]> - The list of args to pass to the command.
 *
 * @returns Promise<ProcessResult>
 */
async function runDockerCommand(projectID: string, args: string[]): Promise<ProcessResult> {
  try {
    logger.logProjectInfo("Run docker command: docker " + args, projectID);
    return await processManager.spawnDetachedAsync(projectID, "docker", args, {});
  } catch (err) {
    throw err;
  }
}
