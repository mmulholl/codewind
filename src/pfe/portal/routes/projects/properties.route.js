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
const CWSettingsError = require('../../modules/utils/errors/CWSettingsError')
const Project = require('../../modules/Project');
const Logger = require('../../modules/utils/Logger');
const settingsValidate = require('../../modules/utils/cwSettingsValidate');

const router = express.Router();
const log = new Logger(__filename);

/**
 * API Function to store .cw-settings properties for a project.
 * @param id, the id of the project
 * @return 200 if project existed and a valid action was requested.
 * @return 400 if the properties are not stored in .cw-settings.
 * @return 404 if the project is not found.
 * @return 500 on internal error.
 */
router.post('/api/v1/projects/:id/properties', async function (req, res) {
  try {
    const user = req.mc_user;
    const projectID = req.sanitizeParams('id');
    const project = user.projectList.retrieveProject(projectID);
    if (!project) {
      res.status(404).send(`Unable to find project ${projectID}`);
      return;
    }
    await settingsValidate.findInvalidSettings(req);
    const projectUpdateObj = extractUpdateObj(req);
    if (Object.keys(projectUpdateObj).length === 0) {
      res.status(400).send('No properties valid for storing in .cw-settings');
      return;
    }
    projectUpdateObj.projectID =  project.projectID;
    await user.projectList.updateProject(projectUpdateObj);
    res.sendStatus(200);
  } catch (err) {
    log.error(err.info);
    if (err instanceof CWSettingsError) {
      res.status(400).send(err.info || err);
    } else {
      res.status(500).send(err);
    }
  }
});

function extractUpdateObj(req) {
  let projectUpdateObj = {};
  Object.keys(req.body).forEach((key) => {
    if (Project.MC_SETTINGS_PROPERTIES.includes(key)) projectUpdateObj[key] = req.sanitizeBody(key);
  });
  return projectUpdateObj;
}

/**
 * API Function to delete a property for a project.
 * @param id, the id of the project
 * @param property, the name of the property to delete
 * @return 200 if project existed and a valid action was requested.
 * @return 400 if project is not found
 * @return 500 on internal error
 */
router.delete('/api/v1/projects/:id/properties/:property', async function (req, res) {
  try {
    let user = req.mc_user;
    const projectID = req.sanitizeParams('id');
    let project = user.projectList.retrieveProject(projectID);
    if (!project) {
      res.status(400).send(`Unable to find project ${projectID}`);
    } else {
      let property = req.sanitizeParams('property');
      if (!Project.MC_SETTINGS_PROPERTIES.includes(property)) {
        res.status(400).send(`Property ${property} not found in .cw-settings`);
      } else {
        if (project.hasOwnProperty(property)) {
          delete project[property];
          await user.projectList.updateProject({projectID: project.projectID});
          res.sendStatus(200);
        } else {
          res.status(400).send(`Project has no property named ${property}`);
        }
      }
    }
  } catch (err) {
    log.error(err);
    res.status(500).send(err);
  }
});

module.exports = router;
