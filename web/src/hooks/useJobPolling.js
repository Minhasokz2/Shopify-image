import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client.js';
import { showToast } from '../lib/toast.js';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed']);
const TERMINAL_BATCH_STATUSES = new Set(['complete', 'partial_failure']);

// Polling, not a live Firestore listener or SSE/WebSocket — see the plan's ambiguity #5: direct
// browser Firestore listeners would require a second auth system alongside Shopify session
// tokens, which is out of scope as an unrequested addition.
export function useJobPolling(jobId) {
  const query = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => apiClient.get(`/api/jobs/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (query) => (TERMINAL_STATUSES.has(query.state.data?.job?.status) ? false : 2500),
  });

  // Fires an App Bridge toast the moment THIS hook instance observes a live pending/processing →
  // succeeded/failed transition — never on initial load of an already-terminal job, so opening
  // Job History and seeing old completed jobs doesn't spam toasts. `sawInFlight` is the guard:
  // only a status change witnessed in-flight counts as "just finished".
  const sawInFlight = useRef(false);
  useEffect(() => {
    const status = query.data?.job?.status;
    if (!status) return;
    if (!TERMINAL_STATUSES.has(status)) {
      sawInFlight.current = true;
      return;
    }
    if (sawInFlight.current) {
      showToast(status === 'succeeded' ? 'Your AI photo is ready to review' : 'Generation failed — see Job History for details', {
        isError: status === 'failed',
      });
      sawInFlight.current = false;
    }
  }, [query.data?.job?.status]);

  return query;
}

export function useBatchPolling(batchId) {
  const query = useQuery({
    queryKey: ['batch', batchId],
    queryFn: () => apiClient.get(`/api/batches/${batchId}`),
    enabled: Boolean(batchId),
    refetchInterval: (query) => (TERMINAL_BATCH_STATUSES.has(query.state.data?.batch?.status) ? false : 3000),
  });

  const sawInFlight = useRef(false);
  useEffect(() => {
    const status = query.data?.batch?.status;
    if (!status) return;
    if (!TERMINAL_BATCH_STATUSES.has(status)) {
      sawInFlight.current = true;
      return;
    }
    if (sawInFlight.current) {
      showToast(status === 'complete' ? 'Bulk batch finished generating' : 'Bulk batch finished — some jobs failed', {
        isError: status === 'partial_failure',
      });
      sawInFlight.current = false;
    }
  }, [query.data?.batch?.status]);

  return query;
}
