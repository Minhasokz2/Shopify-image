import { Badge, InlineStack, Text, SkeletonBodyText } from '@shopify/polaris';
import { useCreditBalance } from '../hooks/useCreditBalance.js';

export function CreditBalanceBadge() {
  const { data, isLoading } = useCreditBalance();

  if (isLoading) {
    return <SkeletonBodyText lines={1} />;
  }

  if (!data) {
    return null;
  }

  const tone = data.creditBalance <= 0 ? 'critical' : data.creditBalance < 20 ? 'warning' : 'success';

  return (
    <InlineStack gap="200" blockAlign="center">
      <Badge tone={tone}>{`${data.creditBalance} credits`}</Badge>
      <Text as="span" variant="bodySm" tone="subdued">
        {data.plan} plan
      </Text>
    </InlineStack>
  );
}

export default CreditBalanceBadge;
