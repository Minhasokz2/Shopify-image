// Intended to run on a schedule (e.g. a Render Cron Job running `npm run sweep:nurture -w
// server` once a day) — this app has no other background scheduler for the Day 0/1/3/7/14
// trial nurture sequence (spec Section 3).
import { shopify } from '../src/config/shopify.js';
import { runNurtureSweep } from '../src/services/email.js';

async function getShopEmail(shopDomain) {
  const session = await shopify.config.sessionStorage.loadSession(`offline_${shopDomain}`);
  if (!session) return null;
  try {
    const client = new shopify.api.clients.Graphql({ session });
    const response = await client.request(`#graphql
      query ShopEmail { shop { email } }
    `);
    return response.data?.shop?.email ?? null;
  } catch {
    return null;
  }
}

runNurtureSweep({ getShopEmail })
  .then(({ sent }) => {
    // eslint-disable-next-line no-console
    console.log(`Nurture sweep complete — sent ${sent} email(s).`);
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Nurture sweep failed:', error);
    process.exit(1);
  });
