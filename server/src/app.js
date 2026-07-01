import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import pinoHttp from 'pino-http';
import { shopify } from './config/shopify.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRouter from './routes/auth.js';
import webhooksRouter from './routes/webhooks.js';
import apiRouter from './routes/api/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST_PATH = path.join(__dirname, '../../web/dist');

// Split from index.js so tests can import the Express app directly with supertest, without
// binding a real port.
export function createApp() {
  const app = express();

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
  app.get('/health', (req, res) => res.status(200).send('ok'));

  // HMAC is computed over the raw body — this must be mounted before express.json() below.
  app.use('/webhooks', webhooksRouter);

  app.use(express.json());
  app.use(shopify.cspHeaders());

  app.use(authRouter);
  app.use('/api', apiRouter);

  // Serve the built embedded-app frontend. Any route shopify-app-express hasn't already
  // handled (i.e. anything that isn't /auth, /api, or /webhooks) is a page load of the embedded
  // app itself — ensureInstalledOnShop() redirects to OAuth if the shop has no session yet.
  if (fs.existsSync(WEB_DIST_PATH)) {
    app.use(express.static(WEB_DIST_PATH));
    app.get('/*splat', shopify.ensureInstalledOnShop(), (req, res) => {
      res.set('Content-Type', 'text/html');
      res.send(fs.readFileSync(path.join(WEB_DIST_PATH, 'index.html')));
    });
  }

  app.use(errorHandler);

  return app;
}
