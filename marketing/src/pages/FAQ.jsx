import { useDocumentHead } from '../hooks/useDocumentHead.js';
import Accordion from '../components/Accordion.jsx';

const faqItems = [
  {
    question: 'Will my product still look exactly like my product?',
    answer: (
      <p>
        Yes. VisualKit uses a two-step pipeline: the first step locks in your product's exact color, logo placement,
        and label text from your original catalog photo, and only the second step applies the creative scene, model,
        or motion. We don't let the creative step redraw your product from scratch, which is what causes the warped
        logos and inaccurate colors you see from generic image generators.
      </p>
    ),
  },
  {
    question: 'Do unused credits expire?',
    answer: (
      <p>
        No. Credits you purchase in a one-time pack (Starter, Growth, or Pro) do not expire. Use them next week or
        next year — they stay on your account until you spend them.
      </p>
    ),
  },
  {
    question: 'What product categories does VisualKit work with?',
    answer: (
      <p>
        VisualKit is built to generalize across most physical product categories, including apparel, skincare,
        cosmetics, jewelry, home goods, footwear, accessories, food and beverage packaging, and electronics. If your
        product has a consistent shape, color, and label in your source photo, VisualKit can typically generate
        accurate scenes, UGC content, and video for it.
      </p>
    ),
  },
  {
    question: 'Are the people shown in AI-generated UGC content real?',
    answer: (
      <p>
        The people you see in VisualKit's UGC-style content are AI-generated, not real customers or hired models.
        As a matter of firm platform policy, every AI-generated person VisualKit produces is an adult presentation —
        with no exceptions. VisualKit does not generate, and will not generate, imagery depicting minors under any
        circumstance.
      </p>
    ),
  },
  {
    question: 'Do I need a photo studio or professional photos to start?',
    answer: (
      <p>
        No. VisualKit is designed to work from the product photos you already have in your Shopify catalog — even
        simple flat-lay or white-background shots taken on a phone. You don't need studio lighting or a professional
        photographer to get started.
      </p>
    ),
  },
  {
    question: 'Can I cancel the Unlimited plan or switch back to credit packs?',
    answer: (
      <p>
        Yes. The Unlimited plan is a standard monthly subscription you can cancel at any time from your Shopify
        billing settings. If you cancel, you can still purchase one-time credit packs whenever you need more content.
      </p>
    ),
  },
  {
    question: 'Where do my product images go during generation?',
    answer: (
      <p>
        Your product images are sent securely to the AI providers VisualKit uses to generate content, and the
        resulting media is stored temporarily so you can review and download it. See our{' '}
        <a href="/privacy">Privacy Policy</a> for the full list of processors and our data retention timelines.
      </p>
    ),
  },
];

export default function FAQ() {
  useDocumentHead({
    title: 'FAQ — VisualKit AI Product Photo & UGC Generator',
    description:
      'Answers to common questions about VisualKit: product accuracy, credit expiration, supported categories, and our adult-only content policy for AI-generated UGC.',
    path: '/faq',
  });

  return (
    <section className="section">
      <div className="container">
        <h1>Frequently asked questions</h1>
        <p className="section-subheading">
          Everything merchants ask us before installing VisualKit. Can't find your answer? Reach out at{' '}
          <a href="mailto:support@visualkit.app">support@visualkit.app</a>.
        </p>
        <Accordion items={faqItems} />
      </div>
    </section>
  );
}
