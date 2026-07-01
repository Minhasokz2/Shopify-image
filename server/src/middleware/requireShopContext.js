// Must run after verifySessionToken — reads the session it attached to res.locals.shopify.
export function requireShopContext(req, res, next) {
  const session = res.locals.shopify?.session;
  if (!session) {
    return res.status(401).json({ error: 'No authenticated session' });
  }
  req.shopSession = session;
  req.shopDomain = session.shop;
  return next();
}
