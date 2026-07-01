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

// Exchanges the one-time authorization code for tokens, then verifies the ID token's signature
// and audience server-side rather than trusting the unverified payload — this is the actual
// proof that the email came from Google, not just a claim.
export async function verifyGoogleAuthCode(code) {
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
}
