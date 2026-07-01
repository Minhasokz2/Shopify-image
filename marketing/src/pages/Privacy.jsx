import { useDocumentHead } from '../hooks/useDocumentHead.js';

export default function Privacy() {
  useDocumentHead({
    title: 'Privacy Policy | VisualKit',
    description:
      'How VisualKit collects, uses, and protects merchant and shop data, including which third-party AI providers process product images to generate content.',
    path: '/privacy',
  });

  return (
    <section className="section">
      <div className="container legal-content">
        <h1>Privacy Policy</h1>
        <p className="text-muted">Last updated: July 1, 2026</p>

        <p>
          This Privacy Policy explains how VisualKit ("VisualKit," "we," "us," or "our") collects, uses, discloses,
          and protects information when a merchant installs and uses the VisualKit app on Shopify (the "Service").
          By installing VisualKit, you agree to the practices described in this policy.
        </p>

        <h2>1. Information we collect</h2>
        <p>When you install and use VisualKit, we collect the following categories of information:</p>
        <ul>
          <li>
            <strong>Shop information:</strong> your Shopify store domain, store name, contact email, plan level, and
            authentication tokens needed to access your store via the Shopify API.
          </li>
          <li>
            <strong>Product catalog data:</strong> product titles, descriptions, variants, and the existing product
            images you select for generation.
          </li>
          <li>
            <strong>Generated media:</strong> the AI-generated images and videos VisualKit produces from your source
            product images, along with metadata about each generation (style selected, timestamp, credit cost).
          </li>
          <li>
            <strong>Billing records:</strong> purchase history for credit packs and subscription plans, processed
            through Shopify's billing APIs. VisualKit does not directly collect or store your payment card details —
            Shopify handles payment processing.
          </li>
          <li>
            <strong>Usage data:</strong> basic app usage and diagnostic logs (e.g. feature usage, error reports) used
            to operate and improve the Service.
          </li>
        </ul>

        <h2>2. How we use your information</h2>
        <p>We use the information above to:</p>
        <ul>
          <li>Generate the product scenes, UGC-style content, and video you request;</li>
          <li>Operate, maintain, and improve the Service;</li>
          <li>Process billing for credit packs and subscriptions;</li>
          <li>Provide customer support and respond to inquiries;</li>
          <li>Detect, prevent, and address fraud, abuse, or violations of our Terms of Service;</li>
          <li>Comply with legal obligations.</li>
        </ul>

        <h2>3. Third-party processors used for content generation</h2>
        <p>
          To generate scenes, UGC content, and video, VisualKit sends your selected product images and related
          prompts to the following third-party AI infrastructure providers, acting as our data processors:
        </p>
        <ul>
          <li>
            <strong>FAL.ai</strong> — image and video generation infrastructure.
          </li>
          <li>
            <strong>OpenAI</strong> — image generation and prompt processing.
          </li>
          <li>
            <strong>Anthropic</strong> — content understanding and generation orchestration.
          </li>
          <li>
            <strong>WaveSpeed</strong> — video generation infrastructure.
          </li>
        </ul>
        <p>
          These providers process product images solely to generate the outputs you request and are contractually
          restricted from using your data to train their own general-purpose models where such controls are
          available to us, and are bound by confidentiality and data protection obligations. We do not sell your
          data to any third party.
        </p>

        <h2>4. Data retention</h2>
        <p>
          Generated media (images and video produced by VisualKit) is retained in our storage for <strong>30 days</strong>{' '}
          from the date of generation, after which it is automatically deleted. We recommend downloading or
          publishing any generated content you want to keep within that window. Shop and billing records are
          retained for as long as your account is active and for a reasonable period afterward to comply with legal,
          accounting, and tax obligations.
        </p>

        <h2>5. Data deletion and your rights</h2>
        <p>
          You may request deletion of your data at any time by uninstalling VisualKit and contacting us at{' '}
          <a href="mailto:privacy@visualkit.app">privacy@visualkit.app</a>. Depending on your jurisdiction, you may
          have rights to access, correct, export, or delete your personal data, and to object to or restrict certain
          processing. We will respond to verified requests in accordance with applicable law.
        </p>
        <p>
          <strong>GDPR mandatory webhooks:</strong> as required by Shopify, VisualKit implements the{' '}
          <code>customers/data_request</code>, <code>customers/redact</code>, and <code>shop/redact</code> webhooks.
          When a shop owner uninstalls VisualKit or a customer data redaction request is received via these
          webhooks, we delete or anonymize the corresponding personal data from our systems within the timeframe
          required by Shopify's Partner Program requirements, except where we are legally required to retain
          specific records (such as billing history for tax purposes).
        </p>

        <h2>6. Data security</h2>
        <p>
          We use industry-standard technical and organizational measures — including encryption in transit,
          access controls, and restricted internal access — to protect the data we hold. No system is completely
          secure, and we cannot guarantee absolute security.
        </p>

        <h2>7. International data transfers</h2>
        <p>
          Our third-party processors may process data in countries other than your own, including the United States.
          Where required, we rely on appropriate safeguards (such as standard contractual clauses) to protect data
          transferred internationally.
        </p>

        <h2>8. Children's privacy</h2>
        <p>
          VisualKit is a business-to-business tool intended for use by Shopify merchants and is not directed at
          children. We do not knowingly collect personal information from children.
        </p>

        <h2>9. Changes to this policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Material changes will be reflected by updating the
          "Last updated" date above. Continued use of VisualKit after changes take effect constitutes acceptance of
          the revised policy.
        </p>

        <h2>10. Contact us</h2>
        <p>
          If you have questions about this Privacy Policy or wish to exercise a data right, contact us at{' '}
          <a href="mailto:privacy@visualkit.app">privacy@visualkit.app</a>.
        </p>
      </div>
    </section>
  );
}
