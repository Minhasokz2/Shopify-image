// App Bridge 4.x's global toast API (window.shopify.toast.show) — the one notification surface
// that reaches a merchant regardless of which page they're on, unlike a Polaris <Banner> which
// only shows on the page that renders it. No-op outside the embedded admin iframe (local dev
// preview, tests) since window.shopify doesn't exist there.
export function showToast(message, { isError = false, duration } = {}) {
  if (typeof window === 'undefined' || !window.shopify?.toast) return;
  window.shopify.toast.show(message, { isError, ...(duration ? { duration } : {}) });
}
