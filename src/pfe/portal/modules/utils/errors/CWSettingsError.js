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

"use strict";
const BaseError = require('./BaseError')

module.exports = class CWSettingsError extends BaseError {
  constructor(code = '[Unknown error code]', message) {
    super(code, constructMessage(code, message));
  }
}

// Error codes
module.exports.INVALID_SETTING_TYPE = "INVALID_SETTING_TYPE";
module.exports.INVALID_CONTEXT_ROOT = "INVALID_CONTEXT_ROOT"
module.exports.INVALID_APPLICATION_PORT = "INVALID_APPLICATION_PORT"
module.exports.INVALID_DEBUG_PORT = "INVALID_DEBUG_PORT"
module.exports.INVALID_WATCHED_FILES = "INVALID_WATCHED_FILES"
module.exports.INVALID_HEALTH_CHECK = "INVALID_HEALTH_CHECK"
module.exports.INVALID_SETTINGS = "INVALID_SETTINGS"


/**
 * Function to construct an error message based on the given error code
 * @param code, the error code to create the message from
 * @param message, a message to be appended on the end of a default message
 */
function constructMessage(code, message) {
  let output = "";
  switch (code) {
  case 'INVALID_SETTINGS':
    output = '';
    break;
  case 'INVALID_SETTING_TYPE':
    output = 'Invalid setting: ';
    break;
  case 'INVALID_CONTEXT_ROOT':
    output = 'Invalid context root: ';
    break;
  case 'INVALID_APPLICATION_PORT':
    output = 'Invalid application port: ';
    break;
  case 'INVALID_DEBUG_PORT':
    output = 'Invalid debug port: ';
    break;
  case 'INVALID_WATCHED_FILES':
    output = 'Invalid watched files: ';
    break;
  case 'INVALID_HEALTH_CHECK':
    output = 'Invalid health check: ';
    break;
  default:
    output = 'MC Settings error: ';
  }
  // Append message to output if provided
  return message ? `${output}${message}` : output;
}
