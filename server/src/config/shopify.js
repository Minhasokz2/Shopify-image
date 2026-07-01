import { shopifyApp } from '@shopify/shopify-app-express';
import { ApiVersion, BillingInterval, LogSeverity } from '@shopify/shopify-api';
import { env, isProduction } from './env.js';
import { FirestoreSessionStorage } from '../lib/sessionStorage.js';

// No `LATEST_API_VERSION` export exists on this SDK version. Pinned to April26 ("2026-04"),
// not the newer-looking July26 the SDK also exports — the SDK ships version constants ahead of
// Shopify's platform actually activating them, and April26 is the newest version the real
// Partner Dashboard's app configuration currently accepts. Using an not-yet-active version here
// causes every live Admin API call (including validateAuthenticatedSession()'s session-token
// verification ping) to fail, which forces a fresh OAuth cycle on every single request — an
// infinite embedded-app reload loop, not a one-time error. Keep in sync with
// `[webhooks].api_version` in shopify.app.toml.
export const ADMIN_API_VERSION = ApiVersion.April26;

// One-time credit packs (spec Section 12) plus the recurring Unlimited tier, expressed as
// shopify-api's billing config so `shopify.billing.request/check/cancel` handle the
// appPurchaseOneTimeCreate / appSubscriptionCreate GraphQL calls for us instead of hand-rolled
// mutations.
export const BILLING_PLANS = {
  starter: { amount: 9, currencyCode: 'USD', interval: BillingInterval.OneTime },
  growth: { amount: 29, currencyCode: 'USD', interval: BillingInterval.OneTime },
  pro: { amount: 69, currencyCode: 'USD', interval: BillingInterval.OneTime },
  unlimited: {
    lineItems: [{ amount: 29, currencyCode: 'USD', interval: BillingInterval.Every30Days }],
  },
};

const appUrl = new URL(env.SHOPIFY_APP_URL);

export const shopify = shopifyApp({
  api: {
    apiVersion: ADMIN_API_VERSION,
    apiKey: env.SHOPIFY_API_KEY,
    apiSecretKey: env.SHOPIFY_API_SECRET,
    scopes: env.SHOPIFY_SCOPES,
    hostName: appUrl.host,
    hostScheme: appUrl.protocol.replace(':', ''),
    isEmbeddedApp: true,
    billing: BILLING_PLANS,
    // TEMPORARY: forced to Debug in production to diagnose the reauth loop — revert to
    // `isProduction ? LogSeverity.Info : LogSeverity.Debug` once root-caused.
    logger: { level: LogSeverity.Debug },
  },
  auth: {
    path: '/auth',
    callbackPath: '/auth/callback',
  },
  webhooks: {
    // Required by AppConfigParams, but unused: this app relies exclusively on app-specific
    // webhook subscriptions declared in shopify.app.toml (validated by hand in
    // routes/webhooks.js), not shop-specific subscriptions registered through this library.
    path: '/webhooks/_unused-shop-specific-registry',
  },
  sessionStorage: new FirestoreSessionStorage(),
});
