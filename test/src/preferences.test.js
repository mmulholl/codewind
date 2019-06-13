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

const reqService = require('../modules/request.service');
const { ADMIN_COOKIE } = require('../config');

chai.should();

// Using telemetry as the preference that will never change. This preference
// is used for default tests instead of verifying the entire file or other
// values that may change. Originally, constants were used, but it made the
// test case hard to read, so strings were used instead
describe('Preferences API tests', function() {
    let group;

    describe('Default preferences', function() {
        const defaultPreference = {
            telemetry: { enabled: false },
        };
        group = Object.keys(defaultPreference)[0]; // telemetry
        const property = defaultPreference[group]; // { enabled: false }
        const key = Object.keys(property)[0]; // enabled
        const value = property[key]; // false
        const newValue = !value; // true

        it('GET/defaults should return at least 1 default preference', async function() {
            const res = await reqService.chai.get('/api/v1/preferences/defaults').set('Cookie', ADMIN_COOKIE);
            res.should.have.status(200);
            res.body.should.not.be.null;
            res.body.should.deep.include(defaultPreference);
        });

        it('GET/{group}/{key} should return the value of that default preference', async function() {
            const res = await reqService.chai.get(`/api/v1/preferences/${group}/${key}`)
                .set('Cookie', ADMIN_COOKIE);
            res.should.have.status(200);
            res.text.should.equal(`${value}`);
            res.should.have.header('preferences-from-default', 'true');
        });

        it('PUT/{group}/{key} should successfully update the default preference', async function() {
            const res = await reqService.chai.put(`/api/v1/preferences/${group}/${key}`)
                .set('Cookie', ADMIN_COOKIE)
                .send({ value: newValue });
            res.should.have.status(200);
        });

        it('GET/{group}/{key} should get the updated default preference', async function() {
            const res = await reqService.chai.get(`/api/v1/preferences/${group}/${key}`)
                .set('Cookie', ADMIN_COOKIE);
            res.should.have.status(200);
            res.text.should.equal(`${newValue}`);
            res.should.have.header('preferences-from-default', 'false');
        });

        it('DELETE/{group}/{key} should delete the default preference', async function() {
            const res = await reqService.chai.delete(`/api/v1/preferences/${group}/${key}`)
                .set('Cookie', ADMIN_COOKIE)
                .send('true');
            res.should.have.status(200);
        });

        it('GET/{group}/{key} should get the default preference and show it has been reset to default values', async function() {
            const res = await reqService.chai.get(`/api/v1/preferences/${group}/${key}`)
                .set('Cookie', ADMIN_COOKIE);
            res.should.have.status(200);
            res.text.should.equal('false');
            res.should.have.header('preferences-from-default', 'true');
        });
    });


    describe('User preferences', function() {
        const key = 'testKey';
        const value = 'testValue';

        it('GET/ should return all preferences', async function() {
            const res = await reqService.chai.get('/api/v1/preferences').set('Cookie', ADMIN_COOKIE);
            res.should.have.status(200);
            res.body.should.not.be.null;
        });

        it('PUT/{group}/{newKey} should add a new key to an existing preference', async function() {
            const res = await reqService.chai.put(`/api/v1/preferences/${group}/${key}`) // group should = 'telemetry' (defined above)
                .set('Cookie', ADMIN_COOKIE)
                .send({ value });
            res.should.have.status(200);
        });

        it('GET/{group}/{newKey} should return the new key', async function() {
            const res = await reqService.chai.get(`/api/v1/preferences/${group}/${key}`).set('Cookie', ADMIN_COOKIE);
            res.should.have.status(200);
            res.text.should.equal(`${value}`);
            res.should.have.header('preferences-from-default', 'false');
        });

        it('PUT/{newGroup}/{newKey} should add a new preference group', async function() {
            const res = await reqService.chai.put('/api/v1/preferences/preferencestest/greetings')
                .set('Cookie', ADMIN_COOKIE)
                .send({ value: 'hello' });
            res.should.have.status(200);
        });

        it('PUT/{newGroup}/{newKey} should return error 400 if request body is empty when adding preference key and value', async function() {
            const res = await reqService.chai.put('/api/v1/preferences/preferencestest/failure')
                .set('Cookie', ADMIN_COOKIE);
            res.should.have.status(400);
        });

        it('GET/ should return all preferences, now including the 2 just created', async function() {
            const res = await reqService.chai.get('/api/v1/preferences').set('Cookie', ADMIN_COOKIE);
            res.should.have.status(200);
            res.body.should.not.be.null;
            const newPreference = {};
            newPreference[key] = value;
            res.body.telemetry.should.deep.include(newPreference);
            res.body.preferencestest.should.deep.include({ greetings: 'hello' });
        });

        it('DELETE/{group}/{newKey} should successfully delete the new key', async function() {
            const res = await reqService.chai.delete(`/api/v1/preferences/${group}/${key}`)
                .set('Cookie', ADMIN_COOKIE)
                .send('true');
            res.should.have.status(200);
        });

        it('GET/{group}/{newKey} should fail to get the deleted preference', async function() {
            const res = await reqService.chai.get(`/api/v1/preferences/${group}/${key}`)
                .set('Cookie', ADMIN_COOKIE);
            res.should.have.status(400);
        });

        it('GET/{group}/{non-existent-preference} should fail to get a non-existent preference', async function() {
            const res = await reqService.chai.get(`/api/v1/preferences/${group}/non-existent-preference`)
                .set('Cookie', ADMIN_COOKIE);
            res.should.have.status(400);
        });
    });
});
