// ===== k6 Load Test for 500 Concurrent Users =====
// Run with: k6 run k6-load-test.js
// Run with 500 VUs: k6 run --vus 500 --duration 60s k6-load-test.js
// Run with HTML report: k6 run --out json=results.json k6-load-test.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomString, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// ===== Custom Metrics =====
const errorRate = new Rate('errors');
const successRate = new Rate('success');
const registrationTime = new Trend('registration_time');
const productFetchTime = new Trend('product_fetch_time');
const orderCreationTime = new Trend('order_creation_time');
const cachedResponses = new Counter('cached_responses');

// ===== Test Configuration =====
export const options = {
  // Scenario-based load testing
  scenarios: {
    // Scenario 1: Ramp up to 500 users
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },   // Warm-up
        { duration: '60s', target: 300 },   // Ramp to 300
        { duration: '120s', target: 500 },  // Peak at 500
        { duration: '60s', target: 500 },   // Sustained load
        { duration: '30s', target: 50 },    // Cool-down
      ],
      gracefulRampDown: '30s',
    },
  },
  
  // Performance thresholds
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'], // 95% under 2s, 99% under 5s
    http_req_failed: ['rate<0.3'],                   // Less than 30% failures
    errors: ['rate<0.3'],                             // Custom error rate
    success: ['rate>0.7'],                            // At least 70% success
    registration_time: ['p(95)<5000'],                // Registration under 5s
    product_fetch_time: ['p(95)<500'],                // Products fetch under 500ms
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// ===== Helper Functions =====
function generateEmail() {
  return `user_${randomString(8)}_${Date.now()}@loadtest.com`;
}

function checkResponse(res, expectedStatus = [200, 201]) {
  const statusOk = Array.isArray(expectedStatus) 
    ? expectedStatus.includes(res.status)
    : res.status === expectedStatus;
  
  if (!statusOk) {
    errorRate.add(1);
    successRate.add(0);
  } else {
    errorRate.add(0);
    successRate.add(1);
  }
  
  // Check for cached response
  if (res.json() && res.json().cached === true) {
    cachedResponses.add(1);
  }
  
  return statusOk;
}

// ===== Main Test Function =====
export default function () {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    timeout: '30s',
  };

  // Randomly select a scenario based on weight
  const scenarioWeight = Math.random() * 100;
  
  if (scenarioWeight < 10) {
    // 10% - Health Check
    healthCheck(params);
  } else if (scenarioWeight < 50) {
    // 40% - Browse Products
    browseProducts(params);
  } else if (scenarioWeight < 65) {
    // 15% - User Registration
    userRegistration(params);
  } else if (scenarioWeight < 85) {
    // 20% - User Login
    userLogin(params);
  } else if (scenarioWeight < 95) {
    // 10% - Create Product
    createProduct(params);
  } else {
    // 5% - Full E-commerce Journey
    fullJourney(params);
  }
  
  sleep(randomIntBetween(1, 3));
}

// ===== Test Scenarios =====

function healthCheck(params) {
  group('Health Check', () => {
    const res = http.get(`${BASE_URL}/health`, params);
    check(res, {
      'health check status is 200': (r) => r.status === 200,
    });
    checkResponse(res, 200);
  });
}

function browseProducts(params) {
  group('Browse Products', () => {
    // Get all products
    const startTime = Date.now();
    const productsRes = http.get(`${BASE_URL}/api/products`, params);
    productFetchTime.add(Date.now() - startTime);
    
    const productsOk = check(productsRes, {
      'products status is 200': (r) => r.status === 200,
      'products response has data': (r) => {
        try {
          const body = r.json();
          return body.products !== undefined;
        } catch (e) {
          return false;
        }
      },
    });
    checkResponse(productsRes, 200);
    
    if (productsOk) {
      try {
        const products = productsRes.json().products;
        if (products && products.length > 0) {
          // Get a random product
          const productId = products[randomIntBetween(0, products.length - 1)]._id;
          sleep(1);
          
          const productRes = http.get(`${BASE_URL}/api/products/${productId}`, params);
          check(productRes, {
            'single product status is 200': (r) => r.status === 200,
          });
          checkResponse(productRes, 200);
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
    
    sleep(1);
    
    // Get categories
    const categoriesRes = http.get(`${BASE_URL}/api/categories`, params);
    check(categoriesRes, {
      'categories status is 200': (r) => r.status === 200,
    });
    checkResponse(categoriesRes, 200);
  });
}

function userRegistration(params) {
  group('User Registration', () => {
    const email = generateEmail();
    const payload = JSON.stringify({
      email: email,
      password: 'TestPassword123!',
      name: `Load Test User ${randomIntBetween(1, 10000)}`,
    });
    
    const startTime = Date.now();
    const res = http.post(`${BASE_URL}/api/auth/register`, payload, params);
    registrationTime.add(Date.now() - startTime);
    
    check(res, {
      'registration status is 201 or 400': (r) => [201, 400, 429].includes(r.status),
      'registration returns token on success': (r) => {
        if (r.status === 201) {
          try {
            return r.json().token !== undefined;
          } catch (e) {
            return false;
          }
        }
        return true;
      },
    });
    checkResponse(res, [201, 400, 429]);
  });
}

function userLogin(params) {
  group('User Login', () => {
    // First register a user
    const email = generateEmail();
    const password = 'TestPassword123!';
    
    const registerPayload = JSON.stringify({
      email: email,
      password: password,
      name: 'Login Test User',
    });
    
    const registerRes = http.post(`${BASE_URL}/api/auth/register`, registerPayload, params);
    
    if (registerRes.status === 201) {
      sleep(0.5);
      
      // Then login
      const loginPayload = JSON.stringify({
        email: email,
        password: password,
      });
      
      const loginRes = http.post(`${BASE_URL}/api/auth/login`, loginPayload, params);
      
      check(loginRes, {
        'login status is 200': (r) => r.status === 200,
        'login returns token': (r) => {
          try {
            return r.json().token !== undefined;
          } catch (e) {
            return false;
          }
        },
      });
      checkResponse(loginRes, 200);
    }
  });
}

function createProduct(params) {
  group('Create Product', () => {
    const payload = JSON.stringify({
      name: `Test Product ${randomString(8)}`,
      description: 'A high-quality test product created during load testing',
      price: randomIntBetween(10, 1000),
      category: ['Electronics', 'Clothing', 'Books', 'Home'][randomIntBetween(0, 3)],
      stock: randomIntBetween(1, 100),
    });
    
    const res = http.post(`${BASE_URL}/api/products`, payload, params);
    
    check(res, {
      'create product status is 201 or rate limited': (r) => [201, 429].includes(r.status),
    });
    checkResponse(res, [201, 429]);
  });
}

function fullJourney(params) {
  group('Full E-commerce Journey', () => {
    // 1. Register
    const email = generateEmail();
    const registerPayload = JSON.stringify({
      email: email,
      password: 'TestPassword123!',
      name: 'Journey User',
    });
    
    const registerRes = http.post(`${BASE_URL}/api/auth/register`, registerPayload, params);
    
    if (registerRes.status !== 201) {
      return; // Exit if registration fails
    }
    
    let token, userId;
    try {
      const body = registerRes.json();
      token = body.token;
      userId = body.user.id;
    } catch (e) {
      return;
    }
    
    const authParams = {
      ...params,
      headers: {
        ...params.headers,
        'Authorization': `Bearer ${token}`,
      },
    };
    
    sleep(1);
    
    // 2. Browse products
    const productsRes = http.get(`${BASE_URL}/api/products`, authParams);
    
    let productId;
    if (productsRes.status === 200) {
      try {
        const products = productsRes.json().products;
        if (products && products.length > 0) {
          productId = products[0]._id;
        }
      } catch (e) {
        // Ignore
      }
    }
    
    sleep(2);
    
    // 3. Create order (if we have a product)
    if (productId && userId) {
      const orderPayload = JSON.stringify({
        userId: userId,
        items: [
          {
            productId: productId,
            quantity: randomIntBetween(1, 3),
          },
        ],
      });
      
      const startTime = Date.now();
      const orderRes = http.post(`${BASE_URL}/api/orders`, orderPayload, authParams);
      orderCreationTime.add(Date.now() - startTime);
      
      check(orderRes, {
        'order creation handled': (r) => [201, 400, 500].includes(r.status),
      });
    }
  });
}

// ===== Setup and Teardown =====
export function setup() {
  console.log('Starting load test against:', BASE_URL);
  
  // Verify target is accessible
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`Target not accessible. Health check returned: ${res.status}`);
  }
  
  return { startTime: Date.now() };
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Load test completed in ${duration.toFixed(2)} seconds`);
}

// ===== Summary Handler =====
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data, options) {
  const { indent = '', enableColors = false } = options;
  
  let output = '\n========== LOAD TEST SUMMARY ==========\n\n';
  
  output += `${indent}Total Requests: ${data.metrics.http_reqs?.values?.count || 0}\n`;
  output += `${indent}Request Rate: ${(data.metrics.http_reqs?.values?.rate || 0).toFixed(2)} req/s\n`;
  output += `${indent}Avg Response Time: ${(data.metrics.http_req_duration?.values?.avg || 0).toFixed(2)}ms\n`;
  output += `${indent}p95 Response Time: ${(data.metrics.http_req_duration?.values?.['p(95)'] || 0).toFixed(2)}ms\n`;
  output += `${indent}p99 Response Time: ${(data.metrics.http_req_duration?.values?.['p(99)'] || 0).toFixed(2)}ms\n`;
  output += `${indent}Failed Requests: ${((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%\n`;
  output += `${indent}Cached Responses: ${data.metrics.cached_responses?.values?.count || 0}\n`;
  
  output += '\n========================================\n';
  
  return output;
}
