import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// Custom metrics
const pageDuration = new Trend('page_duration');
const pageSuccessRate = new Rate('page_success_rate');
const pageLoadCounter = new Counter('page_loads');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp-up to 10 users
    { duration: '1m', target: 10 },   // Stay at 10 users
    { duration: '30s', target: 0 },   // Ramp-down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
    http_req_failed: ['rate<0.1'],     // Error rate should be less than 10%
  },
};

export default function () {
  const url = __ENV.TARGET_URL || 'http://localhost';
  
  const startTime = new Date().getTime();
  const res = http.get(url);
  const endTime = new Date().getTime();
  
  const duration = endTime - startTime;
  pageDuration.add(duration);
  pageLoadCounter.add(1);
  
  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 1000ms': (r) => r.timings.duration < 1000,
  });
  
  pageSuccessRate.add(success);
  
  sleep(1);
}
