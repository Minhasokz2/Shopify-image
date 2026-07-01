import express from 'express';
import { shopify } from '../config/shopify.js';
import { logger } from '../lib/logger.js';

// HMAC is computed over the raw request bytes, so this raw-body parser MUST be mounted before
// any global express.json()/express.urlencoded() on the /webhooks router — a JSON body parser
// running first would consume the stream and break every webhook's signature check.
export const rawBodyParser = express.raw({ type: 'application/json' });

export async function verifyWebhookHmac(req, res, next) {
  const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : req.body;

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
