import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * k6 Rush Load Testing Script for WhatsApp Restaurant AI Agent
 * Simulates high concurrent WhatsApp webhook spikes (50 to 100 VUs) during lunch/dinner rush.
 *
 * Usage:
 * k6 run --vus 50 --duration 30s scripts/load-test.js
 */

export const options = {
  stages: [
    { duration: '10s', target: 20 }, // Ramp up to 20 users
    { duration: '30s', target: 50 }, // Rush peak: 50 concurrent users
    { duration: '10s', target: 0 },  // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of webhook responses under 2s
    http_req_failed: ['rate<0.01'],    // < 1% error rate
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:3000';

export default function () {
  const payload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '100000000000000',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550000000',
                phone_number_id: '100000000000000'
              },
              contacts: [
                {
                  profile: { name: 'Customer Test' },
                  wa_id: '201000000000'
                }
              ],
              messages: [
                {
                  from: '201000000000',
                  id: `wamid.HBgL${Math.random().toString(36).substring(7)}`,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  text: { body: 'عايز أسأل عن منيو النهارده وأسعار الوجبات' },
                  type: 'text'
                }
              ]
            },
            field: 'messages'
          }
        ]
      }
    ]
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.post(`${BASE_URL}/webhook`, payload, params);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 2000ms': (r) => r.timings.duration < 2000,
  });

  sleep(1);
}
