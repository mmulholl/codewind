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
'use strict';
const express = require('express');

const Logger = require('../modules/utils/Logger');

const router = express.Router();
const log = new Logger(__filename);

/**
 * API function to return a preference value for the current user
 * @param group, the preference group
 * @param key, the preference key
 * @return 200 status code and the preference value. The header 'preferences-from-default' is
 * set to true if the value was taken from the preferences file and false otherwise
 * @return 400 if the preference does not exist and is not a default preference
 * @return 500 status code if the preference was not successfully retrieved
 */
router.get('/api/v1/preferences/:group/:key', async (req, res) => {
  try {
    let user = req.mc_user;
    let obj = await user.preferences.retrieveSinglePreference(req.sanitizeParams('group'), req.sanitizeParams('key'));
    if (obj == undefined) {
      res.sendStatus(400);
    } else {
      res.header({
        'preferences-from-default': obj.defaults
      });
      res.status(200).send(obj.preference);
    }
  } catch (err) {
    log.error(err);
    if (err instanceof SyntaxError) {
      res.header({
        'preferences-file-contains-invalid-json': true
      });
      res.status(500).send('Preferences file contains invalid JSON');
    } else {
      res.status(500).send(err);
    }
  }
});

/**
 * API function to return all preference values for the current user
 * @return 200 status code and the preference values in JSON. The header 'preferences-from-default'
 * is set to true if the value was taken from the preferences file and false otherwise
 * @return 400 if the preference does not exist and is not a default preference
 * @return 500 status code if the preferences were not successfully retrieved
 */
router.get('/api/v1/preferences', async (req, res) => {
  try {
    let user = req.mc_user;
    let obj = await user.preferences.retrievePreferences();
    if (obj.preferences == undefined) {
      res.status(400).send('');
    } else {
      res.header({
        'preferences-from-default': obj.defaults
      });
      res.status(200).send(obj.preferences);
    }
  } catch (err) {
    log.error(err);
    if (err instanceof SyntaxError) {
      res.header({
        'preferences-file-contains-invalid-json': true
      });
      res.status(500).send('Preferences file contains invalid JSON');
    } else {
      res.status(500).send(err);
    }
  }
});

/**
 * API function to return all default preference values for the current user
 * @return 200 status code and the preference values in JSON
 * @return 500 status code if the preferences were not successfully retrieved
 */
router.get('/api/v1/preferences/defaults', async (req, res) => {
  try {
    let user = req.mc_user;
    let defaultPreferences = await user.preferences.retrieveDefaults();
    res.status(200).send(defaultPreferences);
  } catch (err) {
    log.error(err);
    if (err instanceof SyntaxError) {
      res.header({
        'defaults-file-contains-invalid-json': true
      });
      res.status(500).send('Preferences file contains invalid JSON');
    } else {
      res.status(500).send(err);
    }
  }
});

/**
 * API function to set the value of a preference for the current user
 * @param group, the preference group
 * @param key, the preference key
 * @param req.sanitizeBody('value'), the body contains JSON containing the value
 * @return 200 status code if the preference was updated successfully
 * @return 500 status code if the preference was not updated successfully. If the preferences
 * file contains invaid JSON, return a content header with 'preferences-file-contains-invalid-json'
 */
router.put('/api/v1/preferences/:group/:key', async (req, res) => {
  try {
    // Expect text which is not empty
    if (req.body == undefined || req.sanitizeBody('value') == undefined) {
      res.status(400).send('Request body missing');
    } else {
      let user = req.mc_user;
      await user.preferences.updateSinglePreference(req.sanitizeParams('group'), req.sanitizeParams('key'), req.sanitizeBody('value'));
      res.sendStatus(200);
    }
  } catch (err) {
    log.error(err);
    if (err instanceof SyntaxError) {
      res.header({
        'preferences-file-contains-invalid-json': true
      });
      res.status(500).send('Preferences file contains invalid JSON');
    } else {
      res.status(500).send(err);
    }
  }
});

/**
 * API function to delete the value of a preference for the current user
 * @param group, the preference group
 * @param key, the preference key
 * @return 200 status code if the preference was deleted successfully
 * @return 400 status code if the preference to delete does not exist (e.g. invalid group or key)
 * @return 500 status code if the preference was not deleted successfully. If the preferences
 * file contains invaid JSON, return a content header with 'preferences-file-contains-invalid-json'
 */
router.delete('/api/v1/preferences/:group/:key', async (req, res) => {
  try {
    let user = req.mc_user;
    await user.preferences.deleteSinglePreference(req.sanitizeParams('group'), req.sanitizeParams('key'));
    res.sendStatus(200);
  } catch (err) {
    if (err.code == 'PREFERENCES_GROUP_NOT_FOUND') {
      res.header({'preferences-file-does-not-contain-group' : true});
      res.status(400).send(err);
    } else if (err.code == 'PREFERENCES_KEY_NOT_FOUND') {
      res.header({'preferences-file-does-not-contain-group-and-key' : true});
      res.status(400).send(err);
    } else {
      log.error(err);
      res.status(500).send(err);
    }
  }
});

module.exports = router;
