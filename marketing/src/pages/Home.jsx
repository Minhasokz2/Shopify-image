import { Link } from 'react-router-dom';
import { useDocumentHead, SITE_URL } from '../hooks/useDocumentHead.js';
import { JsonLd } from '../components/JsonLd.jsx';
import BeforeAfterSlider from '../components/BeforeAfterSlider.jsx';

const softwareAppSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'VisualKit',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description:
    'VisualKit is a Shopify app that turns existing product catalog images into professional AI product photos, UGC-style on-model content, and short product videos.',
  url: SITE_URL,
  offers: [
    {
      '@type': 'Offer',
      name: 'Starter',
      price: '9.00',
      priceCurrency: 'USD',
      description: 'One-time purchase, 50 credits',
    },
    {
      '@type': 'Offer',
      name: 'Growth',
      price: '29.00',
      priceCurrency: 'USD',
      description: 'One-time purchase, 200 credits',
    },
    {
      '@type': 'Offer',
      name: 'Pro',
      price: '69.00',
      priceCurrency: 'USD',
      description: 'One-time purchase, 600 credits',
    },
    {
      '@type': 'Offer',
      name: 'Unlimited',
      price: '29.00',
      priceCurrency: 'USD',
      description: 'Monthly subscription, unlimited generations',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: '29.00',
        priceCurrency: 'USD',
        billingDuration: 'P1M',
      },
    },
  ],
};

// sameAs left empty intentionally — no live social profiles yet. Fill in once
// official VisualKit accounts (Twitter/X, Instagram, LinkedIn, etc.) exist.
const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'VisualKit',
  url: SITE_URL,
  sameAs: [],
};

const steps = [
  {
    title: 'Connect your catalog',
    body: 'Install VisualKit and pick the products you want to reimagine — no re-uploading, it reads straight from your existing Shopify product images.',
  },
  {
    title: 'Choose a look',
    body: 'Pick a scene, an on-model UGC style, or a short video format. Our two-step pipeline locks in your exact product details before any creative generation happens.',
  },
  {
    title: 'Publish in minutes',
    body: 'Review the results, push approved images straight back to your product listings, and download video for ads and social.',
  },
];

const contentTypes = [
  {
    title: 'Scenes',
    body: 'Studio-quality product photography in lifestyle and editorial settings — no photographer, no studio rental.',
  },
  {
    title: 'UGC Content',
    body: 'On-model, creator-style photos that look like real customer content, generated straight from your product shots.',
  },
  {
    title: 'Video',
    body: 'Short vertical product videos built for ads, TikTok, and Instagram — generated from the same catalog images.',
  },
];

export default function Home() {
  useDocumentHead({
    title: 'VisualKit — AI Product Photos & Shopify Product Photography',
    description:
      'Turn your existing Shopify catalog images into professional AI product photos, UGC content, and video. One-time credit packs start at $9 — no subscription required.',
    path: '/',
  });

  return (
    <>
      <JsonLd data={softwareAppSchema} />
      <JsonLd data={organizationSchema} />

      <section className="section hero">
        <div className="container hero-inner">
          <div className="hero-copy">
            <h1>Turn your product photos into scroll-stopping content, without a studio</h1>
            <p className="hero-subtitle">
              VisualKit is the AI product image generator built for Shopify merchants. Upload nothing new — we
              generate on-brand scenes, UGC-style photos, and short video straight from the catalog images you
              already have.
            </p>
            <div className="hero-actions">
              <a href="#" className="button">
                Install on Shopify
              </a>
              <Link to="/pricing" className="button button-secondary">
                See pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section-heading">See the difference before you commit</h2>
          <p className="section-subheading">
            Drag the handle — same product, same label, same color. Only the scene changed.
          </p>
          <BeforeAfterSlider
            beforeSrc="https://placehold.co/800x600/1a2030/9aa3b5?text=Original+Catalog+Photo"
            afterSrc="https://placehold.co/800x600/12161f/00d4b8?text=VisualKit+AI+Scene"
            beforeLabel="Original catalog photo"
            afterLabel="AI-generated scene"
          />
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <h2 className="section-heading">How it works</h2>
          <div className="grid grid-3">
            {steps.map((step, index) => (
              <div className="card" key={step.title}>
                <div className="step-number">{index + 1}</div>
                <h3>{step.title}</h3>
                <p className="text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section-heading">One catalog, three kinds of content</h2>
          <p className="section-subheading">
            Every format is generated from a two-step pipeline that locks in your product's real color, logo, and
            label details before any creative rendering starts.
          </p>
          <div className="grid grid-3">
            {contentTypes.map((type) => (
              <div className="card" key={type.title}>
                <h3>{type.title}</h3>
                <p className="text-muted">{type.body}</p>
              </div>
            ))}
          </div>
          <div className="center-cta">
            <Link to="/features" className="button button-secondary">
              Explore all features
            </Link>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container pricing-preview">
          <h2 className="section-heading">Start for $9 — no subscription required</h2>
          <p className="section-subheading">
            One-time credit packs from $9, or go unlimited for $29/mo when you're ready to scale. No forced monthly
            commitment to try VisualKit out.
          </p>
          <div className="center-cta">
            <Link to="/pricing" className="button">
              View full pricing
            </Link>
          </div>
        </div>
      </section>

      <section className="section cta-band">
        <div className="container center-cta">
          <h2 className="section-heading">Ready to reimagine your catalog?</h2>
          <p className="section-subheading">Install VisualKit from the Shopify App Store and generate your first images in minutes.</p>
          <a href="#" className="button">
            Install on Shopify
          </a>
        </div>
      </section>
    </>
  );
}
