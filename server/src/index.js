import { env } from './config/env.js';
import { initSentry } from './lib/sentry.js';
import { logger } from './lib/logger.js';
import { createApp } from './app.js';
import { jobWorker } from './services/jobWorker.js';

initSentry();

const app = createApp();

app.listen(env.PORT, async () => {
  logger.info({ port: env.PORT }, 'VisualKit server listening');
  try {
    // Resume any job left `pending`/`processing` by a killed or redeployed process — see
    // services/jobWorker.js for why this is a fallback path, not the primary dispatch mechanism.
    // A failure here (e.g. Firestore briefly unreachable) must not crash an otherwise-healthy
    // server that can still serve new requests.
    await jobWorker.resumeFromFirestore();
  } catch (error) {
    logger.error({ err: error }, 'Failed to resume in-flight jobs from Firestore at boot');
  }
});
