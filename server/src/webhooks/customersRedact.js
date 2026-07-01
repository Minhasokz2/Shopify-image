import { logger } from '../lib/logger.js';

// GDPR mandatory webhook — a merchant's end customer requested erasure. VisualKit never stores
// end-customer PII (it only ever processes the merchant's own product images/catalog), so there
// is nothing to erase. Acknowledging receipt satisfies Shopify's requirement to handle the topic.
export async function handleCustomersRedact(shopDomain, payload) {
  logger.info({ shopDomain, customerId: payload?.customer?.id }, 'customers/redact received — no customer data is stored, no-op');
}
