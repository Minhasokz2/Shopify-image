import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { Page, Card, BlockStack, InlineStack, Text, Select, TextField, Button, Banner, Box, Thumbnail } from '@shopify/polaris';
import { PersonIcon } from '@shopify/polaris-icons';
import { apiClient } from '../api/client.js';
import { CreditBalanceBadge } from '../components/CreditBalanceBadge.jsx';
import { SectionHeading } from '../components/SectionHeading.jsx';
import { useCreditBalance } from '../hooks/useCreditBalance.js';

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
  const { data: creditData } = useCreditBalance();
  const isUnlimited = creditData?.plan === 'unlimited';
  const balance = creditData?.creditBalance ?? null;
  const canAfford = isUnlimited || balance === null || !template || balance >= template.creditCost;

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
      titleMetadata={<CreditBalanceBadge />}
    >
      <Card>
        <BlockStack gap="400">
          <SectionHeading icon={PersonIcon}>Persona details</SectionHeading>

          {!product || !template ? (
            <Banner tone="warning" title="Missing selection">
              <p>Go back and pick a product and a UGC template first.</p>
            </Banner>
          ) : (
            <Box borderWidth="025" borderColor="border" borderRadius="200" padding="300">
              <InlineStack align="space-between" blockAlign="center" gap="300">
                <InlineStack gap="300" blockAlign="center">
                  {product.imageUrl ? (
                    <Thumbnail source={product.imageUrl} alt={product.title} size="small" />
                  ) : null}
                  <Text as="p" tone="subdued">
                    Template: {template.name} ({template.creditCost} credits)
                  </Text>
                </InlineStack>
                {!canAfford ? (
                  <Text as="span" variant="bodySm" tone="critical">
                    Not enough credits — you have {balance}
                  </Text>
                ) : null}
              </InlineStack>
            </Box>
          )}

          {submitError ? (
            <Banner tone="critical" title="Couldn't start generation" onDismiss={() => setSubmitError(null)}>
              <p>{submitError}</p>
            </Banner>
          ) : null}

          <Box borderWidth="025" borderColor="border" borderRadius="200" padding="300">
            <BlockStack gap="300">
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
            </BlockStack>
          </Box>

          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={generateMutation.isPending}
            disabled={!product || !template || !canAfford}
          >
            {canAfford ? 'Generate UGC content' : 'Not enough credits'}
          </Button>
        </BlockStack>
      </Card>
    </Page>
  );
}
