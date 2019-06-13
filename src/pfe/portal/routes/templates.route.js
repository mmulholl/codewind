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
const express = require('express');

const Logger = require('../modules/utils/Logger');

const router = express.Router();
const log = new Logger(__filename);
const request = require('request');
let projectTypes = [];
let needsRefresh = true;
/**
 * API Function to return a list of available templates 
 * @return the set of language extensions as a JSON array of strings
 */
router.get('/api/v1/templates', (req, res, _next) => {
  log.trace(`requesting list of templates`);

  
  let options = {
    method: 'get',
    url: 'https://raw.githubusercontent.com/microclimate-dev2ops/codewind-templates/master/devfiles/index.json',
    timeout: 10000
  }

  if(!needsRefresh){
    log.trace(`returning cache of templates`);
    return res.status(200).json(projectTypes); 
  }

  request(options, function (error, response, body) {

    if (!error && response.statusCode == 200) {
  
      let csv = JSON.parse(body);
  
      for (let i=0; i < csv.length; i ++){

        projectTypes.push({
          label: csv[i].displayName,
          description: csv[i].description,
          language: csv[i].language,
          url: csv[i].location,
          projectType: csv[i].projectType
        });
      }       
      projectTypes.sort((a, b) => {
        return a.language.localeCompare(b.language);
      });
      
      needsRefresh = false;
      return res.status(200).json(projectTypes); 
    } 
    log.warn('no templates found');
    return res.status(204).send("No templates found");
     
  });

});


module.exports = router;