// Populates the `templates` Firestore collection (spec Section 7). Nothing in the product spec
// covers seeding this data, but every generation job reads its model/cost/prompt from a
// template record, so the app is unusable without it. Safe to re-run — upsert, not insert.
import { templatesRepo } from '../src/models/templatesRepo.js';

const SCENE_TEMPLATES = [
  { id: 'studio-white', name: 'Clean White Studio', preferredModel: 'flux-kontext-max', creditCost: 4, promptTemplate: 'Clean seamless white studio background, soft even lighting, professional product photography.' },
  { id: 'marble-surface', name: 'Marble Surface', preferredModel: 'flux-kontext-max', creditCost: 4, promptTemplate: 'Product resting on a polished marble surface, soft natural light, subtle reflections.' },
  { id: 'wood-surface', name: 'Wood Grain Surface', preferredModel: 'flux-kontext-max', creditCost: 4, promptTemplate: 'Product resting on a warm wood grain surface, cozy natural lighting.' },
  { id: 'outdoor-daylight', name: 'Outdoor Natural Light', preferredModel: 'flux-kontext-max', creditCost: 4, promptTemplate: 'Product photographed outdoors in soft natural daylight, blurred greenery background.' },
  { id: 'gradient-soft', name: 'Soft Gradient Backdrop', preferredModel: 'flux-kontext-pro', creditCost: 3, promptTemplate: 'Product on a soft pastel gradient studio backdrop, minimal shadow, modern e-commerce look.' },
  { id: 'shadow-minimal', name: 'Minimalist Shadow Studio', preferredModel: 'flux-kontext-pro', creditCost: 3, promptTemplate: 'Minimalist studio scene with a single dramatic hard shadow, high-contrast lighting.' },
  { id: 'flatlay-topdown', name: 'Flat Lay Top-Down', preferredModel: 'flux-kontext-max', creditCost: 4, promptTemplate: 'Top-down flat lay composition, product centered, styled with complementary props.' },
  { id: 'fabric-texture', name: 'Textured Fabric Backdrop', preferredModel: 'flux-kontext-max', creditCost: 4, promptTemplate: 'Product on a textured linen fabric backdrop, soft directional light.' },
  { id: 'seasonal-holiday', name: 'Seasonal — Holiday', preferredModel: 'flux-kontext-max', creditCost: 4, promptTemplate: 'Product styled in a warm seasonal holiday scene with tasteful festive accents.' },
  { id: 'color-critical-studio', name: 'Color-Accurate Studio (cosmetics/skincare)', preferredModel: 'flux-kontext-max', creditCost: 4, promptTemplate: 'Color-accurate studio product shot, neutral white background, true-to-life color rendering.' },
].map((t) => ({ ...t, category: 'scene' }));

const UGC_TEMPLATES = [
  { id: 'ugc-home-casual', name: 'Casual Home Setting', setting: 'indoor lifestyle', promptTemplate: 'Holding the product in a bright, casual home interior, natural candid pose.' },
  { id: 'ugc-outdoor-lifestyle', name: 'Outdoor Lifestyle', setting: 'park/street', promptTemplate: 'Using the product outdoors in a park or street setting, natural daylight, lifestyle photography.' },
  { id: 'ugc-studio-portrait', name: 'Studio Portrait Hold', setting: 'studio backdrop', promptTemplate: 'Studio portrait holding the product, clean backdrop, soft beauty lighting.' },
  { id: 'ugc-social-story', name: 'Social Story Framing (vertical crop)', setting: 'mixed', promptTemplate: 'Vertical social-story framed shot of the product being used, casual and authentic feel.' },
].map((t) => ({ ...t, category: 'ugc', preferredModel: 'gpt-image-2', creditCost: 5 }));

const VIDEO_TEMPLATES = [
  { id: 'video-slow-rotate', name: 'Slow 360° Rotate', preferredModel: 'seedance-fast', creditCost: 8, promptTemplate: 'Slow, smooth 360-degree rotation of the product against a clean background.' },
  { id: 'video-zoom-reveal', name: 'Zoom-In Reveal', preferredModel: 'seedance-fast', creditCost: 8, promptTemplate: 'Cinematic zoom-in reveal of the product from a wide establishing shot.' },
  { id: 'video-cinematic-pan', name: 'Cinematic Pan (premium)', preferredModel: 'kling-3', creditCost: 15, promptTemplate: 'Cinematic camera pan across the product with premium lighting and shallow depth of field.' },
  { id: 'video-ambient-motion', name: 'Subtle Ambient Motion (premium)', preferredModel: 'kling-3', creditCost: 15, promptTemplate: 'Subtle ambient motion — gentle lighting shifts and soft particle drift around the product.' },
  { id: 'video-style-transfer', name: 'Restyle Existing Footage', preferredModel: 'wan-2.7', creditCost: 10, promptTemplate: 'Restyle the existing footage with a polished, cinematic product-video look.' },
].map((t) => ({ ...t, category: 'video' }));

async function main() {
  const all = [...SCENE_TEMPLATES, ...UGC_TEMPLATES, ...VIDEO_TEMPLATES];
  for (const { id, ...data } of all) {
    await templatesRepo.upsert(id, { ...data, thumbnailUrl: null });
    // eslint-disable-next-line no-console
    console.log(`Seeded template: ${id}`);
  }
  // eslint-disable-next-line no-console
  console.log(`Done — seeded ${all.length} templates.`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to seed templates:', error);
  process.exit(1);
});
