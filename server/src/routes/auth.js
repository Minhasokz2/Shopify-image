import { Router } from 'express';
import { shopify } from '../config/shopify.js';
import { shopsRepo } from '../models/shopsRepo.js';
import { referralsRepo } from '../models/referralsRepo.js';
import { logger } from '../lib/logger.js';

const router = Router();

router.get(shopify.config.auth.path, shopify.auth.begin());

router.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  async (req, res, next) => {
    let { session } = res.locals.shopify;

    // shopify.auth.callback() completes the classic authorization-code grant, which can only ever
    // produce a non-expiring offline token — that grant type has no `expiring` parameter, unlike
    // token exchange (see verifySessionToken.js). Immediately migrating it here means this route
    // (still reachable via referral links) never leaves a non-expiring token in storage even
    // momentarily, which is exactly the token type Shopify's Partner Dashboard flags as deprecated
    // for public apps. If migration fails for any reason, fall through and keep the classic token
    // rather than blocking install — verifySessionToken's own re-exchange-on-next-request logic
    // (isUsable() rejects a session with no `expires`) still cleans this up on the merchant's very
    // first embedded page load either way.
    try {
      const migrated = await shopify.api.auth.migrateToExpiringToken({
        shop: session.shop,
        nonExpiringOfflineAccessToken: session.accessToken,
      });
      await shopify.config.sessionStorage.storeSession(migrated.session);
      session = migrated.session;
      logger.info({ shop: session.shop }, 'Migrated classic-OAuth offline token to an expiring one');
    } catch (error) {
      logger.warn({ shop: session.shop, err: error }, 'Failed to migrate offline token to expiring — keeping classic token for now');
    }

    const referralCode = typeof req.query.referral === 'string' ? req.query.referral : null;

    let referrerShopDomain = null;
    if (referralCode) {
      const referrer = await shopsRepo.findByReferralCode(referralCode);
      if (referrer && referrer.id !== session.shop) {
        referrerShopDomain = referrer.id;
      }
    }

    const shop = await shopsRepo.ensureShopExists(session.shop, { referredBy: referrerShopDomain });

    // Only record a referral on the install that actually happened — ensureShopExists() is a
    // no-op on every subsequent re-auth, so this branch only runs once per shop.
    if (shop.isNew && referrerShopDomain) {
      await referralsRepo.create(`${referrerShopDomain}__${session.shop}`, {
        referrerShop: referrerShopDomain,
        referredShop: session.shop,
      });
      logger.info({ referrerShopDomain, referredShop: session.shop }, 'Recorded new referral');
    }

    next();
  },
  shopify.redirectToShopifyOrAppRoot(),
);

export default router;
