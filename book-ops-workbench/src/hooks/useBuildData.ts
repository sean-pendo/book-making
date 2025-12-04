import { useQuery, useQueryClient } from '@tanstack/react-query';
import { buildDataService, type BuildDataSummary, type BuildDataRelationships } from '@/services/buildDataService';

export const useBuildDataSummary = (buildId: string | undefined) => {
  return useQuery({
    queryKey: ['build-data-summary', buildId], // Fixed: removed Date.now() that caused infinite loop
    queryFn: async () => {
      console.log('Fetching build data summary for buildId:', buildId);
      console.log('🔄 Force refreshing all caches and data...');
      
      // Force clear all caches before fetching
      buildDataService.clearBuildCache(buildId!);
      
      const result = await buildDataService.getBuildDataSummary(buildId!);
      console.log('Build data summary result:', result);
      
      // Validate the data we received
      if (result?.accounts?.total && result.accounts.total < 10000) {
        console.warn('⚠️ Received limited account data:', result.accounts.total, 'accounts. Expected 27,000+');
        console.warn('This might indicate RLS policy issues or authentication problems');
      }
      
      return result;
    },
    enabled: !!buildId,
    staleTime: 0, // Disable cache to ensure fresh data
    gcTime: 0, // Disable garbage collection cache
    refetchOnMount: true,
    refetchOnWindowFocus: false, // Prevent excessive refetching
    retry: 1, // Retry once if failed
  });
};

export const useBuildDataRelationships = (buildId: string | undefined) => {
  return useQuery({
    queryKey: ['build-data-relationships', buildId],
    queryFn: () => buildDataService.getBuildDataRelationships(buildId!),
    enabled: !!buildId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useInvalidateBuildData = () => {
  const queryClient = useQueryClient();
  
  return async (buildId: string) => {
    console.log(`[useBuildData] 🔥 FORCE INVALIDATING all caches for build ${buildId}`);
    
    // Clear service cache completely
    buildDataService.clearBuildCache(buildId);
    buildDataService.clearAllCache();
    
    // Force refetch React Query cache - this immediately re-runs the query
    await queryClient.refetchQueries({ 
      queryKey: ['build-data-summary', buildId],
      type: 'active'
    });
    
    await queryClient.refetchQueries({ 
      queryKey: ['build-data-relationships', buildId],
      type: 'active'
    });
    
    console.log('🧹 All caches cleared and data refetched!');
  };
};