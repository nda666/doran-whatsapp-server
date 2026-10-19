'use strict';
// User-approved deployment policy: existing delivery warnings may remain,
// while the worker must be active and successfully polling/sampling its queue.
const queueWarnings = new Set(['BACKLOG_AGE_EXCEEDED', 'SENDER_OFFLINE_WITH_BACKLOG']);
function dispatchReady(status, health, now = Date.now()) {
  if (![200, 503].includes(status) || !health || !Array.isArray(health.alerts)) return false;
  const metrics = health.metrics;
  if (!metrics || metrics.running !== true) return false;
  if (![metrics.worker_last_poll_success, metrics.queueSampleAt].every(value =>
    Number.isFinite(value) && value > 0 && now - value >= -5000 && now - value <= 60000)) return false;
  return health.alerts.every(code => queueWarnings.has(code));
}
module.exports = { dispatchReady };
