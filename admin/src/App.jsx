import { useState } from 'react';
import { Frame, Page, Card, BlockStack, Text, TextField, Button, Banner, Tabs } from '@shopify/polaris';
import { getStoredAdminKey, storeAdminKey, clearStoredAdminKey, adminClient } from './api/adminClient.js';
import { TemplateManager } from './components/TemplateManager.jsx';
import { ModelManager } from './components/ModelManager.jsx';

const SECTIONS = [
  { id: 'templates', content: 'Templates' },
  { id: 'models', content: 'Allowed models' },
];

export default function App() {
  const [adminKey, setAdminKey] = useState(() => getStoredAdminKey());
  const [keyInput, setKeyInput] = useState('');
  const [loginError, setLoginError] = useState(null);
  const [checking, setChecking] = useState(false);
  const [selectedSection, setSelectedSection] = useState(0);

  const handleLogin = async () => {
    setLoginError(null);
    setChecking(true);
    storeAdminKey(keyInput.trim());
    try {
      // GET /templates doubles as a credential check — no separate /admin/api/login endpoint
      // exists, or needs to, for a single shared-secret admin tool. A 401 specifically means the
      // key was wrong; any other failure (e.g. Firestore briefly unreachable) means the key was
      // accepted but something downstream is broken — that's TemplateManager's own load-error
      // banner to show, not a reason to reject a correct key and lock the admin out of the app.
      await adminClient.get('/templates');
      setAdminKey(keyInput.trim());
    } catch (err) {
      if (err.statusCode === 401) {
        clearStoredAdminKey();
        setLoginError('Incorrect admin key.');
      } else {
        setAdminKey(keyInput.trim());
      }
    } finally {
      setChecking(false);
    }
  };

  const handleLogout = () => {
    clearStoredAdminKey();
    setAdminKey(null);
    setKeyInput('');
  };

  if (!adminKey) {
    return (
      <Frame>
        <Page title="VisualKit Admin" subtitle="Template catalog management">
          <Card>
            <BlockStack gap="400">
              <Text as="p" tone="subdued">
                Enter the platform admin key to manage the shared template catalog every merchant
                picks from.
              </Text>
              {loginError ? (
                <Banner tone="critical" title="Couldn't sign in" onDismiss={() => setLoginError(null)}>
                  <p>{loginError}</p>
                </Banner>
              ) : null}
              <TextField
                label="Admin key"
                type="password"
                value={keyInput}
                onChange={setKeyInput}
                autoComplete="off"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLogin();
                }}
              />
              <Button variant="primary" onClick={handleLogin} loading={checking} disabled={!keyInput.trim()}>
                Sign in
              </Button>
            </BlockStack>
          </Card>
        </Page>
      </Frame>
    );
  }

  return (
    <Frame>
      <div style={{ borderBottom: '1px solid var(--p-color-border)' }}>
        <Tabs tabs={SECTIONS} selected={selectedSection} onSelect={setSelectedSection} />
      </div>
      {SECTIONS[selectedSection].id === 'templates' ? (
        <TemplateManager onLogout={handleLogout} />
      ) : (
        <ModelManager onLogout={handleLogout} />
      )}
    </Frame>
  );
}
