import express from 'express';
import { shopify } from '../config/shopify.js';
import { logger } from '../lib/logger.js';

// HMAC is computed over the raw request bytes, so this raw-body parser MUST be mounted before
// any global express.json()/express.urlencoded() on the /webhooks router — a JSON body parser
// running first would consume the stream and break every webhook's signature check.
export const rawBodyParser = express.raw({ type: 'application/json' });

export async function verifyWebhookHmac(req, res, next) {
  // express.raw() only populates req.body with a Buffer when the request's Content-Type matches
  // 'application/json' exactly — anything else (a GET/HEAD probe with no body at all, a wrong or
  // missing Content-Type header) leaves req.body undefined. Passing that straight into
  // shopify.api.webhooks.validate() throws deep inside its HMAC computation, which without this
  // guard turned into an unhandled 500 (and leaked the raw error message) instead of the same
  // clean 401 a genuinely-invalid signature gets. Shopify's automated app review specifically
  // probes with malformed requests, so this crash was failing the "verifies webhooks with HMAC
  // signatures" and "provides mandatory compliance webhooks" checks.
  if (!Buffer.isBuffer(req.body)) {
    logger.warn({ contentType: req.headers['content-type'] }, 'Rejected webhook with missing or non-JSON body');
    return res.status(401).send('Invalid webhook signature');
  }
  const rawBody = req.body.toString('utf8');

  const result = await shopify.api.webhooks.validate({
    rawBody,
    rawRequest: req,
    rawResponse: res,
  });

  if (!result.valid) {
    logger.warn({ reason: result.reason }, 'Rejected webhook with invalid HMAC');
    return res.status(401).send('Invalid webhook signature');
  }

  req.webhook = { topic: result.topic, domain: result.domain, webhookId: result.webhookId };
  req.rawBody = rawBody;
  try {
    req.body = JSON.parse(rawBody);
  } catch {
    req.body = {};
  }
  return next();
}
