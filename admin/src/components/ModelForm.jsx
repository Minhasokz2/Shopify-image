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
];

// All 5 catalog models support multi-image reference structurally (FLUX via a dedicated
// /multi endpoint, the others because their schema always takes an image array) — this flag is
// still admin-editable in case a model should be advertised as single-image-only for UX reasons.
const MULTI_IMAGE_CAPABLE = new Set(FAL_MODEL_OPTIONS.map((o) => o.value));

// Real per-image USD cost, verified live via fal.ai's pricing API (mcp__fal-ai__get_pricing) —
// not estimated. Used only for the margin calculator below; never sent to the server.
const REAL_COST_PER_IMAGE_USD = {
  'flux-kontext-max': 0.08,
  'flux-kontext-pro': 0.04,
  'seedream-v4-edit': 0.03,
  'nano-banana': 0.0398,
  'nano-banana-pro': 0.15,
};

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
          These are the model's real capabilities — the generation pipeline currently only sends
          prompt, your reference image(s), and the merchant's chosen image count, all other
          parameters use fal.ai's defaults above.
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
            Real FAL cost: <strong>${realCost.toFixed(4)}</strong>
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
            helpText="Scene models only — custom-prompt generation currently supports static product scenes. Every option here is verified to accept a reference image; models without one (like Imagen 4) are intentionally excluded."
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
