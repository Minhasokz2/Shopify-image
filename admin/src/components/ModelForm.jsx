import { useState } from 'react';
import { Modal, FormLayout, TextField, Select, Checkbox, Banner } from '@shopify/polaris';

// Must match server/src/routes/admin/models.js's KNOWN_SCENE_MODELS exactly — the server is the
// source of truth and will 400 on a mismatch.
const KNOWN_SCENE_MODELS = ['flux-kontext-max', 'flux-kontext-pro', 'imagen-4'];
const MULTI_IMAGE_CAPABLE = new Set(['flux-kontext-max', 'flux-kontext-pro']);

const FAL_MODEL_OPTIONS = KNOWN_SCENE_MODELS.map((value) => ({ label: value, value }));

const EMPTY_MODEL = {
  id: '',
  label: '',
  category: 'scene',
  falModel: KNOWN_SCENE_MODELS[0],
  creditCost: '4',
  supportsMultiImage: false,
  active: true,
};

export function ModelForm({ model, onSubmit, onClose, submitting, error }) {
  const isEditing = Boolean(model);
  const [form, setForm] = useState(() =>
    model ? { ...EMPTY_MODEL, ...model, creditCost: String(model.creditCost) } : EMPTY_MODEL,
  );

  const updateField = (field) => (value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // A model that doesn't support multi-image reference at all can't have the flag left on.
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
            helpText="Scene models only — custom-prompt generation currently supports static product scenes."
          />

          <TextField
            label="Credit cost"
            type="number"
            min={1}
            value={form.creditCost}
            onChange={updateField('creditCost')}
            autoComplete="off"
          />

          <Checkbox
            label="Supports multi-image reference"
            helpText="Lets merchants select more than one product image to combine into a single custom generation. Only enable for models with a verified multi-image endpoint."
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
