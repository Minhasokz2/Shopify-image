import { Routes, Route, Link } from 'react-router-dom';
import { NavMenu } from '@shopify/app-bridge-react';
import { Box, InlineStack } from '@shopify/polaris';
import Dashboard from './pages/Dashboard.jsx';
import ProductPicker from './pages/ProductPicker.jsx';
import TemplateGallery from './pages/TemplateGallery.jsx';
import PersonaBuilder from './pages/PersonaBuilder.jsx';
import VideoStudio from './pages/VideoStudio.jsx';
import GenerationReview from './pages/GenerationReview.jsx';
import BulkQueue from './pages/BulkQueue.jsx';
import JobHistory from './pages/JobHistory.jsx';
import BrandSettings from './pages/BrandSettings.jsx';
import Billing from './pages/Billing.jsx';
import Referrals from './pages/Referrals.jsx';

const NAV_LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/products', label: 'Products' },
  { to: '/templates', label: 'Templates' },
  { to: '/bulk', label: 'Bulk Queue' },
  { to: '/history', label: 'Job History' },
  { to: '/brand', label: 'Brand Settings' },
  { to: '/billing', label: 'Billing' },
  { to: '/referrals', label: 'Referrals' },
];

// True only inside the Shopify admin iframe, where App Bridge's CDN script sets this global.
// Outside of it, NavMenu's children would otherwise dump as raw unstyled <a> tags into the
// page — there's no Shopify chrome present to consume them as a portal target.
const isEmbedded = typeof window !== 'undefined' && Boolean(window.shopify);

export default function App() {
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

      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/products" element={<ProductPicker />} />
        <Route path="/templates" element={<TemplateGallery />} />
        <Route path="/persona" element={<PersonaBuilder />} />
        <Route path="/video-studio" element={<VideoStudio />} />
        <Route path="/review/:jobId" element={<GenerationReview />} />
        <Route path="/bulk" element={<BulkQueue />} />
        <Route path="/bulk/:batchId" element={<BulkQueue />} />
        <Route path="/history" element={<JobHistory />} />
        <Route path="/brand" element={<BrandSettings />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/referrals" element={<Referrals />} />
      </Routes>
    </>
  );
}
