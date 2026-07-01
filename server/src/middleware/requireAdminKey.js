import crypto from 'node:crypto';
import { env } from '../config/env.js';

// Hashing both sides to a fixed-length digest first means timingSafeEqual never sees a length
// mismatch, so a wrong-length guess can't be rejected any faster than a right-length one.
function timingSafeEqual(a, b) {
  const digestA = crypto.createHash('sha256').update(a).digest();
  const digestB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

// Gates every /admin/api/* route. Deliberately NOT Shopify session-token auth — the template
// catalog is shared across every shop, not scoped to one, so there is no "shop" to authenticate
// as here. A single long-lived shared secret is enough for a single-operator admin tool; this is
// not intended to scale to multiple admin users.
export function requireAdminKey(req, res, next) {
  const provided = req.get('x-admin-key');
  if (!provided || !timingSafeEqual(provided, env.ADMIN_API_KEY)) {
    return res.status(401).json({ error: 'Invalid or missing admin key' });
  }
  return next();
}
