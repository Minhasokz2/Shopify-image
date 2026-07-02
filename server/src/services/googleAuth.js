import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';

const REDIRECT_URI = `${env.SHOPIFY_APP_URL}/auth/google/callback`;

const client = new OAuth2Client({
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  redirectUri: REDIRECT_URI,
});

export function buildGoogleAuthUrl(state) {
  return client.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
  });
}

export class GoogleAuthError extends Error {}

// Google authorization codes are single-use: exchanging the same code twice always fails the
// second time with invalid_grant. In practice /auth/google/callback sometimes receives a
// near-duplicate request for the exact same code a fraction of a second after the first —
// observed with referers pointing back at the callback URL itself, consistent with a browser or
// security scanner re-requesting the redirect target rather than a genuine second OAuth attempt.
// Memoizing the exchange by code (not just while in flight, but for a short window after it
// settles) makes a duplicate request replay the first request's outcome instead of racing Google
// for a code that's already been consumed.
const recentExchanges = new Map(); // code -> Promise<{email, googleId, name}>
const EXCHANGE_MEMO_TTL_MS = 2 * 60 * 1000;

// Exchanges the one-time authorization code for tokens, then verifies the ID token's signature
// and audience server-side rather than trusting the unverified payload — this is the actual
// proof that the email came from Google, not just a claim.
export async function verifyGoogleAuthCode(code) {
  const cached = recentExchanges.get(code);
  if (cached) return cached;

  const exchange = (async () => {
    try {
      const { tokens } = await client.getToken({ code, redirect_uri: REDIRECT_URI });
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID });
      const payload = ticket.getPayload();

      if (!payload?.email) {
        throw new GoogleAuthError('Google did not return an email address');
      }
      if (!payload.email_verified) {
        throw new GoogleAuthError('Google account email is not verified');
      }

      return { email: payload.email, googleId: payload.sub, name: payload.name ?? null };
    } catch (err) {
      if (err instanceof GoogleAuthError) throw err;
      throw new GoogleAuthError(err.message);
    }
  })();

  recentExchanges.set(code, exchange);
  // .then(onFulfilled, onRejected) rather than .finally(): .finally()'s returned promise re-throws
  // on rejection, and since that derived promise isn't awaited anywhere, it would itself become an
  // unhandled rejection independent of the (already-handled) `exchange` promise above.
  const scheduleForget = () => {
    const timer = setTimeout(() => {
      if (recentExchanges.get(code) === exchange) recentExchanges.delete(code);
    }, EXCHANGE_MEMO_TTL_MS);
    timer.unref?.();
  };
  exchange.then(scheduleForget, scheduleForget);

  return exchange;
}
