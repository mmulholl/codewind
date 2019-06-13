package org.eclipse.codewind.microclimate.smoketest;

import static org.junit.Assert.*;

import java.io.File;
import java.net.HttpURLConnection;
import java.util.Date;

import org.eclipse.codewind.microclimate.test.util.AbstractMicroclimateTest;
import org.eclipse.codewind.microclimate.test.util.Logger;
import org.eclipse.codewind.microclimate.test.util.MicroclimateTestUtils;
import org.eclipse.codewind.microclimate.test.util.RetryRule;
import org.eclipse.codewind.microclimate.test.util.StatusTrackingUtil;
import org.eclipse.codewind.microclimate.test.util.MicroclimateTestUtils.PROJECT_TYPES;
import org.eclipse.codewind.microclimate.test.util.MicroclimateTestUtils.SUITE_TYPES;
import org.junit.FixMethodOrder;
import org.junit.Ignore;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runners.MethodSorters;


@FixMethodOrder(MethodSorters.NAME_ASCENDING)
public class SwiftCreationAndUpdate extends AbstractMicroclimateTest {

	public static String exposedPort;
	public static String projectName = "swift" + SUITE_TYPES.smoketest + (new Date().getTime());
	private static String nonDefaultWorkspace = System.getProperty("microclimate.workspace");
	private static String workspace = nonDefaultWorkspace == null ? System.getProperty("user.home") + "/microclimate-workspace/" : nonDefaultWorkspace.endsWith("/") ? nonDefaultWorkspace : nonDefaultWorkspace + "/";
	private static String testType = System.getProperty("testType");
	private static PROJECT_TYPES projectType = PROJECT_TYPES.swift;
	
    @Rule
    public RetryRule retry = new RetryRule(MicroclimateTestUtils.retryCount);
    
    @Test(timeout=180000) //3 minutes timeout
	public void TestAcreate(){
    	Logger.println(SwiftCreationAndUpdate.class, "TestAcreate()", ">>> SwiftCreationAndUpdate.TestAcreate");
		if (testType.equalsIgnoreCase("icp") && System.getProperty("ns") != null) MicroclimateTestUtils.setDefaultNS(System.getProperty("ns"));
		
		String urlParameters  ="{\"name\": \"" + projectName+"\",\"language\": \"swift\"}";
		
		try {
			// Start up sockets listener for project status change events
			StatusTrackingUtil.startStatusTrackingListener();
			int HttpResult = MicroclimateTestUtils.projectCreation(urlParameters, testType);
			Logger.println(SwiftCreationAndUpdate.class, "TestAcreate()", "HttpResult is: " + HttpResult);
			assertTrue(HttpResult == HttpURLConnection.HTTP_ACCEPTED);
		}catch(Exception e) {
			Logger.println(SwiftCreationAndUpdate.class, "TestAcreate()", "Exception occurred during project creation: " + e.getMessage(),e);
			fail("Exception occurred during project creation.");
		}
		
		return;
	}
	
	@Test(timeout=30000) //30 seconds timeout
	public void TestBcheckForProject() {
		try {
			Logger.println(SwiftCreationAndUpdate.class, "TestBcheckForProject()", ">>> SwiftCreationAndUpdate.TestBcheckForProject");
			while(true) {
				if(MicroclimateTestUtils.checkProjectExistency(projectName, testType)) {
					return;
				} else {
					Thread.sleep(3000);
				}
			}
		}catch(Exception e) {
			Logger.println(SwiftCreationAndUpdate.class, "TestBcheckForProject()", "Exception occurred when looking for project in projectList: " + e.getMessage(),e);
			fail("Exception occurred when looking for project in projectList");
		}	
	}
	
	@Test(timeout=600000) //10 mins timeout
	public void TestCcheckForContainer() {
		try {
			Logger.println(SwiftCreationAndUpdate.class, "TestCcheckForContainer()", ">>> SwiftCreationAndUpdate.TestCcheckForContainer");
			exposedPort = MicroclimateTestUtils.getexposedPort(projectName, testType, projectType);
			Logger.println(SwiftCreationAndUpdate.class, "TestCcheckForContainer()", "Exposed Port is " + exposedPort);
			assertNotNull("exposedPort for project " + projectName + " is null", exposedPort);
		}catch(Exception e) {
			Logger.println(SwiftCreationAndUpdate.class, "TestCcheckForContainer()", "Exception occurred when looking for exposedport: " + e.getMessage(),e);
			fail("Exception occurred when looking for exposedport");
		}
		
		return;
	}
	
	@Test(timeout=300000) //5 mins timeout
	public void TestEcheckEndpoint() {
		Logger.println(SwiftCreationAndUpdate.class, "TestEcheckEndpoint()", ">>> SwiftCreationAndUpdate.TestEcheckEndpoint");
		assertNotNull("exposedPort for project " + projectName +" is null", exposedPort);
		String expectedString = "UP";
		String api = "/health";
		
		try {
			while(true) {
				if(MicroclimateTestUtils.checkEndpoint(expectedString, exposedPort, api, testType)) {
					String projectID = MicroclimateTestUtils.getProjectID(projectName, testType);
					// Check application & build status transitions
					StatusTrackingUtil.checkAppStatusTransitionsForCreate(projectID, 120);
					StatusTrackingUtil.checkBuildStatusTransitionsForCreate(projectID, 120);
					return;
				} else {
					Thread.sleep(10000);
				}
			}
		}catch(Exception e) {
			Logger.println(SwiftCreationAndUpdate.class, "TestEcheckEndpoint()", "Exception occurred when checking for endpoint: ",e);
			fail("Exception occurred when checking for endpoint");
		}	
	}
	
	@Test(timeout=1200000) //20 mins timeout
	public void TestFupdate() {
		Logger.println(SwiftCreationAndUpdate.class, "TestFupdate()", ">>> SwiftCreationAndUpdate.TestFupdate");
		assertNotNull("exposedPort for project " + projectName +" is null", exposedPort);
		String expectedString = "UP";		
			
		try {
			String projectID = MicroclimateTestUtils.getProjectID(projectName, testType);
			
			// Clear the current project status states transitions records
			StatusTrackingUtil.clearStatusEventsRecord(projectID);
			
			MicroclimateTestUtils.updateFile(testType, projectName, "Sources/Application/Routes/HealthRoutes.swift", "HealthRoutes.swift", "/health", "/hello");
			
			while(true) {
				TestCcheckForContainer();
				String api = "/hello";
				if(MicroclimateTestUtils.checkEndpoint(expectedString, exposedPort, api, testType)) {
					// Check application & build status transitions (previously when using polling, only final state was checked)
					StatusTrackingUtil.checkAppStatusTransitionsForUpdate(projectID, 120);
					StatusTrackingUtil.checkBuildStatusTransitionsForUpdate(projectID, 120);
					return;
				} else {
					Thread.sleep(3000);
				}
			}
		}catch(Exception e) {
			Logger.println(SwiftCreationAndUpdate.class, "TestFupdate()", "Exception occurred when checking for endpoint: ",e);
			fail("Exception occurred when checking for endpoint");
		}
	}

	@Test(timeout=600000) // 10 mins timeout
	public void TestGautoBuild() {
		Logger.println(SwiftCreationAndUpdate.class, "TestGautoBuild()", ">>> SwiftCreationAndUpdate.TestGautoBuild");
		assertNotNull("exposedPort for project " + projectName +" is null", exposedPort);
		
		// Get the project ID - needed for requests
		String projectID = null;
		try {
			projectID = MicroclimateTestUtils.getProjectID(projectName, testType);
		} catch (Exception e) {
			Logger.println(SwiftCreationAndUpdate.class, "TestGautoBuild()", "Exception occurred getting the project ID: " + e.getMessage(),e);
			fail("Exception occurred getting the project ID.");
		}
		
		try {
			// Disable auto build
			MicroclimateTestUtils.setAutoBuild(projectID, testType, false);
			
			// Check that build required is false
			assertFalse("Build required should be false", MicroclimateTestUtils.getBuildRequired(projectID, testType));
			
			// Update the application
			String originalRoute = "/hello";
			String newRoute = "/healthcheck";
			String expectedString = "UP";
			MicroclimateTestUtils.updateFile(testType, projectName, "Sources/Application/Routes/HealthRoutes.swift", "HealthRoutes.swift", originalRoute, newRoute);
			
			// Wait for build required to be set
			try {
				while (!MicroclimateTestUtils.getBuildRequired(projectID, testType)) {
					Thread.sleep(1000);
				}
			} catch(Exception e) {
				Logger.println(SwiftCreationAndUpdate.class, "TestGautoBuild()", "Exception occurred when checking build required",e);
				fail("Exception occurred when checking build required");
			}
			
			// Check that the original route is still served (no build has been requested yet)
			MicroclimateTestUtils.pingApp(expectedString, exposedPort, originalRoute, testType);
			
			// Request a build
			MicroclimateTestUtils.requestBuild(projectID, testType);
			assertTrue("App should restart after build request", StatusTrackingUtil.detectAppRestart(projectID, 300));
			
			try {
				while(true) {
					// Get the new exposed port
					TestCcheckForContainer();
					
					if(MicroclimateTestUtils.checkEndpoint(expectedString, exposedPort, newRoute, testType)) {
						break;
					} else {
						Thread.sleep(3000);
					}
				}
			} catch(Exception e) {
				Logger.println(SwiftCreationAndUpdate.class, "TestFautoBuild()", "Exception occurred when checking for endpoint",e);
				fail("Exception occurred when checking for endpoint");
			}
			
			// Check that the new route is served
			MicroclimateTestUtils.pingApp(expectedString, exposedPort, newRoute, testType);
		} finally {
			// Make sure auto build is enabled
			MicroclimateTestUtils.setAutoBuild(projectID, testType, true);
		}
	}
	
	@Test(timeout = 600000) //10 mins timeout
	public void TestHmodifyDockerFile() {
		Logger.println(SwiftCreationAndUpdate.class, "TestHmodifyDockerFile()", ">>> SwiftCreationAndUpdate.TestHmodifyDockerFile");
		assertNotNull("exposedPort for project " + projectName +" is null", exposedPort);
		
		String Dockerfile = "Dockerfile";
		String content = "RUN mkdir -m 777 -p /test_directory";
		
		try {
			String projectID = MicroclimateTestUtils.getProjectID(projectName, testType);
			
			// Clear the current project status states transitions records
			StatusTrackingUtil.clearStatusEventsRecord(projectID);
			
			MicroclimateTestUtils.updateDockerFile(testType, projectName, Dockerfile, content);
			
			while(true) {
				if(MicroclimateTestUtils.checkContainerChange(projectName, testType)) {
					StatusTrackingUtil.checkBuildStatusTransitionsForUpdate(projectID, 300);
					return;
				} else {
					Thread.sleep(3000);
				}		
			}
		}catch(Exception e) {
			Logger.println(SwiftCreationAndUpdate.class, "TestHmodifyDockerFile()", "Exception occurred when checking for container change: " + e.getMessage(),e);
			fail("Exception occurred when checking for container change");
		}
	}
	
	@Test(timeout=30000) //30 seconds timeout
	public void TestIdelete() {
		Logger.println(SwiftCreationAndUpdate.class, "TestIdelete()", ">>> SwiftCreationAndUpdate.TestIdelete");
		String path = workspace + projectName;
		
		// only if this is the 1st time trying, then we run the portal project deletion
		if (MicroclimateTestUtils.retryCount == retry.getRetriesLeft()) {
			try {
				int responseCode = MicroclimateTestUtils.projectdeletion(projectName, testType);
				assertTrue("expected response code " + HttpURLConnection.HTTP_ACCEPTED + ", found " + responseCode, responseCode == HttpURLConnection.HTTP_ACCEPTED);
			} catch (Exception e) {
				Logger.println(SwiftCreationAndUpdate.class, "TestIdelete()", "Exception occurred during project deletion: " + e.getMessage(),e);
				fail("Exception occurred during project deletion: " + projectName);
			}	
		}
		
		if (testType.equalsIgnoreCase("local")) {
			File projectDirectory = new File(path);
			
			try {
				if (MicroclimateTestUtils.existContainer(projectName)) {
					fail("Project deletion failed! Project container still exists.");
				}
			} catch (Exception e) {
				Logger.println(SwiftCreationAndUpdate.class, "TestIdelete()", "Exception occurred during check if container still exists: " + e.getMessage(),e);
				fail("Exception occurred during check if container still exists");
			}
			
			try {
				if (MicroclimateTestUtils.existImage(projectName)) {
					fail("Project deletion failed! Project image still exists.");
				}
			} catch (Exception e) {
				Logger.println(SwiftCreationAndUpdate.class, "TestIdelete()", "Exception occurred during check if image still exists: " + e.getMessage(),e);
				fail("Exception occurred during check if image still exists");
			}
		} else if (testType.equalsIgnoreCase("icp")) {
			String pod = null;
			String dirName = projectName;
			
			try {
				pod = MicroclimateTestUtils.getFileWatcherPod();
			} catch (Exception e) {
				Logger.println(SwiftCreationAndUpdate.class, "TestIdelete()", "Exception occurred during get pod: " + e.getMessage(),e);
				fail("Exception occurred during get pod");
			}
			
			try {
				Thread.sleep(5000);
				if (MicroclimateTestUtils.existPod(projectName)) {
					fail("Project deletion failed! Project pod still exists.");
				}
			} catch (Exception e) {
				Logger.println(SwiftCreationAndUpdate.class, "TestIdelete()", "Exception occurred during check if pod still exists: " + e.getMessage(),e);
				fail("Exception occurred during check if pod still exists");
			}
		}
	}
}
