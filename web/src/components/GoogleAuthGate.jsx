import { useEffect, useRef, useState } from 'react';
import { Page, Layout, Card, BlockStack, Text, Button, Banner, Spinner, Box } from '@shopify/polaris';
import { apiClient } from '../api/client.js';

const POPUP_FEATURES = 'width=480,height=640,menubar=no,toolbar=no,status=no';

// Every shop must verify a real Google account before touching any part of the app — this wraps
// the whole embedded app and renders a lock screen until that's done. Google's own Sign-In UI
// can't run inside a cross-origin iframe (Shopify admin), so verification happens in a popup:
// the button opens /auth/google/callback's flow in a new top-level window, that window posts a
// result back via postMessage when it's done, and this component re-checks status on success.
export function GoogleAuthGate({ children }) {
  const [status, setStatus] = useState('checking'); // checking | locked | unlocked
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const popupRef = useRef(null);

  async function refreshStatus() {
    try {
      const { verified } = await apiClient.get('/api/auth/google/status');
      setStatus(verified ? 'unlocked' : 'locked');
    } catch (err) {
      setStatus('locked');
      setError(err.message);
    }
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  useEffect(() => {
    function handleMessage(event) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.source !== 'visualkit-google-auth') return;

      setConnecting(false);
      if (event.data.ok) {
        setError(null);
        refreshStatus();
      } else {
        setError(event.data.error || 'Google sign-in failed. Please try again.');
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  async function handleSignIn() {
    setError(null);
    setConnecting(true);
    try {
      const { authorizeUrl } = await apiClient.post('/api/auth/google/init');
      const popup = window.open(authorizeUrl, 'visualkit-google-auth', POPUP_FEATURES);
      if (!popup) {
        setConnecting(false);
        setError('Your browser blocked the sign-in popup. Please allow popups for this site and try again.');
        return;
      }
      popupRef.current = popup;
    } catch (err) {
      setConnecting(false);
      setError(err.message);
    }
  }

  if (status === 'checking') {
    return (
      <Box padding="1000">
        <BlockStack inlineAlign="center">
          <Spinner accessibilityLabel="Checking sign-in status" size="large" />
        </BlockStack>
      </Box>
    );
  }

  if (status === 'unlocked') {
    return children;
  }

  return (
    <Page narrowWidth>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400" inlineAlign="center">
              <Text as="h1" variant="headingLg">
                Sign in to Product Image Generator
              </Text>
              <Text as="p" tone="subdued" alignment="center">
                For security and to protect free-trial credits from abuse, every store must verify a Google
                account once before generating images or videos.
              </Text>
              {error ? (
                <Banner tone="critical" title="Couldn't sign in">
                  <p>{error}</p>
                </Banner>
              ) : null}
              <Button variant="primary" size="large" loading={connecting} onClick={handleSignIn}>
                Continue with Google
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
