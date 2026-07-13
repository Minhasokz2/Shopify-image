import { useLocation, useNavigate } from 'react-router-dom';
import { Page } from '@shopify/polaris';
import { CreditBalanceBadge } from '../components/CreditBalanceBadge.jsx';
import { TemplatePicker } from '../components/TemplatePicker.jsx';

// Full-page template browser — reachable either from the top nav (no product pre-selected yet)
// or from GenerateMethod's "Browse templates" link when a merchant wants the whole page instead
// of the popup. All the actual tabs/grid/generate logic lives in TemplatePicker.jsx, shared with
// GenerateMethod's modal popup so both entry points behave identically.
export default function TemplateGallery() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedProducts = location.state?.selectedProducts ?? [];

  return (
    <Page
      title="Choose a template"
      subtitle={
        selectedProducts.length > 0
          ? `Applying to ${selectedProducts.length} selected product${selectedProducts.length > 1 ? 's' : ''}`
          : "Pick a template — you'll choose a product for it next"
      }
      backAction={{ content: 'Products', onAction: () => navigate('/products') }}
      titleMetadata={<CreditBalanceBadge />}
    >
      <TemplatePicker
        selectedProducts={selectedProducts}
        autoGenerateTemplateId={location.state?.autoGenerateTemplateId ?? null}
        onNeedProduct={(templateId) =>
          navigate('/products', { state: { returnTo: 'templates', pendingTemplateId: templateId } })
        }
        onGenerated={(jobId) => navigate(`/review/${jobId}`)}
        onOpenTryOn={() => navigate('/try-on')}
      />
    </Page>
  );
}
