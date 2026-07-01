import { Badge, BlockStack, Card, InlineStack, Text, Thumbnail } from '@shopify/polaris';

const STATUS_TONE = {
  pending: 'info',
  processing: 'attention',
  succeeded: 'success',
  failed: 'critical',
};

const CONTENT_TYPE_LABEL = {
  scene: 'Scene',
  ugc: 'UGC',
  video: 'Video',
};

export function JobProgressCard({ job, onSelectChange, selected, showCheckbox = false }) {
  const previewUrl = job.variations?.[0]?.url;
  const tone = STATUS_TONE[job.status] ?? 'info';

  return (
    <Card padding="300">
      <InlineStack gap="300" blockAlign="center" wrap={false}>
        {showCheckbox && (
          <input
            type="checkbox"
            checked={Boolean(selected)}
            disabled={job.status !== 'succeeded'}
            onChange={(event) => onSelectChange?.(job.id, event.target.checked)}
            aria-label={`Select job ${job.id}`}
          />
        )}
        {job.contentType === 'video' && previewUrl ? (
          <video
            src={previewUrl}
            controls
            style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 'var(--p-border-radius-200, 8px)' }}
          />
        ) : (
          <Thumbnail
            source={previewUrl || job.productImageUrl || ''}
            alt={`Job ${job.id} preview`}
            size="small"
          />
        )}
        <BlockStack gap="050">
          <InlineStack gap="200" blockAlign="center">
            <Text as="span" fontWeight="semibold">
              {CONTENT_TYPE_LABEL[job.contentType] ?? job.contentType}
            </Text>
            <Badge tone={tone}>{job.status}</Badge>
          </InlineStack>
          <Text as="span" variant="bodySm" tone="subdued">
            {job.creditsCharged ?? 0} credits · {job.createdAt ? new Date(job.createdAt).toLocaleString() : '—'}
          </Text>
          {job.status === 'failed' && job.errorMessage && (
            <Text as="span" variant="bodySm" tone="critical">
              {job.errorMessage}
            </Text>
          )}
        </BlockStack>
      </InlineStack>
    </Card>
  );
}

export default JobProgressCard;
