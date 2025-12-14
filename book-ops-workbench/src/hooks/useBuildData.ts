import { useQuery, useQueryClient } from '@tanstack/react-query';
import { buildDataService, type BuildDataSummary, type BuildDataRelationships } from '@/services/buildDataService';
import type { MetricsSnapshot, MetricsComparison } from '@/types/analytics';
import { supabase } from '@/integrations/supabase/client';
import { getPriorityById } from '@/config/priorityRegistry';

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
    
    // Also invalidate analytics queries
    await queryClient.invalidateQueries({ 
      queryKey: ['analytics-metrics', buildId]
    });
    
    await queryClient.invalidateQueries({ 
      queryKey: ['metrics-comparison', buildId]
    });
    
    console.log('🧹 All caches cleared and data refetched!');
  };
};

/**
 * Hook for fetching analytics metrics (LP success metrics + distributions)
 * Used in Data Overview and Assignment Preview
 */
export const useAnalyticsMetrics = (buildId: string | undefined) => {
  return useQuery<MetricsSnapshot>({
    queryKey: ['analytics-metrics', buildId],
    queryFn: () => buildDataService.getAnalyticsMetrics(buildId!),
    enabled: !!buildId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};

/**
 * Hook for fetching before/after metrics comparison
 * Used in Balancing tab for comparing original vs proposed assignments
 */
export const useMetricsComparison = (buildId: string | undefined) => {
  return useQuery<MetricsComparison>({
    queryKey: ['metrics-comparison', buildId],
    queryFn: () => buildDataService.getMetricsComparison(buildId!),
    enabled: !!buildId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};

/**
 * Hook for fetching the timestamp of the last applied assignment
 * Used in Balancing tab header to show when assignments were last applied
 */
export interface LastAssignmentInfo {
  timestamp: Date | null;
  count: number;
}

export const useLastAssignmentTimestamp = (buildId: string | undefined) => {
  return useQuery<LastAssignmentInfo>({
    queryKey: ['last-assignment-timestamp', buildId],
    queryFn: async () => {
      // Get the most recent approved assignment
      const { data, error } = await supabase
        .from('assignments')
        .select('created_at')
        .eq('build_id', buildId!)
        .eq('is_approved', true)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (error) throw error;
      
      // Also get count of approved assignments
      const { count, error: countError } = await supabase
        .from('assignments')
        .select('*', { count: 'exact', head: true })
        .eq('build_id', buildId!)
        .eq('is_approved', true);
      
      if (countError) throw countError;
      
      return {
        timestamp: data && data.length > 0 ? new Date(data[0].created_at) : null,
        count: count || 0
      };
    },
    enabled: !!buildId,
    staleTime: 30 * 1000, // 30 seconds - refresh frequently
    gcTime: 2 * 60 * 1000, // 2 minutes
  });
};

/**
 * Priority distribution data for pie chart
 */
export interface PriorityDistributionItem {
  priorityId: string;
  priorityName: string;
  priorityDescription: string;
  count: number;
  percentage: number;
}

/**
 * Hook for fetching priority distribution data
 * Shows breakdown of accounts by assignment priority level
 * Extracts priority from the assignments table's rationale field
 */
export const usePriorityDistribution = (buildId: string | undefined) => {
  return useQuery<PriorityDistributionItem[]>({
    queryKey: ['priority-distribution', buildId],
    queryFn: async () => {
      // Get all approved assignments with their rationale
      const { data: assignments, error } = await supabase
        .from('assignments')
        .select('rationale')
        .eq('build_id', buildId!)
        .eq('is_approved', true);
      
      if (error) throw error;
      if (!assignments || assignments.length === 0) return [];
      
      // Parse priority from rationale (format: "P1: Geography + Continuity")
      const priorityCounts: Record<string, number> = {};
      assignments.forEach(assignment => {
        const rationale = assignment.rationale || '';
        // Extract priority ID (e.g., "P1", "P2") from start of rationale
        const priorityMatch = rationale.match(/^(P\d+)/i);
        const priorityId = priorityMatch ? priorityMatch[1].toUpperCase() : 'Other';
        priorityCounts[priorityId] = (priorityCounts[priorityId] || 0) + 1;
      });
      
      const total = assignments.length;
      
      // Map to distribution items with priority metadata
      const distribution: PriorityDistributionItem[] = Object.entries(priorityCounts)
        .map(([priorityId, count]) => {
          const priorityDef = getPriorityById(priorityId);
          // Extract description from the first matching rationale
          const sampleRationale = assignments.find(a => 
            a.rationale?.toUpperCase().startsWith(priorityId)
          )?.rationale || '';
          const description = sampleRationale.replace(/^P\d+:\s*/i, '');
          
          return {
            priorityId,
            priorityName: priorityDef?.name || priorityId,
            priorityDescription: priorityDef?.description || description,
            count,
            percentage: (count / total) * 100
          };
        })
        .sort((a, b) => {
          // Sort by priority level (P0, P1, P2, etc.)
          const aNum = parseInt(a.priorityId.replace(/\D/g, '')) || 999;
          const bNum = parseInt(b.priorityId.replace(/\D/g, '')) || 999;
          return aNum - bNum;
        });
      
      return distribution;
    },
    enabled: !!buildId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};