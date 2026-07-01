import { useDocumentHead } from '../hooks/useDocumentHead.js';

const plans = [
  {
    name: 'Starter',
    price: '$9',
    billing: 'one-time',
    credits: '50 credits',
    description: 'Try VisualKit on a handful of products before you commit to more.',
    features: ['50 generation credits', 'Scenes, UGC & video', 'Credits never expire', 'No subscription required'],
    featured: false,
  },
  {
    name: 'Growth',
    price: '$29',
    billing: 'one-time',
    credits: '200 credits',
    description: 'For merchants refreshing a full collection or launching a new line.',
    features: ['200 generation credits', 'Scenes, UGC & video', 'Credits never expire', 'No subscription required'],
    featured: true,
  },
  {
    name: 'Pro',
    price: '$69',
    billing: 'one-time',
    credits: '600 credits',
    description: 'For larger catalogs and agencies producing content at volume.',
    features: ['600 generation credits', 'Scenes, UGC & video', 'Credits never expire', 'No subscription required'],
    featured: false,
  },
  {
    name: 'Unlimited',
    price: '$29',
    billing: '/month',
    credits: 'Unlimited generations',
    description: 'For stores that generate new content every week and want to stop counting credits.',
    features: ['Unlimited generations', 'Scenes, UGC & video', 'Cancel anytime', 'Billed monthly'],
    featured: false,
  },
];

const competitors = [
  { name: 'Soona', price: '$19/mo', note: 'Subscription required to start' },
  { name: 'Piks AI', price: '$17.99/mo', note: 'Subscription required to start' },
  { name: 'SellerPic', price: '$29/mo', note: 'Subscription required to start' },
  { name: 'StudioShot', price: '$14.99/mo', note: 'Subscription required to start' },
  { name: 'VisualKit', price: '$9 one-time', note: 'No subscription required to start', highlight: true },
];

export default function Pricing() {
  useDocumentHead({
    title: 'Pricing — AI Product Image Generator Plans | VisualKit',
    description:
      'VisualKit pricing: one-time credit packs from $9 (Starter, Growth, Pro) or an unlimited $29/month plan. Compare against Soona, Piks AI, SellerPic, and StudioShot.',
    path: '/pricing',
  });

  return (
    <>
      <section className="section">
        <div className="container">
          <h1>Simple pricing, no forced subscription</h1>
          <p className="section-subheading">
            Buy a one-time credit pack and use it whenever you like, or go unlimited on a monthly plan once you know
            VisualKit fits your workflow. Either way, credits you buy never expire.
          </p>

          <div className="grid grid-2 pricing-grid">
            {plans.map((plan) => (
              <div className={plan.featured ? 'card pricing-card featured' : 'card pricing-card'} key={plan.name}>
                {plan.featured && <span className="pricing-badge">Most popular</span>}
                <h3>{plan.name}</h3>
                <div className="pricing-price">
                  <span className="pricing-amount">{plan.price}</span>
                  <span className="pricing-billing">{plan.billing}</span>
                </div>
                <p className="pricing-credits text-muted">{plan.credits}</p>
                <p className="text-muted">{plan.description}</p>
                <ul className="pricing-features">
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <a href="#" className={plan.featured ? 'button' : 'button button-secondary'}>
                  Install on Shopify
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <h2 className="section-heading">How VisualKit compares</h2>
          <p className="section-subheading">
            Most AI product photography tools require a monthly subscription before you can generate a single image.
            VisualKit lets you buy a $9 credit pack, see the quality for yourself, and only subscribe if and when it
            makes sense for your volume.
          </p>
          <div className="table-scroll">
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>Starting price</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {competitors.map((c) => (
                  <tr key={c.name} className={c.highlight ? 'compare-row-highlight' : undefined}>
                    <td>{c.name}</td>
                    <td>{c.price}</td>
                    <td>{c.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted compare-disclaimer">
            Competitor pricing shown reflects publicly listed starting plans as of publication and may change —
            always confirm current pricing directly with each provider.
          </p>
        </div>
      </section>

      <section className="section cta-band">
        <div className="container center-cta">
          <h2 className="section-heading">Start with a $9 credit pack</h2>
          <p className="section-subheading">No commitment. See real results on your own products first.</p>
          <a href="#" className="button">
            Install on Shopify
          </a>
        </div>
      </section>
    </>
  );
}
