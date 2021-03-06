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
const chai = require('chai');
const chaiHttp = require('chai-http');
const mlog = require('mocha-logger');

const {promisify} = require('util');
const execAsync = promisify(require('child_process').exec);

const containerService = require('../../../modules/container.service');
const projectService = require('../../../modules/project.service');
const SocketService = require('../../../modules/socket.service');
const { MICROCLIMATE_HOST, USING_K8S, testTimeout, templateOptions } = require('../../../config');

chai.use(chaiHttp);
chai.should();

// Interval ticker used for keeping long-running tests alive on travis
let ticker;
let ticking = false;

const createOptions = {};

// Generate the creation options to pass to createFromTemplate.
for (const type of Object.keys(templateOptions)) {
    const project = templateOptions[type];
    const name = `${type}templatecreate${Date.now()}`;
    project.name = name;

    createOptions[type] = {
        projectName: project.name,
        url: templateOptions[type].url,
    };
}

const expectedLogs = {
    nodejs: {
        build: ['docker.build.log'],
        app: ['-'],
    },
    swift: {
        build: ['docker.build.log', 'app.compile.log'],
        app: ['-'],
    },
    spring: {
        build: ['docker.build.log', 'maven.build.log'],
        app: ['-'],
    },
    liberty: {
        build: ['docker.build.log', 'maven.build.log'],
        app: ['messages.log', 'console.log', '-'],
    },
    docker: {
        build: ['docker.build.log'],
        app: ['-', 'app.log'],
    },
};

// These are filled in after the project files are created from the template.
const bindParams = {};

let workspace_location;

describe('Project Lifecycle Tests', function() {
    let socketService;

    before(async function() {
        socketService = await SocketService.createSocket();
        socketService.on('projectStatusChanged', checkProjectListContainsCorrectStatuses);
        workspace_location = await projectService.findWorkspaceLocation();
    });

    after(function() {
        socketService.close();
        socketService = undefined;
    });

    describe('create projects', function() {
        this.timeout(testTimeout.maxTravis);

        it('successfully creates projects', async function() {
            for (const language in templateOptions) {

                // We can't add the path until the before block that gets
                // the workspace location has run.
                createOptions[language].parentPath = workspace_location;
                const res = await projectService.createFromTemplate(createOptions[language]);

                res.should.have.status(200);
                bindParams[language] = { ...res.body.result,
                    path: res.body.projectPath,
                    name: createOptions[language].projectName,
                };
            }
        });
        it('should bind projects', async function() {
            for (const type in bindParams) {
                this.timeout(testTimeout.med);
                const res = await projectService.bindProject(bindParams[type]);
                res.should.have.status(202);
                const project = templateOptions[type];
                const projectID = res.body.projectID;
                project.projectID = projectID;
            }
        });

        it('should return 409 if project already bound', async function() {
            for (const type in bindParams) {
                const originalNumProjects = await projectService.countProjects();
                await projectService.bindProject(bindParams[type], 409);
                const finalNumProjects = await projectService.countProjects();
                finalNumProjects.should.equal(originalNumProjects);
            }
        });
    });

    describe('NodeJS', function() {
        this.timeout(2 * testTimeout.maxTravis);
        TestProject('nodejs', {
            metricsEndpoint: 'appmetrics-dash',
            checkString: 'appmetrics-dash',
            skipBuildLogs: true,
        });
    });

    describe('Liberty', function() {
        this.timeout(2 * testTimeout.maxTravis);
        TestProject('liberty', {
            metricsEndpoint: 'javametrics-dash',
            checkString: `Starting application ${templateOptions.liberty.name}`,
        });
    });

    describe('Spring', function() {
        this.timeout(2 * testTimeout.maxTravis);
        TestProject('spring', {
            metricsEndpoint: 'javametrics-dash',
            checkString: 'application.SBApplication',
        });
    });

 

    describe('Swift', function() {
        before(async function() {
            const containerArchitecture = await containerService.getArchitecture();
            if (['ppc64le', 's390x'].includes(containerArchitecture)) {
                this.skip();
            }
        });

        this.timeout(testTimeout.maxTravis);
        TestProject('swift', {
            metricsEndpoint: 'swiftmetrics-dash',
            checkString: 'INFO: Swift Application Metrics',
        });
    });

    describe('Python', function() {
        this.timeout(2 * testTimeout.maxTravis);
        TestProject('docker', {
            checkString: '* Running on http://',
        });
    });

    function TestProject(language, testOptions) {
        const { metricsEndpoint, needContextRoot, checkString } = testOptions;
        const projectName = templateOptions[language].name;
        let projectID;
        let contextRoot;


        before(function() {
            projectID = templateOptions[language].projectID;
        });

        // Fail fast on error.
        let projectFailed = false;
        beforeEach(function() {
            if (projectFailed) this.skip();
        });
        afterEach(function() {
            if (this.currentTest.state === 'failed') projectFailed = true;
        });

        describe('.create', function() {

            it(`${projectName} should be in the project list`, async function() {
                (await projectService.awaitProject(projectName)).should.be.true;
            });

            it(`should have created a 'projectID'.inf file`, async function() {
                const projectInf = await containerService.awaitProjectInfFile(projectID);
                projectInf.projectID.should.be.a('string');
                projectID.should.equal(projectInf.projectID);

                if (needContextRoot) {
                    contextRoot = projectInf.contextRoot;
                    contextRoot.should.be.a('string');
                }
            });
        });

        describe('.socketChecker', function() {
            before(function() {
                ticker = setInterval(intervalFunction, 60*1000);
                ticking = false; // Initialise ticker
            });

            after(function() { clearInterval(ticker); });

            it(`should emit projectCreation for ${projectName} project creation`, async function() {
                await socketService.checkForMsg({ projectID, msgType: 'projectCreation' });
            });

            it(`should emit projectLogsListChanged for ${projectName} creating a build log`, async function() {
                await socketService.checkForMsg({ projectID, msgType: 'projectLogsListChanged'});
            });

            it(`should emit projectStatusChanged for ${projectName} building successfully`, async function() {
                await socketService.checkForMsg({ projectID, msgType: 'projectBuilt' });
            });

            it(`should be able enable log streams for ${projectName}`, async function() {
                await projectService.startLogStreams(projectID);
            });

            // All docker logs should end with 'Successfully tagged ', luckily.
            it(`should emit docker logs for ${projectName}`, async function() {
                const expectedSocketMsg = {
                    projectID,
                    msgType: 'log-update',
                    expectedProperties: {
                        logType: 'build',
                        logName: 'docker.build.log',
                        logs: 'Successfully tagged ',
                    },
                };
                await socketService.checkForMsg(expectedSocketMsg);
            });

            it(`should emit projectStatusChanged for ${projectName} application started`, async function() {
                await socketService.checkForMsg({ projectID, msgType: 'projectStarted' });
            });

            it(`should emit container logs for ${projectName}`, async function() {
                // Need to enable the new log stream for the container log.
                await projectService.startLogStreams(projectID);
                const expectedSocketMsg = {
                    projectID,
                    msgType: 'log-update',
                    expectedProperties: {
                        logType: 'app',
                        logName: 'container',
                        logs: checkString,
                    },
                };
                await socketService.checkForMsg(expectedSocketMsg);
            });
        });

        describe('.logsChecker', function() {
            before(function() {
                projectID.should.be.a('string');
            });

            it(`should return list of logs for ${language}, project ${projectName}`, async function() {
                // Once all the logs have migrated to the new interface we will
                // add the content checks here.
                const logInfo = await projectService.getLogStreams(projectID);
                const projectType = bindParams[language].projectType;
                for (const logType of Object.keys(expectedLogs[projectType])) {
                    logInfo.should.have.ownProperty(logType);
                    for (const expectedLogName of expectedLogs[projectType][logType]) {
                        const logList = logInfo[logType].map(logObject => logObject.logName);
                        logList.should.include(expectedLogName);
                    }
                }
            });
        });

        describe('.containerChecker', function() {
            before(function() {
                projectID.should.be.a('string');
            });

            it('the container should contain id, ip, exposedPort, internalPort', async function() {
                const containerInfo = await containerService.awaitContainer(projectName, projectID);
                if (USING_K8S) {
                    containerInfo.exposedPort.should.be.a('number');
                    containerInfo.internalPort.should.be.a('number');
                } else {
                    containerInfo.id.should.be.a('string');
                    containerInfo.ip.should.be.a('string');
                    containerInfo.exposedPort.should.be.a('string');
                    containerInfo.internalPort.should.be.a('string');
                }
            });
        });

        describe('.applicationChecker', function() {
            let port;

            before(async function() {
                projectID.should.be.a('string');
                await containerService.awaitProjectInfFile(projectID);
            });

            it('should launch the Application', async function() {
                const projectInf = await containerService.getProjectInfJSON(projectID);
                port = projectInf.ports.exposedPort;
                port.should.be.a('string');
                const url = `${MICROCLIMATE_HOST}:${port}`;
                const receivedSuccessResponse = await awaitSuccessResponseFromEndpoint(url, contextRoot);
                receivedSuccessResponse.should.be.true;
            });

            it('should launch a metrics dashboard', async function() {
                if(!metricsEndpoint) this.skip();
                const url = `${MICROCLIMATE_HOST}:${port}/${metricsEndpoint}`;
                const receivedSuccessResponse = await awaitSuccessResponseFromEndpoint(url, contextRoot);
                receivedSuccessResponse.should.be.true;
            });
        });

        after(async function() {
            this.timeout(2 * testTimeout.med);
            if (projectID) {
                const res = await projectService.unbindProject(projectID);
                res.should.have.status(202);
                await execAsync(`rm -rf ${workspace_location}/${projectName}`);
            }
        });
    }
});

/**
 * Periodically checks for a 200 response from an endpoint, resolving to true if
 * the response is 200, else false if the response is not 200 or the maxWaitingTime elapses
 */
async function awaitSuccessResponseFromEndpoint(url, contextRoot = '') {
    const maxWaitingTime = testTimeout.med;
    const checkingInterval = 1000;
    let timeAwaited = 0;
    let res;
    while (timeAwaited < maxWaitingTime) {
        try {
            res = await chai.request(url).get(`/${contextRoot}`);
        } catch (error) {
            // mlog.log(error);
            // mlog.log(`[awaitSuccessResponseFromEndpoint] Endpoint not found - trying again in ${checkingInterval/1000} sec`);
        }
        if (res && res.status == 200) {
            res.status.should.equal(200);
            return true;
        }

        wait(checkingInterval);
        timeAwaited += checkingInterval;
        if (timeAwaited > 0 && timeAwaited % (20*1000) === 0) {
            mlog.log('[awaitSuccessResponseFromEndpoint] Received no response from endpoint yet');
        }
    }
    return false;
}

function wait(ms){
    const start = new Date().getTime();
    let end = start;
    while (end < start + ms) {
        end = new Date().getTime();
    }
}

async function checkProjectListContainsCorrectStatuses(socketMsg) {
    const projectList = await projectService.getProjects();

    const project = projectList.find(project => project.projectID === socketMsg.projectID);
    if (!project) throw new Error(`Project List does not contain project ${socketMsg.projectID}`);

    for (const status of ['appStatus', 'appErrorStatus', 'buildStatus', 'buildDetailedStatus']) {
        if (socketMsg[status]) project.should.have.property(status);
    }

}

function intervalFunction() {
    if (ticking) {
        process.stdout.write('.');
    } else {
        process.stdout.write('\t.');
        ticking = true;
    }
}
