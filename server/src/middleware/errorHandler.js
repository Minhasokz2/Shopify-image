import { ZodError } from 'zod';
import { Sentry } from '../lib/sentry.js';
import { logger } from '../lib/logger.js';

// Mounted last. Express 5 auto-forwards rejected promises from async route handlers here, so
// route handlers don't need their own try/catch/next(err) boilerplate — they just throw (or let
// schema.parse() throw for them).
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  // Every route validates request bodies with zod's .parse() rather than .safeParse() — a
  // malformed request is a 400, never a 500, so this is handled once here instead of every route
  // needing its own try/catch around parse().
  if (error instanceof ZodError) {
    return res.status(400).json({ error: 'Invalid request', details: error.flatten().fieldErrors });
  }

  const statusCode = error.statusCode ?? 500;
  logger.error({ err: error, path: req.path, shopDomain: req.shopDomain }, 'Request failed');
  if (statusCode >= 500) {
    Sentry.captureException(error);
  }
  return res.status(statusCode).json({ error: error.message || 'Internal server error' });
}
