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
  // reinstalled, token rotated), or genuinely expired despite verifySessionToken's proactive
  // expiry check and refresh (a race, or a refresh-token failure that fell through anyway).
  // Deleting the stored session makes the very next request mint a fresh expiring token via
  // token exchange (see verifySessionToken) instead of failing forever on the dead one. Evicting
  // on a "legitimate" 403 (e.g. a missing access scope) is harmless: the re-exchanged session
  // carries the same grants, so it just costs one extra exchange round trip.
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

  // Every 4xx here comes from an error class this app throws deliberately (InsufficientCreditsError,
  // PublishError, etc.) with a message written to be shown to the merchant — safe to return as-is.
  // A 5xx, by contrast, is always something UNEXPECTED (a Firestore outage, a provider SDK
  // exception, a bug) — error.message at that point is an internal implementation detail (a raw
  // Firestore/fal.ai/OpenAI SDK error string), not merchant-facing copy, and returning it verbatim
  // risks leaking internal details. Full detail still goes to Sentry/logs above; the client only
  // gets a generic message.
  if (statusCode >= 500) {
    Sentry.captureException(error);
    return res.status(statusCode).json({ error: 'Internal server error' });
  }
  return res.status(statusCode).json({ error: error.message || 'Internal server error' });
}
