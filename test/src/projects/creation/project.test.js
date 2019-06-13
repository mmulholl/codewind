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
const chai = require('chai');
const path = require('path');
const fs = require('fs-extra');

const reqService = require('../../../modules/request.service');
const projService = require('../../../modules/project.service');
const { ADMIN_COOKIE, testTimeout, templateOptions } = require('../../../config');

chai.should();

describe('POST /projects API tests', function() {
    let workspace_location;

    const expectedCwSettingsData = {
        contextRoot: '',
        internalPort: '',
        healthCheck: '',
        watchedFiles: {
            includeFiles: [''],
            excludeFiles: [''],
        },
    };

    before(async function(){
        workspace_location = await projService.findWorkspaceLocation();
    });

    describe('Creating a project', function() {
        describe('Valid Input', () => {
            describe('java - liberty', function() {
                let projectPath, expectedResult;
                const url = templateOptions.liberty.url;
                const projectName = `creationlibertytest${Date.now()}`;
                const validOptions = {
                    projectName,
                    url,
                    projectPath,
                };

                before(function(){
                    projectPath = path.join(workspace_location, projectName);
                    validOptions.parentPath = workspace_location;
                    expectedResult = generateSuccessMessage('liberty', projectPath);
                });

                after(async function() {
                    this.timeout(2 * testTimeout.med);
                    await fs.remove(projectPath);
                });

                it('succeeds (with status 200) in creating a project', async function() {
                    this.timeout(testTimeout.med);
                    const res = await createAProject(validOptions);
                    res.should.have.status(200);
                    res.body.should.deep.equal(expectedResult);
                });

                it('has successfully cloned the git repo to disk', function() {
                    this.timeout(testTimeout.short);
                    const projectPathExists = fs.pathExistsSync(`${projectPath}/pom.xml`);
                    projectPathExists.should.be.true;
                });

                it('writes the .cw-settings file and adds the correct data', function() {
                    const cwSettingsData = projService.readCwSettings(projectPath);
                    cwSettingsData.should.deep.equal(expectedCwSettingsData);
                });

                it('fails (with status 400) to create a project if a non-empty parentPath is specified', async function() {
                    this.timeout(testTimeout.med);
                    const res = await createAProject(validOptions);
                    res.should.have.status(400);
                    res.body.code.should.equal('TARGET_DIR_NOT_EMPTY');
                });
            });

            describe('java - spring', function() {
                let projectPath, expectedResult;
                const url = templateOptions.spring.url;
                const projectName = `creationspringtest${Date.now()}`;
                const validOptions = {
                    projectName,
                    url,
                    projectPath,
                };

                before(function(){
                    projectPath = path.join(workspace_location, projectName);
                    validOptions.parentPath = workspace_location;
                    expectedResult = generateSuccessMessage('spring', projectPath);
                });

                after(async function() {
                    this.timeout(2 * testTimeout.med);
                    await fs.remove(projectPath);
                });

                it('succeeds (with status 200) in creating a project ', async function() {
                    this.timeout(testTimeout.med);
                    const res = await createAProject(validOptions);
                    res.should.have.status(200);
                    res.body.should.deep.equal(expectedResult);
                });

                it('has successfully cloned the git repo to disk', function() {
                    this.timeout(testTimeout.short);
                    const projectPathExists = fs.pathExistsSync(`${workspace_location}/${projectName}/pom.xml`);
                    projectPathExists.should.equal(true);
                });

                it('writes the .cw-settings file and adds the correct data', function() {
                    const cwSettingsData = projService.readCwSettings(projectPath);
                    cwSettingsData.should.deep.equal(expectedCwSettingsData);
                });
            });

            describe('nodejs', function() {
                let projectPath, expectedResult;
                const url = templateOptions.nodejs.url;
                const projectName = `creationnodejstest${Date.now()}`;
                const validOptions = {
                    projectName,
                    url,
                    projectPath,
                };

                before(function(){
                    projectPath = path.join(workspace_location, projectName);
                    validOptions.parentPath = workspace_location;
                    expectedResult = generateSuccessMessage('nodejs', projectPath);
                });

                after(async function() {
                    this.timeout(2 * testTimeout.med);
                    await fs.remove(projectPath);
                });

                it('succeeds (with status 200) in creating a project', async function() {
                    this.timeout(testTimeout.med);
                    const res = await createAProject(validOptions);
                    res.should.have.status(200);
                    res.body.should.deep.equal(expectedResult);
                });

                it('has successfully cloned the git repo to disk', function() {
                    this.timeout(testTimeout.short);
                    const projectPathExists = fs.pathExistsSync(`${workspace_location}/${projectName}/package.json`);
                    projectPathExists.should.equal(true);
                });

                it('writes the .cw-settings file and adds the correct data', function() {
                    const cwSettingsData = projService.readCwSettings(projectPath);
                    cwSettingsData.should.deep.equal(expectedCwSettingsData);
                });
            });

            describe('python - docker', function() {
                let projectPath, expectedResult;
                const url = templateOptions.docker.url;
                const projectName = `creationpythontest${Date.now()}`;
                const validOptions = {
                    projectName,
                    url,
                    projectPath,
                };

                before(function(){
                    projectPath = path.join(workspace_location, projectName);
                    validOptions.parentPath = workspace_location;
                    expectedResult = generateSuccessMessage('docker', projectPath);
                });

                after(async function() {
                    this.timeout(2 * testTimeout.med);
                    await fs.remove(projectPath);
                });

                it('succeeds (with status 200) in creating a project', async function() {
                    this.timeout(testTimeout.med);
                    const res = await createAProject(validOptions);
                    res.should.have.status(200);
                    res.body.should.deep.equal(expectedResult);
                });

                it('has successfully cloned the git repo to disk', function() {
                    this.timeout(testTimeout.short);
                    const projectPathExists = fs.pathExistsSync(`${workspace_location}/${projectName}/app.py`);
                    projectPathExists.should.equal(true);
                });

                it('writes the .cw-settings file and adds the correct data', function() {
                    const cwSettingsData = projService.readCwSettings(projectPath);
                    cwSettingsData.should.deep.equal(expectedCwSettingsData);
                });
            });

            describe('swift', function() {
                let projectPath, expectedResult;
                const url = templateOptions.swift.url;
                const projectName = `creationswifttest${Date.now()}`;
                const validOptions = {
                    projectName,
                    url,
                    projectPath,
                };

                before(function(){
                    projectPath = path.join(workspace_location, projectName);
                    validOptions.parentPath = workspace_location;
                    expectedResult = generateSuccessMessage('swift', projectPath);
                });

                after(async function() {
                    this.timeout(2 * testTimeout.med);
                    await fs.remove(projectPath);
                });

                it('succeeds (with status 200) in creating a project', async function() {
                    this.timeout(testTimeout.med);
                    const res = await createAProject(validOptions);
                    res.should.have.status(200);
                    res.body.should.deep.equal(expectedResult);
                });

                it('has successfully cloned the git repo to disk', function() {
                    this.timeout(testTimeout.short);
                    const projectPathExists = fs.pathExistsSync(`${workspace_location}/${projectName}/Package.swift`);
                    projectPathExists.should.equal(true);
                });

                it('writes the .cw-settings file and adds the correct data', function() {
                    const cwSettingsData = projService.readCwSettings(projectPath);
                    cwSettingsData.should.deep.equal(expectedCwSettingsData);
                });
            });
        });

        describe('Invalid input', function() {
            let parentPath, validOptions;
            const projectName = `createfromtemplateinvalidinputs${Date.now()}`;
            before(function(){
                parentPath = `${workspace_location}/${projectName}`;
                validOptions = {
                    projectName,
                    url: 'javaMicroProfileTemplate',
                    parentPath,
                };
            });

            describe('Invalid types', () => {
                it('fails (with status 400) to create from template when projectName is of incorrect type', async function() {
                    const options = modifyCreationOptions(validOptions, { projectName : true });
                    const res = await createAProject(options);
                    res.should.have.status(400);
                    res.error.text.should.equal('Error while validating request: request.body.projectName should be string');
                });

                it('fails (with status 400) to create a project if url is incorrect', async function() {
                    const options =  modifyCreationOptions(validOptions, { url : true });
                    const res = await createAProject(options);
                    res.should.have.status(400);
                    res.error.text.should.equal('Error while validating request: request.body.url should be string');
                });

                it('fails (with status 400) to create a project if parentPath is of incorrect type', async function() {
                    const options =  modifyCreationOptions(validOptions, { parentPath : true });
                    const res = await createAProject(options);
                    res.should.have.status(400);
                    res.error.text.should.equal('Error while validating request: request.body.parentPath should be string');
                });
            });

            describe('Invalid parentPaths', () => {
                it('fails (with status 400) if parentPath is not absolute', async function() {
                    this.timeout(testTimeout.short);
                    const options = modifyCreationOptions(validOptions, { parentPath : 'Documents/'});
                    const res = await createAProject(options);
                    res.should.have.status(400);
                    res.body.message.should.include('PATH_NOT_ABSOLUTE');
                });
            });

            describe('Invalid projectName', () => {
                it('fails (with status 400) if projectName contains an illegal character', async function() {
                    this.timeout(testTimeout.short);
                    const options = modifyCreationOptions(validOptions, { projectName : '&isnotallowed'});
                    const res = await createAProject(options);
                    res.should.have.status(400);
                    res.body.message.should.equal('Project name is invalid: invalid characters : ["&"]');
                });
            });
        });
    });
});

async function createAProject(options) {
    const res = await reqService.chai
        .post('/api/v1/projects')
        .set('cookie', ADMIN_COOKIE)
        .send(options);
    return res;
}

function generateSuccessMessage(projectType, projectPath) {
    return {
        status: 'success',
        result: {
            language: templateOptions[projectType].language,
            projectType,
        },
        projectPath,
    };
}

function modifyCreationOptions(options, newOptions) {
    const modifiedOptions = {... options};
    Object.keys(newOptions).forEach((key) => {
        modifiedOptions[key] = newOptions[key];
    });
    return modifiedOptions;
};
