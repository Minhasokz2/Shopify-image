import { removeBackground, generateScene } from './fal.js';
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
export function routeModel({ contentType, productCategoryTag, templateId, templates }) {
  const template = templates[templateId];
  if (!template) throw new Error(`Unknown templateId: ${templateId}`);

  switch (contentType) {
    case 'scene':
      if (COLOR_CRITICAL_CATEGORIES.includes(productCategoryTag?.toLowerCase())) {
        return 'imagen-4';
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
}) {
  const model = routeModel({ contentType, productCategoryTag, templateId, templates });
  const cleanImageUrl = providedCleanImageUrl ?? (await removeBackground(sourceImageUrl));

  switch (contentType) {
    case 'scene': {
      const variationUrls = await generateScene({ model, cleanImageUrl, promptTemplate, productAttributes, brandStyleProfile });
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
