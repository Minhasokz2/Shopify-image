import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const migrateToExpiringToken = vi.fn();
const storeSession = vi.fn();
const redirectToShopifyOrAppRoot = vi.fn(() => (req, res) => res.redirect('/'));

// shopify.auth.begin()/callback() are called once, synchronously, at module-load time to produce
// the actual middleware functions the router uses — spying on them after routes/auth.js has
// already imported `shopify` wouldn't affect anything, so the whole config module is mocked here
// instead, same as other integration tests mock lib/firestore.js.
vi.mock('../../src/config/shopify.js', () => ({
  shopify: {
    config: { auth: { path: '/auth', callbackPath: '/auth/callback' }, sessionStorage: { storeSession } },
    auth: {
      begin: () => (req, res) => res.redirect('https://accounts.shopify.com/mock-oauth'),
      // Simulates a completed classic OAuth grant: always produces a non-expiring token (no
      // `expires` field) — the whole reason this route needs the migration step below.
      callback: () => (req, res, next) => {
        res.locals.shopify = { session: { shop: req.query.shop || 'callback-shop.myshopify.com', accessToken: 'shpat_classic_non_expiring' } };
        next();
      },
    },
    api: { auth: { migrateToExpiringToken } },
    redirectToShopifyOrAppRoot: () => redirectToShopifyOrAppRoot(),
  },
}));

vi.mock('../../src/models/shopsRepo.js', () => ({
  shopsRepo: {
    findByReferralCode: vi.fn().mockResolvedValue(null),
    ensureShopExists: vi.fn().mockResolvedValue({ id: 'callback-shop.myshopify.com', isNew: false }),
  },
}));

vi.mock('../../src/models/referralsRepo.js', () => ({
  referralsRepo: { create: vi.fn() },
}));

const authRouter = (await import('../../src/routes/auth.js')).default;

function buildApp() {
  const app = express();
  app.use(authRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /auth/callback', () => {
  it('migrates the classic-OAuth non-expiring token to an expiring one and stores it', async () => {
    migrateToExpiringToken.mockResolvedValue({
      session: { shop: 'callback-shop.myshopify.com', accessToken: 'shpat_expiring', expires: new Date(Date.now() + 3600_000) },
    });

    const res = await request(buildApp()).get('/auth/callback').query({ shop: 'callback-shop.myshopify.com' });

    expect(res.status).toBe(302);
    expect(migrateToExpiringToken).toHaveBeenCalledWith({
      shop: 'callback-shop.myshopify.com',
      nonExpiringOfflineAccessToken: 'shpat_classic_non_expiring',
    });
    expect(storeSession).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'shpat_expiring', expires: expect.any(Date) }),
    );
  });

  it('falls through to complete the install instead of failing when migration errors', async () => {
    migrateToExpiringToken.mockRejectedValue(new Error('token endpoint unreachable'));

    const res = await request(buildApp()).get('/auth/callback').query({ shop: 'callback-shop.myshopify.com' });

    expect(res.status).toBe(302);
    expect(storeSession).not.toHaveBeenCalled();
  });
});
