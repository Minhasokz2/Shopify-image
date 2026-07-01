import { shopify } from '../config/shopify.js';

// Wraps the officially-supported shopify-app-express middleware: it validates the App Bridge
// session-token JWT (signature/exp/aud/dest), resolves the offline session, and — on success —
// sets res.locals.shopify.session. On failure it responds with the redirect-out-of-app signal
// App Bridge's authenticatedFetch understands, rather than a plain 401.
export const verifySessionToken = shopify.validateAuthenticatedSession();
