import { Sentry } from '../lib/sentry.js';
import { logger } from '../lib/logger.js';

// Mounted last. Express 5 auto-forwards rejected promises from async route handlers here, so
// route handlers don't need their own try/catch/next(err) boilerplate — they just throw.
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  const statusCode = error.statusCode ?? 500;
  logger.error({ err: error, path: req.path, shopDomain: req.shopDomain }, 'Request failed');
  if (statusCode >= 500) {
    Sentry.captureException(error);
  }
  res.status(statusCode).json({ error: error.message || 'Internal server error' });
}
