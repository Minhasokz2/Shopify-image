import { RequestedTokenType } from '@shopify/shopify-api';
import { shopify } from '../config/shopify.js';
import { shopsRepo } from '../models/shopsRepo.js';
import { logger } from '../lib/logger.js';

// Modern embedded-app auth: OAuth2 Token Exchange instead of the legacy authorization-code
// redirect flow. Shopify's distribution docs are explicit that public-distribution embedded apps
// authenticate via "token exchange and session tokens" — the legacy grant is the old path, and
// after this app was switched to App Store distribution every Admin API call made with a
// legacy-grant token started being rejected (empty-body 403s, see the July 2 incident). Token
// exchange also removes shopify-app-express's per-request "is this token still valid" GraphQL
// ping to Shopify, which both added latency to every /api/* call and was itself the first call
// to hit that 403.
//
// Flow per request:
//   1. Validate the App Bridge session-token JWT from the Authorization header (signature via
//      the API secret, exp/nbf, audience) — decodeSessionToken throws on any failure.
//   2. Resolve the shop from the token's `dest` claim (never from a query param — the JWT is the
//      only trusted source).
//   3. Use the stored offline session for that shop if one exists; otherwise exchange the session
//      token for a fresh offline access token (Shopify managed installation has already installed
//      the app by the time the embedded iframe loads, so there is no separate "install" step).
async function getOrCreateOfflineSession(shop, sessionToken) {
  const offlineSessionId = `offline_${shop}`;
  const existing = await shopify.config.sessionStorage.loadSession(offlineSessionId);
  if (existing?.accessToken) return existing;

  const { session } = await shopify.api.auth.tokenExchange({
    shop,
    sessionToken,
    requestedTokenType: RequestedTokenType.OfflineAccessToken,
  });
  await shopify.config.sessionStorage.storeSession(session);

  // First contact with this shop through the token-exchange path — make sure its Firestore doc
  // exists (idempotent; the legacy /auth callback also does this and additionally handles
  // referral capture for installs that arrive through a referral link).
  //
  // Deliberately NO per-shop webhook registration here: this app uses app-specific webhook
  // subscriptions declared in shopify.app.toml (see config/shopify.js), which Shopify delivers
  // without any per-shop registration call. The legacy flow's automatic registration step
  // queried the Admin API for nothing.
  await shopsRepo.ensureShopExists(shop);
  logger.info({ shop }, 'Minted offline access token via token exchange');

  return session;
}

export async function verifySessionToken(req, res, next) {
  const authHeader = req.headers.authorization ?? '';
  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    return res.status(401).json({ error: 'Missing Authorization session token' });
  }

  let payload;
  try {
    payload = await shopify.api.session.decodeSessionToken(match[1]);
  } catch {
    // Session tokens live for 60 seconds — an expired one is routine (backgrounded tab), and
    // App Bridge's fetch retries with a fresh token when it sees 401.
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }

  const shop = new URL(payload.dest).hostname;

  try {
    const session = await getOrCreateOfflineSession(shop, match[1]);
    res.locals.shopify = { ...res.locals.shopify, session };
    return next();
  } catch (error) {
    logger.error({ shop, err: error }, 'Token exchange failed');
    return res.status(401).json({ error: 'Could not establish a Shopify session for this shop' });
  }
}
