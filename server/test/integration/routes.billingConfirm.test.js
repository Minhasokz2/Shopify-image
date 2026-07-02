import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
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
const { signState } = await import('../../src/lib/signedState.js');

const STORE_NAME = 'billing-confirm-shop';
const SHOP = `${STORE_NAME}.myshopify.com`;

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

// These two routes exist because Shopify's billing confirmation page redirects the merchant's
// TOP-LEVEL browser back here (see Billing.jsx's window.top.location.href) — never an
// authenticated fetch, so there's no App Bridge session token on this request the way every other
// /api/* route expects. A signed state token (verified below) stands in for it instead.
describe('GET /billing/confirm', () => {
  it('reconciles billing state and redirects into the embedded admin', async () => {
    vi.spyOn(shopify.api.billing, 'check').mockResolvedValue({
      oneTimePurchases: [],
      appSubscriptions: [
        { id: 'gid://shopify/AppSubscription/1', name: 'starter', status: 'ACTIVE', currentPeriodEnd: '2026-08-01T00:00:00Z' },
      ],
    });

    const state = signState({ shop: SHOP });
    const app = createApp();
    const res = await request(app).get('/billing/confirm').query({ state });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`https://${SHOP}/admin/apps/${env.SHOPIFY_API_KEY}`);

    const shopDoc = await firestore.collection('shops').doc(SHOP).get();
    expect(shopDoc.data().creditBalance).toBe(50); // starter pack credited — proves reconcile actually ran
  });

  it('rejects a missing or tampered state token without calling Shopify at all', async () => {
    const billingCheckSpy = vi.spyOn(shopify.api.billing, 'check');

    const app = createApp();
    const res = await request(app).get('/billing/confirm').query({ state: 'garbage' });

    expect(res.status).toBe(400);
    expect(billingCheckSpy).not.toHaveBeenCalled();
  });

  it('returns 400 instead of crashing when no offline session exists for the shop', async () => {
    const orphanShop = 'orphan-shop.myshopify.com';
    const state = signState({ shop: orphanShop });

    const app = createApp();
    const res = await request(app).get('/billing/confirm').query({ state });

    expect(res.status).toBe(400);
  });
});

describe('GET /image-optimizer/billing/confirm', () => {
  it('reconciles billing state and redirects into the embedded admin', async () => {
    vi.spyOn(shopify.api.billing, 'check').mockResolvedValue({
      oneTimePurchases: [],
      appSubscriptions: [
        { id: 'gid://shopify/AppSubscription/2', name: 'image_optimizer_addon', status: 'ACTIVE', currentPeriodEnd: 'x' },
      ],
    });

    const state = signState({ shop: SHOP });
    const app = createApp();
    const res = await request(app).get('/image-optimizer/billing/confirm').query({ state });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`https://${SHOP}/admin/apps/${env.SHOPIFY_API_KEY}`);

    const shopDoc = await firestore.collection('shops').doc(SHOP).get();
    expect(shopDoc.data().imageOptimizerAddon).toBe(true);
  });
});
