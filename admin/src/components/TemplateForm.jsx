import { useState } from 'react';
import { Modal, FormLayout, TextField, Select, Banner } from '@shopify/polaris';

// Must match server/src/services/fal.js's TEMPLATE_MODEL_IDS exactly — the server will 400 on a
// mismatch, this is just so the form only offers valid choices instead of letting the admin
// discover the constraint from an error message.
//
// Scene = the original 5 (multi-image edit models) + 8 of the 15 extended AI-feature models whose
// request shape fits a template (always exactly one image, always a fixed batch of 4). The other
// 7 extended models are Allowed-Models-only, NOT offered here, on purpose:
//   - 5 text-only models (banner/brand-asset) would make EVERY job on a template using them
//     silently ignore the product photo — the Imagen 4 failure mode, at the template level.
//   - Virtual Try-On needs 2 distinct image roles; a template only has one image slot.
//   - The eraser model needs a mask this app's UI can't create.
// 'imagen-4' is deliberately excluded too — pure text-to-image, same reasoning as above.
const MODELS_BY_CATEGORY = {
  scene: [
    'flux-kontext-max',
    'flux-kontext-pro',
    'seedream-v4-edit',
    'nano-banana',
    'nano-banana-pro',
    'bria-remove-background',
    'birefnet',
    'bria-extract-object',
    'rembg',
    'gemini-3-1-flash-retouch',
    'topaz-upscale',
    'seedvr-upscale',
    'qwen-multi-angle',
  ],
  ugc: ['gpt-image-2'],
  video: ['seedance-fast', 'kling-3', 'wan-2.7'],
};

const CATEGORY_OPTIONS = [
  { label: 'Scene', value: 'scene' },
  { label: 'UGC', value: 'ugc' },
  { label: 'Video', value: 'video' },
];

const EMPTY_TEMPLATE = {
  id: '',
  name: '',
  category: 'scene',
  promptTemplate: '',
  preferredModel: MODELS_BY_CATEGORY.scene[0],
  creditCost: '4',
  thumbnailUrl: '',
  setting: '',
};

export function TemplateForm({ template, onSubmit, onClose, submitting, error }) {
  const isEditing = Boolean(template);
  const [form, setForm] = useState(() =>
    template
      ? { ...EMPTY_TEMPLATE, ...template, creditCost: String(template.creditCost), thumbnailUrl: template.thumbnailUrl ?? '', setting: template.setting ?? '' }
      : EMPTY_TEMPLATE,
  );

  const modelOptions = MODELS_BY_CATEGORY[form.category].map((value) => ({ label: value, value }));

  const updateField = (field) => (value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Changing category can invalidate the previously-selected model — snap to the first
      // valid option for the new category rather than submitting a stale, now-illegal pairing.
      if (field === 'category' && !MODELS_BY_CATEGORY[value].includes(prev.preferredModel)) {
        next.preferredModel = MODELS_BY_CATEGORY[value][0];
      }
      return next;
    });
  };

  const handleSubmit = () => {
    onSubmit({
      ...(isEditing ? {} : { id: form.id.trim() }),
      name: form.name.trim(),
      category: form.category,
      promptTemplate: form.promptTemplate.trim(),
      preferredModel: form.preferredModel,
      creditCost: Number(form.creditCost),
      thumbnailUrl: form.thumbnailUrl.trim() || null,
      ...(form.category === 'ugc' ? { setting: form.setting.trim() } : {}),
    });
  };

  const isValid =
    (isEditing || /^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.id.trim())) &&
    form.name.trim().length > 0 &&
    form.promptTemplate.trim().length > 0 &&
    Number(form.creditCost) > 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={isEditing ? `Edit "${template.id}"` : 'New template'}
      primaryAction={{ content: isEditing ? 'Save changes' : 'Create template', onAction: handleSubmit, loading: submitting, disabled: !isValid }}
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
              label="Template ID"
              helpText="Lowercase letters, numbers, and hyphens only — e.g. studio-white. This becomes the id merchants' jobs reference, so it can't be changed later."
              value={form.id}
              onChange={updateField('id')}
              autoComplete="off"
            />
          ) : null}

          <TextField label="Display name" value={form.name} onChange={updateField('name')} autoComplete="off" />

          <Select label="Category" options={CATEGORY_OPTIONS} value={form.category} onChange={updateField('category')} />

          <TextField
            label="Prompt"
            helpText="The prompt sent to the model, in addition to the product-fidelity lock rules the pipeline always adds automatically."
            value={form.promptTemplate}
            onChange={updateField('promptTemplate')}
            multiline={4}
            autoComplete="off"
          />

          <Select
            label="Model"
            options={modelOptions}
            value={form.preferredModel}
            onChange={updateField('preferredModel')}
            helpText={
              form.category === 'scene'
                ? 'Ignored for skincare/cosmetics/makeup/beauty products — those always route to FLUX Kontext Max for color accuracy, regardless of this setting.'
                : undefined
            }
          />

          <TextField
            label="Credit cost"
            type="number"
            min={1}
            value={form.creditCost}
            onChange={updateField('creditCost')}
            autoComplete="off"
          />

          {form.category === 'ugc' ? (
            <TextField
              label="Setting"
              helpText='Shown to merchants as a hint, e.g. "indoor lifestyle" or "studio backdrop".'
              value={form.setting}
              onChange={updateField('setting')}
              autoComplete="off"
            />
          ) : null}

          <TextField
            label="Thumbnail URL (optional)"
            value={form.thumbnailUrl}
            onChange={updateField('thumbnailUrl')}
            autoComplete="off"
          />
        </FormLayout>
      </Modal.Section>
    </Modal>
  );
}
