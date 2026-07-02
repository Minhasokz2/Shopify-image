// Every authenticated call goes through here — App Bridge 4.x's global `shopify.idToken()`
// mints a fresh short-lived session-token JWT per request, which the server's
// verifySessionToken middleware validates (see server/src/middleware/verifySessionToken.js).
async function getSessionToken() {
  if (typeof window === 'undefined' || !window.shopify) {
    throw new Error('App Bridge is not available — this app must run embedded in the Shopify admin.');
  }
  return window.shopify.idToken();
}

async function request(path, { method = 'GET', body, ...rest } = {}) {
  const token = await getSessionToken();
  const response = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    ...rest,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      // response wasn't JSON — keep the generic message
    }
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}

// Multipart upload (Image Optimizer's "upload a file" path) needs its own path through fetch:
// FormData must NOT be JSON.stringify'd, and the browser sets its own multipart Content-Type
// (with boundary) automatically — setting one manually here would break the boundary.
async function postFormData(path, formData) {
  const token = await getSessionToken();
  const response = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      // response wasn't JSON — keep the generic message
    }
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  return response.json();
}

export const apiClient = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  postFormData,
};
