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
const containerService = require('../../modules/container.service');
const reqService = require('../../modules/request.service');
const { ADMIN_COOKIE, testTimeout } = require('../../config');

chai.should();

// Bind/Unbind Changes - This test needs to be updated to use bound projects.
describe.skip('Project Properties Tests', function() {
    let projectID;
    const invalidProperty = { key: 'value_1' };
    const validProperty = { healthCheck : '/health' };
    const moreValidProperties = {
        internalDebugPort: '1234',
        contextRoot: '/app',
    };

    before('Create a project', async function() {
        this.timeout(testTimeout.med);
        projectID = await projectService.createProjectAndAwaitID({ name: `projecttest${Date.now()}` });
    });

    after('Clean up by deleting project', async function() {
        this.timeout(testTimeout.med);
        await projectService.deleteProject(projectID);
    });

    describe('POST /{id}/properties', function() {

        it('should set an allowed property on a project', async function() {
            this.timeout(testTimeout.short);
            const res = await reqService.chai.post(`/api/v1/projects/${projectID}/properties`)
                .set('Cookie', ADMIN_COOKIE)
                .send(validProperty);
            res.should.have.status(200);
        });

        it('should not set a non-cw-settings property on a project', async function() {
            this.timeout(testTimeout.short);
            const res = await reqService.chai.post(`/api/v1/projects/${projectID}/properties`)
                .set('Cookie', ADMIN_COOKIE)
                .send(invalidProperty);
            res.should.have.status(400);
        });

        it('should not set a property on an invalid project', async function() {
            this.timeout(testTimeout.short);
            const res = await reqService.chai.post('/api/v1/projects/invalidProjectID/properties')
                .set('Cookie', ADMIN_COOKIE)
                .send(validProperty);
            res.should.have.status(404);
        });

        it('should add more valid properties to the project without removing the existing properties', async function() {
            this.timeout(testTimeout.short);
            const res = await reqService.chai.post(`/api/v1/projects/${projectID}/properties`)
                .set('Cookie', ADMIN_COOKIE)
                .send(moreValidProperties);
            res.should.have.status(200);
        });

        it('should get all set properties', async function() {
            this.timeout(testTimeout.short);
            const project = await projectService.getProject(projectID);
            project.should.not.be.null;
            project.should.deep.include({ ...validProperty, ...moreValidProperties });
        });

        it('.cw-settings file should exist and have the correct contents', async function() {
            this.timeout(testTimeout.short);
            const project = await projectService.getProject(projectID);
            const cwSettingsFileContents = await containerService.getCWSettingsJSON(project.name);
            cwSettingsFileContents.should.not.be.null;
            cwSettingsFileContents.should.deep.include(validProperty);
            cwSettingsFileContents.should.deep.include(moreValidProperties);
        });

    });

    describe('DELETE /{id}/properties/{key}', function() {

        it('should not delete a property on an invalid project', async function() {
            this.timeout(testTimeout.short);
            const key = Object.keys(validProperty)[0];
            const res = await reqService.chai.delete(`/api/v1/projects/invalidProjectID/properties/${key}`)
                .set('Cookie', ADMIN_COOKIE);
            res.should.have.status(400);
        });

        it('should not delete an invalid property on a project', async function() {
            this.timeout(testTimeout.short);
            const key = Object.keys(invalidProperty)[0];
            const res = await reqService.chai.delete(`/api/v1/projects/${projectID}/properties/${key}`)
                .set('Cookie', ADMIN_COOKIE);
            res.should.have.status(400);
        });

        it('should delete a valid property on a project', async function() {
            this.timeout(testTimeout.short);
            const key = Object.keys(validProperty)[0];
            const res = await reqService.chai.delete(`/api/v1/projects/${projectID}/properties/${key}`)
                .set('Cookie', ADMIN_COOKIE);
            res.should.have.status(200);
        });

        it('should get the remaining properties', async function() {
            this.timeout(testTimeout.short);
            const project = await projectService.getProject(projectID);
            project.should.not.be.null;
            project.should.not.deep.include(validProperty);
            project.should.deep.include(moreValidProperties);
        });

        it('.cw-settings file should exist and have the correct contents', async function() {
            this.timeout(testTimeout.short);
            const project = await projectService.getProject(projectID);
            const cwSettingsFileContents = await containerService.getCWSettingsJSON(project.name);
            cwSettingsFileContents.should.not.be.null;
            cwSettingsFileContents.should.not.deep.include(validProperty);
            cwSettingsFileContents.should.deep.include(moreValidProperties);
        });
    });
});
