import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { HttpResponseError } from '@shopify/shopify-api';
import { errorHandler } from '../../src/middleware/errorHandler.js';

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('errorHandler', () => {
  it('returns a generic message for a 500 (unexpected error) — the real message never reaches the client', async () => {
    const error = new Error('FirestoreError: 5 NOT_FOUND: no matching index found for query');
    const res = fakeRes();

    await errorHandler(error, { path: '/api/jobs', shopDomain: 'shop.myshopify.com' }, res, vi.fn());

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });

  it('does the same for an error with an explicit statusCode >= 500', async () => {
    const error = new Error('fal.ai request failed: upstream 503');
    error.statusCode = 503;
    const res = fakeRes();

    await errorHandler(error, { path: '/api/generate', shopDomain: 'shop.myshopify.com' }, res, vi.fn());

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });

  it('still returns the real message for a deliberate 4xx error class (merchant-facing by design)', async () => {
    const error = new Error('Insufficient credits: need 4, have 0');
    error.statusCode = 402;
    const res = fakeRes();

    await errorHandler(error, { path: '/api/generate', shopDomain: 'shop.myshopify.com' }, res, vi.fn());

    expect(res.statusCode).toBe(402);
    expect(res.body).toEqual({ error: 'Insufficient credits: need 4, have 0' });
  });

  it('returns zod field errors for a ZodError, never as a 500', async () => {
    const schema = z.object({ amountUSD: z.number() });
    const zodError = schema.safeParse({ amountUSD: 'not a number' }).error;
    const res = fakeRes();

    await errorHandler(zodError, { path: '/api/billing/custom-purchase', shopDomain: 'shop.myshopify.com' }, res, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Invalid request');
    expect(res.body.details).toBeTruthy();
  });

  it('evicts the stored offline session on a 401/403 from the Shopify Admin API', async () => {
    const deleteSession = vi.fn(async () => true);
    vi.doMock('../../src/config/shopify.js', () => ({
      shopify: { config: { sessionStorage: { deleteSession } } },
    }));
    vi.resetModules();
    const { errorHandler: freshErrorHandler } = await import('../../src/middleware/errorHandler.js');

    const error = new HttpResponseError({ message: 'Unauthorized', code: 401, statusText: 'Unauthorized', headers: {} });
    const res = fakeRes();

    await freshErrorHandler(error, { path: '/api/jobs', shopDomain: 'shop.myshopify.com' }, res, vi.fn());

    expect(deleteSession).toHaveBeenCalledWith('offline_shop.myshopify.com');
    vi.doUnmock('../../src/config/shopify.js');
    vi.resetModules();
  });
});
