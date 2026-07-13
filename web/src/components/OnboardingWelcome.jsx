import { Box, BlockStack, InlineStack, Text, Button, Card, Icon } from '@shopify/polaris';
import { ProductIcon, WandIcon, ImagesIcon } from '@shopify/polaris-icons';

const STEPS = [
  { icon: ProductIcon, title: '1. Pick a product', body: 'Choose one from your catalog, or upload your own photo.' },
  { icon: WandIcon, title: '2. Choose a style', body: 'Pick a template — studio backdrop, lifestyle scene, and more.' },
  { icon: ImagesIcon, title: '3. Get AI photos', body: 'Review the results and publish the ones you like straight to Shopify.' },
];

function Step({ icon, title, body }) {
  return (
    <InlineStack gap="200" blockAlign="start" wrap={false}>
      <Box paddingBlockStart="100">
        <Icon source={icon} tone="base" />
      </Box>
      <BlockStack gap="050">
        <Text as="h3" fontWeight="semibold">
          {title}
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          {body}
        </Text>
      </BlockStack>
    </InlineStack>
  );
}

// Shown on the Dashboard only for a merchant who has never generated anything — the previous
// experience was a generic empty-state buried inside the "Recent jobs" card, with no explanation
// of the golden path (pick a product, pick a style, get photos) before they'd committed to
// anything. Dismissible with local state only (no server persistence) — once a first job exists,
// Dashboard.jsx stops rendering this entirely regardless, so a dismiss is a same-session nicety,
// not a state a merchant needs to be remembered across visits.
export function OnboardingWelcome({ onGetStarted, onDismiss }) {
  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="start">
          <BlockStack gap="100">
            <Text as="h2" variant="headingMd">
              Welcome to MotionArt
            </Text>
            <Text as="p" tone="subdued">
              Turn your product photos into studio-quality scenes in three steps.
            </Text>
          </BlockStack>
          <Button variant="plain" onClick={onDismiss}>
            I'll explore on my own
          </Button>
        </InlineStack>

        <InlineStack gap="500" wrap>
          {STEPS.map((step) => (
            <Box key={step.title} minWidth="220px" maxWidth="320px">
              <Step {...step} />
            </Box>
          ))}
        </InlineStack>

        <InlineStack>
          <Button variant="primary" icon={ProductIcon} onClick={onGetStarted}>
            Pick your first product
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}
