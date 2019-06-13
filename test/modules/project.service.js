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

/**
 * This module's purpose is to centralise as much 'project' logic as possible.
 * Example usage:
 *    const projectManager = require(../modules/projectManager.js);
 *    const projectID = await projectManager.createProject( { name, 'example' });
 *    await projectManager.deleteProject(projectID);
 */

const chai = require('chai');
const uuidv4 = require('uuid/v4');
const { promisify } = require('util');
const git = require('simple-git/promise');
const fs = require('fs-extra');
const path = require('path');

const reqService = require('./request.service');
const containerService = require('./container.service');
const { ADMIN_COOKIE, containerDir, templateOptions } = require('../config');

chai.should();
const sleep = promisify(setTimeout);
const isObject = (obj) => (!!obj && obj.constructor === Object);

const fastestCreationOptions = {
    language: 'nodejs',
    framework: 'spring',
};

let workspace_location ;

async function cloneAndBindProject(projectName, projectType) {
    const workspace = await findWorkspaceLocation();
    const projectPath = `${workspace}/${projectName}`;
    await cloneProject(templateOptions[projectType].url, projectPath);
    const language = templateOptions[projectType].language;
    const options = { 
        name: projectName,
        path: projectPath,
        language,
        projectType,
        autoBuild: false,
    };
    const res = await bindProject(options);
    return res.body.projectID;
}

async function bindNonBuiltProjectFromTemplate(
    projectName,
    parentPath,
    templateID
){  
    const templateDetails = await createProjectFromTemplate({ projectName, parentPath, templateID });
    const { projectType, language } = templateDetails.result;    
    const projectPath = path.join(parentPath, projectName);
    const res = await bindProject({ 
        name: projectName,
        path: projectPath,
        language,
        projectType,
        autoBuild: false,
    });
    return res.body.projectID;
};

async function createProjectFromTemplate(
    options,
    expectedResStatus = 200,
){
    const res = await reqService.chai
        .post('/api/v1/projects')
        .set('cookie', ADMIN_COOKIE)
        .send(options);
    res.status.should.equal(expectedResStatus);
    return res.body;
}

/**
 * @param {JSON} [options] e.g. { name: 'example' }
 * @param {number} [expectedResStatus] default 202
 * @param {boolean} [awaitSocketConfirmation] false by default, so won't wait for projectStart. Set to true to make it wait until the project is starting
 */
async function createProjectAndAwaitID(
    options,
    expectedResStatus = 202,
    awaitSocketConfirmation = false,
) {
    const completeOptions = completeCreationOptions(options);
    await createProject(completeOptions, expectedResStatus, awaitSocketConfirmation);
    await awaitProject(completeOptions.name);
    const projectID = await getProjectIdFromName(completeOptions.name);
    return projectID;
}

/**
 * @param {JSON} [options] e.g. { name: 'example' }
 * @param {number} [expectedResStatus] default 202
 * @param {boolean} [awaitSocketConfirmation] false by default, so won't wait for projectStart. Set to true to make it wait until the project is starting
 */
async function createProject(
    options,
    expectedResStatus = 202,
    awaitSocketConfirmation = false,
) {
    const completeOptions = completeCreationOptions(options);
    const req = () => reqService.chai
        .post('/api/v1/projects')
        .set('Cookie', ADMIN_COOKIE)
        .send(completeOptions);
    awaitSocketConfirmation
        ? await reqService.makeReqAndAwaitSocketMsg(req, expectedResStatus, { msgType: 'projectStarting' })
        : await reqService.makeReq(req, expectedResStatus);
}

/**
 * @param {JSON} [options] e.g. { name: 'example' }
 * @param {number} [expectedResStatus] default 202
 */
async function createNonBuiltProject(
    options,
    expectedResStatus = 202,
) {
    const name = options.name;
    const completeOptions = completeCreationOptions(options);
    completeOptions.autoBuild = false;
    const req = () => reqService.chai
        .post('/api/v1/projects')
        .set('Cookie', ADMIN_COOKIE)
        .send(completeOptions);
    await reqService.makeReqAndAwaitSocketMsg(req, expectedResStatus, { name, msgType: 'projectCreation' });
    const projectID = await getProjectIdFromName(completeOptions.name);
    return projectID;
}

/**
 * @param {JSON} [options]
 * @returns {JSON} JSON with 'name', 'language', and (if 'language' is Java) 'framework' fields set to default values if they were empty
 */
function completeCreationOptions(options = {}) {
    if (!isObject(options)) throw new Error(`'${options}' should be an object`);
    if (options.extension) return options;

    const completeOptions = { ...options };

    completeOptions.name = options.name || generateUniqueName();
    completeOptions.langauge = templateOptions[options.type].language;
    completeOptions.url = templateOptions[options.type].url;
    
    return completeOptions;
}


async function createFromTemplate(options) {
    const res = await reqService.chai
        .post('/api/v1/projects')
        .set('cookie', ADMIN_COOKIE)
        .send(options);
    return res;
}

/**
 * @param {JSON} [options] e.g. { name: 'example' }
 * @param {number} [expectedResStatus] default 202
 */
async function bindProject(
    options,
    expectedResStatus = 202,
) {
    const req = () => {
        return reqService.chai
            .post('/api/v1/projects/bind')
            .set('Cookie', ADMIN_COOKIE)
            .send(options);
    };
    const res = await reqService.makeReqAndAwaitSocketMsg(req, expectedResStatus, { msgType: 'projectBind' });
    return res;
}

/**
 * @param {JSON} [options] e.g. { name: 'example' }
 * @param {number} [expectedResStatus] default 202
 */
async function unbindProject(
    projectID,
    expectedResStatus = 202,
) {
    const req = () => reqService.chai
        .post(`/api/v1/projects/${projectID}/unbind`)
        .set('Cookie', ADMIN_COOKIE);
    const res = await reqService.makeReqAndAwaitSocketMsg(req, expectedResStatus, { projectID, msgType: 'projectDeletion' });
    return res;
}

function generateUniqueName(baseName = 'test') {
    const uniqueNumbers = uuidv4()
        .replace(/[^0-9]/gi, '')
        .substring(0,10);
    return `${baseName}${uniqueNumbers}`;
}

function createProjects(optionsArray, expectedResStatus) {
    if (!Array.isArray(optionsArray)) throw new Error(`'${optionsArray}' should be an array`);
    const promises = optionsArray.map(options => createProject(options, expectedResStatus));
    return Promise.all(promises);
}

function openProject(projectID, expectedResStatus = 200) {
    if (typeof projectID !== 'string') throw new Error(`'${projectID}' should be a string`);
    const req = () => reqService.chai
        .put(`/api/v1/projects/${projectID}/open`)
        .set('Cookie', ADMIN_COOKIE);
    return reqService.makeReq(req, expectedResStatus);
}

/**
 * @param {String} projectID
 * @param {number} [expectedResStatus] e.g. 202
 * @param {boolean} [awaitSocketConfirmation] true by default, so will wait for projectClose. Set to false to make it skip confirmation
 */
function closeProject(
    projectID,
    expectedResStatus = 202,
    awaitSocketConfirmation = true
) {
    if (typeof projectID !== 'string') throw new Error(`'${projectID}' should be a string`);
    const req = () => reqService.chai
        .put(`/api/v1/projects/${projectID}/close`)
        .set('Cookie', ADMIN_COOKIE);
    return awaitSocketConfirmation
        ? reqService.makeReqAndAwaitSocketMsg(req, expectedResStatus, { projectID, msgType: 'projectClosed' })
        : reqService.makeReq(req, expectedResStatus);

}
/**
 *
 * @param {String} projectID
 * @param {String} [startMode] see {@link https://github.ibm.com/dev-ex/portal/wiki/API:-Projects-(build-capabilities-close-create-delete-listing-open-metrics-properties-repositories-restart)#project-restart} for permitted startModes
 * @param {number} [expectedResStatus] default 202
 * @param {boolean} [awaitSocketConfirmation] false by default, so won't wait for projectStart. Set to true to make it wait until the project is starting
 */
function restartProject(
    projectID,
    startMode = 'run',
    expectedResStatus = 202,
    awaitSocketConfirmation = false
) {
    if (typeof projectID !== 'string') throw new Error(`'${projectID}' should be a string`);
    const req = () => reqService.chai
        .post(`/api/v1/projects/${projectID}/restart`)
        .set('Cookie', ADMIN_COOKIE)
        .send({ startMode });
    return awaitSocketConfirmation
        ? reqService.makeReqAndAwaitSocketMsg(req, expectedResStatus, { projectID, msgType: 'projectStarting' })
        : reqService.makeReq(req, expectedResStatus);
}

async function getProjects() {
    const req = () => reqService.chai
        .get('/api/v1/projects')
        .set('Cookie', ADMIN_COOKIE);
    const res = await reqService.makeReq(req, 200);
    if (!Array.isArray(res.body)) throw new Error(`'${res.body}' should be an array`);
    return res.body;
}

async function getProjectIdFromName(projectName) {
    if (typeof projectName !== 'string') throw new Error(`'${projectName}' should be a string`);
    const project = await getProjectByName(projectName);
    const { projectID } = project;
    return projectID;
}
async function getProjectByName(projectName) {
    if (typeof projectName !== 'string') throw new Error(`'${projectName}' should be a string`);
    const projects = await getProjects();
    const project = projects.find(project => project.name === projectName);
    return project;
}

async function getProject(id) {
    const req = () => reqService.chai
        .get(`/api/v1/projects/${id}`)
        .set('Cookie', ADMIN_COOKIE);
    const res = await reqService.makeReq(req, 200);
    const project = res.body;
    if (!project || typeof project !== 'object') throw new Error(`'${project}' should be an object`);
    return project;
}

async function getProjectIDs() {
    const projects = await getProjects();
    const projectIDs = projects.map(project => project.projectID);
    return projectIDs;
}

async function countProjects() {
    const projects = await getProjects();
    return projects.length;
}

async function awaitProject(projectName) {
    const project = await getProjectByName(projectName);
    if (project) return true;

    await sleep(1000);
    return awaitProject(projectName);
}

async function runLoad(projectID, description = null) {
    let body = null;
    if (description) {
        body = { description };
    }
    const res = await reqService.chai
        .post(`/api/v1/projects/${projectID}/runLoad`)
        .set('Cookie', ADMIN_COOKIE)
    return res;
}

const cancelLoad = projectID => reqService.chai
    .post(`/api/v1/projects/${projectID}/cancelLoad`)
    .set('Cookie', ADMIN_COOKIE);

async function getLogStreams(projectID) {
    const res = await reqService.chai
        .get(`/api/v1/projects/${projectID}/logs`)
        .set('Cookie', ADMIN_COOKIE);
    res.should.have.status(200);
    res.should.have.ownProperty('body');
    res.body.should.be.an('object');
    return res.body;
}

async function startLogStreams(projectID) {
    const res = await reqService.chai
        .post(`/api/v1/projects/${projectID}/logs`)
        .set('Cookie', ADMIN_COOKIE);
    res.should.have.status(200);
    res.should.have.ownProperty('body');
    res.body.should.be.an('object');
    return res.body;
}

async function cloneProject(giturl, dest) {
    await git().clone(giturl, dest);
}

async function findWorkspaceLocation() {
    if (workspace_location != null) {
        return workspace_location;
    }
    const res = await reqService.chai
        .get('/api/v1/environment')
        .set('Cookie', ADMIN_COOKIE);
    res.should.have.status(200);
    res.should.have.ownProperty('body');
    workspace_location =  res.body.workspace_location;
    await containerService.ensureDir(containerDir);
    return workspace_location;
}

function readCwSettings(projectPath) {
    return fs.readJSONSync(`${projectPath}/.cw-settings`);
}


module.exports = {
    fastestCreationOptions,
    generateUniqueName,
    bindNonBuiltProjectFromTemplate,
    createNonBuiltProject,
    createProjectAndAwaitID,
    createProject,
    createProjects,
    createProjectFromTemplate,
    completeCreationOptions,
    openProject,
    closeProject,
    restartProject,
    getProjectIdFromName,
    getProjects,
    getProject,
    getProjectIDs,
    countProjects,
    awaitProject,
    runLoad,
    cancelLoad,
    getLogStreams,
    startLogStreams,
    bindProject,
    unbindProject,
    cloneProject,
    findWorkspaceLocation,
    readCwSettings,
    createFromTemplate,
    cloneAndBindProject,
};
