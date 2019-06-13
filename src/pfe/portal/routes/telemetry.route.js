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

const Logger = require('../modules/utils/Logger');

const log = new Logger(__filename);

/**
 * API function to return the telemetry user identification
 */
router.get('/api/v1/telemetry/id', (req, res) => {
  try {
    let user = req.mc_user;
    let telemetryIdentification = user.getTelemetryIdentification();
    if (telemetryIdentification) {
      res.status(200).send(telemetryIdentification).end();
    } else {
      res.sendStatus(400);
    }
  } catch (err) {
    log.error(err);
    res.status(500).send(err);
  }
});

/**
 * API to track telemetry events
 */
router.post('/api/v1/telemetry/track', (req, res) => {
  try {
    let user = req.mc_user;
    let event = req.sanitizeBody('event');
    let properties = req.sanitizeBody('properties');
    if (!(event && properties)) {
      res.sendStatus(400);
    } else {
      let telemetrySubmitted = user.trackTelemetryEvent(event, properties);
      res.header({
        'telemetry-submitted': telemetrySubmitted
      });
      res.sendStatus(200);
    }
  } catch (err) {
    res.status(500).send(err);
  }
});

module.exports = router;
