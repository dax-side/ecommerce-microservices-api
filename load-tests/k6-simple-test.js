// k6 Load Test for High Concurrency
// Run: k6 run k6-simple-test.js
// Run with 500 VUs: k6 run --vus 500 --duration 60s k6-simple-test.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
var errorRate = new Rate('errors');
var productFetchTime = new Trend('product_fetch_time');

// Test configuration
export var options = {
  vus: 100,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.3'],
    errors: ['rate<0.3'],
  },
};

var BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // Health check
  var healthRes = http.get(BASE_URL + '/health');
  check(healthRes, {
    'health status is 200': function(r) { return r.status === 200; },
  });
  
  // Fetch products
  var startTime = Date.now();
  var productsRes = http.get(BASE_URL + '/api/products');
  productFetchTime.add(Date.now() - startTime);
  
  var productsOk = check(productsRes, {
    'products status is 200': function(r) { return r.status === 200; },
    'products has data': function(r) {
      try {
        var body = JSON.parse(r.body);
        return body.products !== undefined;
      } catch (e) {
        return false;
      }
    },
  });
  
  if (!productsOk) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }
  
  // Small delay between requests
  sleep(0.1);
}
