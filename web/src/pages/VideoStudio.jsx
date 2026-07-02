import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Select,
  Button,
  Banner,
  Spinner,
  Box,
} from '@shopify/polaris';
import { PlayCircleIcon } from '@shopify/polaris-icons';
import { apiClient } from '../api/client.js';
import { CreditBalanceBadge } from '../components/CreditBalanceBadge.jsx';
import { SectionHeading } from '../components/SectionHeading.jsx';
import { useCreditBalance } from '../hooks/useCreditBalance.js';

const ASPECT_RATIO_OPTIONS = [
  { label: 'Vertical (9:16)', value: '9:16' },
  { label: 'Square (1:1)', value: '1:1' },
  { label: 'Widescreen (16:9)', value: '16:9' },
];

function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: () => apiClient.get('/api/templates'),
  });
}

export default function VideoStudio() {
  const navigate = useNavigate();
  const location = useLocation();
  const { product, template: initialTemplate } = location.state ?? {};

  const { data, isLoading, error } = useTemplates();
  const videoTemplates = useMemo(
    () => (data?.templates ?? []).filter((t) => t.category === 'video'),
    [data],
  );

  const [selectedTemplateId, setSelectedTemplateId] = useState(initialTemplate?.id ?? null);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [submitError, setSubmitError] = useState(null);

  const selectedTemplate = videoTemplates.find((t) => t.id === selectedTemplateId) ?? null;

  const { data: creditData } = useCreditBalance();
  const isUnlimited = creditData?.plan === 'unlimited';
  const balance = creditData?.creditBalance ?? null;
  const canAfford =
    isUnlimited || balance === null || !selectedTemplate || balance >= selectedTemplate.creditCost;

  const generateMutation = useMutation({
    mutationFn: (body) => apiClient.post('/api/generate', body),
  });

  const handleSubmit = async () => {
    setSubmitError(null);

    if (!product || !selectedTemplate) {
      setSubmitError('Missing product or motion template — please start over from the template gallery.');
      return;
    }

    try {
      const result = await generateMutation.mutateAsync({
        productId: product.id,
        imageUrl: product.imageUrl,
        contentType: 'video',
        templateId: selectedTemplate.id,
        aspectRatio,
        productCategoryTag: product.productCategoryTag ?? undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      navigate(`/review/${result.jobId}`);
    } catch (err) {
      if (err.statusCode === 402) {
        setSubmitError('Insufficient credits. Visit the Billing page to top up.');
      } else if (err.statusCode === 429) {
        setSubmitError('Too many generations running at once. Please wait for one to finish and try again.');
      } else {
        setSubmitError(err.message || 'Failed to start generation.');
      }
    }
  };

  return (
    <Page
      title="Video Studio"
      subtitle={product ? `For ${product.title}` : undefined}
      backAction={{ content: 'Templates', onAction: () => navigate('/templates') }}
      titleMetadata={<CreditBalanceBadge />}
    >
      <Card>
        <BlockStack gap="400">
          {!product ? (
            <Banner tone="warning" title="Missing product">
              <p>Go back and pick a product before creating a video.</p>
            </Banner>
          ) : null}

          {selectedTemplate && !canAfford ? (
            <Banner tone="warning" title="Not enough credits">
              <p>
                {selectedTemplate.name} costs {selectedTemplate.creditCost} credits — you have {balance}. Visit
                the Billing page to top up.
              </p>
            </Banner>
          ) : null}

          {error ? (
            <Banner tone="critical" title="Couldn't load motion templates">
              <p>{error.message}</p>
            </Banner>
          ) : null}

          {submitError ? (
            <Banner tone="critical" title="Couldn't start generation" onDismiss={() => setSubmitError(null)}>
              <p>{submitError}</p>
            </Banner>
          ) : null}

          <SectionHeading icon={PlayCircleIcon}>Motion template</SectionHeading>

          {isLoading ? (
            <Box padding="400">
              <InlineStack align="center">
                <Spinner accessibilityLabel="Loading motion templates" size="small" />
              </InlineStack>
            </Box>
          ) : (
            <InlineStack gap="300" wrap>
              {videoTemplates.map((template) => {
                const isSelected = template.id === selectedTemplateId;
                const templateAffordable = isUnlimited || balance === null || balance >= template.creditCost;
                return (
                  <Box
                    key={template.id}
                    padding="300"
                    borderWidth={isSelected ? '050' : '025'}
                    borderColor={isSelected ? 'border-emphasis' : 'border'}
                    borderRadius="200"
                    minWidth="200px"
                  >
                    <BlockStack gap="200">
                      <Text as="h3" fontWeight="medium">
                        {template.name}
                      </Text>
                      <Badge tone={templateAffordable ? undefined : 'critical'}>{`${template.creditCost} credits`}</Badge>
                      <Button
                        pressed={isSelected}
                        onClick={() => setSelectedTemplateId(template.id)}
                      >
                        {isSelected ? 'Selected' : 'Select'}
                      </Button>
                    </BlockStack>
                  </Box>
                );
              })}
            </InlineStack>
          )}

          <Select
            label="Aspect ratio"
            options={ASPECT_RATIO_OPTIONS}
            value={aspectRatio}
            onChange={setAspectRatio}
          />

          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={generateMutation.isPending}
            disabled={!product || !selectedTemplate || !canAfford}
          >
            {canAfford ? 'Generate video' : 'Not enough credits'}
          </Button>
        </BlockStack>
      </Card>
    </Page>
  );
}
