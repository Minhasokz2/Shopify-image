import { shopifyApp } from '@shopify/shopify-app-express';
import { ApiVersion, BillingInterval, LogSeverity } from '@shopify/shopify-api';
import { env, isProduction } from './env.js';
import { FirestoreSessionStorage } from '../lib/sessionStorage.js';

// No `LATEST_API_VERSION` export exists on this SDK version — pinned explicitly to the most
// recent stable quarterly release available at build time. Keep in sync with
// `[webhooks].api_version` in shopify.app.toml.
export const ADMIN_API_VERSION = ApiVersion.July26;

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
    logger: { level: isProduction ? LogSeverity.Info : LogSeverity.Debug },
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
