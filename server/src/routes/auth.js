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
    const { session } = res.locals.shopify;
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
