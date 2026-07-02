import { useState } from 'react';
import { Modal, FormLayout, TextField, Select, Checkbox, Banner, Box, BlockStack, InlineStack, Text, Badge } from '@shopify/polaris';

// Must match server/src/routes/admin/models.js's KNOWN_SCENE_MODELS exactly — the server is the
// source of truth and will 400 on a mismatch. Every one of these was verified live against
// fal.ai's real schema (get_model_schema) to have a genuine image-input parameter before being
// added — Imagen 4 was evaluated and rejected here for having none (pure text-to-image, it
// silently ignores any product photo you send it).
const FAL_MODEL_OPTIONS = [
  { value: 'flux-kontext-max', label: 'FLUX Kontext Max — best editing fidelity, single or multi-image' },
  { value: 'flux-kontext-pro', label: 'FLUX Kontext Pro — faster/cheaper FLUX tier, single or multi-image' },
  { value: 'seedream-v4-edit', label: 'Seedream V4 Edit — cheapest multi-image editor (up to 10 refs)' },
  { value: 'nano-banana', label: 'Nano Banana (Gemini 2.5 Flash Image) — balanced quality/cost, multi-image' },
  { value: 'nano-banana-pro', label: 'Nano Banana Pro — premium/4K tier, multi-image' },
  // --- Extended catalog (AI feature registry) — see server/src/services/fal.js's
  // EXTENDED_ALLOWED_MODELS doc comment for the full request-shape rationale. Several of these
  // have real limitations flagged directly in the label so an admin doesn't have to open
  // ModelParameters to find out before assigning a price.
  { value: 'bria-remove-background', label: 'Bria Background Remove — single image, no prompt used' },
  { value: 'birefnet', label: 'BiRefNet Background Remove — single image, no prompt used' },
  { value: 'bria-extract-object', label: 'Bria Extract Object — prompt names the object to cut out' },
  { value: 'rembg', label: 'Rembg Background Remove (budget) — single image, no prompt used' },
  { value: 'gemini-3-1-flash-retouch', label: 'Gemini 3.1 Flash Image (retouch/enhance) — multi-image' },
  { value: 'topaz-upscale', label: 'Topaz Upscale — single image, no prompt used' },
  { value: 'seedvr-upscale', label: 'SeedVR2 Upscale (budget) — single image, no prompt used' },
  { value: 'fashn-tryon', label: 'FASHN Virtual Try-On — requires EXACTLY 2 images (person, then garment); driven by its own Virtual Try-On page, not the custom-prompt studio' },
  { value: 'qwen-multi-angle', label: 'Qwen Multi-Angle Shots — fixed default camera angle (no angle control yet)' },
];

// Only models that genuinely combine more than one merchant-selected image into one generation.
// Text-only models (banner/brand-asset) and single-image models (background removal, upscale)
// are NOT multi-image capable even though they're valid model choices — see fal.js's
// EXTENDED_ALLOWED_MODELS `supportsMultiImage` field, mirrored here.
const MULTI_IMAGE_CAPABLE = new Set([
  'flux-kontext-max',
  'flux-kontext-pro',
  'seedream-v4-edit',
  'nano-banana',
  'nano-banana-pro',
  'gemini-3-1-flash-retouch',
  'fashn-tryon', // exactly 2, not "as many as you like" — see helpText below
  'qwen-multi-angle',
]);

// Real per-image USD cost, verified live via fal.ai's pricing API (mcp__fal-ai__get_pricing) —
// not estimated. Used only for the margin calculator below; never sent to the server. Costs
// billed per-megapixel or per-compute-second are converted to an approximate per-image figure
// (assuming a ~1 megapixel output / a few seconds of compute) — flagged as approximate in the
// margin calculator itself, not a guarantee.
const REAL_COST_PER_IMAGE_USD = {
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
  'topaz-upscale': 0.04,
  'seedvr-upscale': 0.004,
  'fashn-tryon': 0.075,
  'qwen-multi-angle': 0.035,
};

// True for costs converted from a per-megapixel/per-compute-second unit rather than fal's own
// stated per-image/per-generation price — shown as "~" in the margin calculator.
const APPROXIMATE_COST_MODELS = new Set(['birefnet', 'rembg', 'topaz-upscale', 'seedvr-upscale', 'qwen-multi-angle']);

// Real input schema for each FAL endpoint, verified live via mcp__fal-ai__get_model_schema —
// not guessed. Purely informational (the pipeline always sends fixed defaults: prompt, the
// merchant's image(s), and num_images — see services/fal.js's generateCustomScene), but the
// admin should be able to see exactly what each underlying model is actually capable of before
// deciding which to expose and at what price, rather than treating them as an opaque dropdown.
const MODEL_PARAMETERS = {
  'flux-kontext-max': {
    endpoint: 'fal-ai/flux-pro/kontext/max',
    imageInput: 'image_url (single) — a dedicated /multi endpoint handles more than one reference image',
    params: [
      'aspect_ratio (string, optional)',
      'output_format: jpeg | png (default jpeg)',
      'guidance_scale (number, default 3.5)',
      'safety_tolerance: 1–6 (default 2, strictest)',
      'seed (integer, optional — reproducible outputs)',
    ],
  },
  'flux-kontext-pro': {
    endpoint: 'fal-ai/flux-pro/kontext',
    imageInput: 'image_url (single) — a dedicated /multi endpoint handles more than one reference image',
    params: [
      'aspect_ratio (string, optional)',
      'output_format: jpeg | png (default jpeg)',
      'guidance_scale (number, default 3.5)',
      'safety_tolerance: 1–6 (default 2, strictest)',
      'seed (integer, optional — reproducible outputs)',
    ],
  },
  'seedream-v4-edit': {
    endpoint: 'fal-ai/bytedance/seedream/v4/edit',
    imageInput: 'image_urls (array, always) — up to 10 reference images in one request',
    params: [
      'image_size (object or preset, default 2048x2048)',
      'max_images (default 1) — can return multiple variants per generation',
      'enhance_prompt_mode: standard | fast',
      'enable_safety_checker (default true)',
      'seed (integer, optional — reproducible outputs)',
    ],
  },
  'nano-banana': {
    endpoint: 'fal-ai/gemini-25-flash-image/edit',
    imageInput: 'image_urls (array, always)',
    params: [
      'aspect_ratio (default auto)',
      'output_format: jpeg | png | webp (default png)',
      'safety_tolerance: 1–6 (default 4, more permissive than FLUX)',
      'seed (integer, optional — reproducible outputs)',
    ],
  },
  'nano-banana-pro': {
    endpoint: 'fal-ai/nano-banana-pro/edit',
    imageInput: 'image_urls (array, always)',
    params: [
      'resolution: 1K | 2K | 4K (default 1K) — driver of this model’s higher cost',
      'aspect_ratio (default auto)',
      'output_format: jpeg | png | webp (default png)',
      'safety_tolerance: 1–6 (default 4)',
      'enable_web_search (default false) — lets the model ground generation in current web info',
      'seed (integer, optional — reproducible outputs)',
    ],
  },
  'bria-remove-background': {
    endpoint: 'fal-ai/bria/background/remove',
    imageInput: 'image_url (single). No prompt/num_images — merchant\'s prompt text is not used.',
    params: ['sync_mode (default false)'],
  },
  birefnet: {
    endpoint: 'fal-ai/birefnet',
    imageInput: 'image_url (single). No prompt/num_images.',
    params: ['Same model already used internally for the template flow\'s background-removal step.'],
  },
  'bria-extract-object': {
    endpoint: 'bria/extract-object',
    imageInput: 'image_url (single) + the merchant\'s prompt names the object to isolate (e.g. "the red shoe").',
    params: [
      'remove_background (default false) — refines the cutout edge with an extra background-removal pass',
      'autocrop (default false) — tightens the output canvas to the extracted object',
    ],
  },
  rembg: {
    endpoint: 'fal-ai/imageutils/rembg',
    imageInput: 'image_url (single). No prompt/num_images.',
    params: ['crop_to_bbox (default false)'],
  },
  'gemini-3-1-flash-retouch': {
    endpoint: 'fal-ai/gemini-3.1-flash-image-preview/edit',
    imageInput: 'image_urls (array, always) — Google\'s newer "Nano Banana 2" model.',
    params: [
      'resolution: 0.5K | 1K | 2K | 4K (default 1K)',
      'aspect_ratio (default auto)',
      'safety_tolerance: 1–6 (default 4)',
      'seed (integer, optional)',
    ],
  },
  'topaz-upscale': {
    endpoint: 'fal-ai/topaz/upscale/image',
    imageInput: 'image_url (single). No prompt/num_images.',
    params: ['upscale_factor (default 2)', 'model: Standard V2 | CGI | Wonder | Redefine | … (default Standard V2)', 'face_enhancement (default true)'],
  },
  'seedvr-upscale': {
    endpoint: 'fal-ai/seedvr/upscale/image',
    imageInput: 'image_url (single). No prompt/num_images.',
    params: ['upscale_factor (default 2) or target_resolution: 720p | 1080p | 1440p | 2160p'],
  },
  'fashn-tryon': {
    endpoint: 'fal-ai/fashn/tryon/v1.6',
    imageInput: 'REQUIRES EXACTLY 2 images, in order: the person/model photo first, the garment photo second. Merchants use the dedicated Virtual Try-On page (web/src/pages/VirtualTryOn.jsx) to supply these, not the generic custom-prompt studio.',
    params: ['category: tops | bottoms | one-pieces | auto (default auto)', 'mode: performance | balanced | quality (default balanced)'],
  },
  'qwen-multi-angle': {
    endpoint: 'fal-ai/qwen-image-edit-2511-multiple-angles',
    imageInput: 'image_urls (array, always). Camera angle stays at this model\'s defaults (front view, eye-level, medium shot) — there\'s no angle-slider UI yet.',
    params: ['horizontal_angle / vertical_angle / zoom (all fixed at defaults — not exposed in the merchant UI yet)'],
  },
};

function ModelParameters({ falModel }) {
  const info = MODEL_PARAMETERS[falModel];
  if (!info) return null;

  return (
    <Box padding="300" background="bg-surface-secondary" borderRadius="200">
      <BlockStack gap="150">
        <Text as="h3" fontWeight="medium">
          Model parameters (from fal.ai's live schema)
        </Text>
        <Text as="span" variant="bodySm" tone="subdued">
          {info.endpoint}
        </Text>
        <Text as="span" variant="bodySm">
          Image input: {info.imageInput}
        </Text>
        <BlockStack gap="050">
          {info.params.map((param) => (
            <Text as="span" variant="bodySm" key={param}>
              • {param}
            </Text>
          ))}
        </BlockStack>
        <Text as="span" variant="bodySm" tone="subdued">
          These are the model's real capabilities — every parameter not explicitly built into this
          model's request shape (see "Image input" above) uses fal.ai's own default.
        </Text>
      </BlockStack>
    </Box>
  );
}

// Revenue per credit, derived from the actual credit packs in server/src/services/billing.js:
// Starter $9/50cr, Growth $29/200cr, Pro $69/600cr. Bulk packs pay merchants less per credit, so
// the low end of this range (Pro pack) is the conservative number to check margin against — if a
// model is still profitable there, it's profitable on every pack.
const REVENUE_PER_CREDIT_USD = { low: 69 / 600, high: 9 / 50 };

const EMPTY_MODEL = {
  id: '',
  label: '',
  category: 'scene',
  falModel: FAL_MODEL_OPTIONS[0].value,
  creditCost: '1',
  supportsMultiImage: true,
  active: true,
};

function MarginCalculator({ falModel, creditCost }) {
  const realCost = REAL_COST_PER_IMAGE_USD[falModel];
  const credits = Number(creditCost);
  if (!realCost || !credits || credits <= 0) return null;

  const revenueLow = credits * REVENUE_PER_CREDIT_USD.low;
  const revenueHigh = credits * REVENUE_PER_CREDIT_USD.high;
  const marginLow = revenueLow - realCost;
  const marginHigh = revenueHigh - realCost;
  const marginPctLow = Math.round((marginLow / revenueLow) * 100);
  const isProfitableAtWorstCase = marginLow > 0;

  return (
    <Box padding="300" background="bg-surface-secondary" borderRadius="200">
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h3" fontWeight="medium">
            Margin calculator (per image)
          </Text>
          <Badge tone={isProfitableAtWorstCase ? 'success' : 'critical'}>
            {isProfitableAtWorstCase ? 'Profitable' : 'Loses money'} on bulk packs
          </Badge>
        </InlineStack>
        <InlineStack gap="400" wrap>
          <Text as="span" variant="bodySm">
            {APPROXIMATE_COST_MODELS.has(falModel) ? 'Approx. FAL cost' : 'Real FAL cost'}: <strong>${realCost.toFixed(4)}</strong>
          </Text>
          <Text as="span" variant="bodySm">
            Merchant revenue at {credits} credit{credits === 1 ? '' : 's'}: <strong>${revenueLow.toFixed(3)}–${revenueHigh.toFixed(3)}</strong>
          </Text>
          <Text as="span" variant="bodySm" tone={isProfitableAtWorstCase ? undefined : 'critical'}>
            Margin: <strong>${marginLow.toFixed(3)}–${marginHigh.toFixed(3)}</strong> ({marginPctLow}%–
            {Math.round((marginHigh / revenueHigh) * 100)}% on the Pro/bulk pack rate)
          </Text>
        </InlineStack>
        <Text as="span" variant="bodySm" tone="subdued">
          Revenue range reflects the Starter ($9/50 credits = $0.18/credit) through Pro ($69/600 credits =
          $0.115/credit) packs — the low end is the conservative number to check profitability against.
        </Text>
        {APPROXIMATE_COST_MODELS.has(falModel) ? (
          <Text as="span" variant="bodySm" tone="subdued">
            fal.ai bills this model per-megapixel or per-compute-second rather than per-image — the figure above
            assumes a typical ~1 megapixel output / a few seconds of compute, so treat it as an estimate.
          </Text>
        ) : null}
      </BlockStack>
    </Box>
  );
}

export function ModelForm({ model, onSubmit, onClose, submitting, error }) {
  const isEditing = Boolean(model);
  const [form, setForm] = useState(() =>
    model ? { ...EMPTY_MODEL, ...model, creditCost: String(model.creditCost) } : EMPTY_MODEL,
  );

  const updateField = (field) => (value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'falModel' && !MULTI_IMAGE_CAPABLE.has(value)) {
        next.supportsMultiImage = false;
      }
      return next;
    });
  };

  const handleSubmit = () => {
    onSubmit({
      ...(isEditing ? {} : { id: form.id.trim() }),
      label: form.label.trim(),
      category: form.category,
      falModel: form.falModel,
      creditCost: Number(form.creditCost),
      supportsMultiImage: form.supportsMultiImage,
      active: form.active,
    });
  };

  const isValid =
    (isEditing || /^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.id.trim())) &&
    form.label.trim().length > 0 &&
    Number(form.creditCost) > 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={isEditing ? `Edit "${model.id}"` : 'New allowed model'}
      primaryAction={{
        content: isEditing ? 'Save changes' : 'Create model',
        onAction: handleSubmit,
        loading: submitting,
        disabled: !isValid,
      }}
      secondaryActions={[{ content: 'Cancel', onAction: onClose }]}
    >
      <Modal.Section>
        <FormLayout>
          {error ? (
            <Banner tone="critical" title="Couldn't save">
              <p>{error}</p>
            </Banner>
          ) : null}

          {!isEditing ? (
            <TextField
              label="Model ID"
              helpText="Lowercase letters, numbers, and hyphens only — e.g. flux-kontext-max. Referenced directly by merchants' custom-prompt jobs, so it can't be changed later."
              value={form.id}
              onChange={updateField('id')}
              autoComplete="off"
            />
          ) : null}

          <TextField
            label="Display label"
            helpText='Shown to merchants in the model picker, e.g. "FLUX Kontext Max".'
            value={form.label}
            onChange={updateField('label')}
            autoComplete="off"
          />

          <Select
            label="FAL model"
            options={FAL_MODEL_OPTIONS}
            value={form.falModel}
            onChange={updateField('falModel')}
            helpText="Every option here was verified against fal.ai's real schema — check ModelParameters below for each model's exact image-input requirements before assigning it to a feature."
          />

          <ModelParameters falModel={form.falModel} />

          <TextField
            label="Credit cost per image"
            helpText="Charged per generated image, not per job — a merchant generating 3 images pays 3x this."
            type="number"
            min={1}
            value={form.creditCost}
            onChange={updateField('creditCost')}
            autoComplete="off"
          />

          <MarginCalculator falModel={form.falModel} creditCost={form.creditCost} />

          <Checkbox
            label="Supports multi-image reference"
            helpText="Lets merchants select more than one product image to combine into a single custom generation."
            checked={form.supportsMultiImage}
            onChange={updateField('supportsMultiImage')}
            disabled={!MULTI_IMAGE_CAPABLE.has(form.falModel)}
          />

          <Checkbox
            label="Active"
            helpText="Inactive models are hidden from merchants immediately but stay in this list for reference."
            checked={form.active}
            onChange={updateField('active')}
          />
        </FormLayout>
      </Modal.Section>
    </Modal>
  );
}
