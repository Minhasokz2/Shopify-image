import { Router } from 'express';
import { shopify } from '../config/shopify.js';
import { shopsRepo } from '../models/shopsRepo.js';
import { referralsRepo } from '../models/referralsRepo.js';
import { logger } from '../lib/logger.js';

const router = Router();

router.get(shopify.config.auth.path, shopify.auth.begin());

// Shop owner's Shopify-verified email — used, best-effort, so ensureShopExists() can stop the
// same person from farming free trial credits across multiple dev stores. Never blocks install:
// a failure here just means the new shop gets the trial without dedup, same as before this
// existed.
async function fetchShopEmail(session) {
  try {
    const client = new shopify.api.clients.Graphql({ session });
    const response = await client.request(`#graphql
      query ShopEmail {
        shop {
          email
        }
      }
    `);
    return response.data?.shop?.email ?? null;
  } catch (err) {
    logger.warn({ err }, 'Failed to fetch shop email during install; proceeding without trial dedup');
    return null;
  }
}

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

    const shopEmail = await fetchShopEmail(session);
    const shop = await shopsRepo.ensureShopExists(session.shop, { referredBy: referrerShopDomain, shopEmail });

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
