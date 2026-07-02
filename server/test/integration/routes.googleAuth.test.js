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

const verifyGoogleAuthCode = vi.fn();
vi.mock('../../src/services/googleAuth.js', () => ({
  buildGoogleAuthUrl: vi.fn((state) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`),
  verifyGoogleAuthCode,
  GoogleAuthError: class GoogleAuthError extends Error {},
}));

const { Session } = await import('@shopify/shopify-api');
const { shopify } = await import('../../src/config/shopify.js');
const { firestore } = await import('../../src/lib/firestore.js');
const { createApp } = await import('../../src/app.js');
const { signState } = await import('../../src/lib/signedState.js');

const STORE_NAME = 'google-auth-test-shop';
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
      scope: env.SHOPIFY_SCOPES.join(','),
    }),
  );
  vi.spyOn(shopify.api.clients.Graphql.prototype, 'request').mockResolvedValue({ data: {}, headers: {} });

  await firestore.collection('shops').doc(SHOP).set({
    creditBalance: 0,
    plan: 'free',
    googleVerifiedAt: null,
    googleEmail: null,
    trialCreditsGranted: false,
  });
});

describe('GET /api/auth/google/status', () => {
  it('reports unverified for a shop that has not signed in with Google yet', async () => {
    const app = createApp();
    const res = await request(app).get('/api/auth/google/status').set(await authHeader());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ verified: false, googleEmail: null });
  });

  it('reports verified once markGoogleVerified has run', async () => {
    await firestore.collection('shops').doc(SHOP).update({ googleVerifiedAt: new Date(), googleEmail: 'owner@example.com' });

    const app = createApp();
    const res = await request(app).get('/api/auth/google/status').set(await authHeader());
    expect(res.body).toEqual({ verified: true, googleEmail: 'owner@example.com' });
  });
});

describe('POST /api/auth/google/init', () => {
  it('returns a Google authorize URL carrying a signed state for this shop', async () => {
    const app = createApp();
    const res = await request(app).post('/api/auth/google/init').set(await authHeader());
    expect(res.status).toBe(200);
    expect(res.body.authorizeUrl).toContain('accounts.google.com');
  });

  it('rejects requests with no valid session token', async () => {
    const app = createApp();
    const res = await request(app).post('/api/auth/google/init');
    expect(res.status).not.toBe(200);
  });
});

describe('POST /api/auth/google/signout', () => {
  it('clears Google verification so the shop is locked out again', async () => {
    await firestore.collection('shops').doc(SHOP).update({ googleVerifiedAt: new Date(), googleEmail: 'owner@example.com' });

    const app = createApp();
    const res = await request(app).post('/api/auth/google/signout').set(await authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ signedOut: true });

    const statusRes = await request(app).get('/api/auth/google/status').set(await authHeader());
    expect(statusRes.body).toEqual({ verified: false, googleEmail: null });
  });

  it('rejects requests with no valid session token', async () => {
    const app = createApp();
    const res = await request(app).post('/api/auth/google/signout');
    expect(res.status).not.toBe(200);
  });

  it('does not re-grant the free trial on sign-out + re-verify with the same email', async () => {
    verifyGoogleAuthCode.mockResolvedValue({ email: 'signout-test@example.com', googleId: 'g-2' });
    const state = signState({ shop: SHOP });
    const app = createApp();

    await request(app).get('/auth/google/callback').query({ code: 'auth-code', state });
    let shopDoc = await firestore.collection('shops').doc(SHOP).get();
    expect(shopDoc.data().creditBalance).toBe(10);

    await request(app).post('/api/auth/google/signout').set(await authHeader());
    shopDoc = await firestore.collection('shops').doc(SHOP).get();
    expect(shopDoc.data().googleVerifiedAt).toBeNull();
    expect(shopDoc.data().creditBalance).toBe(10); // unaffected by sign-out itself

    await request(app).get('/auth/google/callback').query({ code: 'auth-code-2', state });
    shopDoc = await firestore.collection('shops').doc(SHOP).get();
    expect(shopDoc.data().googleVerifiedAt).toBeTruthy(); // re-verified successfully
    expect(shopDoc.data().creditBalance).toBe(10); // trial not granted twice
  });
});

describe('GET /auth/google/callback', () => {
  it('verifies the code, marks the shop Google-verified, and grants the trial', async () => {
    verifyGoogleAuthCode.mockResolvedValue({ email: 'owner@example.com', googleId: 'g-1' });
    const state = signState({ shop: SHOP });

    const app = createApp();
    const res = await request(app).get('/auth/google/callback').query({ code: 'auth-code', state });

    expect(res.status).toBe(200);
    expect(res.text).toContain('visualkit-google-auth');
    expect(res.text).toContain('"ok":true');

    const shopDoc = await firestore.collection('shops').doc(SHOP).get();
    expect(shopDoc.data().googleVerifiedAt).toBeTruthy();
    expect(shopDoc.data().creditBalance).toBe(10);
  });

  it('creates the shop record on the fly when the popup fires before any /api/* call has run', async () => {
    // Under the token-exchange auth strategy a shop's Firestore doc is only created lazily on its
    // first authenticated /api/* call — this reproduces the real-world race where the Google
    // popup completes before that has ever happened for a brand-new shop.
    const freshShop = 'brand-new-shop.myshopify.com';
    verifyGoogleAuthCode.mockResolvedValue({ email: 'fresh@example.com', googleId: 'g-fresh' });
    const state = signState({ shop: freshShop });

    const app = createApp();
    const res = await request(app).get('/auth/google/callback').query({ code: 'auth-code', state });

    expect(res.status).toBe(200);
    expect(res.text).toContain('"ok":true');

    const shopDoc = await firestore.collection('shops').doc(freshShop).get();
    expect(shopDoc.exists).toBe(true);
    expect(shopDoc.data().googleVerifiedAt).toBeTruthy();
    expect(shopDoc.data().creditBalance).toBe(10);
  });

  it('rejects a tampered or expired state token without touching the shop', async () => {
    const app = createApp();
    const res = await request(app).get('/auth/google/callback').query({ code: 'auth-code', state: 'garbage' });

    expect(res.status).toBe(200); // popup page always 200s — outcome is in the postMessage payload
    expect(res.text).toContain('"ok":false');
    expect(verifyGoogleAuthCode).not.toHaveBeenCalled();
  });

  it('reflects a Google-side error without ever calling verifyGoogleAuthCode', async () => {
    const app = createApp();
    const res = await request(app).get('/auth/google/callback').query({ error: 'access_denied' });

    expect(res.text).toContain('access_denied');
    expect(verifyGoogleAuthCode).not.toHaveBeenCalled();
  });

  it('escapes an attacker-controlled error value in the visible <p> text', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/auth/google/callback')
      .query({ error: '<script>alert(1)</script>' });

    expect(res.text).not.toContain('<script>alert(1)</script>');
    expect(res.text).toContain('&lt;script&gt;');
  });

  it('does not let an attacker-controlled error value break out of the inline <script> block', async () => {
    // A naive JSON.stringify-into-<script> is not enough: an HTML parser closes a <script> tag on
    // a literal "</script>" sequence even inside a JS string literal, regardless of JS escaping.
    const app = createApp();
    const res = await request(app)
      .get('/auth/google/callback')
      .query({ error: '</script><script>window.top.location="https://evil.example.com"</script>' });

    expect(res.text).not.toMatch(/<\/script><script>window\.top\.location/);
    expect(res.text).toContain('\\u003c/script>');
  });
});
