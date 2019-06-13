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

const CWSettingsError = require('./errors/CWSettingsError')

/**
 * Exported function to return fields added to the
 * cw-settings file that are of an invalid form.
 * @param req, the http request body from the properties API
 * @return {JSON}, with the keys the invalid field, and the values its error.
 */
function findInvalidSettings(req) {
  let errorString = "";
  Object.keys(req.body).forEach((key) => {
    const value = req.sanitizeBody(key);
    try {
      validateSetting(key, value);
    } catch (error) {
      if (errorString.length > 0) errorString += ", "
      errorString += error.message;
    }
  });
  if (errorString.length > 0) {
    throw new CWSettingsError(CWSettingsError.INVALID_SETTINGS, errorString)
  }
}

function validateSetting(setting, value) {
  switch (setting) {
  case "contextRoot":
    validateContextRoot(value);
    break;
  case "internalAppPort":
    validateApplicationPort(value);
    break;
  case "internalDebugPort":
    validateDebugPort(value);
    break;
  case "watchedFiles":
    validateWatchedFiles(value);
    break;
  case "healthCheck":
    validateHealthCheck(value);
    break;
  default:
    throw new CWSettingsError(CWSettingsError.INVALID_SETTING_TYPE, `Could not identify the setting: ${setting}`);
  }
}

function validateContextRoot(value) {
  if (typeof value !== 'string') throw new CWSettingsError(CWSettingsError.INVALID_CONTEXT_ROOT, `Could not convert "${value}" to a string`);
}

function validateApplicationPort(value) {
  if (typeof value !== 'number' && typeof value !== 'string') throw new CWSettingsError(CWSettingsError.INVALID_APPLICATION_PORT, `Could not convert "${value}" to a number`);
}

function validateDebugPort(value) {
  if (typeof value !== 'number' && typeof value !== 'string') throw new CWSettingsError(CWSettingsError.INVALID_DEBUG_PORT, `Could not convert "${value}" to a number`);
}

function validateWatchedFiles(value) {
  if (typeof value !== 'object') throw new CWSettingsError(CWSettingsError.INVALID_WATCHED_FILES, `Could not convert "${value}" to an array`);
}

function validateHealthCheck(value) {
  if (typeof value !== 'string') throw new CWSettingsError(CWSettingsError.INVALID_HEALTH_CHECK, `Could not convert "${value}" to a string`);
}

module.exports = {
  findInvalidSettings,
}
