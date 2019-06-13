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

import { promisify } from "util";
import fs from "fs";
import path from "path";
import * as projectOperation from "../projects/operation";
import * as projectsController from "./projectsController";
import * as projectExtensions from "../extensions/projectExtensions";
import * as logger from "../utils/logger";
import * as statusController from "./projectStatusController";
import { UpdateProjectInfoPair, ProjectInfo } from "../projects/Project";
import * as projectSpecifications  from "../projects/projectSpecifications";
import AsyncLock from "async-lock";
const lock = new AsyncLock();

const fileStatAsync = promisify(fs.stat);
const readFileAsync = promisify(fs.readFile);

/**
 * @description
 * Map to save the timer for update operation for the current project
 * key: projectID
 * value: timer
 */
export const timerMap: Map<string, NodeJS.Timer> = new Map<string, NodeJS.Timer>();
export const changedFilesMap: Map<string, IFileChangeEvent[]> = new Map<string, IFileChangeEvent[]>();
export const chunkRemainingMap: Map <string, ChunkRemainingMapValue[]> = new Map<string, ChunkRemainingMapValue[]>();
// 20s timeout to wait for all chunks
// TODO: make the timeout user consigurable in project settings
const timeout = 20000;

/**
 * @see [[Filewatcher.updateProject]]
 */
export async function updateProject(projectID: string): Promise<IUpdateProjectSuccess | IUpdateProjectFailure> {
    if (!projectID) {
        return { "statusCode": 400, "error": {"msg": "Bad request, projectID is a required." }};
    }

    try {
        const projectMetadata = projectsController.getProjectMetadataById(projectID);
        try {
            await fileStatAsync(projectMetadata.infoFile);
        } catch (err) {
            if (err.code == "ENOENT") {
                logger.logFileWatcherError("Project does not exist " + projectID);
                return { "statusCode": 404, "error": {"msg": "Project does not exist " + projectID }};
            }
        }
        const f = projectMetadata.infoFile;
        const projectInfo = await projectsController.getProjectInfoFromFile(f);
        if (!projectInfo.autoBuildEnabled) {
            logger.logProjectInfo("Auto build disabled so build will not be started", projectID);
            statusController.buildRequired(projectID, true);
            // TODO:
            // currently the statusCode 202 just means the request is accepted.
            // REST API statusCode does not make sense to a node module. Need to change later.
            return { "statusCode": 202 };
        }

        if (!statusController.isBuildInProgress(projectInfo.projectID)) {
            const projectHandler = projectExtensions.getProjectHandler(projectInfo.projectType);
            const operation = new projectOperation.Operation("update", projectInfo);
            projectHandler.update(operation);
        } else {
            logger.logProjectInfo("Project "  + projectID + " build is in progress, set build request flag to true", projectID);
            const keyValuePair: UpdateProjectInfoPair = {
                key : "buildRequest",
                value: true,
                saveIntoJsonFile: false
            };
            await projectsController.updateProjectInfo(projectID, keyValuePair);
        }
    } catch (err) {
        const errorMsg = "Internal error occurred when updating project " + projectID;
        logger.logProjectError(errorMsg, projectID);
        logger.logProjectError(err, projectID);
        return { "statusCode": 500, "error": {"msg": errorMsg }};
    }
    return { "statusCode": 202 };

}

/**
 * This is a function to receive notification from filewatcher daemon
 * @see [[Filewatcher.updateProjectForNewChange]]
 */
export async function updateProjectForNewChange(projectID: string, timestamp: number,  chunk: number, chunk_total: number, eventArray: IFileChangeEvent[]): Promise<IUpdateProjectSuccess | IUpdateProjectFailure> {
    if (!projectID || !timestamp || !eventArray || !chunk || !chunk_total) {
        return { "statusCode": 400, "error": {"msg": "Bad request. projectID, timestamp, chunk, chunk_total and eventArray are required." }};
    }

    try {
        logger.logProjectInfo("Project "  + projectID + " file changed" , projectID);
        const projectMetadata = projectsController.getProjectMetadataById(projectID);
        try {
            await fileStatAsync(projectMetadata.infoFile);
        } catch (err) {
            if (err.code == "ENOENT") {
                logger.logFileWatcherError("Project does not exist " + projectID);
                return { "statusCode": 404, "error": {"msg": "Project does not exist " + projectID }};
            }
        }

        const f = projectMetadata.infoFile;
        const projectInfo: ProjectInfo = await projectsController.getProjectInfoFromFile(f);
        await lock.acquire("timerLock", done => {
            if (timerMap.get(projectID) != undefined) {
                clearTimeout(timerMap.get(projectID));
            }
            done();
        }, () => {
            // timerLock release
        }, {});

        try {
            eventArray.forEach( async element => {
                if (element.path && element.path.includes(".cw-settings")) {
                    logger.logProjectInfo("cw-settings file changed.", projectID);
                    const settingsFilePath = path.join(projectInfo.location, ".cw-settings");
                    const data = await readFileAsync(settingsFilePath, "utf8");
                    const projectSettings = JSON.parse(data);
                    projectSpecifications.projectSpecificationHandler(projectID, projectSettings);
                    // to break out of foreach loop
                    throw new Error("break out");
                }
            });
        } catch (err) {
            // out of forEach, do nothing
        }

        if (eventArray.length == 1 && eventArray[0].path && eventArray[0].path.includes(".cw-settings")) {
            // .cw-settings file is the only changed file. return succeed status
            return { "statusCode": 202 };
        }
        await lock.acquire("changedFilesLock", done => {
            const oldChangedFiles: IFileChangeEvent[] = changedFilesMap.get(projectID);
            const newChangedFiles: IFileChangeEvent[] = oldChangedFiles ? oldChangedFiles.concat(eventArray) : eventArray;
            changedFilesMap.set(projectID, newChangedFiles);
            done();
        }, () => {
            // changedFilesLock release
        }, {});

        await lock.acquire(["chunkRemainingLock", "timerLock", "changedFilesLock"], async done => {
            let newChunkRemaining;
            if (chunk_total == 1) {
                newChunkRemaining = 0;
            } else {
                const chunkRemainingArray = chunkRemainingMap.get(projectID);
                if (chunkRemainingArray) {
                    let i;
                    for ( i = 0 ; i < chunkRemainingArray.length; i++) {
                        const chunkRemainingElement = chunkRemainingArray[i];
                        if (chunkRemainingElement.timestamp == timestamp) {
                            const oldchunkRemaining = chunkRemainingElement.chunkRemaining;
                            newChunkRemaining = oldchunkRemaining - 1;
                            if (newChunkRemaining == 0) {
                                chunkRemainingArray.splice(i, 1);
                            } else {
                                const value: ChunkRemainingMapValue = {
                                    timestamp: timestamp,
                                    chunkRemaining: newChunkRemaining
                                };
                                chunkRemainingArray[i] = value;
                                chunkRemainingMap.set(projectID, chunkRemainingArray);
                            }
                            break;
                        }
                    }
                    // first time initialize for this timestamp
                    if (chunkRemainingArray.length != 0 && i == chunkRemainingArray.length) {
                        const value: ChunkRemainingMapValue = {
                            timestamp: timestamp,
                            chunkRemaining: chunk_total - 1
                        };
                        chunkRemainingArray.push(value);
                        chunkRemainingMap.set(projectID, chunkRemainingArray);
                    }
                } else {
                    // first time initialize for this projectID
                    const tempArray = [];
                    const value: ChunkRemainingMapValue = {
                        timestamp: timestamp,
                        chunkRemaining: chunk_total - 1
                    };
                    tempArray.push(value);
                    chunkRemainingMap.set(projectID, tempArray);
                }
            }

            if (!projectInfo.autoBuildEnabled) {
                logger.logProjectInfo("Auto build disabled so build will not be started", projectID);
                statusController.buildRequired(projectID, true);
            }

            if (newChunkRemaining == 0) {
                // this is the last chunk for this timestamp, check if still waiting for other chunks for other timestamps
                let shouldTriggerBuild = true;
                if (chunkRemainingMap.size != 0) {
                    const chunkRemainingArray = chunkRemainingMap.get(projectID);
                    if (chunkRemainingArray && chunkRemainingArray.length > 0) {
                        // still waiting for some chunks
                        shouldTriggerBuild = false;
                    }
                }
                if (shouldTriggerBuild) {
                    if (projectInfo.autoBuildEnabled) {
                        if (!statusController.isBuildInProgress(projectID)) {
                            const projectHandler = projectExtensions.getProjectHandler(projectInfo.projectType);
                            const operation = new projectOperation.Operation("update", projectInfo);
                            projectHandler.update(operation, changedFilesMap.get(projectInfo.projectID));
                        } else {
                            logger.logProjectInfo("Project "  + projectID + " build is in progress, set build request flag to true", projectID);
                            const keyValuePair: UpdateProjectInfoPair = {
                                key : "buildRequest",
                                value: true,
                                saveIntoJsonFile: false
                            };
                            await projectsController.updateProjectInfo(projectID, keyValuePair);
                        }
                        // remove the cache in memory
                        changedFilesMap.delete(projectID);
                    }
                    timerMap.delete(projectID);
                    chunkRemainingMap.delete(projectID);
                    done();
                    return;
                }
            }

            const timer = setTimeout(async () => {
                try {
                    if (projectInfo.autoBuildEnabled) {
                        if (!statusController.isBuildInProgress(projectID)) {
                            const projectHandler = projectExtensions.getProjectHandler(projectInfo.projectType);
                            const operation = new projectOperation.Operation("update", projectInfo);
                            projectHandler.update(operation, changedFilesMap.get(projectInfo.projectID));
                        } else {
                            logger.logProjectInfo("Project "  + projectID + " build is in progress, set build request flag to true", projectID);
                            const keyValuePair: UpdateProjectInfoPair = {
                                key : "buildRequest",
                                value: true,
                                saveIntoJsonFile: false
                            };
                            await projectsController.updateProjectInfo(projectID, keyValuePair);
                        }
                        // remove the cache in memory
                        changedFilesMap.delete(projectID);
                    }
                    timerMap.delete(projectID);
                    chunkRemainingMap.delete(projectID);
                } catch (err) {
                    logger.logProjectError("Failed to set timeout for project update.", projectID);
                }
            }, timeout);
            timerMap.set(projectID, timer);
            done();
        }, () => {
            // all locks release
        }, {});
    } catch (err) {
        const errorMsg = "Internal error occurred when updating project " + projectID;
        logger.logProjectError(errorMsg, projectID);
        logger.logProjectError(err, projectID);
        return { "statusCode": 500, "error": {"msg": errorMsg }};
    }
    return { "statusCode": 202 };

}

export interface IUpdateProjectSuccess {
    statusCode: 202;
}
export interface IUpdateProjectFailure {
    statusCode: 400 | 404| 500;
    error: { msg: string };
}

export interface IFileChangeEvent {
    path: string;
    timestamp: number;
    type: string;
    directory: boolean;
}
export interface ChunkRemainingMapValue {
    timestamp: number;
    chunkRemaining: number;
}