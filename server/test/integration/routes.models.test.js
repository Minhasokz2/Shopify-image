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

const STORE_NAME = 'models-test-shop';
const SHOP = `${STORE_NAME}.myshopify.com`;

async function authHeader() {
  const { token } = await getJwt(STORE_NAME, env.SHOPIFY_API_KEY, env.SHOPIFY_API_SECRET);
  return { Authorization: `Bearer ${token}` };
}

beforeEach(async () => {
  vi.clearAllMocks();
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
  vi.spyOn(shopify.api.clients.Graphql.prototype, 'request').mockResolvedValue({ data: {}, headers: {} });

  await firestore.collection('allowed_models').doc('flux-kontext-max').set({
    label: 'FLUX Kontext Max',
    category: 'scene',
    creditCost: 4,
    supportsMultiImage: true,
    active: true,
  });
  await firestore.collection('allowed_models').doc('disabled-model').set({
    label: 'Disabled Model',
    category: 'scene',
    creditCost: 3,
    supportsMultiImage: false,
    active: false,
  });
});

describe('GET /api/models', () => {
  it('returns only active models for the requested category', async () => {
    const app = createApp();
    const res = await request(app).get('/api/models?category=scene').set(await authHeader());

    expect(res.status).toBe(200);
    expect(res.body.models).toHaveLength(1);
    expect(res.body.models[0].id).toBe('flux-kontext-max');
  });

  it('rejects requests without a valid session token', async () => {
    const app = createApp();
    const res = await request(app).get('/api/models?category=scene');
    expect(res.status).not.toBe(200);
  });
});
