import { describe, it, expect, vi } from 'vitest';
import { getHmac } from '@shopify/shopify-api/test-helpers';
import { env } from '../../src/config/env.js';

const { verifyWebhookHmac } = await import('../../src/middleware/verifyWebhookHmac.js');

function makeReqRes(rawBodyString, { validHmac = true } = {}) {
  const hmac = getHmac(rawBodyString, validHmac ? env.SHOPIFY_API_SECRET : 'wrong-secret');
  const req = {
    body: Buffer.from(rawBodyString, 'utf8'),
    headers: {
      'x-shopify-hmac-sha256': hmac,
      'x-shopify-topic': 'app/uninstalled',
      'x-shopify-shop-domain': 'shop.myshopify.com',
      'x-shopify-webhook-id': 'wh-1',
      'x-shopify-api-version': '2026-07',
    },
    get(name) {
      return this.headers[name.toLowerCase()];
    },
  };
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
  return { req, res };
}

describe('verifyWebhookHmac', () => {
  it('calls next() and parses the body for a validly-signed webhook', async () => {
    const payload = JSON.stringify({ shop_domain: 'shop.myshopify.com' });
    const { req, res } = makeReqRes(payload);
    const next = vi.fn();

    await verifyWebhookHmac(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
    expect(req.body).toEqual({ shop_domain: 'shop.myshopify.com' });
    expect(req.webhook.topic).toBeTruthy();
  });

  it('rejects a webhook with a tampered signature with 401 and does not call next()', async () => {
    const payload = JSON.stringify({ shop_domain: 'shop.myshopify.com' });
    const { req, res } = makeReqRes(payload, { validHmac: false });
    const next = vi.fn();

    await verifyWebhookHmac(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejects a webhook whose body was tampered with after signing', async () => {
    const originalPayload = JSON.stringify({ shop_domain: 'shop.myshopify.com' });
    const { req, res } = makeReqRes(originalPayload);
    req.body = Buffer.from(JSON.stringify({ shop_domain: 'attacker.myshopify.com' }), 'utf8');
    const next = vi.fn();

    await verifyWebhookHmac(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
