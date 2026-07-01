import { useDocumentHead } from '../hooks/useDocumentHead.js';

export default function Blog() {
  useDocumentHead({
    title: 'Blog | VisualKit',
    description: 'VisualKit blog — guides and updates on AI product photography for Shopify merchants, coming soon.',
    path: '/blog',
  });

  return (
    <section className="section">
      <div className="container">
        <h1>Blog</h1>
        <p className="section-subheading">
          We're just getting started — posts on AI product photography, UGC strategy, and Shopify merchandising tips
          are coming soon.
        </p>
      </div>
    </section>
  );
}
