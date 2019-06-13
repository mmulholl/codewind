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

import * as logger from "../utils/logger";
import * as utils from "../utils/utils";

// built-in project extensions
import * as libertyProject from "../projects/libertyProject";
import * as springProject from "../projects/springProject";
import * as swiftProject from "../projects/swiftProject";
import * as nodeProject from "../projects/nodejsProject";
import { DockerProject } from "../projects/DockerProject";
import { ProjectCapabilities, defaultProjectCapabilities } from "../projects/Project";

export const DOCKER_TYPE = "docker";

export const projectHandlers = [libertyProject, springProject, swiftProject, nodeProject];
const projectExtensionList: string[] = [];

/**
 * @function
 * @description Check to see if a project extension is supported.
 *
 * @param projectType <Required | String> - The project type.
 *
 * @returns boolean
 */
export function isProjectExtensionSupported(projectType: string): boolean {
    const isExtensionSupported = projectExtensionList.includes(projectType);
    return isExtensionSupported;
}

/**
 * @function
 * @description Add the project type to the project extension list.
 *
 * @param projectType <Required | String> - The project type.
 *
 * @returns void
 */
export function setProjectExtensionList(projectType: string): void {
    projectExtensionList.push(projectType);
    logger.logFileWatcherInfo("projectExtensionList has been updated with extension type " + projectType + ": " + projectExtensionList);
}

/**
 * @function
 * @description Remove the project type from the project extension list.
 *
 * @param projectType <Required | String> - The project type.
 *
 * @returns void
 */
export function removeProjectExtensionList(projectType: string): void {
    projectExtensionList.splice(projectExtensionList.indexOf(projectType), 1);
    logger.logFileWatcherInfo("Extension type " + projectType + " has been removed from projectExtensionList: " + projectExtensionList);
}

/**
 * @function
 * @description Get list of project types.
 *
 * @param location <Required | String> - The folder location to scan.
 *
 * @returns Promise<Array<string>>
 */
export async function getProjectTypes(location: string): Promise<Array<string>> {

    let types: Array<string> = [];

    // If no project location is specified then return all known types
    if (!location) {
        return getAllProjectTypes();
    }

    types = await determineProjectType(location);

    return types;
}

/**
 * @function
 * @description Determine the project type given the project location.
 *
 * @param location <Required | String> - The folder location to scan.
 *
 * @returns Promise<Array<string>>
 */
export async function determineProjectType(location: string): Promise<Array<string>> {
    logger.logFileWatcherInfo("Determining project type for project at location: " + location);

    if (! await utils.asyncFileExists(location)) {
        const msg = "The location does not exist: " + location;
        logger.logFileWatcherError(msg);
        const error = new Error("The location does not exist: " + location);
        error.name = "FILE_NOT_EXIST";
        throw error;
    }

    const types = [];

    if (await utils.asyncIsDirectory(location)) {

        for (let i = 0; i < projectHandlers.length; i++) {
            const isValidLoc = await projectHandlers[i].typeMatches(location);
            if (isValidLoc) {
                types.push(projectHandlers[i].supportedType);
            }
        }

    }

    logger.logFileWatcherInfo("The project location " + location + " matched types: " + types);
    return types;
}

/**
 * @function
 * @description Get all project types supported.
 *
 * @returns Array<string>
 */
export function getAllProjectTypes(): Array<string> {
    const types: string[] = [];
    projectHandlers.forEach((handler) => {
        if (handler.supportedType) {
            types.push(handler.supportedType);
        }
    });
    types.push(DOCKER_TYPE);
    return types;
}

/**
 * @function
 * @description Get the selected project handler for the given project type.
 *
 * @param projectType <Required | String> - The project type.
 *
 * @returns any
 */
export function getProjectHandler(projectType: string): any {
    if (!projectType) {
        return undefined;
    }
    for (let i = 0; i < projectHandlers.length; i++) {
        if (projectHandlers[i].supportedType === projectType) {
            return projectHandlers[i];
        }
    }
    return new DockerProject(DOCKER_TYPE);
}

/**
 * @function
 * @description Get the project capability of a selected project.
 *
 * @param projectHandler <Required | Any> - The selected project handler for a project.
 *
 * @returns ProjectCapabilities
 */
export function getProjectCapabilities(projectHandler: any): ProjectCapabilities {
    if (projectHandler && projectHandler.hasOwnProperty("getCapabilities")) {
        return projectHandler.getCapabilities();
    }
    else {
        return defaultProjectCapabilities;
    }
}
