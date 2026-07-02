import { RequestedTokenType } from '@shopify/shopify-api';
import { shopify } from '../config/shopify.js';
import { shopsRepo } from '../models/shopsRepo.js';
import { logger } from '../lib/logger.js';

// Modern embedded-app auth: OAuth2 Token Exchange instead of the legacy authorization-code
// redirect flow, requesting an EXPIRING offline token. Both parts are mandatory, not just a nice
// upgrade — per Shopify's changelog ("Expiring offline access tokens required for new public
// apps as of April 1, 2026"), a public-distribution app created on or after that date has every
// Admin API call rejected outright if it presents a non-expiring token. That's what the July 2
// incident actually was: switching this app to Shopify App Store distribution made every stored
// legacy/non-expiring offline token instantly invalid — reinstalling or minting a fresh
// *non-expiring* token changed nothing, because the token type itself was the problem, not its
// age. Token exchange with `expiring: true` requests a token that satisfies the policy; it also
// removes shopify-app-express's per-request "is this token still valid" GraphQL ping to Shopify,
// which both added latency to every /api/* call and was itself the first call to hit the 403.
//
// Flow per request:
//   1. Validate the App Bridge session-token JWT from the Authorization header (signature via
//      the API secret, exp/nbf, audience) — decodeSessionToken throws on any failure.
//   2. Resolve the shop from the token's `dest` claim (never from a query param — the JWT is the
//      only trusted source).
//   3. Reuse the stored offline session if it's still valid; refresh it via its refresh token if
//      it's expired (or nearly so); otherwise exchange the session token for a brand new expiring
//      offline access token (Shopify managed installation has already installed the app by the
//      time the embedded iframe loads, so there is no separate "install" step).
const EXPIRY_BUFFER_MS = 60_000; // refresh a little before the real expiry, not exactly at it

function isUsable(session) {
  if (!session?.accessToken) return false;
  if (!session.expires) return false; // no expiry = a stale pre-migration non-expiring token
  return session.expires.getTime() - Date.now() > EXPIRY_BUFFER_MS;
}

async function exchangeForFreshSession(shop, sessionToken) {
  const { session } = await shopify.api.auth.tokenExchange({
    shop,
    sessionToken,
    requestedTokenType: RequestedTokenType.OfflineAccessToken,
    expiring: true,
  });
  await shopify.config.sessionStorage.storeSession(session);
  logger.info({ shop, expires: session.expires }, 'Minted offline access token via token exchange');
  return session;
}

async function getOrCreateOfflineSession(shop, sessionToken) {
  const offlineSessionId = `offline_${shop}`;
  const existing = await shopify.config.sessionStorage.loadSession(offlineSessionId);

  if (isUsable(existing)) return existing;

  if (existing?.refreshToken) {
    try {
      const { session } = await shopify.api.auth.refreshToken({ shop, refreshToken: existing.refreshToken });
      await shopify.config.sessionStorage.storeSession(session);
      logger.info({ shop, expires: session.expires }, 'Refreshed offline access token');
      return session;
    } catch (error) {
      // Refresh tokens are one-time-use and expire after 90 days — a failure here just means
      // falling through to a full token exchange below, not a hard failure.
      logger.warn({ shop, err: error }, 'Refresh token exchange failed, re-exchanging session token');
    }
  }

  const session = await exchangeForFreshSession(shop, sessionToken);

  if (!existing) {
    // First contact with this shop through the token-exchange path — make sure its Firestore doc
    // exists (idempotent; the legacy /auth callback also does this and additionally handles
    // referral capture for installs that arrive through a referral link).
    //
    // Deliberately NO per-shop webhook registration here: this app uses app-specific webhook
    // subscriptions declared in shopify.app.toml (see config/shopify.js), which Shopify delivers
    // without any per-shop registration call. The legacy flow's automatic registration step
    // queried the Admin API for nothing.
    await shopsRepo.ensureShopExists(shop);
  }

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
