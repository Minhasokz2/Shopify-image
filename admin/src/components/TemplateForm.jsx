import { useEffect, useState } from 'react';
import { Modal, FormLayout, TextField, Select, Banner, DropZone, Thumbnail, InlineStack, Button, Spinner } from '@shopify/polaris';
import { adminClient } from '../api/adminClient.js';

// Must match server/src/services/fal.js's TEMPLATE_MODEL_IDS — the server will 400 on a mismatch.
// This is the WIDER, code-level list of every model whose request shape fits a template (always
// exactly one image, always a fixed batch of 4); the component below further narrows the 'scene'
// options at render time to whichever of these are actually active Allowed Models, since that's
// the real-world set an admin has priced and vetted for merchant use — see modelIdsForCategory.
//
// Scene = the original 5 (multi-image edit models) + 10 of the 11 extended AI-feature models
// whose request shape fits a template. The 11th extended model — Virtual Try-On — is
// Allowed-Models-only, NOT offered here: it needs 2 distinct image roles (person + garment), and
// a template only has one image slot. It's driven instead by its own dedicated page
// (web/src/pages/VirtualTryOn.jsx). 'imagen-4' is deliberately excluded too — pure text-to-image,
// the same failure mode that got the brand-asset LoRA models removed from the catalog entirely
// (GPT Image 2 and Ideogram V4 below use their genuinely image-aware edit endpoints, not the
// text-only originals).
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
    'gpt-image-2-banner',
    'ideogram-v4-banner',
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

  // Allowed Models (admin-curated: active + priced) is the narrower, real-world source of truth
  // for what merchants can actually use — MODELS_BY_CATEGORY.scene above is just the wider
  // code-level "shape fits a template" boundary. Null means "don't narrow yet" (either still
  // loading, or the fetch failed) — falls back to the full code-level list rather than an empty
  // Set, since an empty Set combined with the filter below would silently collapse the dropdown
  // to just the one currently-selected model on any transient fetch error, with no indication
  // anything went wrong.
  const [allowedSceneModelIds, setAllowedSceneModelIds] = useState(null);
  const [allowedModelsLoadError, setAllowedModelsLoadError] = useState(null);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [thumbnailUploadError, setThumbnailUploadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    adminClient
      .get('/models')
      .then(({ models }) => {
        if (cancelled) return;
        setAllowedSceneModelIds(new Set(models.filter((m) => m.category === 'scene' && m.active).map((m) => m.falModel)));
      })
      .catch((err) => {
        if (cancelled) return;
        setAllowedModelsLoadError(err.message || 'Failed to load Allowed Models.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Never drops the currently-selected model from the list, even if it's since been deactivated
  // in Allowed Models — an admin editing an existing template shouldn't have its model silently
  // vanish out from under them; they can still see and knowingly change it.
  const modelIdsForCategory = (category, currentPreferredModel) => {
    const codeLevelIds = MODELS_BY_CATEGORY[category];
    if (category !== 'scene' || allowedSceneModelIds === null) return codeLevelIds;
    return codeLevelIds.filter((id) => allowedSceneModelIds.has(id) || id === currentPreferredModel);
  };

  const modelOptions = modelIdsForCategory(form.category, form.preferredModel).map((value) => ({ label: value, value }));

  const updateField = (field) => (value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Changing category can invalidate the previously-selected model — snap to the first
      // valid option for the new category rather than submitting a stale, now-illegal pairing.
      if (field === 'category') {
        const validIds = modelIdsForCategory(value, prev.preferredModel);
        if (!validIds.includes(prev.preferredModel)) {
          next.preferredModel = validIds[0];
        }
      }
      return next;
    });
  };

  const handleDropThumbnail = async (_dropFiles, acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setThumbnailUploadError(null);
    setUploadingThumbnail(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { thumbnailUrl } = await adminClient.postFormData('/templates/thumbnail-upload', formData);
      setForm((prev) => ({ ...prev, thumbnailUrl }));
    } catch (err) {
      setThumbnailUploadError(err.message || 'Failed to upload thumbnail.');
    } finally {
      setUploadingThumbnail(false);
    }
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

          {allowedModelsLoadError ? (
            <Banner tone="warning" title="Couldn't verify Allowed Models" onDismiss={() => setAllowedModelsLoadError(null)}>
              <p>{allowedModelsLoadError} Showing every template-compatible model instead of only active Allowed Models — double check your choice is actually priced and active before saving.</p>
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
                ? 'Limited to models active in Allowed Models. Ignored for skincare/cosmetics/makeup/beauty products — those always route to FLUX Kontext Max for color accuracy, regardless of this setting.'
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

          {thumbnailUploadError ? (
            <Banner tone="critical" title="Upload failed" onDismiss={() => setThumbnailUploadError(null)}>
              <p>{thumbnailUploadError}</p>
            </Banner>
          ) : null}

          {form.thumbnailUrl ? (
            <InlineStack gap="300" blockAlign="center">
              <Thumbnail source={form.thumbnailUrl} alt="Template thumbnail" size="large" />
              <Button onClick={() => updateField('thumbnailUrl')('')}>Remove</Button>
            </InlineStack>
          ) : (
            <DropZone accept="image/*" type="image" onDrop={handleDropThumbnail} disabled={uploadingThumbnail}>
              <DropZone.FileUpload actionTitle="Upload a thumbnail image" actionHint="Or paste a URL below" />
            </DropZone>
          )}
          {uploadingThumbnail ? (
            <InlineStack align="center">
              <Spinner accessibilityLabel="Uploading thumbnail" size="small" />
            </InlineStack>
          ) : null}

          <TextField
            label="Thumbnail URL (optional)"
            helpText="Set automatically when you upload an image above — or paste an external URL directly instead."
            value={form.thumbnailUrl}
            onChange={updateField('thumbnailUrl')}
            autoComplete="off"
          />
        </FormLayout>
      </Modal.Section>
    </Modal>
  );
}
