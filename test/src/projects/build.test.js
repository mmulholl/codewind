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
const config = require('../../config');

const { ADMIN_COOKIE, testTimeout } = config;

chai.should();

// Bind/Unbind Changes - This test needs to be updated to use bound projects.
describe.skip('Project Build Tests', function() {
    const projectName = `projectbuildtest${Date.now()}`;
    let projectID;

    before('Create a project', async function() {
        this.timeout(testTimeout.med);
        projectID = await projectService.createProjectAndAwaitID({ name: projectName });       
    });

    after('Clean up by deleting project', async function() {
        this.timeout(testTimeout.med);
        await projectService.deleteProject(projectID);
    });

    describe('POST /{id}/build', function() {
        it('should accept a build request for an existing project', async function() {
            this.timeout(testTimeout.short);
            const res = await reqService.chai.post(`/api/v1/projects/${projectID}/build`)
                .set('Cookie', ADMIN_COOKIE)
                .send({ action: 'build' });
            res.should.have.status(202);
        });

        it('should reject a build request for a non-existing project', async function() {
            this.timeout(testTimeout.short);
            const res = await reqService.chai.post(`/api/v1/projects/${'fakeProject'}/build`)
                .set('Cookie', ADMIN_COOKIE)
                .send({ action: 'build' });
            res.should.have.status(400);
        });
    });
});
