import { useEffect } from 'react';

const SITE_URL = 'https://visualkit.app';

function setMetaTag(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setLinkTag(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

// No react-helmet dependency needed for a handful of static marketing pages — this covers
// title/meta description/canonical, which is all the spec's SEO requirements ask for per page.
export function useDocumentHead({ title, description, path = '/' }) {
  useEffect(() => {
    if (title) document.title = title;
    if (description) setMetaTag('name', 'description', description);
    setLinkTag('canonical', `${SITE_URL}${path}`);
  }, [title, description, path]);
}

export { SITE_URL };
