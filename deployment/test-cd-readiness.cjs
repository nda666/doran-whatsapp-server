'use strict';
const assert = require('node:assert/strict');
const { dispatchReady } = require('./cd-readiness.cjs');
const now = Date.now();
const healthy = { alerts: [], metrics: { running: true, worker_last_poll_success: now, queueSampleAt: now } };
assert(dispatchReady(200, healthy, now));
assert(dispatchReady(503, { ...healthy, alerts: ['BACKLOG_AGE_EXCEEDED', 'SENDER_OFFLINE_WITH_BACKLOG'] }, now));
for (const status of [401, 403, 500]) assert(!dispatchReady(status, healthy, now));
for (const code of ['WORKER_NOT_RUNNING', 'POLL_STALE', 'QUEUE_SAMPLE_STALE', 'CLAIM_STALLED', 'UNKNOWN_ERROR']) {
  assert(!dispatchReady(503, { ...healthy, alerts: [code] }, now));
}
for (const metrics of [null, { ...healthy.metrics, running: false },
  { ...healthy.metrics, worker_last_poll_success: 0 },
  { ...healthy.metrics, worker_last_poll_success: now - 61000 },
  { ...healthy.metrics, queueSampleAt: now - 61000 }]) {
  assert(!dispatchReady(200, { ...healthy, metrics }, now));
}
assert(!dispatchReady(200, null, now));
console.log('DEPLOY_READINESS_WORKER_FRESHNESS_RUNTIME_FAILURES_AND_EXISTING_BACKLOG_PASSED');
