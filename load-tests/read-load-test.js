const axios = require('axios');

const BASE_URL = process.env.TARGET_URL || 'http://localhost:3000';
const CONCURRENT_USERS = parseInt(process.env.USERS || '100');
const TEST_DURATION = parseInt(process.env.DURATION || '60') * 1000;

// Track results
const results = {
  total: 0,
  success: 0,
  failed: 0,
  responseTimes: [],
  statusCodes: {}
};

async function makeRequest(endpoint) {
  const startTime = Date.now();
  try {
    const response = await axios({
      method: 'GET',
      url: `${BASE_URL}${endpoint}`,
      timeout: 10000
    });
    const duration = Date.now() - startTime;
    
    results.total++;
    results.success++;
    results.responseTimes.push(duration);
    results.statusCodes[response.status] = (results.statusCodes[response.status] || 0) + 1;
    
    return { success: true, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    const status = error.response?.status || 'error';
    
    results.total++;
    results.failed++;
    results.responseTimes.push(duration);
    results.statusCodes[status] = (results.statusCodes[status] || 0) + 1;
    
    return { success: false, duration };
  }
}

async function runUser(userId) {
  const endTime = Date.now() + TEST_DURATION;
  let requestCount = 0;
  
  // Endpoints weighted towards reads (no auth required)
  const endpoints = [
    '/health',
    '/api/products',
    '/api/products',
    '/api/products',
    '/api/products',
    '/health',
  ];
  
  while (Date.now() < endTime) {
    const endpoint = endpoints[requestCount % endpoints.length];
    await makeRequest(endpoint);
    requestCount++;
  }
  
  return requestCount;
}

async function runLoadTest() {
  console.log(`\nRead-Heavy Load Test`);
  console.log(`═══════════════════════════════════════`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`Users: ${CONCURRENT_USERS}`);
  console.log(`Duration: ${TEST_DURATION / 1000}s\n`);
  
  const startTime = Date.now();
  
  // Start all users concurrently
  const userPromises = [];
  for (let i = 1; i <= CONCURRENT_USERS; i++) {
    userPromises.push(runUser(i));
  }
  
  await Promise.all(userPromises);
  
  const actualDuration = (Date.now() - startTime) / 1000;
  
  // Calculate statistics
  const avgResponseTime = results.responseTimes.length > 0
    ? results.responseTimes.reduce((a, b) => a + b, 0) / results.responseTimes.length
    : 0;
  
  const sortedTimes = [...results.responseTimes].sort((a, b) => a - b);
  const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)] || 0;
  const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0;
  const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)] || 0;
  
  const successRate = results.total > 0 ? (results.success / results.total * 100).toFixed(2) : 0;
  const rps = results.total / actualDuration;
  
  console.log(`\n═══════════════════════════════════════`);
  console.log(`LOAD TEST RESULTS`);
  console.log(`═══════════════════════════════════════`);
  console.log(`Duration: ${actualDuration.toFixed(2)}s`);
  console.log(`Total Requests: ${results.total.toLocaleString()}`);
  console.log(`Successful: ${results.success.toLocaleString()} (${successRate}%)`);
  console.log(`Failed: ${results.failed.toLocaleString()}`);
  console.log(`\nPerformance:`);
  console.log(`  Requests/sec: ${rps.toFixed(2)}`);
  console.log(`  Avg Response: ${avgResponseTime.toFixed(2)}ms`);
  console.log(`  P50: ${p50}ms`);
  console.log(`  P95: ${p95}ms`);
  console.log(`  P99: ${p99}ms`);
  console.log(`\nStatus Codes:`);
  
  for (const [code, count] of Object.entries(results.statusCodes).sort()) {
    console.log(`  ${code}: ${count.toLocaleString()}`);
  }
  
  // Calculate improvement from baseline
  console.log(`\nComparison to Baseline (50 users, 48.67 RPS):`);
  console.log(`  Throughput improvement: ${(rps / 48.67).toFixed(2)}x`);
  
  console.log(`═══════════════════════════════════════\n`);
}

runLoadTest().catch(console.error);
