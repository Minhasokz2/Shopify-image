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

const jobWorkerMock = {
  canAcceptJob: vi.fn(() => true),
  enqueue: vi.fn(),
  trackStart: vi.fn(),
  trackEnd: vi.fn(),
  getActiveCount: vi.fn(() => 0),
  resumeFromFirestore: vi.fn(async () => {}),
};
vi.mock('../../src/services/jobWorker.js', () => ({ jobWorker: jobWorkerMock }));

const { Session } = await import('@shopify/shopify-api');
const { shopify } = await import('../../src/config/shopify.js');
const { firestore } = await import('../../src/lib/firestore.js');
const { createApp } = await import('../../src/app.js');

const STORE_NAME = 'jobs-test-shop';
const SHOP = `${STORE_NAME}.myshopify.com`;

async function authHeader() {
  const { token } = await getJwt(STORE_NAME, env.SHOPIFY_API_KEY, env.SHOPIFY_API_SECRET);
  return { Authorization: `Bearer ${token}` };
}

const validGenerateBody = {
  productId: 'gid://shopify/Product/1',
  imageUrl: 'https://cdn.shopify.com/img.png',
  contentType: 'scene',
  templateId: 'studio-white',
};

beforeEach(async () => {
  vi.clearAllMocks();
  jobWorkerMock.canAcceptJob.mockReturnValue(true);

  storedSessions.set(
    `offline_${SHOP}`,
    new Session({
      id: `offline_${SHOP}`,
      shop: SHOP,
      state: 'test',
      isOnline: false,
      accessToken: 'shpat_totally_real',
      expires: new Date(Date.now() + 60 * 60 * 1000),
      scope: env.SHOPIFY_SCOPES.join(','),
    }),
  );
  // Skip the live "shop { name }" access-token verification ping (see verifySessionToken.test.js).
  vi.spyOn(shopify.api.clients.Graphql.prototype, 'request').mockResolvedValue({ data: {}, headers: {} });

  await firestore.collection('shops').doc(SHOP).set({ creditBalance: 20, plan: 'free' });
  await firestore.collection('templates').doc('studio-white').set({
    creditCost: 4,
    category: 'scene',
    preferredModel: 'flux-kontext-max',
    promptTemplate: 'a clean studio scene',
  });
});

describe('POST /api/generate', () => {
  it('422s a UGC job with a non-adult persona and never enqueues it', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/generate')
      .set(await authHeader())
      .send({
        productId: 'gid://shopify/Product/1',
        imageUrl: 'https://cdn.shopify.com/img.png',
        contentType: 'ugc',
        templateId: 'ugc-home-casual',
        idempotencyKey: 'key-422',
        personaSettings: { ageRange: 'teen', genderPresentation: 'feminine', setting: 'home' },
      });

    expect(res.status).toBe(422);
    expect(jobWorkerMock.enqueue).not.toHaveBeenCalled();
  });

  it('429s when the job worker reports the shop is at its concurrency cap', async () => {
    jobWorkerMock.canAcceptJob.mockReturnValue(false);
    const app = createApp();

    const res = await request(app)
      .post('/api/generate')
      .set(await authHeader())
      .send({ ...validGenerateBody, idempotencyKey: 'key-429' });

    expect(res.status).toBe(429);
    expect(jobWorkerMock.enqueue).not.toHaveBeenCalled();
  });

  it('402s when the shop cannot afford the template and never enqueues it', async () => {
    await firestore.collection('shops').doc(SHOP).set({ creditBalance: 0, plan: 'free' });
    const app = createApp();

    const res = await request(app)
      .post('/api/generate')
      .set(await authHeader())
      .send({ ...validGenerateBody, idempotencyKey: 'key-402' });

    expect(res.status).toBe(402);
    expect(jobWorkerMock.enqueue).not.toHaveBeenCalled();
  });

  it('201s on success, then 200s an idempotent retry with the SAME jobId and no second enqueue', async () => {
    const app = createApp();
    const headers = await authHeader();
    const body = { ...validGenerateBody, idempotencyKey: 'key-201' };

    const first = await request(app).post('/api/generate').set(headers).send(body);
    expect(first.status).toBe(201);
    expect(jobWorkerMock.enqueue).toHaveBeenCalledTimes(1);

    const second = await request(app).post('/api/generate').set(headers).send(body);
    expect(second.status).toBe(200);
    expect(second.body.jobId).toBe(first.body.jobId);
    expect(jobWorkerMock.enqueue).toHaveBeenCalledTimes(1); // still just once
  });

  it('rejects requests with no valid session token', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/generate')
      .send({ ...validGenerateBody, idempotencyKey: 'key-noauth' });

    expect(res.status).not.toBe(201);
    expect(jobWorkerMock.enqueue).not.toHaveBeenCalled();
  });
});

describe('GET /api/jobs/:jobId', () => {
  it('404s for a job that belongs to a different shop', async () => {
    await firestore.collection('jobs').doc('foreign-job').set({ shopDomain: 'someone-else.myshopify.com', status: 'succeeded' });
    const app = createApp();

    const res = await request(app).get('/api/jobs/foreign-job').set(await authHeader());

    expect(res.status).toBe(404);
  });

  it('returns a job that belongs to the authenticated shop', async () => {
    await firestore.collection('jobs').doc('own-job').set({ shopDomain: SHOP, status: 'succeeded', variations: [] });
    const app = createApp();

    const res = await request(app).get('/api/jobs/own-job').set(await authHeader());

    expect(res.status).toBe(200);
    expect(res.body.job.status).toBe('succeeded');
  });

  // Real Firestore Timestamps (unlike this suite's fake, which resolves serverTimestamp() to a
  // plain Date) serialize to {_seconds, _nanoseconds} with no toJSON — new Date(...) on that in
  // the browser produces "Invalid Date". Shaping createdAt like a real Timestamp here proves the
  // res.json patch in app.js actually converts it to an ISO string the client can parse.
  it('serializes a Firestore-Timestamp-shaped createdAt to an ISO string, not {_seconds, _nanoseconds}', async () => {
    const fakeTimestamp = {
      _seconds: 1783000000,
      _nanoseconds: 0,
      toDate: () => new Date(1783000000 * 1000),
    };
    await firestore
      .collection('jobs')
      .doc('timestamp-job')
      .set({ shopDomain: SHOP, status: 'succeeded', variations: [], createdAt: fakeTimestamp });
    const app = createApp();

    const res = await request(app).get('/api/jobs/timestamp-job').set(await authHeader());

    expect(res.status).toBe(200);
    expect(res.body.job.createdAt).toBe(new Date(1783000000 * 1000).toISOString());
    expect(new Date(res.body.job.createdAt).toString()).not.toBe('Invalid Date');
  });
});

describe('POST /api/jobs/:jobId/create-product', () => {
  it('404s for a job that belongs to a different shop', async () => {
    await firestore.collection('jobs').doc('foreign-job-2').set({ shopDomain: 'someone-else.myshopify.com' });
    const app = createApp();

    const res = await request(app)
      .post('/api/jobs/foreign-job-2/create-product')
      .set(await authHeader())
      .send({ title: 'My new product' });

    expect(res.status).toBe(404);
  });

  it('creates a bare product via productCreate and backfills productId onto the job', async () => {
    await firestore.collection('jobs').doc('no-product-job').set({ shopDomain: SHOP, status: 'succeeded', variations: [] });
    vi.spyOn(shopify.api.clients.Graphql.prototype, 'request').mockResolvedValueOnce({
      data: {
        productCreate: {
          product: { id: 'gid://shopify/Product/999', title: 'My new product' },
          userErrors: [],
        },
      },
      headers: {},
    });
    const app = createApp();

    const res = await request(app)
      .post('/api/jobs/no-product-job/create-product')
      .set(await authHeader())
      .send({ title: 'My new product' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ created: true, productId: 'gid://shopify/Product/999', productTitle: 'My new product' });

    const job = await firestore.collection('jobs').doc('no-product-job').get();
    expect(job.data().productId).toBe('gid://shopify/Product/999');
  });

  it('is idempotent — a job that already has a productId returns it instead of creating a second product', async () => {
    await firestore.collection('jobs').doc('already-has-product').set({
      shopDomain: SHOP,
      status: 'succeeded',
      variations: [],
      productId: 'gid://shopify/Product/111',
    });
    const graphqlSpy = vi.spyOn(shopify.api.clients.Graphql.prototype, 'request');
    const app = createApp();

    const res = await request(app)
      .post('/api/jobs/already-has-product/create-product')
      .set(await authHeader())
      .send({ title: 'Ignored' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ created: false, productId: 'gid://shopify/Product/111' });
    expect(graphqlSpy).not.toHaveBeenCalled();
  });

  it('422s when Shopify returns userErrors, and never sets productId on the job', async () => {
    await firestore.collection('jobs').doc('product-create-fails').set({ shopDomain: SHOP, status: 'succeeded', variations: [] });
    vi.spyOn(shopify.api.clients.Graphql.prototype, 'request').mockResolvedValueOnce({
      data: { productCreate: { product: null, userErrors: [{ field: ['title'], message: 'Title cannot be blank' }] } },
      headers: {},
    });
    const app = createApp();

    const res = await request(app)
      .post('/api/jobs/product-create-fails/create-product')
      .set(await authHeader())
      .send({ title: 'x' });

    expect(res.status).toBe(422);
    const job = await firestore.collection('jobs').doc('product-create-fails').get();
    expect(job.data().productId).toBeUndefined();
  });
});
