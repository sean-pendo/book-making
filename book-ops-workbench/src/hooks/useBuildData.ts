import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { buildDataService, type BuildDataSummary, type BuildDataRelationships, subscribeToLoadProgress, type LoadProgress } from '@/services/buildDataService';
import type { MetricsSnapshot, MetricsComparison } from '@/types/analytics';
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_LIMITS } from '@/_domain';

// Hook to track loading progress
export const useLoadProgress = () => {
  const [progress, setProgress] = useState<LoadProgress | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToLoadProgress((p) => {
      setProgress(p);
    });
    return unsubscribe;
  }, []);

  return progress;
};

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
 * @param buildId - Build ID
 * @param useProposed - Whether to use proposed assignments (new_owner_id) or original (owner_id). Defaults to true.
 */
export const useAnalyticsMetrics = (buildId: string | undefined, useProposed = true) => {
  return useQuery<MetricsSnapshot>({
    queryKey: ['analytics-metrics', buildId, useProposed],
    queryFn: () => buildDataService.getAnalyticsMetrics(buildId!, useProposed),
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
 * Default priority names when not parseable from rationale
 * Used when rationale format doesn't include the friendly name
 */
const DEFAULT_PRIORITY_NAMES: Record<string, string> = {
  'P0': 'Manual Holdover',
  'P1': 'Sales Tools Bucket',
  'P2': 'Stability Accounts',
  'P3': 'Team Alignment',
  'P4': 'Geography + Continuity',
  'P5': 'Continuity',
  'P6': 'Geography',
  'P7': 'Residual',
  'RO': 'Residual Optimization',
};

/**
 * Parse priority code and name from rationale string
 * 
 * Rationale formats:
 * - LP solver: "P1: Geography + Continuity → Rep Name (details)"
 * - Double-prefix (bug): "P4: P4: Geography + Continuity → Rep Name"
 * - Legacy: "CONTINUITY: Reason text"
 * 
 * Returns { code: "P1", name: "Geography + Continuity" }
 */
function parsePriorityFromRationale(rationale: string): { code: string; name: string } {
  // First, handle the double-prefix bug: "P4: P4: Name → Rep"
  // Strip the duplicate prefix if present
  const doublePrefixMatch = rationale.match(/^(P\d+|RO):\s*\1:\s*/i);
  if (doublePrefixMatch) {
    // Remove the duplicate prefix and re-parse
    rationale = rationale.slice(doublePrefixMatch[0].length - doublePrefixMatch[1].length - 2);
    rationale = `${doublePrefixMatch[1]}: ${rationale}`;
  }

  // Match LP solver format: "P1: Name → Rep (details)" or "RO: Name → Rep (details)"
  // The priority name is between the code and the arrow (→)
  const lpMatch = rationale.match(/^(P\d+|RO):\s*(.+?)\s*→/i);
  
  if (lpMatch) {
    const name = lpMatch[2].trim();
    // If name is just the code repeated, use default name
    if (name.match(/^P\d+$/i) || name === 'RO') {
      return {
        code: lpMatch[1].toUpperCase(),
        name: DEFAULT_PRIORITY_NAMES[lpMatch[1].toUpperCase()] || 'Unknown'
      };
    }
    return {
      code: lpMatch[1].toUpperCase(),
      name: name
    };
  }
  
  // Match simplified format without arrow: "P1: Name" or "RO: Name"
  // Stop at dash, parenthesis, or end of string
  const simpleMatch = rationale.match(/^(P\d+|RO):\s*(.+?)(?:\s*[-:(]|$)/i);
  
  if (simpleMatch) {
    const name = simpleMatch[2].trim();
    // If name is just the code repeated or empty, use default name
    if (!name || name.match(/^P\d+$/i) || name === 'RO') {
      return {
        code: simpleMatch[1].toUpperCase(),
        name: DEFAULT_PRIORITY_NAMES[simpleMatch[1].toUpperCase()] || 'Unknown'
      };
    }
    return {
      code: simpleMatch[1].toUpperCase(),
      name: name
    };
  }
  
  // Fallback: try to at least get the code and use default name
  const codeMatch = rationale.match(/^(P\d+|RO):/i);
  if (codeMatch) {
    return {
      code: codeMatch[1].toUpperCase(),
      name: DEFAULT_PRIORITY_NAMES[codeMatch[1].toUpperCase()] || 'Unknown'
    };
  }
  
  return { code: 'Other', name: 'Other' };
}

/**
 * Hook for fetching priority distribution data
 * Shows breakdown of accounts by assignment priority level
 *
 * Parses priority code and name directly from rationale strings.
 * Rationale format: "P1: Continuity + Geography" or "RO: Force Assignment"
 *
 * Uses pagination to fetch all assignments (Supabase defaults to 1000 row limit).
 */
export const usePriorityDistribution = (buildId: string | undefined) => {
  return useQuery<PriorityDistributionItem[]>({
    queryKey: ['priority-distribution', buildId],
    queryFn: async () => {
      // Fetch all approved assignments using pagination
      // Supabase defaults to 1000 rows per request
      const allAssignments: { rationale: string | null }[] = [];
      const pageSize = SUPABASE_LIMITS.DEFAULT_PAGE_SIZE;
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('assignments')
          .select('rationale')
          .eq('build_id', buildId!)
          .eq('is_approved', true)
          .range(from, from + pageSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allAssignments.push(...data);
          from += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      const assignments = allAssignments;
      if (assignments.length === 0) return [];

      // Group by priority code, tracking the name from the rationale
      const priorityCounts: Record<string, { count: number; name: string }> = {};

      assignments.forEach(assignment => {
        const rationale = assignment.rationale || '';
        const { code, name } = parsePriorityFromRationale(rationale);

        if (!priorityCounts[code]) {
          priorityCounts[code] = { count: 0, name };
        }
        priorityCounts[code].count++;
      });

      const total = assignments.length;

      // Map to distribution items
      const distribution: PriorityDistributionItem[] = Object.entries(priorityCounts)
        .map(([code, data]) => ({
          priorityId: code,
          priorityName: data.name,
          priorityDescription: '', // No description needed - name is self-explanatory
          count: data.count,
          percentage: (data.count / total) * 100
        }))
        .sort((a, b) => {
          // Sort by priority level (P0, P1, P2, ... RO last, Other after)
          const getPriority = (id: string) => {
            if (id === 'Other') return 9999;
            if (id === 'RO') return 1000;
            const num = parseInt(id.replace(/\D/g, ''));
            return isNaN(num) ? 9998 : num;
          };
          return getPriority(a.priorityId) - getPriority(b.priorityId);
        });

      return distribution;
    },
    enabled: !!buildId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};