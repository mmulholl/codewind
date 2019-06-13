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

module.exports = class PreferencesError extends BaseError {
  constructor(code = '[Unknown error code]', identifier, message) {
    super(code, constructMessage(code, identifier, message));
  }
}

// Error codes
module.exports.INVALID_INPUT = "INVALID_INPUT";
module.exports.PREFERENCES_GROUP_NOT_FOUND = "PREFERENCES_GROUP_NOT_FOUND";
module.exports.PREFERENCES_KEY_NOT_FOUND = "PREFERENCES_KEY_NOT_FOUND";

/**
 * Function to construct an error message based on the given error code
 * @param code, the error code to create the message from
 * @param identifier, the group of the preference in question (based on the code being called)
 * @param message, a message to be appended on the end of a default message
 */
function constructMessage(code, identifier, message) {

  let output = "";
  switch(code) {
  case "INVALID_INPUT":
    output = `Missing the: `;
    break;
  case "PREFERENCES_GROUP_NOT_FOUND":
    output = `Preferences file does not contain group ${identifier}.`;
    break;
  case 'PREFERENCES_KEY_NOT_FOUND':
    output = `Preference not found: ${identifier}`;
    break;
  default:
    output = `${code}: Error with request.`;
  }

  // Append message to output if provided
  return message ? `${output}\n${message}` : output;
}
