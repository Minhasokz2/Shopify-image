import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { getJwt } from '@shopify/shopify-api/test-helpers';
import { env } from '../../src/config/env.js';

const storedSessions = new Map();

vi.mock('../../src/lib/sessionStorage.js', () => ({
  FirestoreSessionStorage: class {
    async storeSession(session) {
      storedSessions.set(session.id, session);
      return true;
    }
    async loadSession(id) {
      return storedSessions.get(id);
    }
    async deleteSession(id) {
      storedSessions.delete(id);
      return true;
    }
    async deleteSessions(ids) {
      ids.forEach((id) => storedSessions.delete(id));
      return true;
    }
    async findSessionsByShop(shop) {
      return [...storedSessions.values()].filter((s) => s.shop === shop);
    }
  },
}));

// The middleware creates the shop's Firestore doc the first time it mints a session via token
// exchange — backed by the in-memory fake so this unit test never touches a real project.
vi.mock('../../src/lib/firestore.js', async () => {
  const { createFakeFirestore } = await import('../helpers/fakeFirestore.js');
  const fake = createFakeFirestore();
  return { firestore: fake.firestore, FieldValue: fake.FieldValue, Timestamp: {} };
});

const { shopify } = await import('../../src/config/shopify.js');
const { verifySessionToken } = await import('../../src/middleware/verifySessionToken.js');
const { Session } = await import('@shopify/shopify-api');

function buildApp() {
  const app = express();
  app.get('/protected', verifySessionToken, (req, res) => {
    res.json({ shop: res.locals.shopify.session.shop });
  });
  return app;
}

// getJwt() always appends ".myshopify.com" to whatever store name it's given (see
// @shopify/shopify-api/test-helpers/get-shop-value.ts) — pass the bare store name to it, and use
// the fully-qualified domain for everything else.
const STORE_NAME = 'session-test-shop';
const SHOP = `${STORE_NAME}.myshopify.com`;

beforeEach(() => {
  storedSessions.clear();
  vi.restoreAllMocks();
});

describe('verifySessionToken (token exchange strategy)', () => {
  it('passes through with the stored offline session when one exists — no network calls at all', async () => {
    storedSessions.set(
      `offline_${SHOP}`,
      new Session({
        id: `offline_${SHOP}`,
        shop: SHOP,
        state: 'test',
        isOnline: false,
        accessToken: 'shpat_totally_real',
        scope: env.SHOPIFY_SCOPES.join(','),
      }),
    );
    const exchangeSpy = vi.spyOn(shopify.api.auth, 'tokenExchange');

    const { token } = await getJwt(STORE_NAME, env.SHOPIFY_API_KEY, env.SHOPIFY_API_SECRET);
    const response = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.shop).toBe(SHOP);
    expect(exchangeSpy).not.toHaveBeenCalled();
  });

  it('mints a new offline session via token exchange when none is stored yet', async () => {
    const freshShop = 'no-session-yet.myshopify.com';
    vi.spyOn(shopify.api.auth, 'tokenExchange').mockResolvedValue({
      session: new Session({
        id: `offline_${freshShop}`,
        shop: freshShop,
        state: '',
        isOnline: false,
        accessToken: 'shpat_exchanged',
      }),
    });

    const { token } = await getJwt('no-session-yet', env.SHOPIFY_API_KEY, env.SHOPIFY_API_SECRET);
    const response = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.shop).toBe(freshShop);
    // The exchanged session is persisted so subsequent requests skip the exchange entirely.
    expect(storedSessions.get(`offline_${freshShop}`)?.accessToken).toBe('shpat_exchanged');
  });

  it('responds 401 when the token exchange itself is rejected by Shopify', async () => {
    vi.spyOn(shopify.api.auth, 'tokenExchange').mockRejectedValue(new Error('exchange rejected'));

    const { token } = await getJwt('rejected-shop', env.SHOPIFY_API_KEY, env.SHOPIFY_API_SECRET);
    const response = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(401);
  });

  it('does not grant access for a token signed with the wrong secret', async () => {
    const { token } = await getJwt(STORE_NAME, env.SHOPIFY_API_KEY, 'a-completely-wrong-secret');
    const response = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(response.status).not.toBe(200);
  });

  it('does not grant access for an expired token', async () => {
    const { token } = await getJwt(STORE_NAME, env.SHOPIFY_API_KEY, env.SHOPIFY_API_SECRET, {
      exp: Date.now() / 1000 - 3600,
    });
    const response = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(response.status).not.toBe(200);
  });

  it('does not grant access for a token with the wrong audience (API key)', async () => {
    const { token } = await getJwt(STORE_NAME, 'some-other-app-api-key', env.SHOPIFY_API_SECRET);
    const response = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(response.status).not.toBe(200);
  });

  it('does not grant access with no Authorization header at all', async () => {
    const response = await request(buildApp()).get('/protected');
    expect(response.status).toBe(401);
  });
});
