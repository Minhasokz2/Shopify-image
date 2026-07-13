import { lazy, Suspense } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { NavMenu } from '@shopify/app-bridge-react';
import { Box, InlineStack, Spinner } from '@shopify/polaris';
import { useLowCreditNotice } from './hooks/useLowCreditNotice.js';

// Every page below used to be a static import, so visiting the Dashboard downloaded and parsed
// every other page's code too (Bulk Queue, Video Studio, Persona Builder, the whole Image
// Optimizer suite...) before it could render anything — the entire app shipped as one ~640KB
// bundle regardless of which route a merchant actually opened. Lazy-loading per route means the
// first paint only needs the code for whichever page is actually being visited; this is the
// single biggest lever on Largest Contentful Paint for an app with this many pages.
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const ProductPicker = lazy(() => import('./pages/ProductPicker.jsx'));
const GenerateMethod = lazy(() => import('./pages/GenerateMethod.jsx'));
const TemplateGallery = lazy(() => import('./pages/TemplateGallery.jsx'));
const CustomPromptStudio = lazy(() => import('./pages/CustomPromptStudio.jsx'));
const PersonaBuilder = lazy(() => import('./pages/PersonaBuilder.jsx'));
const VideoStudio = lazy(() => import('./pages/VideoStudio.jsx'));
const VirtualTryOn = lazy(() => import('./pages/VirtualTryOn.jsx'));
const GenerationReview = lazy(() => import('./pages/GenerationReview.jsx'));
const BulkQueue = lazy(() => import('./pages/BulkQueue.jsx'));
const JobHistory = lazy(() => import('./pages/JobHistory.jsx'));
const BrandSettings = lazy(() => import('./pages/BrandSettings.jsx'));
const Billing = lazy(() => import('./pages/Billing.jsx'));
const Referrals = lazy(() => import('./pages/Referrals.jsx'));
const ImageOptimizerConvert = lazy(() => import('./pages/ImageOptimizerConvert.jsx'));
const ImageOptimizerBatch = lazy(() => import('./pages/ImageOptimizerBatch.jsx'));
const ImageOptimizerHistory = lazy(() => import('./pages/ImageOptimizerHistory.jsx'));
const ImageOptimizerSettings = lazy(() => import('./pages/ImageOptimizerSettings.jsx'));

const NAV_LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/products', label: 'Products' },
  { to: '/templates', label: 'Templates' },
  // VirtualTryOn.jsx is fully self-contained (its own person upload + product-image picker), so
  // this is a plain direct link — no product needs to be pre-selected before landing here.
  { to: '/try-on', label: 'Virtual Try-On' },
  { to: '/bulk', label: 'Bulk Queue' },
  { to: '/history', label: 'Job History' },
  { to: '/image-optimizer', label: 'Compress Image' },
  { to: '/brand', label: 'Brand Settings' },
  { to: '/billing', label: 'Billing' },
  { to: '/referrals', label: 'Referrals' },
];

// True only inside the Shopify admin iframe, where App Bridge's CDN script sets this global.
// Outside of it, NavMenu's children would otherwise dump as raw unstyled <a> tags into the
// page — there's no Shopify chrome present to consume them as a portal target.
const isEmbedded = typeof window !== 'undefined' && Boolean(window.shopify);

function RouteFallback() {
  return (
    <Box padding="1000">
      <InlineStack align="center">
        <Spinner accessibilityLabel="Loading page" size="large" />
      </InlineStack>
    </Box>
  );
}

export default function App() {
  // Mounted once at the root so a low/out-of-credits toast can reach the merchant regardless of
  // which page they're on — see the hook's own comment for why this can't just live on Dashboard.
  useLowCreditNotice();

  return (
    <>
      {/* Rendered by the Shopify admin's own chrome, not in-page — see
          https://shopify.dev/docs/api/app-bridge-library/react-components/navmenu
          Only mounted when embedded: outside the Shopify iframe there's no chrome to consume
          these as a portal target, so the custom element dumps its children as raw <a> tags. */}
      {isEmbedded && (
        <NavMenu>
          {NAV_LINKS.map(({ to, label }) => (
            <Link key={to} to={to} rel={to === '/' ? 'home' : undefined}>
              {label}
            </Link>
          ))}
        </NavMenu>
      )}

      {!isEmbedded && (
        <Box background="bg-surface" borderBlockEndWidth="025" borderColor="border" padding="300">
          <InlineStack gap="400" wrap={false}>
            {NAV_LINKS.map(({ to, label }) => (
              <Link key={to} to={to} style={{ fontWeight: 600, color: 'var(--p-color-text)', textDecoration: 'none' }}>
                {label}
              </Link>
            ))}
          </InlineStack>
        </Box>
      )}

      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products" element={<ProductPicker />} />
          <Route path="/generate-method" element={<GenerateMethod />} />
          <Route path="/templates" element={<TemplateGallery />} />
          <Route path="/custom-generate" element={<CustomPromptStudio />} />
          <Route path="/persona" element={<PersonaBuilder />} />
          <Route path="/video-studio" element={<VideoStudio />} />
          <Route path="/try-on" element={<VirtualTryOn />} />
          <Route path="/review/:jobId" element={<GenerationReview />} />
          <Route path="/bulk" element={<BulkQueue />} />
          <Route path="/bulk/:batchId" element={<BulkQueue />} />
          <Route path="/history" element={<JobHistory />} />
          <Route path="/image-optimizer" element={<ImageOptimizerConvert />} />
          <Route path="/image-optimizer/batches/:batchId" element={<ImageOptimizerBatch />} />
          <Route path="/image-optimizer/history" element={<ImageOptimizerHistory />} />
          <Route path="/image-optimizer/settings" element={<ImageOptimizerSettings />} />
          <Route path="/brand" element={<BrandSettings />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/referrals" element={<Referrals />} />
        </Routes>
      </Suspense>
    </>
  );
}
