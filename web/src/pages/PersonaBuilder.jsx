import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { Page, Card, BlockStack, Text, Select, TextField, Button, Banner } from '@shopify/polaris';
import { apiClient } from '../api/client.js';

const GENDER_PRESENTATION_OPTIONS = [
  { label: 'Feminine', value: 'feminine' },
  { label: 'Masculine', value: 'masculine' },
  { label: 'Neutral', value: 'neutral' },
];

const SETTING_OPTIONS = [
  { label: 'Home / casual', value: 'home casual' },
  { label: 'Outdoor lifestyle', value: 'outdoor lifestyle' },
  { label: 'Studio portrait', value: 'studio portrait' },
  { label: 'Custom…', value: 'custom' },
];

export default function PersonaBuilder() {
  const navigate = useNavigate();
  const location = useLocation();
  const { product, template } = location.state ?? {};

  const [genderPresentation, setGenderPresentation] = useState('feminine');
  const [settingOption, setSettingOption] = useState('home casual');
  const [customSetting, setCustomSetting] = useState('');
  const [submitError, setSubmitError] = useState(null);

  const generateMutation = useMutation({
    mutationFn: (body) => apiClient.post('/api/generate', body),
  });

  const resolvedSetting = settingOption === 'custom' ? customSetting.trim() : settingOption;

  const handleSubmit = async () => {
    setSubmitError(null);

    if (!product || !template) {
      setSubmitError('Missing product or template — please start over from the template gallery.');
      return;
    }

    try {
      const result = await generateMutation.mutateAsync({
        productId: product.id,
        imageUrl: product.imageUrl,
        contentType: 'ugc',
        templateId: template.id,
        // ageRange is always the literal "adult" — there is no UI control for this, by design.
        personaSettings: { ageRange: 'adult', genderPresentation, setting: resolvedSetting },
        productCategoryTag: product.productCategoryTag ?? undefined,
      });
      navigate(`/review/${result.jobId}`);
    } catch (err) {
      if (err.statusCode === 402) {
        setSubmitError('Insufficient credits. Visit the Billing page to top up.');
      } else if (err.statusCode === 429) {
        setSubmitError('Too many generations running at once. Please wait for one to finish and try again.');
      } else if (err.statusCode === 422) {
        setSubmitError('This persona configuration was rejected. Please adjust the setting and try again.');
      } else {
        setSubmitError(err.message || 'Failed to start generation.');
      }
    }
  };

  return (
    <Page
      title="Build your UGC persona"
      subtitle={product ? `For ${product.title}` : undefined}
      backAction={{ content: 'Templates', onAction: () => navigate('/templates') }}
    >
      <Card>
        <BlockStack gap="400">
          {!product || !template ? (
            <Banner tone="warning" title="Missing selection">
              <p>Go back and pick a product and a UGC template first.</p>
            </Banner>
          ) : (
            <Text as="p" tone="subdued">
              Template: {template.name} ({template.creditCost} credits)
            </Text>
          )}

          {submitError ? (
            <Banner tone="critical" title="Couldn't start generation" onDismiss={() => setSubmitError(null)}>
              <p>{submitError}</p>
            </Banner>
          ) : null}

          <Select
            label="Presentation"
            options={GENDER_PRESENTATION_OPTIONS}
            value={genderPresentation}
            onChange={setGenderPresentation}
          />

          <Select
            label="Setting"
            options={SETTING_OPTIONS}
            value={settingOption}
            onChange={setSettingOption}
          />

          {settingOption === 'custom' ? (
            <TextField
              label="Custom setting"
              value={customSetting}
              onChange={setCustomSetting}
              autoComplete="off"
              placeholder="e.g. cozy coffee shop"
            />
          ) : null}

          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={generateMutation.isPending}
            disabled={!product || !template}
          >
            Generate UGC content
          </Button>
        </BlockStack>
      </Card>
    </Page>
  );
}
