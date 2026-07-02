// Every repo stores createdAt/updatedAt (and similar) via FieldValue.serverTimestamp(), which
// reads back as a Firestore Timestamp instance — a class with only `_seconds`/`_nanoseconds`
// fields and no toJSON(). JSON.stringify-ing one directly (e.g. via res.json(doc.data())) turns
// it into {_seconds, _nanoseconds}, which `new Date(...)` on the client can't parse ("Invalid
// Date"). Recursively converting any Timestamp to an ISO string before a response goes out fixes
// every route at once instead of patching each repo method that happens to return one.
//
// Duck-typed rather than `instanceof Timestamp`: several tests mock lib/firestore.js's Timestamp
// export with a plain object, which instanceof can't check against, and this also stays correct
// if the Admin SDK is ever duplicated across node_modules (a real possibility with npm workspaces).
function isFirestoreTimestamp(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.toDate === 'function' &&
    typeof value._seconds === 'number' &&
    typeof value._nanoseconds === 'number'
  );
}

export function serializeTimestamps(value) {
  if (isFirestoreTimestamp(value)) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeTimestamps);
  if (value && typeof value === 'object' && value.constructor === Object) {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = serializeTimestamps(val);
    }
    return result;
  }
  return value;
}
