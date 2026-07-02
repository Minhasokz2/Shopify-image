import { InlineStack, Text, Icon } from '@shopify/polaris';

// Icon + heading pair used at the top of every major Card section across the app, so a merchant
// scanning a page can identify each section by its icon before reading the label.
export function SectionHeading({ icon, children, variant = 'headingMd' }) {
  return (
    <InlineStack gap="150" blockAlign="center">
      <Icon source={icon} />
      <Text as="h2" variant={variant}>
        {children}
      </Text>
    </InlineStack>
  );
}

export default SectionHeading;
