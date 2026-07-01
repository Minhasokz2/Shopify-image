import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PolarisProvider } from './providers/PolarisProvider.jsx';
import App from './App.jsx';

// App Bridge 4.x needs no React provider component — the CDN script tag in index.html injects
// the `shopify` global directly; components read it via useAppBridge() or window.shopify.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PolarisProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </PolarisProvider>
  </React.StrictMode>,
);
