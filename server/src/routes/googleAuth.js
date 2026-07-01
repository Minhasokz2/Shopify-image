import { Router } from 'express';
import { env } from '../config/env.js';
import { verifyGoogleAuthCode, GoogleAuthError } from '../services/googleAuth.js';
import { verifyState, InvalidStateError } from '../lib/signedState.js';
import { shopsRepo } from '../models/shopsRepo.js';
import { logger } from '../lib/logger.js';

const router = Router();

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

// Renders a tiny page that hands the result back to the embedded app (the popup's opener) via
// postMessage and closes itself — the popup never needs to show real UI, just relay outcome.
// `error` can originate from query params Google (or an attacker) controls, so it's escaped
// before landing in the visible <p>. It's also escaped inside the <script> block: JSON.stringify
// alone isn't enough there — a literal "</script>" inside the JSON string would still close the
// tag early to an HTML parser regardless of JS string-literal context, so `<` is additionally
// escaped to <, which round-trips fine through JSON.parse on the receiving end.
function renderPopupResult(res, { ok, error }) {
  const payload = JSON.stringify({ source: 'visualkit-google-auth', ok, error: error ?? null }).replaceAll(
    '<',
    '\\u003c',
  );
  const visibleMessage = ok ? 'Signed in — you can close this window.' : `Sign-in failed: ${escapeHtml(error)}`;
  res.set('Content-Type', 'text/html').send(`<!doctype html>
<html><body>
<script>
  if (window.opener) {
    window.opener.postMessage(${payload}, ${JSON.stringify(env.SHOPIFY_APP_URL)});
  }
  window.close();
</script>
<p>${visibleMessage}</p>
</body></html>`);
}

// Top-level callback for the Google OAuth popup (see /api/auth/google/init for how it's opened).
// Deliberately outside /api — this is a plain browser redirect from Google, not an authenticated
// fetch, so it can't carry an App Bridge session token; the signed `state` param is what proves
// which shop initiated it instead.
router.get('/auth/google/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    return renderPopupResult(res, { ok: false, error: String(oauthError) });
  }

  let shopDomain;
  try {
    ({ shop: shopDomain } = verifyState(state));
  } catch (err) {
    logger.warn({ err }, 'Google OAuth callback received an invalid/expired state token');
    const message = err instanceof InvalidStateError ? err.message : 'invalid state';
    return renderPopupResult(res, { ok: false, error: message });
  }

  try {
    const { email, googleId } = await verifyGoogleAuthCode(code);
    await shopsRepo.markGoogleVerified(shopDomain, { googleEmail: email, googleId });
    return renderPopupResult(res, { ok: true });
  } catch (err) {
    logger.error({ err, shopDomain }, 'Google OAuth verification failed');
    const message = err instanceof GoogleAuthError ? err.message : 'verification failed';
    return renderPopupResult(res, { ok: false, error: message });
  }
});

export default router;
