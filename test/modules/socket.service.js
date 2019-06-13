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

/**
 * This module's purpose is to centralise as much socket.io-client logic as possible.
 * To use it,
 *  1) initialise SocketService to start listening for the expectedMsgTypes (listed below)
 *     in a before() block for your tests.
 *     (Do not create them inside a describe as they will exist for the whole test run and
 *      capture every socket message.)
 *  E.g.:
 *    const SocketService = require('../modules/socket.service');
 *    describe('Top level describe block', function() {
 *    let socketService;
 *    before(function() {
        socketService = await SocketService.createSocket();
      }
 *  2) call any of the functions you need.
 *  E.g.:
 *    await socketService.checkForMsg( { projectID, msgType: 'projectDeletion' });
 *  3) close down the socket when the test is complete via socketService.close(); in the
 *     after block:
 *  E.g.:
 *    after(function() {
 *      socketService.close();
 *      socketService = undefined;
 *    });
 */

const socketClient = require('socket.io-client');
const chai = require('chai');
const util = require('util');

const config = require('../config');

chai.should();

const expectedMsgTypes = {
    projectCreation: {
        event: 'projectCreation',
        expectedProperties: { status: 'success' } ,
    },
    projectBind: {
        event: 'projectBind',
        expectedProperties: { status: 'success' } ,
    },
    projectCreationFailed: {
        event: 'projectCreation',
        expectedProperties: { status: 'failed' } ,
    },
    projectCreatedFromTemplate: {
        event: 'projectCreatedFromTemplate',
    },
    projectBuilt: {
        event: 'projectStatusChanged',
        expectedProperties: { buildStatus: 'success' } ,
    },
    projectStarting: {
        event: 'projectStatusChanged',
        expectedProperties: { appStatus: 'starting' } ,
    },
    projectStarted: {
        event: 'projectStatusChanged',
        expectedProperties: { appStatus: 'started' } ,
    },
    projectDeletion: {
        event: 'projectDeletion',
        expectedProperties: { status: 'success' } ,
    },
    projectClosed: {
        event: 'projectClosed',
        expectedProperties: { status: 'success' } ,
    },
    projectLogsListChanged: {
        event: 'projectLogsListChanged',
    },
    projectValidated: {
        event: 'projectValidated',
    },
    'log-update': {
        event: 'log-update',
        expectedProperties: {
            logType: 'build|app|console',
            logName: 'a.name.log',
            logs: 'some checkString',
        },
    },
  /* Extend as follows:
  exampleMsgType: {
    event: 'exampleEventType',
    expectedProperties: { someExpectedKey: someExpectedValue },
  }
  */
};
let expectedEvents = Object.values(expectedMsgTypes).map(msgType => msgType.event);
expectedEvents = [... new Set(expectedEvents)]; // (to remove duplicates)
class SocketService {

    /* Create a socket that is ready to use,
     *  ie has been created and has connected.
     */
    static async createSocket() {
        const socket = new SocketService();
        await socket.awaitConnection();
        return socket;
    }

    constructor() {
        this.socket = socketClient(config.MICROCLIMATE_SOCKET_URL, {rejectUnauthorized: false});
        this.expectedEvents = expectedEvents;
        this.receivedMsgs = {};
        for (const event of this.expectedEvents) {
            this.receivedMsgs[event] = [];
            this.socket.on(event, (msg) => {
                this.receivedMsgs[event].push(msg);
            });
        }
    }

    close() {
        this.socket.removeAllListeners();
        this.socket.close();
        this.socket = undefined;
        this.expectedEvents = undefined;
        this.receivedMsgs = undefined;
    }

    on(event, func) { this.socket.on(event, func); }

    awaitConnection() {
        if (this.socket.connected) return true;

        return new Promise((resolve) => {
            this.socket.on('connect', () => resolve(true));
        });
    }

    /**
   * @param {JSON} expectedMsg
   * @returns {Promise<boolean>} resolves to true if expectedMsg has been received, or when it is eventually received
   */
    async checkForMsg(expectedMsg) {
        const completeExpectedMsg = completeDefaultExpectedMsg(expectedMsg);
        const received = this.hasMsgBeenReceived(completeExpectedMsg) || await this.awaitMsg(completeExpectedMsg);
        received.should.be.true;
        return received;
    }

    hasMsgBeenReceived(expectedMsg) {
        expectedMsg.should.have.own.property('event');
        const relevantMsgs = this.receivedMsgs[expectedMsg.event];
        if (!relevantMsgs) throw new Error(`this.receivedMsgs: ${util.inspect(this.receivedMsgs)})`);

        const received = (-1 != relevantMsgs.findIndex(msg => isMsgAsExpected(msg, expectedMsg)));
        return received;
    }

    awaitMsg(expectedMsg) {
        return new Promise((resolve, reject) => {
            this.socket.on(expectedMsg.event, (msg) => {
                // console.log(generateConciseLog(msg, expectedMsg)); // for debugging
                try {
                    if (isMsgAsExpected(msg, expectedMsg)) resolve(true);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }
}

function completeDefaultExpectedMsg(expectedMsg) {
    const { msgType } = expectedMsg;
    const completeExpectedMsg = { ...expectedMsg };

    if (msgType) {
        Object.keys(expectedMsgTypes).should.include(msgType);
        const defaultExpectedMsg = expectedMsgTypes[msgType];
        if (expectedMsg.event) expectedMsg.event.should.equal(defaultExpectedMsg.event);
        for (const key in defaultExpectedMsg) {
            completeExpectedMsg[key] = completeExpectedMsg[key] || defaultExpectedMsg[key];
        }
    }
    return completeExpectedMsg;
}

function isMsgAsExpected(msg, expectedMsg) {
    if (isMsgAboutExpectedProject(msg, expectedMsg)) {
        return isExpectedProjectMessageAsExpected(msg, expectedMsg);
    }

    const { expectedProperties } = expectedMsg;

    if (!expectedProperties) return true;

    const expectedKeys = Object.keys(expectedProperties);
    for (const expectedKey of expectedKeys) {
        const expectedValue = expectedProperties[expectedKey];
        const msgValue = msg[expectedKey];
        if (msgValue) {
            // We expect the content of 'logs' only have to have a partial match.
            if (expectedKey === 'logs' && msgValue.includes(expectedValue)) {
                continue;
            } else if (msgValue !== expectedValue) {
                return false;
            }
        }
    }

    return true;
}

function isMsgAboutExpectedProject(msg, expectedMsg) {
    if (msg.projectID && expectedMsg.projectID) return true;
    if (msg.name) return true;

    return false;
}

function isExpectedProjectMessageAsExpected(msg, expectedMsg) {
    if (msg.projectID && expectedMsg.projectID) return (msg.projectID === expectedMsg.projectID);
    if (msg.name) return (msg.name === expectedMsg.name);

    return false;
}

function generateFullLog(msg, expectedMsg) {
    let log = generateConciseLog(msg, expectedMsg);
    log += ` (msg = ${util.inspect(msg)})`;
    return log;
}

function generateConciseLog(msg, expectedMsg) {
    const { expectedProperties } = expectedMsg;
    let log = `[socket.service.js] received ${expectedMsg.event} event`;
    log += ` (projectID: ${msg.projectID})`;
    if (expectedProperties) {
        const expectedKeys = Object.keys(expectedProperties);
        for (const expectedKey of expectedKeys) {
            log += ` (${expectedKey}: ${msg[expectedKey]})`;
        }
    }
    return log;
}

module.exports = SocketService;
