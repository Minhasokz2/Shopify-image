import { logger } from '../lib/logger.js';

// GDPR mandatory webhook — a merchant's end customer requested their data. Same as
// customers/redact: MotionArt holds no end-customer PII, so there is nothing to return.
export async function handleCustomersDataRequest(shopDomain, payload) {
  logger.info(
    { shopDomain, customerId: payload?.customer?.id },
    'customers/data_request received — no customer data is stored, no-op',
  );
}
