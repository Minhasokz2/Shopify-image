import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import pinoHttp from 'pino-http';
import { shopify } from './config/shopify.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { serializeTimestamps } from './lib/serializeTimestamps.js';
import authRouter from './routes/auth.js';
import googleAuthRouter from './routes/googleAuth.js';
import webhooksRouter from './routes/webhooks.js';
import apiRouter from './routes/api/index.js';
import adminRouter from './routes/admin/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST_PATH = path.join(__dirname, '../../web/dist');
const ADMIN_DIST_PATH = path.join(__dirname, '../../admin/dist');

// Split from index.js so tests can import the Express app directly with supertest, without
// binding a real port.
export function createApp() {
  const app = express();

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
  app.get('/health', (req, res) => res.status(200).send('ok'));

  // Every route below eventually res.json()s data that traced back to a Firestore doc — patching
  // res.json once here (rather than converting Timestamps at each repo call site) guarantees no
  // route can ship a raw Timestamp by accident.
  app.use((req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body) => originalJson(serializeTimestamps(body));
    next();
  });

  // Public privacy policy — linked from the Shopify App Store listing, so it must be reachable
  // without any Shopify/App Bridge/Google auth. Registered before the SPA catch-all below, which
  // would otherwise swallow the route and serve the embedded app's HTML instead.
  app.get('/privacy', (req, res) => {
    res.sendFile(path.join(__dirname, '../static/privacy.html'));
  });

  // HMAC is computed over the raw body — this must be mounted before express.json() below.
  app.use('/webhooks', webhooksRouter);

  app.use(express.json());
  app.use(shopify.cspHeaders());

  // Mounted before /auth and the merchant-facing catch-all below so /admin/* is never swallowed
  // by the embedded-app's SPA fallback route. Gated by its own admin key, not a Shopify session
  // — this manages the template catalog shared across every shop, not one shop's own data.
  app.use('/admin/api', adminRouter);
  if (fs.existsSync(ADMIN_DIST_PATH)) {
    app.use('/admin', express.static(ADMIN_DIST_PATH));
  }

  app.use(authRouter);
  app.use(googleAuthRouter);
  app.use('/api', apiRouter);

  // Serve the built embedded-app frontend. With Shopify managed installation + token exchange
  // (see middleware/verifySessionToken.js) there is no per-shop install redirect to run here —
  // Shopify installs the app before the embedded iframe ever loads, and the first authenticated
  // /api/* call mints the offline token. The one non-embedded case worth handling: a merchant
  // hitting the bare app URL with ?shop= (e.g. an old install link) gets bounced into the
  // embedded app in their admin instead of a broken standalone page.
  if (fs.existsSync(WEB_DIST_PATH)) {
    app.use(express.static(WEB_DIST_PATH));
    app.get('/*splat', (req, res) => {
      const shopParam = typeof req.query.shop === 'string' ? req.query.shop : null;
      if (shopParam && req.query.embedded !== '1') {
        const sanitizedShop = shopify.api.utils.sanitizeShop(shopParam);
        if (sanitizedShop) {
          return res.redirect(`https://${sanitizedShop}/admin/apps/${env.SHOPIFY_API_KEY}`);
        }
      }
      res.set('Content-Type', 'text/html');
      return res.send(fs.readFileSync(path.join(WEB_DIST_PATH, 'index.html')));
    });
  }

  app.use(errorHandler);

  return app;
}
