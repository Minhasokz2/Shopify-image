import * as Sentry from '@sentry/node';
import { env, isProduction } from '../config/env.js';

let initialized = false;

export function initSentry() {
  if (initialized || !env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: isProduction ? 0.1 : 0,
  });
  initialized = true;
}

// Every job failure must be logged with shop domain + jobId (spec Section 13). Callers pass
// those as `extra` so they show up as searchable Sentry tags/context, not just in the message.
export function captureJobFailure(error, { shopDomain, jobId, ...extra } = {}) {
  if (!initialized) {
    return;
  }
  Sentry.withScope((scope) => {
    if (shopDomain) scope.setTag('shopDomain', shopDomain);
    if (jobId) scope.setTag('jobId', jobId);
    scope.setContext('job', { shopDomain, jobId, ...extra });
    Sentry.captureException(error);
  });
}

export { Sentry };
