import { useDocumentHead } from '../hooks/useDocumentHead.js';

export default function Terms() {
  useDocumentHead({
    title: 'Terms of Service | VisualKit',
    description:
      'The terms governing use of VisualKit, including billing, acceptable use, intellectual property, and liability.',
    path: '/terms',
  });

  return (
    <section className="section">
      <div className="container legal-content">
        <h1>Terms of Service</h1>
        <p className="text-muted">Last updated: July 1, 2026</p>

        <p>
          These Terms of Service ("Terms") govern your access to and use of VisualKit (the "Service"), a Shopify
          application that generates AI product photography, UGC-style content, and video from a merchant's existing
          product catalog images. By installing or using VisualKit, you agree to be bound by these Terms.
        </p>

        <h2>1. Service description</h2>
        <p>
          VisualKit lets merchants generate AI product scenes, on-model UGC-style photos, and short product video
          from images already present in their Shopify product catalog. Generated outputs are made available for
          review, download, and publication back to the merchant's store.
        </p>

        <h2>2. Billing terms</h2>
        <p>VisualKit offers two billing models:</p>
        <ul>
          <li>
            <strong>One-time credit packs</strong> (Starter, Growth, Pro): a single payment grants a fixed number of
            credits that do not expire. Once credits are consumed to generate content, that purchase is{' '}
            <strong>non-refundable</strong>. Unused, unconsumed credits may be eligible for a refund at our
            discretion if requested within a reasonable period of purchase; contact us to request one.
          </li>
          <li>
            <strong>Unlimited subscription</strong>: a recurring monthly charge billed through Shopify's billing
            system that grants unlimited generations for the duration of the billing period. You may cancel at any
            time through your Shopify billing settings; cancellation takes effect at the end of the current billing
            period, and you will retain access to the subscription's benefits until then. We do not provide prorated
            refunds for partial billing periods.
          </li>
        </ul>
        <p>
          All payments are processed through Shopify's billing infrastructure. Prices are listed in USD and are
          subject to change with reasonable notice for future purchases; changes do not affect credits already
          purchased.
        </p>

        <h2>3. Acceptable use</h2>
        <p>You agree not to use VisualKit to:</p>
        <ul>
          <li>
            Generate, attempt to generate, or upload source material intended to produce content depicting minors in
            any context, sexualized or otherwise — this is strictly and permanently prohibited with no exceptions;
          </li>
          <li>Generate sexually explicit, obscene, or non-consensual intimate content;</li>
          <li>Generate content that infringes a third party's intellectual property, publicity, or privacy rights;</li>
          <li>Generate misleading product depictions intended to deceive consumers about the actual product sold;</li>
          <li>Attempt to reverse-engineer, disrupt, or circumvent the security or rate limits of the Service;</li>
          <li>Use the Service in violation of Shopify's Acceptable Use Policy or applicable law.</li>
        </ul>
        <p>
          As stated in our <a href="/faq">FAQ</a>, every AI-generated person produced through VisualKit's UGC content
          is an adult presentation, as a matter of firm platform policy with no exceptions. Violations of this
          section may result in immediate suspension or termination of your account without refund.
        </p>

        <h2>4. Intellectual property</h2>
        <p>
          You retain all rights, title, and interest in the product images and catalog data you upload or connect to
          VisualKit. As between you and VisualKit, you also own the AI-generated outputs (images and video) produced
          from your content through the Service, subject to your compliance with these Terms and full payment for
          the credits used to generate them. VisualKit retains all rights in the underlying Service, software, and
          technology used to provide it.
        </p>

        <h2>5. Third-party AI processing</h2>
        <p>
          Generating content requires sending your product images to third-party AI infrastructure providers as
          described in our <a href="/privacy">Privacy Policy</a>. By using the Service, you consent to this
          processing as necessary to deliver the generated outputs you request.
        </p>

        <h2>6. Disclaimers and limitation of liability</h2>
        <p>
          The Service is provided "as is" and "as available," without warranties of any kind, express or implied,
          including warranties of merchantability, fitness for a particular purpose, or non-infringement. AI-generated
          content may occasionally contain inaccuracies, and you are responsible for reviewing all generated content
          before publishing it to your store or using it in marketing.
        </p>
        <p>
          To the maximum extent permitted by law, VisualKit and its officers, employees, and service providers will
          not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of
          profits or revenue, arising from your use of the Service. Our total aggregate liability for any claim
          arising from these Terms or the Service will not exceed the amount you paid to VisualKit in the twelve
          months preceding the claim.
        </p>

        <h2>7. Termination</h2>
        <p>
          You may stop using VisualKit at any time by uninstalling the app from your Shopify admin. We may suspend or
          terminate your access to the Service if you violate these Terms, misuse the Service, or fail to pay amounts
          owed. Upon termination, your right to use the Service ends immediately; data handling upon termination is
          described in our <a href="/privacy">Privacy Policy</a>.
        </p>

        <h2>8. Changes to these Terms</h2>
        <p>
          We may update these Terms from time to time. Material changes will be reflected by updating the "Last
          updated" date above. Continued use of VisualKit after changes take effect constitutes acceptance of the
          revised Terms.
        </p>

        <h2>9. Contact us</h2>
        <p>
          Questions about these Terms can be sent to <a href="mailto:legal@visualkit.app">legal@visualkit.app</a>.
        </p>
      </div>
    </section>
  );
}
