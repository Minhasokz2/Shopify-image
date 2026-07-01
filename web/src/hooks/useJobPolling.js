import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client.js';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed']);
const TERMINAL_BATCH_STATUSES = new Set(['complete', 'partial_failure']);

// Polling, not a live Firestore listener or SSE/WebSocket — see the plan's ambiguity #5: direct
// browser Firestore listeners would require a second auth system alongside Shopify session
// tokens, which is out of scope as an unrequested addition.
export function useJobPolling(jobId) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => apiClient.get(`/api/jobs/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (query) => (TERMINAL_STATUSES.has(query.state.data?.job?.status) ? false : 2500),
  });
}

export function useBatchPolling(batchId) {
  return useQuery({
    queryKey: ['batch', batchId],
    queryFn: () => apiClient.get(`/api/batches/${batchId}`),
    enabled: Boolean(batchId),
    refetchInterval: (query) => (TERMINAL_BATCH_STATUSES.has(query.state.data?.batch?.status) ? false : 3000),
  });
}
