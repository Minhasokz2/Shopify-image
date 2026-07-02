import { Router } from 'express';
import { shopify } from '../config/shopify.js';
import { env, isProduction } from '../config/env.js';
import { verifyState, InvalidStateError } from '../lib/signedState.js';
import { reconcileBillingState } from '../services/billing.js';
import { logger } from '../lib/logger.js';

const router = Router();

// Shopify redirects the merchant's TOP-LEVEL browser here after they approve or decline a charge
// (see Billing.jsx's `window.top.location.href = confirmationUrl` — embedded apps can't run the
// billing confirmation page inside their own iframe). That means this is a plain page navigation,
// never an authenticated fetch, so there is no App Bridge session token to verify — the signed
// `state` param (same mechanism as /auth/google/callback) is what proves which shop this belongs
// to instead.
async function loadShopSession(state) {
  const { shop } = verifyState(state);
  const session = await shopify.config.sessionStorage.loadSession(`offline_${shop}`);
  if (!session) throw new Error(`No offline session found for shop ${shop}`);
  return { shop, session };
}

// Bounces the merchant's now-top-level browser back into the embedded app inside Shopify admin —
// the same destination Shopify itself uses for embedded app links.
function redirectIntoAdmin(res, shop) {
  const sanitizedShop = shopify.api.utils.sanitizeShop(shop);
  res.redirect(`https://${sanitizedShop}/admin/apps/${env.SHOPIFY_API_KEY}`);
}

function handleConfirmError(res, err) {
  logger.error({ err }, 'Billing confirmation failed');
  const message = err instanceof InvalidStateError ? err.message : 'confirmation failed';
  res.status(400).send(`Could not confirm billing: ${message}`);
}

// GET /billing/confirm — redirect target after a credit-pack subscription or a custom credit
// purchase is approved/declined.
router.get('/billing/confirm', async (req, res) => {
  try {
    const { shop, session } = await loadShopSession(req.query.state);
    await reconcileBillingState({ session, isTest: !isProduction });
    redirectIntoAdmin(res, shop);
  } catch (err) {
    handleConfirmError(res, err);
  }
});

// GET /image-optimizer/billing/confirm — redirect target after the Compress Image add-on
// subscription is approved/declined. Reuses reconcileBillingState() same as above — a shop's full
// billing state (credits, unlimited, and this add-on) is always re-checked together.
router.get('/image-optimizer/billing/confirm', async (req, res) => {
  try {
    const { shop, session } = await loadShopSession(req.query.state);
    await reconcileBillingState({ session, isTest: !isProduction });
    redirectIntoAdmin(res, shop);
  } catch (err) {
    handleConfirmError(res, err);
  }
});

export default router;
