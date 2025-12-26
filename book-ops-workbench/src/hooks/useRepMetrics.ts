import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  RepBookMetrics, 
  calculateRepBookMetrics,
  RepBookAccountData,
  getOpportunityPipelineValue,
  isPipelineOpportunity
} from '@/_domain';

/**
 * useRepMetrics
 * 
 * Hook for fetching and computing a sales rep's book metrics.
 * Uses React Query for caching and deduplication.
 * 
 * @param repId - The rep's ID (uses new_owner_id if proposal exists, else owner_id)
 * @param buildId - The current build ID
 * @param useProposed - If true, look at new_owner_id; if false, look at owner_id
 * 
 * @returns Metrics object with loading state
 * 
 * @see MASTER_LOGIC.mdc §13.7
 */
export function useRepMetrics(
  repId: string | null,
  buildId: string,
  useProposed: boolean = true
): {
  metrics: RepBookMetrics | null;
  isLoading: boolean;
  error: Error | null;
} {
  const { data: metrics, isLoading, error } = useQuery({
    queryKey: ['rep-metrics', buildId, repId, useProposed],
    queryFn: async (): Promise<RepBookMetrics | null> => {
      if (!repId || !buildId) return null;

      // Determine which owner field to filter by
      const ownerField = useProposed ? 'new_owner_id' : 'owner_id';

      // Fetch accounts owned by this rep
      const { data: accounts, error: accountsError } = await supabase
        .from('accounts')
        .select(`
          sfdc_account_id,
          account_name,
          is_parent,
          is_customer,
          arr,
          calculated_arr,
          hierarchy_bookings_arr_converted,
          calculated_atr,
          atr,
          expansion_tier,
          initial_sale_tier,
          cre_count,
          pipeline_value
        `)
        .eq('build_id', buildId)
        .eq(ownerField, repId);

      if (accountsError) {
        console.error('[useRepMetrics] Error fetching accounts:', accountsError);
        throw accountsError;
      }

      if (!accounts || accounts.length === 0) {
        // Return empty metrics for rep with no accounts
        return {
          accountCount: 0,
          customerCount: 0,
          prospectCount: 0,
          totalARR: 0,
          totalATR: 0,
          totalPipeline: 0,
          tierBreakdown: { tier1: 0, tier2: 0, tier3: 0, tier4: 0, unclassified: 0 },
          creRiskCount: 0,
        };
      }

      // Get account IDs for opportunity lookup
      const accountIds = accounts.map(a => a.sfdc_account_id);

      // Fetch opportunities for pipeline calculation
      const { data: opportunities, error: oppsError } = await supabase
        .from('opportunities')
        .select('sfdc_account_id, net_arr, amount, opportunity_type')
        .eq('build_id', buildId)
        .in('sfdc_account_id', accountIds);

      if (oppsError) {
        console.error('[useRepMetrics] Error fetching opportunities:', oppsError);
        // Continue without opportunities - pipeline will be from account.pipeline_value
      }

      // Build pipeline map from opportunities
      // For prospects: all opportunities count
      // For customers: only Expansion + New Subscription count
      const pipelineByAccount = new Map<string, number>();
      const customerAccountIds = new Set(
        accounts.filter(a => a.is_customer).map(a => a.sfdc_account_id)
      );

      if (opportunities) {
        for (const opp of opportunities) {
          const isCustomerAccount = customerAccountIds.has(opp.sfdc_account_id);
          
          // For customers, only count pipeline opportunities (Expansion, New Subscription)
          // For prospects, count all opportunities
          if (!isCustomerAccount || isPipelineOpportunity(opp)) {
            const currentPipeline = pipelineByAccount.get(opp.sfdc_account_id) || 0;
            pipelineByAccount.set(
              opp.sfdc_account_id, 
              currentPipeline + getOpportunityPipelineValue(opp)
            );
          }
        }
      }

      // Calculate metrics using domain function
      return calculateRepBookMetrics(accounts as RepBookAccountData[], pipelineByAccount);
    },
    enabled: !!repId && !!buildId,
    staleTime: 30_000, // 30 seconds - metrics change with reassignments
    gcTime: 5 * 60_000, // 5 minutes
  });

  return {
    metrics: metrics ?? null,
    isLoading,
    error: error as Error | null,
  };
}

/**
 * useRepMetricsWithDelta
 * 
 * Enhanced hook that computes metrics AND the delta after removing/adding accounts.
 * Used for the reassignment impact preview.
 * 
 * @param repId - The rep's ID
 * @param buildId - The current build ID
 * @param accountsBeingMoved - Accounts that will be moved (for calculating delta)
 * @param isGainingRep - If true, accounts are being added; if false, removed
 * 
 * @see MASTER_LOGIC.mdc §13.7
 */
export function useRepMetricsWithDelta(
  repId: string | null,
  buildId: string,
  accountsBeingMoved: RepBookAccountData[],
  isGainingRep: boolean
): {
  currentMetrics: RepBookMetrics | null;
  projectedMetrics: RepBookMetrics | null;
  isLoading: boolean;
  error: Error | null;
} {
  const { metrics: currentMetrics, isLoading, error } = useRepMetrics(repId, buildId);

  // Calculate what the metrics will be after the move
  let projectedMetrics: RepBookMetrics | null = null;
  
  if (currentMetrics && accountsBeingMoved.length > 0) {
    // Calculate metrics for the accounts being moved
    const movingMetrics = calculateRepBookMetrics(accountsBeingMoved);
    
    if (isGainingRep) {
      // Rep is receiving accounts - add to current
      projectedMetrics = {
        accountCount: currentMetrics.accountCount + movingMetrics.accountCount,
        customerCount: currentMetrics.customerCount + movingMetrics.customerCount,
        prospectCount: currentMetrics.prospectCount + movingMetrics.prospectCount,
        totalARR: currentMetrics.totalARR + movingMetrics.totalARR,
        totalATR: currentMetrics.totalATR + movingMetrics.totalATR,
        totalPipeline: currentMetrics.totalPipeline + movingMetrics.totalPipeline,
        tierBreakdown: {
          tier1: currentMetrics.tierBreakdown.tier1 + movingMetrics.tierBreakdown.tier1,
          tier2: currentMetrics.tierBreakdown.tier2 + movingMetrics.tierBreakdown.tier2,
          tier3: currentMetrics.tierBreakdown.tier3 + movingMetrics.tierBreakdown.tier3,
          tier4: currentMetrics.tierBreakdown.tier4 + movingMetrics.tierBreakdown.tier4,
          unclassified: currentMetrics.tierBreakdown.unclassified + movingMetrics.tierBreakdown.unclassified,
        },
        creRiskCount: currentMetrics.creRiskCount + movingMetrics.creRiskCount,
      };
    } else {
      // Rep is losing accounts - subtract from current
      projectedMetrics = {
        accountCount: Math.max(0, currentMetrics.accountCount - movingMetrics.accountCount),
        customerCount: Math.max(0, currentMetrics.customerCount - movingMetrics.customerCount),
        prospectCount: Math.max(0, currentMetrics.prospectCount - movingMetrics.prospectCount),
        totalARR: Math.max(0, currentMetrics.totalARR - movingMetrics.totalARR),
        totalATR: Math.max(0, currentMetrics.totalATR - movingMetrics.totalATR),
        totalPipeline: Math.max(0, currentMetrics.totalPipeline - movingMetrics.totalPipeline),
        tierBreakdown: {
          tier1: Math.max(0, currentMetrics.tierBreakdown.tier1 - movingMetrics.tierBreakdown.tier1),
          tier2: Math.max(0, currentMetrics.tierBreakdown.tier2 - movingMetrics.tierBreakdown.tier2),
          tier3: Math.max(0, currentMetrics.tierBreakdown.tier3 - movingMetrics.tierBreakdown.tier3),
          tier4: Math.max(0, currentMetrics.tierBreakdown.tier4 - movingMetrics.tierBreakdown.tier4),
          unclassified: Math.max(0, currentMetrics.tierBreakdown.unclassified - movingMetrics.tierBreakdown.unclassified),
        },
        creRiskCount: Math.max(0, currentMetrics.creRiskCount - movingMetrics.creRiskCount),
      };
    }
  }

  return {
    currentMetrics,
    projectedMetrics,
    isLoading,
    error,
  };
}

export default useRepMetrics;

