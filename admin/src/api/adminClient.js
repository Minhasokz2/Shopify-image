const STORAGE_KEY = 'visualkit-admin-key';

export function getStoredAdminKey() {
  return sessionStorage.getItem(STORAGE_KEY);
}

export function storeAdminKey(key) {
  sessionStorage.setItem(STORAGE_KEY, key);
}

export function clearStoredAdminKey() {
  sessionStorage.removeItem(STORAGE_KEY);
}

async function request(path, { method = 'GET', body } = {}) {
  const key = getStoredAdminKey();
  const response = await fetch(`/admin/api${path}`, {
    method,
    headers: {
      'x-admin-key': key ?? '',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401) {
    // The stored key is wrong or has never been set — clear it so the login gate reappears
    // instead of the app quietly failing every subsequent request.
    clearStoredAdminKey();
    const error = new Error('Invalid admin key');
    error.statusCode = 401;
    throw error;
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let details;
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
      details = data?.details;
    } catch {
      // response wasn't JSON — keep the generic message
    }
    const error = new Error(message);
    error.statusCode = response.status;
    error.details = details;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}

export const adminClient = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
};
