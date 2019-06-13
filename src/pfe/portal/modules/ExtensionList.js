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
const path = require('path');
const Extension = require('./Extension.js');
const ExtensionListError = require('./utils/errors/ExtensionListError');

/**
 * The ExtensionList class
 */
module.exports = class ExtensionList {
  constructor() {
    this._list = {};
  }

  /**
   * Function to load all extensions found in the extensions directory
   * @param extensionsPath, directory path of the extensions directory
   */
  async initialise(extensionsPath) {
    try {
      // Read the extensions directory, create and add extensions to the list
      let entries = await fs.readdir(extensionsPath);
      for (let i=0; i < entries.length; i++) {
        let fstats = await fs.lstat(path.join(extensionsPath, entries[i]));
        // Extensions are in sub-directories of the top-level extensions directory
        if (fstats.isDirectory()) {
          this.add(new Extension(path.join(extensionsPath, entries[i])));
        }
      }
    } catch(error) {
      throw new ExtensionListError('FAILED_TO_LOAD');
    }
  }

  /**
   * Function to add an extension to the list
   * Throws an error if the extension already exists
   * @param extension, the extension to add to the list
   */
  add(extension) {
    if (this._list.hasOwnProperty(extension.name)) {
      throw new ExtensionListError('EXISTS', extension.name);
    } else {
      this._list[extension.name] = extension;
    }
  }

  /**
   * Function to remove an extension from the list
   * Throws an error if the extension was not found in the list
   * @param name, the name of the extension to remove from the list
   */
  remove(name) {
    if (!this._list.hasOwnProperty(name)) {
      throw new ExtensionListError('NOT_FOUND',name);
    } else {
      delete this._list[name];
    }
  }

  /**
   * Function to retrieve an extension from the list
   * Throws an error if the extension was not found in the list
   * @param name, the name of the extension
   * @return the requested extension
   */
  retrieve(name) {
    if (this._list.hasOwnProperty(name)) {
      return this._list[name];
    }
    return undefined;
  }

  /**
   * Function to update an extension. If existing fields are supplied these
   * overwrite current ones. If new fields are supplied they are added to the extension
   * Throws an error if the extension was not found in the list
   * @param {Object} extension
   * @return the updated extension object
   */
  update(extension) {
    if (!this._list.hasOwnProperty(extension.name)) {
      throw new ExtensionListError('NOT_FOUND', extension.name);
    } else {
      let currentExtension = this._list[extension.name];
      for (let key in extension) {
        currentExtension[key] = extension[key];
      }
      this._list[extension.name] = currentExtension;
      return this._list[extension.name];
    }
  }

  /**
   * Function to get all the extension names as an array
   * @return array of extension names
   */
  getNames() {
    let array = [];
    for (let key in this._list) {
      array.push(key);
    }
    return array;
  }
}
