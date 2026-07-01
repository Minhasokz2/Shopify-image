import { describe, it, expect, vi } from 'vitest';
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

describe('verifySessionToken', () => {
  it('passes through and exposes the session for a valid token with an active stored session', async () => {
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

    // The real middleware also confirms the stored access token still works with a live
    // "shop { name }" GraphQL call. The underlying HTTP client (@shopify/admin-api-client)
    // captures a direct reference to the platform's native fetch at adapter-load time, so
    // stubbing globalThis.fetch later doesn't intercept it — spying on the GraphQL client
    // class itself is the reliable way to answer that call without hitting the real network.
    const graphqlSpy = vi
      .spyOn(shopify.api.clients.Graphql.prototype, 'request')
      .mockResolvedValue({ data: { shop: { name: 'Test Shop' } }, headers: {} });

    const { token } = await getJwt(STORE_NAME, env.SHOPIFY_API_KEY, env.SHOPIFY_API_SECRET);

    const response = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${token}`);

    graphqlSpy.mockRestore();

    expect(response.status).toBe(200);
    expect(response.body.shop).toBe(SHOP);
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

  it('does not grant access when there is no stored session for the shop yet', async () => {
    const { token } = await getJwt('no-session-yet', env.SHOPIFY_API_KEY, env.SHOPIFY_API_SECRET);

    const response = await request(buildApp()).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(response.status).not.toBe(200);
  });
});
