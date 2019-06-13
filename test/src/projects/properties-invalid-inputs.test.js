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

const projectService = require('../../modules/project.service');
const reqService = require('../../modules/request.service');
const { ADMIN_COOKIE, testTimeout } = require('../../config');

chai.should();

const setProperty = (projectID, inputProperties) => reqService.chai
    .post(`/api/v1/projects/${projectID}/properties`)
    .set('Cookie', ADMIN_COOKIE)
    .send(inputProperties);

// Bind/Unbind Changes - This test needs to be updated to use bound projects.
describe.skip('Project Properties Bad Parameters Tests', function() {
    let projectID;

    before('Create a project', async function() {
        this.timeout(testTimeout.med);
        projectID = await projectService.createProjectAndAwaitID({ name: `projecttest${Date.now()}` });
    });

    after('Clean up by deleting project', async function() {
        this.timeout(testTimeout.med);
        await projectService.deleteProject(projectID);
    });

    describe('contextRoot', function() {

        it('returns 400 when a string is not given', async function() {
            this.timeout(testTimeout.med);
            const res = await setProperty(projectID, { contextRoot : false });
            res.should.have.status(400);
            res.body.code.should.equal('INVALID_SETTINGS');
            res.body.message.should.equal('Invalid context root: Could not convert "false" to a string');
        });
    });

    describe('applicationPort', function() {

        it('returns 400 when a number is not given', async function() {
            this.timeout(testTimeout.med);
            const res = await setProperty(projectID, { internalAppPort : false });
            res.should.have.status(400);
            res.body.code.should.equal('INVALID_SETTINGS');
            res.body.message.should.equal('Invalid application port: Could not convert "false" to a number');
        });
    });

    describe('debugPort', function() {

        it('returns 400 when a number is not given', async function() {
            this.timeout(testTimeout.med);
            const res = await setProperty(projectID, { internalDebugPort: false });
            res.should.have.status(400);
            res.body.code.should.equal('INVALID_SETTINGS');
            res.body.message.should.equal('Invalid debug port: Could not convert "false" to a number');
        });
    });

    describe('watchedFiles', function() {

        it('returns 400 when a list is not given', async function() {
            this.timeout(testTimeout.med);
            const res = await setProperty(projectID, { watchedFiles: 'should-be-array' });
            res.should.have.status(400);
            res.body.code.should.equal('INVALID_SETTINGS');
            res.body.message.should.equal('Invalid watched files: Could not convert "should-be-array" to an array');
        });
    });

    describe('healthCheck', function() {

        it('returns 400 when a string is not given', async function() {
            this.timeout(testTimeout.med);
            const res = await setProperty(projectID, { healthCheck: false });
            res.should.have.status(400);
            res.body.code.should.equal('INVALID_SETTINGS');
            res.body.message.should.equal('Invalid health check: Could not convert "false" to a string');
        });
    });


    describe('multiple parameters', function() {

        it('returns 400 when no properties are given', async function() {
            this.timeout(testTimeout.med);
            const res = await setProperty(projectID, {});
            res.should.have.status(400);
        });

        it('returns 400 when 2 invalid properties are given', async function() {
            this.timeout(testTimeout.med);
            const res = await setProperty(projectID, { healthCheck: false, contextRoot : false });
            res.should.have.status(400);
            res.body.code.should.equal('INVALID_SETTINGS');
            res.body.message.should.equal('Invalid health check: Could not convert "false" to a string, Invalid context root: Could not convert "false" to a string');
        });
    });
});
