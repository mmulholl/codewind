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
import * as fs from "fs";
import * as util from "util";
import * as logger from "./logger";
import * as fse from "fs-extra";

const promisify = util.promisify;
const accessAsync = promisify(fs.access);
const statAsync = promisify(fs.stat);
const copyAsync = promisify(fs.copyFile);
const readDirAsync = promisify(fs.readdir);
const copyDirAsync = promisify(fse.copy);

/**
 * @function
 * @description Check if a file exists asynchronously.
 *
 * @param file <Required | String> - The path to the file location.
 *
 * @returns Promise<boolean> - true if file exists, false otherwise.
 */
export async function asyncFileExists(file: string): Promise<boolean> {
    try {
        await accessAsync(file);
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * @function
 * @description Check if the folder is a directory asynchronously.
 *
 * @param file <Required | String> - The path to the folder location.
 *
 * @returns Promise<boolean> - true if folder exists, false otherwise
 */
export async function asyncIsDirectory(file: string): Promise<boolean> {
    try {
        const stat = await statAsync(file);
        return stat.isDirectory();
    } catch (err) {
        return false;
    }
}

/**
 * @function
 * @description Copy file from source to destination asynchronously.
 *
 * @param file <Required | String> - The source file location.
 * @param destination <Required | destination> - The destination location.
 *
 * @returns Promise<boolean> - true if copy was successful, false otherwise.
 */
export async function asyncCopyFile(file: string, destination: string): Promise<boolean> {
    try {
        await copyAsync(file, destination);
        return true;
    } catch (err) {
        logger.logFileWatcherError("Error copying file " + file  + " to destination " + destination);
        logger.logFileWatcherError(err);
        return false;
    }
}

/**
 * @function
 * @description Copy folder from source to destination asynchronously.
 *
 * @param file <Required | String> - The source folder location.
 * @param destination <Required | destination> - The destination location.
 *
 * @returns Promise<boolean> - true if copy was successful, false otherwise.
 */
export async function asyncCopyDir(src: string, destination: string): Promise<boolean> {
    try {
        await copyDirAsync(src, destination);
        logger.logFileWatcherInfo("Finished copying dir " + src + " to " + destination);
        return true;
    } catch (err) {
        logger.logFileWatcherError("Error copying dir " + src  + " to destination " + destination);
        logger.logFileWatcherError(err);
        return false;
    }
}

/**
 * @function
 * @description Read the contents of a directory asynchronously.
 *
 * @param dir <Required | String> - The directory location.
 *
 * @returns Promise<Array<string>>
 */
export async function asyncReadDir(dir: string): Promise<Array<string>> {
    try {
        const dirList = await readDirAsync(dir);
        return dirList;
    } catch (err) {
        logger.logFileWatcherError("Error reading directory " + dir);
        logger.logFileWatcherError(err);
        return undefined;
    }
}
