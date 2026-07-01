import crypto from 'node:crypto';
import { env } from '../config/env.js';

// Derived, not the raw secret itself — keeps this token's HMAC key cryptographically separate
// from SHOPIFY_API_SECRET's other uses (webhook HMAC, session-token signing) even though both
// ultimately trace back to the same root secret.
const KEY = crypto.createHash('sha256').update(`${env.SHOPIFY_API_SECRET}:signed-state`).digest();

// The Google OAuth popup is a top-level browsing context, not an authenticated fetch — it can't
// carry an App Bridge session-token header. This gives that flow a short-lived, tamper-evident,
// shop-bound token to pass through Google's `state` param instead, so the callback can trust
// which shop initiated the request without re-deriving auth from scratch.
export function signState(payload, ttlMs = 10 * 60 * 1000) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString('base64url');
  const signature = crypto.createHmac('sha256', KEY).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export class InvalidStateError extends Error {
  constructor(reason) {
    super(`Invalid state token: ${reason}`);
    this.statusCode = 400;
  }
}

export function verifyState(token) {
  const [body, signature] = String(token).split('.');
  if (!body || !signature) throw new InvalidStateError('malformed');

  const expectedSignature = crypto.createHmac('sha256', KEY).update(body).digest('base64url');
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    throw new InvalidStateError('signature mismatch');
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (Date.now() > payload.exp) throw new InvalidStateError('expired');

  return payload;
}
