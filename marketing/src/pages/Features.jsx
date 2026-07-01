import { useDocumentHead } from '../hooks/useDocumentHead.js';
import BeforeAfterSlider from '../components/BeforeAfterSlider.jsx';

const sections = [
  {
    id: 'scenes',
    title: 'Scenes',
    tagline: 'Studio-quality product photography, generated from what you already have',
    body: "Upload your existing catalog photo and VisualKit places your product into professionally lit scenes — flat-lay, lifestyle, editorial, or seasonal — without a photographer, a studio, or a reshoot. Every scene keeps your product's true colors, proportions, and label details intact, so what shoppers see matches what ships.",
    beforeAlt: 'Plain catalog photo on white background',
    afterAlt: 'Product placed in a styled lifestyle scene',
  },
  {
    id: 'ugc',
    title: 'UGC Content',
    tagline: 'On-model, creator-style photos without booking a single model or shoot',
    body: 'Generate on-model, UGC-style photos that look like real customer content — the kind that performs best in ads and on social feeds. VisualKit renders your product accurately on the model first, then applies the creative style, so logos and labels stay crisp instead of warping into generic AI artifacts.',
    beforeAlt: 'Product-only catalog photo',
    afterAlt: 'On-model UGC-style photo of the same product',
  },
  {
    id: 'video',
    title: 'Video',
    tagline: 'Short-form product video for ads, TikTok, and Instagram',
    body: "Turn a single product photo into a short, vertical product video — ready to drop into paid social campaigns or organic posts. Video is generated from the same accuracy-first pipeline as our photos, so your product doesn't distort or drift as it moves.",
    beforeAlt: 'Static product photo',
    afterAlt: 'Frame from an AI-generated product video',
  },
];

export default function Features() {
  useDocumentHead({
    title: 'Features — AI UGC Generator & Product Photography for Shopify | VisualKit',
    description:
      'Explore VisualKit features: AI-generated product scenes, on-model UGC content, and short product video — all built from your existing Shopify catalog images.',
    path: '/features',
  });

  return (
    <>
      <section className="section">
        <div className="container">
          <h1>Everything you need to keep your catalog looking fresh</h1>
          <p className="section-subheading">
            Three content types, one accuracy-first pipeline. VisualKit locks in your product's real details before
            generating anything creative, so scenes, UGC photos, and video all stay true to what you actually sell.
          </p>
        </div>
      </section>

      {sections.map((section, index) => (
        <section
          key={section.id}
          id={section.id}
          className={index % 2 === 1 ? 'section section-alt' : 'section'}
        >
          <div className="container feature-block">
            <div className="feature-copy">
              <h2>{section.title}</h2>
              <p className="feature-tagline">{section.tagline}</p>
              <p className="text-muted">{section.body}</p>
            </div>
            <div className="feature-media">
              <BeforeAfterSlider
                beforeSrc={`https://placehold.co/800x600/1a2030/9aa3b5?text=${encodeURIComponent(section.beforeAlt)}`}
                afterSrc={`https://placehold.co/800x600/12161f/00d4b8?text=${encodeURIComponent(section.afterAlt)}`}
                beforeLabel="Before"
                afterLabel="After"
              />
            </div>
          </div>
        </section>
      ))}

      <section className="section cta-band">
        <div className="container center-cta">
          <h2 className="section-heading">See it on your own products</h2>
          <p className="section-subheading">Install VisualKit and generate your first images from a $9 credit pack.</p>
          <a href="#" className="button">
            Install on Shopify
          </a>
        </div>
      </section>
    </>
  );
}
