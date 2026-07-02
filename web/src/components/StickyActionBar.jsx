import { Box } from '@shopify/polaris';

// Keeps a primary action (Continue/Convert/Generate + a running count) reachable without
// scrolling all the way to the top/bottom of a long product or image selection grid. Plain
// `position: sticky` on a div — Polaris's own Box/Card don't expose position styling, and this
// page always scrolls at the embedded iframe's own document level, so sticky behaves like a
// pinned bar once the page scrolls past it, with no extra scroll-container plumbing needed.
export function StickyActionBar({ children, edge = 'bottom' }) {
  return (
    <div
      style={{
        position: 'sticky',
        [edge]: 0,
        zIndex: 400,
      }}
    >
      <Box
        background="bg-surface"
        padding="300"
        borderColor="border"
        borderBlockStartWidth={edge === 'bottom' ? '025' : undefined}
        borderBlockEndWidth={edge === 'top' ? '025' : undefined}
      >
        {children}
      </Box>
    </div>
  );
}

export default StickyActionBar;
