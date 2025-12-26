import { useQueryClient } from '@tanstack/react-query';

/**
 * Shared hook to invalidate all analytics-related queries after manual edits.
 * 
 * This ensures consistent cache invalidation across all edit dialogs.
 * Query keys use buildId prefix matching - e.g., ['analytics-metrics', buildId]
 * will invalidate ['analytics-metrics', buildId, true] and ['analytics-metrics', buildId, false].
 */
export const useInvalidateAnalytics = () => {
  const queryClient = useQueryClient();
  
  return async (buildId: string) => {
    // Core analytics queries
    await queryClient.invalidateQueries({ queryKey: ['analytics-metrics', buildId] });
    await queryClient.invalidateQueries({ queryKey: ['metrics-comparison', buildId] });
    await queryClient.invalidateQueries({ queryKey: ['enhanced-balancing', buildId] });
    await queryClient.invalidateQueries({ queryKey: ['priority-distribution', buildId] });
    await queryClient.invalidateQueries({ queryKey: ['last-assignment-timestamp', buildId] });
    
    // Rep and account table queries
    await queryClient.invalidateQueries({ queryKey: ['sales-reps-detail', buildId] });
    await queryClient.invalidateQueries({ queryKey: ['sales-reps', buildId] });
  };
};



