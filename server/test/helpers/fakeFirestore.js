// A minimal in-memory stand-in for the pieces of the Firestore Admin SDK this app actually uses
// (doc get/set/update/delete, simple where()/in-array queries, and transactions with
// FieldValue.increment/serverTimestamp semantics). Used via vi.mock('.../lib/firestore.js') so
// unit tests exercise the real transaction logic in creditLedger/idempotency/jobWorker without
// touching a real Firebase project.
export function createFakeFirestore(seed = {}) {
  const store = new Map(Object.entries(seed).map(([path, data]) => [path, { ...data }]));

  function resolveFieldValues(existing, patch) {
    const result = { ...existing };
    for (const [key, value] of Object.entries(patch)) {
      if (value && typeof value === 'object' && value.__op === 'increment') {
        result[key] = (existing?.[key] ?? 0) + value.value;
      } else if (value && typeof value === 'object' && value.__op === 'serverTimestamp') {
        result[key] = new Date();
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  function matches(actual, op, expected) {
    if (op === '==') return actual === expected;
    if (op === 'in') return Array.isArray(expected) && expected.includes(actual);
    return true;
  }

  function makeDocRef(collectionName, id) {
    const path = `${collectionName}/${id}`;
    return {
      id,
      path,
      async get() {
        const data = store.get(path);
        return { exists: data !== undefined, id, data: () => (data ? { ...data } : undefined) };
      },
      async set(data, opts = {}) {
        const existing = store.get(path);
        store.set(path, opts.merge ? { ...existing, ...data } : resolveFieldValues(existing ?? {}, data));
      },
      async update(data) {
        if (!store.has(path)) throw new Error(`No document to update at ${path}`);
        store.set(path, resolveFieldValues(store.get(path), data));
      },
      async delete() {
        store.delete(path);
      },
    };
  }

  function makeQuery(collectionName, filters) {
    return {
      where(field, op, value) {
        return makeQuery(collectionName, [...filters, [field, op, value]]);
      },
      orderBy() {
        return this;
      },
      limit() {
        return this;
      },
      async get() {
        const docs = [...store.entries()]
          .filter(([path]) => path.startsWith(`${collectionName}/`))
          .filter(([, data]) => filters.every(([field, op, value]) => matches(data[field], op, value)))
          .map(([path, data]) => ({ id: path.slice(collectionName.length + 1), data: () => ({ ...data }) }));
        return { empty: docs.length === 0, docs };
      },
    };
  }

  function collection(collectionName) {
    return {
      doc(id = `auto_${Math.random().toString(36).slice(2, 10)}`) {
        return makeDocRef(collectionName, id);
      },
      where(field, op, value) {
        return makeQuery(collectionName, [[field, op, value]]);
      },
      async get() {
        return makeQuery(collectionName, []).get();
      },
    };
  }

  const firestore = {
    collection,
    batch() {
      const ops = [];
      return {
        delete(ref) {
          ops.push(() => ref.delete());
        },
        async commit() {
          await Promise.all(ops.map((op) => op()));
        },
      };
    },
    async runTransaction(fn) {
      const tx = {
        get: (ref) => ref.get(),
        set: (ref, data, opts) => ref.set(data, opts),
        update: (ref, data) => ref.update(data),
        delete: (ref) => ref.delete(),
      };
      return fn(tx);
    },
  };

  const FieldValue = {
    increment: (value) => ({ __op: 'increment', value }),
    serverTimestamp: () => ({ __op: 'serverTimestamp' }),
  };

  return { firestore, FieldValue, _store: store };
}
