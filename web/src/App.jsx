import { Routes, Route, Link } from 'react-router-dom';
import { NavMenu } from '@shopify/app-bridge-react';
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

export default function App() {
  return (
    <>
      {/* Rendered by the Shopify admin's own chrome, not in-page — see
          https://shopify.dev/docs/api/app-bridge-library/react-components/navmenu */}
      <NavMenu>
        <Link to="/" rel="home">
          Dashboard
        </Link>
        <Link to="/products">Products</Link>
        <Link to="/templates">Templates</Link>
        <Link to="/bulk">Bulk Queue</Link>
        <Link to="/history">Job History</Link>
        <Link to="/brand">Brand Settings</Link>
        <Link to="/billing">Billing</Link>
        <Link to="/referrals">Referrals</Link>
      </NavMenu>

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
