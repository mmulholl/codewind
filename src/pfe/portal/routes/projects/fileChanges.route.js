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
const router = express.Router();
const Logger = require('../../modules/utils/Logger');
const log = new Logger(__filename);
const buffer = require('buffer');
const zlib = require("zlib");

/**
 * API Function to put the watch status of a project with a particular projectWatchStateId
 * @param id the projectID
 * @param projectWatchStateId the projectWatchStateId for this status
 * @return 200 if operation success
 * @return 400 if with bad request
 * @return 500 if there was an error
 */
router.put('/api/v1/projects/:id/file-changes/:projectWatchStateId/status', function (req, res) {
    try {
        const user = req.mc_user;
        const projectID = req.sanitizeParams('id');
        const projectWatchStateId = req.sanitizeParams('projectWatchStateId');
        const status = req.sanitizeBody('success') ?  "success" : "failed" ;
        if (!projectID || !status || !projectWatchStateId) {
            res.status(400).send("Missing required parameter, projectID, projectWatchStateId and status are required to be provided. ");
            return;
        }
        const project = user.projectList.retrieveProject(projectID);
        if (!project) {
          res.status(404).send(`Unable to find project ${projectID}`);
        }
        // ignore if the projectWatchStateId received does not match the latest projectWatchStateId set for this project
        if(project.projectWatchStateId == projectWatchStateId) {
          const data = {
            projectID: projectID,
            projectWatchStateId: projectWatchStateId,
            status: status
          };
          if (req.query && req.query.clientUUID) {
              data.clientUUID = req.query.clientUUID;
          }
          user.uiSocket.emit("projectWatchStatusChanged", data);
        }
        res.sendStatus(200);
   } catch (err) {
      log.error(err);
      res.status(500).send(err);
   }
  });
  

/**
 * API Function to post the changedFiles
 * @param id the projectID
 * @param msg the body message, contains changedFiles event array
 * @param timestamp (query param) the timestamp of this event
 * @return 200 if operation success
 * @return 400 if with bad request
 * @return 500 if there was an error
 */
  router.post('/api/v1/projects/:id/file-changes', function (req, res) {
    try {
        const user = req.mc_user;
        const projectID = req.sanitizeParams('id');
        const msg = req.sanitizeBody('msg');
        if (!projectID || !msg) {
            res.status(400).send("Missing required parameter, projectID and msg are required to be provided. ");
            return;
        }
        if (!req.query || !req.query.timestamp || !req.query.chunk || !req.query.chunk_total) {
            res.status(400).send("Missing required query, timestamp, chunk and chunk_total are required to be provided. ");
            return;
        }

        const project = user.projectList.retrieveProject(projectID);
        if (!project) {
          res.status(404).send(`Unable to find project ${projectID}`);
        }
        const timestamp = req.query.timestamp;
        const chunk = req.query.chunk;
        const chunk_total = req.query.chunk_total;
        const compressed = buffer.Buffer.from(msg, "base64");
        const output = zlib.inflateSync(compressed);
        const eventArray = JSON.parse(output.toString());
        user.fileChanged(projectID, timestamp, chunk, chunk_total, eventArray);
        res.sendStatus(200);
   } catch (err) {
      log.error(err);
      res.status(500).send(err);
   }
  })
  
  module.exports = router;