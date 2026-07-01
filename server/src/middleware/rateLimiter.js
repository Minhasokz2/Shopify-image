import { jobWorker } from '../services/jobWorker.js';

// Business-rule limiter (spec Section 13): reject job creation once a shop is already at 20
// concurrent pending/processing jobs, rather than silently queuing more. Mount only on the
// job/batch-creation routes, after requireShopContext.
export function requireJobCapacity(req, res, next) {
  if (!jobWorker.canAcceptJob(req.shopDomain)) {
    return res.status(429).json({
      error: 'Too many concurrent generation jobs for this shop. Wait for one to finish and try again.',
    });
  }
  return next();
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 100;
const requestLog = new Map(); // shopDomain -> timestamps[] within the current window

// A separate, much looser general HTTP burst guard for all /api/* traffic — protects against a
// buggy polling loop, independent of (and much higher than) the 20-concurrent-job business rule.
export function httpBurstLimiter(req, res, next) {
  const key = req.shopDomain ?? req.ip;
  const now = Date.now();
  const timestamps = (requestLog.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests, slow down.' });
  }

  timestamps.push(now);
  requestLog.set(key, timestamps);
  return next();
}
