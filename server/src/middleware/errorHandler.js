import { ZodError } from 'zod';
import { HttpResponseError } from '@shopify/shopify-api';
import { shopify } from '../config/shopify.js';
import { Sentry } from '../lib/sentry.js';
import { logger } from '../lib/logger.js';

// Mounted last. Express 5 auto-forwards rejected promises from async route handlers here, so
// route handlers don't need their own try/catch/next(err) boilerplate — they just throw (or let
// schema.parse() throw for them).
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  // A 401/403 from Shopify's Admin API means the stored offline token is dead — revoked (shop
  // reinstalled, token rotated) or rejected outright (the July 2 incident: tokens minted via the
  // legacy authorization-code grant started 403ing wholesale after the app switched to App Store
  // distribution). Deleting the stored session makes the very next request mint a fresh token
  // via token exchange (see verifySessionToken) instead of failing forever on the dead one.
  // Evicting on a "legitimate" 403 (e.g. a missing access scope) is harmless: the re-exchanged
  // session carries the same grants, so it just costs one extra exchange round trip.
  if (error instanceof HttpResponseError && [401, 403].includes(error.response?.code) && req.shopDomain) {
    shopify.config.sessionStorage
      .deleteSession(`offline_${req.shopDomain}`)
      .catch((err) => logger.error({ err, shopDomain: req.shopDomain }, 'Failed to evict stale session'));
  }

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
