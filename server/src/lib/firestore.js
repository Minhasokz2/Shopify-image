import fs from 'node:fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { env } from '../config/env.js';

function loadServiceAccount() {
  const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON.trim();
  // Accept either the raw JSON contents (convenient for Render's env var UI) or a path to a
  // service-account file (convenient for local dev) — spec Section 14 doesn't distinguish.
  const jsonText = raw.startsWith('{') ? raw : fs.readFileSync(raw, 'utf8');
  return JSON.parse(jsonText);
}

const app = getApps().length
  ? getApps()[0]
  : initializeApp({ credential: cert(loadServiceAccount()) });

export const firestore = getFirestore(app);
export { FieldValue, Timestamp };

const BATCH_DELETE_CHUNK_SIZE = 400; // stay under Firestore's 500-writes-per-batch limit

// Used for shop/redact GDPR cleanup — deletes every document in `collectionName` where `field`
// equals `value`, in chunks, without needing every caller to hand-roll pagination.
export async function deleteWhere(collectionName, field, value) {
  let deleted = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snapshot = await firestore
      .collection(collectionName)
      .where(field, '==', value)
      .limit(BATCH_DELETE_CHUNK_SIZE)
      .get();
    if (snapshot.empty) break;

    const batch = firestore.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snapshot.size;

    if (snapshot.size < BATCH_DELETE_CHUNK_SIZE) break;
  }
  return deleted;
}
