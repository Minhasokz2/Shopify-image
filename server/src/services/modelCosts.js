// Real per-image USD cost for every Allowed Model, verified live via fal.ai's pricing API
// (mcp__fal-ai__get_pricing) — not estimated. Costs billed per-megapixel or per-compute-second
// are converted to an approximate per-image figure (assuming a ~1 megapixel output / a few
// seconds of compute), same as flagged in admin/src/components/ModelForm.jsx's margin
// calculator.
//
// This MUST be kept in sync with admin/src/components/ModelForm.jsx's REAL_COST_PER_IMAGE_USD —
// there is currently no shared package between the admin and server workspaces, so this is a
// deliberate duplication (same pattern as fal.js's TEMPLATE_MODEL_IDS needing to match
// TemplateForm.jsx's MODELS_BY_CATEGORY). Used by creditPricing.js to compute the guaranteed-
// margin price floor for custom credit purchases — server-side, since that's a real money
// calculation the client must never be trusted to compute itself.
export const REAL_COST_PER_IMAGE_USD = {
  'flux-kontext-max': 0.08,
  'flux-kontext-pro': 0.04,
  'seedream-v4-edit': 0.03,
  'nano-banana': 0.0398,
  'nano-banana-pro': 0.15,
  'bria-remove-background': 0.018,
  birefnet: 0.0025,
  'bria-extract-object': 0.02,
  rembg: 0.003,
  'gemini-3-1-flash-retouch': 0.08,
  'gpt-image-2-banner': 1.0,
  'ideogram-v4-banner': 0.01,
  'topaz-upscale': 0.04,
  'seedvr-upscale': 0.004,
  'fashn-tryon': 0.075,
  'qwen-multi-angle': 0.035,
  // Text-to-image models (fal.js's TEXT_TO_IMAGE_MODELS) — no source image, verified pricing via
  // get_pricing, not estimated.
  'ideogram-v4-text': 0.01,
  'imagen4-preview': 0.04,
  'flux-schnell': 0.0024, // $0.003/megapixel at the model's default 1024x768 output
  'recraft-v3-text': 0.08, // worst-cased at the vector-style rate (2x the $0.04 raster rate)
};
