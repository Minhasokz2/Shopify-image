import { describe, it, expect, vi, beforeEach } from 'vitest';
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

vi.mock('../../src/lib/firestore.js', async () => {
  const { createFakeFirestore } = await import('../helpers/fakeFirestore.js');
  const fake = createFakeFirestore();
  return { firestore: fake.firestore, FieldValue: fake.FieldValue, Timestamp: {} };
});

const { Session } = await import('@shopify/shopify-api');
const { shopify } = await import('../../src/config/shopify.js');
const { firestore } = await import('../../src/lib/firestore.js');
const { createApp } = await import('../../src/app.js');
const { verifyState } = await import('../../src/lib/signedState.js');

const STORE_NAME = 'credits-purchase-shop';
const SHOP = `${STORE_NAME}.myshopify.com`;

async function authHeader() {
  const { token } = await getJwt(STORE_NAME, env.SHOPIFY_API_KEY, env.SHOPIFY_API_SECRET);
  return { Authorization: `Bearer ${token}` };
}

beforeEach(async () => {
  vi.restoreAllMocks();
  storedSessions.clear();

  storedSessions.set(
    `offline_${SHOP}`,
    new Session({
      id: `offline_${SHOP}`,
      shop: SHOP,
      state: 'test',
      isOnline: false,
      accessToken: 'shpat_totally_real',
      expires: new Date(Date.now() + 60 * 60 * 1000),
    }),
  );

  await firestore.collection('shops').doc(SHOP).set({ creditBalance: 0, plan: 'free' });
});

// The returnUrl built here must point at a route this SHOP can be reconciled from once Shopify
// redirects the merchant's top-level (unauthenticated) browser back to it — see
// routes/billingConfirm.js and its test file for why a plain /api/billing/confirm can't work.
describe('POST /api/billing/purchase', () => {
  it('builds a returnUrl carrying a signed state token for this shop, not the old unauthenticated /api path', async () => {
    vi.spyOn(shopify.api.billing, 'request').mockResolvedValue({
      confirmationUrl: 'https://admin.shopify.com/confirm',
    });

    const app = createApp();
    const res = await request(app).post('/api/billing/purchase').set(await authHeader()).send({ packId: 'growth' });

    expect(res.status).toBe(200);
    const calledWith = shopify.api.billing.request.mock.calls[0][0];

    expect(calledWith.returnUrl).toMatch(/^https:\/\/[^/]+\/billing\/confirm\?state=/);
    expect(calledWith.returnUrl).not.toContain('/api/billing/confirm');
    expect(calledWith.plan).toBe('growth'); // defaults to monthly when billingInterval is omitted

    const state = new URL(calledWith.returnUrl).searchParams.get('state');
    expect(verifyState(state)).toEqual(expect.objectContaining({ shop: SHOP }));
  });

  it('requests the annual plan variant when billingInterval: "annual" is sent', async () => {
    vi.spyOn(shopify.api.billing, 'request').mockResolvedValue({
      confirmationUrl: 'https://admin.shopify.com/confirm',
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/billing/purchase')
      .set(await authHeader())
      .send({ packId: 'growth', billingInterval: 'annual' });

    expect(res.status).toBe(200);
    expect(shopify.api.billing.request.mock.calls[0][0].plan).toBe('growth_annual');
  });
});

describe('POST /api/image-optimizer/billing/subscribe', () => {
  it('builds a returnUrl carrying a signed state token for this shop', async () => {
    vi.spyOn(shopify.api.billing, 'request').mockResolvedValue({
      confirmationUrl: 'https://admin.shopify.com/confirm',
    });

    const app = createApp();
    const res = await request(app).post('/api/image-optimizer/billing/subscribe').set(await authHeader()).send({});

    expect(res.status).toBe(200);
    const calledWith = shopify.api.billing.request.mock.calls[0][0];

    expect(calledWith.returnUrl).toMatch(/^https:\/\/[^/]+\/image-optimizer\/billing\/confirm\?state=/);
    const state = new URL(calledWith.returnUrl).searchParams.get('state');
    expect(verifyState(state)).toEqual(expect.objectContaining({ shop: SHOP }));
  });
});
