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
  it('passes through with a stored, still-valid expiring session — no network calls at all', async () => {
    storedSessions.set(
      `offline_${SHOP}`,
      new Session({
        id: `offline_${SHOP}`,
        shop: SHOP,
        state: 'test',
        isOnline: false,
        accessToken: 'shpat_totally_real',
        scope: env.SHOPIFY_SCOPES.join(','),
        expires: new Date(Date.now() + 60 * 60 * 1000),
      }),
    );
    const exchangeSpy = vi.spyOn(shopify.api.auth, 'tokenExchange');
    const refreshSpy = vi.spyOn(shopify.api.auth, 'refreshToken');

    const { token } = await getJwt(STORE_NAME, env.SHOPIFY_API_KEY, env.SHOPIFY_API_SECRET);
    const response = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.shop).toBe(SHOP);
    expect(exchangeSpy).not.toHaveBeenCalled();
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it('mints a new EXPIRING offline session via token exchange when none is stored yet', async () => {
    const freshShop = 'no-session-yet.myshopify.com';
    const exchangeSpy = vi.spyOn(shopify.api.auth, 'tokenExchange').mockResolvedValue({
      session: new Session({
        id: `offline_${freshShop}`,
        shop: freshShop,
        state: '',
        isOnline: false,
        accessToken: 'shpat_exchanged',
        expires: new Date(Date.now() + 60 * 60 * 1000),
      }),
    });

    const { token } = await getJwt('no-session-yet', env.SHOPIFY_API_KEY, env.SHOPIFY_API_SECRET);
    const response = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.shop).toBe(freshShop);
    // Per Shopify's April 2026 policy, a public app must request an expiring token, or every
    // subsequent Admin API call gets rejected outright regardless of how fresh the token is.
    expect(exchangeSpy).toHaveBeenCalledWith(expect.objectContaining({ expiring: true }));
    // The exchanged session is persisted so subsequent requests skip the exchange entirely.
    expect(storedSessions.get(`offline_${freshShop}`)?.accessToken).toBe('shpat_exchanged');
  });

  it('re-exchanges instead of reusing a stored session with no expiry — a stale pre-migration non-expiring token', async () => {
    const legacyShop = 'legacy-token-shop.myshopify.com';
    storedSessions.set(
      `offline_${legacyShop}`,
      new Session({ id: `offline_${legacyShop}`, shop: legacyShop, state: '', isOnline: false, accessToken: 'shpat_legacy_non_expiring' }),
    );
    vi.spyOn(shopify.api.auth, 'tokenExchange').mockResolvedValue({
      session: new Session({
        id: `offline_${legacyShop}`,
        shop: legacyShop,
        state: '',
        isOnline: false,
        accessToken: 'shpat_reexchanged',
        expires: new Date(Date.now() + 60 * 60 * 1000),
      }),
    });

    const { token } = await getJwt('legacy-token-shop', env.SHOPIFY_API_KEY, env.SHOPIFY_API_SECRET);
    const response = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(storedSessions.get(`offline_${legacyShop}`)?.accessToken).toBe('shpat_reexchanged');
  });

  it('refreshes an expired session via its refresh token instead of a full re-exchange', async () => {
    const refreshShop = 'refresh-shop.myshopify.com';
    storedSessions.set(
      `offline_${refreshShop}`,
      new Session({
        id: `offline_${refreshShop}`,
        shop: refreshShop,
        state: '',
        isOnline: false,
        accessToken: 'shpat_about_to_expire',
        expires: new Date(Date.now() - 1000), // already expired
        refreshToken: 'refresh_token_value',
      }),
    );
    const exchangeSpy = vi.spyOn(shopify.api.auth, 'tokenExchange');
    const refreshSpy = vi.spyOn(shopify.api.auth, 'refreshToken').mockResolvedValue({
      session: new Session({
        id: `offline_${refreshShop}`,
        shop: refreshShop,
        state: '',
        isOnline: false,
        accessToken: 'shpat_refreshed',
        expires: new Date(Date.now() + 60 * 60 * 1000),
        refreshToken: 'new_refresh_token_value',
      }),
    });

    const { token } = await getJwt('refresh-shop', env.SHOPIFY_API_KEY, env.SHOPIFY_API_SECRET);
    const response = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(refreshSpy).toHaveBeenCalledWith({ shop: refreshShop, refreshToken: 'refresh_token_value' });
    expect(exchangeSpy).not.toHaveBeenCalled();
    expect(storedSessions.get(`offline_${refreshShop}`)?.accessToken).toBe('shpat_refreshed');
  });

  it('falls back to a full token exchange when the refresh token itself is rejected', async () => {
    const deadRefreshShop = 'dead-refresh-shop.myshopify.com';
    storedSessions.set(
      `offline_${deadRefreshShop}`,
      new Session({
        id: `offline_${deadRefreshShop}`,
        shop: deadRefreshShop,
        state: '',
        isOnline: false,
        accessToken: 'shpat_expired',
        expires: new Date(Date.now() - 1000),
        refreshToken: 'refresh_token_too_old',
      }),
    );
    vi.spyOn(shopify.api.auth, 'refreshToken').mockRejectedValue(new Error('refresh token expired'));
    const exchangeSpy = vi.spyOn(shopify.api.auth, 'tokenExchange').mockResolvedValue({
      session: new Session({
        id: `offline_${deadRefreshShop}`,
        shop: deadRefreshShop,
        state: '',
        isOnline: false,
        accessToken: 'shpat_fresh_after_failed_refresh',
        expires: new Date(Date.now() + 60 * 60 * 1000),
      }),
    });

    const { token } = await getJwt('dead-refresh-shop', env.SHOPIFY_API_KEY, env.SHOPIFY_API_SECRET);
    const response = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(exchangeSpy).toHaveBeenCalled();
    expect(storedSessions.get(`offline_${deadRefreshShop}`)?.accessToken).toBe('shpat_fresh_after_failed_refresh');
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
