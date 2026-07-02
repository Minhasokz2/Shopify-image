import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client.js';

const TERMINAL_BATCH_STATUSES = new Set(['complete', 'partial_failure']);

export function useImageOptimizerUsage() {
  return useQuery({
    queryKey: ['image-optimizer', 'usage'],
    queryFn: () => apiClient.get('/api/image-optimizer/usage'),
    staleTime: 5_000,
  });
}

export function useImageOptimizerImages(cursor) {
  return useQuery({
    queryKey: ['image-optimizer', 'images', cursor ?? null],
    queryFn: () => {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      const qs = params.toString();
      return apiClient.get(`/api/image-optimizer/images${qs ? `?${qs}` : ''}`);
    },
  });
}

// Same polling shape as useBatchPolling (hooks/useJobPolling.js) for the generation pipeline —
// stops once the batch reaches a terminal state.
export function useConversionBatchPolling(batchId) {
  return useQuery({
    queryKey: ['image-optimizer', 'batch', batchId],
    queryFn: () => apiClient.get(`/api/image-optimizer/batches/${batchId}`),
    enabled: Boolean(batchId),
    refetchInterval: (query) => (TERMINAL_BATCH_STATUSES.has(query.state.data?.batch?.status) ? false : 3000),
  });
}

export function useImageOptimizerHistory() {
  return useQuery({
    queryKey: ['image-optimizer', 'history'],
    queryFn: () => apiClient.get('/api/image-optimizer/history?limit=100'),
  });
}
