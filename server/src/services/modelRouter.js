import { removeBackground, generateScene, generateCustomScene } from './fal.js';
import { generateUGC } from './openaiImages.js';
import { generateVideoWithFallback } from './videoGeneration.js';

const COLOR_CRITICAL_CATEGORIES = ['skincare', 'cosmetics', 'makeup', 'beauty'];

export class UnknownContentTypeError extends Error {
  constructor(contentType) {
    super(`Unknown contentType: ${contentType}`);
    this.statusCode = 400;
  }
}

// Pure routing decision (spec Section 8) — no I/O. Given a content type / product category /
// template, decides which model handles the job. Color-critical categories always win for
// static scenes regardless of the template's own preferred model.
//
// Previously routed to 'imagen-4' — removed after live verification showed that endpoint has
// zero image-input parameters (pure text-to-image). It was silently discarding the actual
// product photo for every cosmetics/skincare/makeup/beauty template, generating unrelated
// output instead of an edit of the real product. flux-kontext-max is a genuine image-editing
// model (preserves the input image, including its exact color, by construction) and is already
// the default preferredModel for most scene templates.
export function routeModel({ contentType, productCategoryTag, templateId, templates }) {
  const template = templates[templateId];
  if (!template) throw new Error(`Unknown templateId: ${templateId}`);

  switch (contentType) {
    case 'scene':
      if (COLOR_CRITICAL_CATEGORIES.includes(productCategoryTag?.toLowerCase())) {
        return 'flux-kontext-max';
      }
      return template.preferredModel;
    case 'ugc':
      return 'gpt-image-2';
    case 'video':
      return template.preferredModel;
    default:
      throw new UnknownContentTypeError(contentType);
  }
}

// Runs the full two-step pipeline for one job: background removal (skipped if the caller
// already supplies a clean image — e.g. a video job reusing a prior job's processed product
// shot) followed by the routed model call. This is the single function jobWorker.js invokes
// inside its concurrency-limited slot; it has no knowledge of credits, Firestore, or retries.
export async function executeGeneration({
  contentType,
  productCategoryTag,
  templateId,
  templates,
  sourceImageUrl,
  cleanImageUrl: providedCleanImageUrl,
  promptTemplate,
  productAttributes,
  personaSettings,
  brandStyleProfile,
  motionPrompt,
  aspectRatio,
  numImages,
  onStage,
}) {
  const model = routeModel({ contentType, productCategoryTag, templateId, templates });

  let cleanImageUrl = providedCleanImageUrl;
  if (!cleanImageUrl) {
    onStage?.('removing_background');
    cleanImageUrl = await removeBackground(sourceImageUrl);
  }
  onStage?.('generating');

  switch (contentType) {
    case 'scene': {
      const variationUrls = await generateScene({ model, cleanImageUrl, promptTemplate, productAttributes, brandStyleProfile, numImages });
      return { model, cleanImageUrl, variationUrls };
    }
    case 'ugc': {
      const variationUrls = await generateUGC({ cleanImageUrl, promptTemplate, personaSettings, brandStyleProfile });
      return { model, cleanImageUrl, variationUrls };
    }
    case 'video': {
      const videoUrl = await generateVideoWithFallback({ model, cleanImageUrl, motionPrompt, aspectRatio });
      return { model, cleanImageUrl, variationUrls: [videoUrl] };
    }
    default:
      throw new UnknownContentTypeError(contentType);
  }
}

// Custom-prompt scene generation: the merchant picked an admin-allowed model directly and wrote
// their own prompt, rather than using a template. No routeModel() call — the merchant's model
// choice is used as-is, not overridden by the color-critical-category logic that applies to
// template-driven jobs (they picked this model on purpose). Background removal still runs on
// every selected source image, same two-step pipeline as the template path.
export async function executeCustomGeneration({ model, sourceImageUrls, customPrompt, numImages, onStage }) {
  onStage?.('removing_background');
  const cleanImageUrls = await Promise.all(sourceImageUrls.map((url) => removeBackground(url)));
  onStage?.('generating');
  const variationUrls = await generateCustomScene({ model, cleanImageUrls, prompt: customPrompt, numImages });
  return { model, cleanImageUrls, variationUrls };
}
