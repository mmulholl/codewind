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

const fs = require('fs-extra');
const { join } = require('path');
const Lock = require('lock').Lock;
const lock = Lock();
const preferenceLock = 'prefLock';
const mcUtils = require('./utils/sharedFunctions.js');
const DEFAULT_PREFERENCES_FILE = './preferences/defaults.json';
const PreferencesError = require('./utils/errors/PreferencesError');
let DEFAULTS;
// Load defaults from file
fs.readJson(DEFAULT_PREFERENCES_FILE, (err, defaultsFromFile) => {
  if (err) console.error(err);
  DEFAULTS = defaultsFromFile;
});

/**
 * The Preferences class
 * Contains the users preferences
 * One per user
 */
module.exports = class Preferences {
  constructor(workspace) {
    this.file = join(workspace, '/.config/preferences.json');
  }

  /**
   * Function to retrieve all the preferences for a user
   * @return an object containing the users preferences and whether they are populated from default
   */
  async retrievePreferences() {
    let preferences = await readPreferences(this.file);
    if (preferences == undefined) {
      // Return the defaults
      return {
        preferences: DEFAULTS,
        defaults: true
      };
    } else {
      return {
        preferences: preferences,
        defaults: false
      };
    }
  }

  /**
   * Function to retrieve (return) a single preference
   * @param group, the preference group to use
   * @param key, the key to return
   * @return an object containing the preference and whether its from defaults if successful,
   *          else false if we couldn't find the preference
   */
  async retrieveSinglePreference(group, key) {
    let preferences = await readPreferences(this.file);
    if (preferences == undefined || preferences[group] == undefined || preferences[group][key] == undefined) {
      // Attempt to get the value from the defaults
      if (DEFAULTS[group] == undefined || DEFAULTS[group][key] == undefined) {
        return undefined;
      } else {
        return {
          preference: DEFAULTS[group][key],
          defaults: true
        };
      }
    } else {
      return {
        preference: preferences[group][key],
        defaults: false
      };
    }
  }

  /**
   * Function to update a single preference
   * Will create the preference if it doesn't already exist
   * @param group, the preference group to use
   * @param key, the key to change or create
   * @param value, the value to set the given key to
   * @return this.preferences
   */
  async updateSinglePreference(group, key, value) {
    let missingParams = [];
    if (!group) {
      missingParams.push('group');
    }
    if (!key) {
      missingParams.push('key');
    }
    if (value == null || value === "") {
      missingParams.push('value');
    }
    if (missingParams.length > 0) throw new PreferencesError('INVALID_INPUT', null, missingParams);

    await new Promise((resolve, reject) => {
      lock(preferenceLock, async release => {
        try {
          let preferences = await readPreferences(this.file);
          let preferencesFile = this.file;
          // If preferences comes back as undefined, initialise as an empty object
          if (preferences == undefined) preferences = {};
          // If the group does not exist, create it to avoid a null error.
          // If the key does not exist, it will be created and if does
          // exist, it will be updated (a null error will not occur for the key)
          if (preferences[group] == undefined) {
            preferences[group] = {};
          }
          preferences[group][key] = value;
          await writePreferences(preferencesFile, preferences);
          release()();
          resolve();
        } catch(err) {
          reject(err);
        }
      });
    });
  }

  /**
   * Function to delete a single preference from the user preferences
   * @param group, the preference group to use, deletes it if its empty
   * @param key, the key to delete
   * @return this.preferences, the updated preferences
   */
  async deleteSinglePreference(group, key) {
    let missingParams = []; 
    if (!group) {
      missingParams.push('group');
    }
    if (!key) {
      missingParams.push('key');
    }
    if (missingParams.length > 0) throw new PreferencesError('INVALID_INPUT', null, missingParams);
    await new Promise((resolve, reject) => {
      lock(preferenceLock, async release => {
        try {
          let preferences = await readPreferences(this.file);
          let preferencesFile = this.file;
          if (preferences[group] == undefined) {
            throw new PreferencesError('PREFERENCES_GROUP_NOT_FOUND', group);
          } else if (preferences[group][key] == undefined) {
            throw new PreferencesError('PREFERENCES_KEY_NOT_FOUND', `Preferences file does not contain group and key value ${group}`, `and ${key}`);
          }
          delete preferences[group][key];
          await writePreferences(preferencesFile, preferences);
          release()();
          resolve();
        } catch(err) {
          reject(err);
        }
      });
    });
  }

  /**
   * Function to retrieve the default preferences
   * @return DEFAULTS
   */
  retrieveDefaults() {
    return { ...DEFAULTS };
  }
}

/**
 * Function to read the JSON preferences from a file
 * @param file, the preferences file location
 * @return the preferences if the file is found, otherwise undefined
 */
async function readPreferences(file) {
  let preferences;
  if (await mcUtils.fileExists(file)) {
    preferences = await fs.readJson(file);
  }
  return preferences;
}

/**
 * Function to write the preferences to a file
 * Will create the file and any directories if they don't exist
 * @param file, the file to write the preferences to
 * @param preferences, the preferences
 */
async function writePreferences(file, preferences) {
  await fs.ensureFile(file);
  await fs.writeJson(file, preferences, {spaces: '  '});
}
