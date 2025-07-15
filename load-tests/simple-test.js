const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const CONCURRENT_USERS = 50;
const TEST_DURATION = 60000; // 60 seconds

async function makeRequest(endpoint, method = 'GET', data = null) {
  const startTime = Date.now();
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      timeout: 5000
    };
    
    if (data) {
      config.data = data;
      config.headers = { 'Content-Type': 'application/json' };
    }
    
    const response = await axios(config);
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      status: response.status,
      duration,
      endpoint
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      status: error.response?.status || 0,
      duration,
      endpoint,
      error: error.message
    };
  }
}

async function runUser(userId) {
  const results = [];
  const endTime = Date.now() + TEST_DURATION;
  
  console.log(`User ${userId} started`);
  
  while (Date.now() < endTime) {
    // Health check
    results.push(await makeRequest('/health'));
    
    // Register user
    const registerData = {
      email: `loaduser${userId}_${Date.now()}@example.com`,
      password: 'password123',
      name: `Load User ${userId}`
    };
    results.push(await makeRequest('/api/auth/register', 'POST', registerData));
    
    // Get products
    results.push(await makeRequest('/api/products'));
    
    // Create product
    const productData = {
      name: `Product ${userId}_${Date.now()}`,
      description: 'Load test product',
      price: Math.floor(Math.random() * 1000),
      category: 'Electronics',
      stock: Math.floor(Math.random() * 100)
    };
    results.push(await makeRequest('/api/products', 'POST', productData));
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`User ${userId} completed ${results.length} requests`);
  return results;
}

async function runLoadTest() {
  console.log(`Starting load test with ${CONCURRENT_USERS} concurrent users for ${TEST_DURATION/1000} seconds`);
  console.log(`Target: ${BASE_URL}`);
  
  const startTime = Date.now();
  
  // Create concurrent users
  const userPromises = [];
  for (let i = 1; i <= CONCURRENT_USERS; i++) {
    userPromises.push(runUser(i));
  }
  
  // Wait for all users to complete
  const allResults = await Promise.all(userPromises);
  const flatResults = allResults.flat();
  
  // Calculate metrics
  const totalRequests = flatResults.length;
  const successfulRequests = flatResults.filter(r => r.success).length;
  const failedRequests = totalRequests - successfulRequests;
  const averageResponseTime = flatResults.reduce((sum, r) => sum + r.duration, 0) / totalRequests;
  const requestsPerSecond = totalRequests / (TEST_DURATION / 1000);
  
  // Group by status code
  const statusCodes = {};
  flatResults.forEach(r => {
    const status = r.status || 'timeout';
    statusCodes[status] = (statusCodes[status] || 0) + 1;
  });
  
  // Results
  console.log('\n===== LOAD TEST RESULTS =====');
  console.log(`Test Duration: ${(Date.now() - startTime) / 1000}s`);
  console.log(`Total Requests: ${totalRequests}`);
  console.log(`Successful Requests: ${successfulRequests} (${((successfulRequests/totalRequests)*100).toFixed(2)}%)`);
  console.log(`Failed Requests: ${failedRequests} (${((failedRequests/totalRequests)*100).toFixed(2)}%)`);
  console.log(`Average Response Time: ${averageResponseTime.toFixed(2)}ms`);
  console.log(`Requests Per Second: ${requestsPerSecond.toFixed(2)}`);
  console.log('\nStatus Code Distribution:');
  Object.entries(statusCodes).forEach(([status, count]) => {
    console.log(`  ${status}: ${count} requests`);
  });
  
  // Find slowest requests
  const slowestRequests = flatResults
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 5);
  
  console.log('\nSlowest Requests:');
  slowestRequests.forEach((req, i) => {
    console.log(`  ${i+1}. ${req.endpoint} - ${req.duration}ms (${req.success ? 'SUCCESS' : 'FAILED'})`);
  });
}

// Install axios if not present
try {
  require('axios');
} catch (e) {
  console.error('Please install axios: npm install axios');
  process.exit(1);
}

runLoadTest().catch(console.error);
