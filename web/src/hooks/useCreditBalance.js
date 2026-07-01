import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client.js';

export function useCreditBalance() {
  return useQuery({
    queryKey: ['credits'],
    queryFn: () => apiClient.get('/api/credits'),
    staleTime: 5_000,
  });
}
