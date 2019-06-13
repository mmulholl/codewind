/*******************************************************************************
 * Copyright (c) 2019 IBM Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 ******************************************************************************/

const chai = require('chai');

const reqService = require('../modules/request.service');
const { ADMIN_COOKIE } = require('../config');

chai.should();

const expectedLanguages = ['java', 'swift', 'nodejs', 'go', 'python'];

describe('Template API tests', function() {
    describe(`GET /api/v1/templates`, function() {
        it('should return a list of available templates', async function() {
            const res = await reqService.chai
                .get('/api/v1/templates')
                .set('Cookie', ADMIN_COOKIE);
            res.should.have.status(200);
            res.body.should.be.an('array');
            // check that all items have the expected keys
            res.body.forEach((template) => {
                template.should.be.an('object');
                template.should.include.all.keys('label', 'description', 'url', 'language');
            });
            // check that we have a template for each supported language
            res.body.map((template) => template.language).should.include.members(expectedLanguages);
        });
    });
});
