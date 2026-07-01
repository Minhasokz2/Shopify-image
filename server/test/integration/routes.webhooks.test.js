import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { getHmac } from '@shopify/shopify-api/test-helpers';
import { env } from '../../src/config/env.js';

vi.mock('../../src/lib/firestore.js', async () => {
  const { createFakeFirestore } = await import('../helpers/fakeFirestore.js');
  const fake = createFakeFirestore();
  return { firestore: fake.firestore, FieldValue: fake.FieldValue, Timestamp: {} };
});

vi.mock('../../src/services/jobWorker.js', () => ({
  jobWorker: { resumeFromFirestore: vi.fn(async () => {}), canAcceptJob: vi.fn(() => true), enqueue: vi.fn() },
}));

const deleteSessionMock = vi.fn(async () => true);
vi.mock('../../src/lib/sessionStorage.js', () => ({
  FirestoreSessionStorage: class {
    async storeSession() {
      return true;
    }
    async loadSession() {
      return undefined;
    }
    async deleteSession(id) {
      return deleteSessionMock(id);
    }
    async deleteSessions() {
      return true;
    }
    async findSessionsByShop() {
      return [];
    }
  },
}));

const { firestore } = await import('../../src/lib/firestore.js');
const { createApp } = await import('../../src/app.js');

const SHOP = 'webhook-test-shop.myshopify.com';

function signedRequest(app, path, payload) {
  const rawBody = JSON.stringify(payload);
  const hmac = getHmac(rawBody, env.SHOPIFY_API_SECRET);
  return request(app)
    .post(path)
    .set('Content-Type', 'application/json')
    .set('X-Shopify-Hmac-Sha256', hmac)
    .set('X-Shopify-Topic', path.slice(1).replace('/', '/'))
    .set('X-Shopify-Shop-Domain', SHOP)
    .set('X-Shopify-Webhook-Id', 'wh-test-1')
    .set('X-Shopify-Api-Version', '2026-07')
    .send(rawBody);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /webhooks/app/uninstalled', () => {
  it('accepts a validly-signed webhook and marks the shop uninstalled', async () => {
    await firestore.collection('shops').doc(SHOP).set({ plan: 'free', creditBalance: 10 });
    const app = createApp();

    const res = await signedRequest(app, '/webhooks/app/uninstalled', { shop_domain: SHOP });

    expect(res.status).toBe(200);
    const shop = await firestore.collection('shops').doc(SHOP).get();
    expect(shop.data().plan).toBe('uninstalled');
    expect(deleteSessionMock).toHaveBeenCalledWith(`offline_${SHOP}`);
  });

  it('rejects a webhook with an invalid HMAC signature with 401', async () => {
    const app = createApp();
    const rawBody = JSON.stringify({ shop_domain: SHOP });

    const res = await request(app)
      .post('/webhooks/app/uninstalled')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Hmac-Sha256', 'not-a-real-hmac')
      .set('X-Shopify-Topic', 'app/uninstalled')
      .set('X-Shopify-Shop-Domain', SHOP)
      .set('X-Shopify-Webhook-Id', 'wh-test-2')
      .set('X-Shopify-Api-Version', '2026-07')
      .send(rawBody);

    expect(res.status).toBe(401);
  });

  it('rejects a webhook whose body was tampered with in transit', async () => {
    const app = createApp();
    const signedBody = JSON.stringify({ shop_domain: SHOP });
    const hmac = getHmac(signedBody, env.SHOPIFY_API_SECRET);

    // Send a DIFFERENT body than what was signed — this is the regression test for the
    // raw-body-before-json-parser middleware ordering: if a JSON body parser ran first and
    // re-serialized the body, this tamper would go undetected because the HMAC would be
    // computed over the re-serialized (identical-looking) JSON rather than the original bytes.
    const res = await request(app)
      .post('/webhooks/app/uninstalled')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Hmac-Sha256', hmac)
      .set('X-Shopify-Topic', 'app/uninstalled')
      .set('X-Shopify-Shop-Domain', SHOP)
      .set('X-Shopify-Webhook-Id', 'wh-test-3')
      .set('X-Shopify-Api-Version', '2026-07')
      .send(JSON.stringify({ shop_domain: 'attacker.myshopify.com' }));

    expect(res.status).toBe(401);
  });
});

describe('POST /webhooks/customers/redact', () => {
  it('acknowledges with 200 without needing any stored customer data', async () => {
    const app = createApp();
    const res = await signedRequest(app, '/webhooks/customers/redact', { shop_domain: SHOP, customer: { id: 1 } });
    expect(res.status).toBe(200);
  });
});
