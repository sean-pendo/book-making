import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ProspectOpportunityData {
  netARR: number;
  closeDate: string | null;
  opportunityCount: number;
}

export interface UseProspectOpportunitiesResult {
  /** Map of sfdc_account_id -> { netARR, closeDate, opportunityCount } */
  opportunityByAccount: Map<string, ProspectOpportunityData>;
  /** Get Net ARR for an account (returns 0 if no opportunities) */
  getNetARR: (sfdcAccountId: string) => number;
  /** Get earliest close date for an account (returns null if no opportunities) */
  getCloseDate: (sfdcAccountId: string) => string | null;
  /** Get rolled-up Net ARR for a parent + all children */
  getRolledUpNetARR: (parentAccountId: string, childAccountIds: string[]) => number;
  /** Get earliest close date across parent + all children */
  getRolledUpCloseDate: (parentAccountId: string, childAccountIds: string[]) => string | null;
  /** Format Net ARR with color class based on value */
  getNetARRColorClass: (netARR: number) => string;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to fetch and aggregate prospect opportunity data (Net ARR and Close Date)
 * 
 * For prospects, we show:
 * - Net ARR: Sum of all net_arr from opportunities for the account
 * - Close Date: Earliest close_date from opportunities for the account
 * 
 * For parent/child rollups:
 * - Net ARR: Sum across parent + all children
 * - Close Date: Earliest across parent + all children
 */
export const useProspectOpportunities = (buildId: string | undefined): UseProspectOpportunitiesResult => {
  const { data: opportunityByAccount, isLoading, error } = useQuery({
    queryKey: ['prospect-opportunities', buildId],
    queryFn: async (): Promise<Map<string, ProspectOpportunityData>> => {
      if (!buildId) return new Map();

      // Fetch all opportunities with net_arr and close_date for this build
      const { data: opportunities, error } = await supabase
        .from('opportunities')
        .select('sfdc_account_id, net_arr, close_date')
        .eq('build_id', buildId);

      if (error) {
        console.error('Error fetching prospect opportunities:', error);
        throw error;
      }

      // Group by account and aggregate
      const accountMap = new Map<string, ProspectOpportunityData>();

      (opportunities || []).forEach((opp) => {
        const accountId = opp.sfdc_account_id;
        const existing = accountMap.get(accountId) || {
          netARR: 0,
          closeDate: null,
          opportunityCount: 0,
        };

        // Sum Net ARR
        existing.netARR += opp.net_arr || 0;
        existing.opportunityCount += 1;

        // Track earliest close date
        if (opp.close_date) {
          if (!existing.closeDate || opp.close_date < existing.closeDate) {
            existing.closeDate = opp.close_date;
          }
        }

        accountMap.set(accountId, existing);
      });

      console.log(`📊 Loaded prospect opportunity data for ${accountMap.size} accounts`);
      return accountMap;
    },
    enabled: !!buildId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  const getNetARR = (sfdcAccountId: string): number => {
    return opportunityByAccount?.get(sfdcAccountId)?.netARR || 0;
  };

  const getCloseDate = (sfdcAccountId: string): string | null => {
    return opportunityByAccount?.get(sfdcAccountId)?.closeDate || null;
  };

  /**
   * Get rolled-up Net ARR for a parent account + all its children
   */
  const getRolledUpNetARR = (parentAccountId: string, childAccountIds: string[]): number => {
    let total = getNetARR(parentAccountId);
    childAccountIds.forEach((childId) => {
      total += getNetARR(childId);
    });
    return total;
  };

  /**
   * Get earliest close date across parent + all children
   */
  const getRolledUpCloseDate = (parentAccountId: string, childAccountIds: string[]): string | null => {
    const allIds = [parentAccountId, ...childAccountIds];
    let earliest: string | null = null;

    allIds.forEach((accountId) => {
      const closeDate = getCloseDate(accountId);
      if (closeDate) {
        if (!earliest || closeDate < earliest) {
          earliest = closeDate;
        }
      }
    });

    return earliest;
  };

  /**
   * Get Tailwind color class based on Net ARR value
   * - Positive: Green (expansion/new business)
   * - Zero: Default gray
   * - Negative: Red (contraction/churn)
   */
  const getNetARRColorClass = (netARR: number): string => {
    if (netARR > 0) {
      return 'text-green-600 dark:text-green-400';
    } else if (netARR < 0) {
      return 'text-red-600 dark:text-red-400';
    }
    return 'text-muted-foreground';
  };

  return {
    opportunityByAccount: opportunityByAccount || new Map(),
    getNetARR,
    getCloseDate,
    getRolledUpNetARR,
    getRolledUpCloseDate,
    getNetARRColorClass,
    isLoading,
    error: error as Error | null,
  };
};

/**
 * Utility function to format close date for display
 */
export const formatCloseDate = (closeDate: string | null): string => {
  if (!closeDate) return '-';
  
  try {
    const date = new Date(closeDate + 'T00:00:00'); // Avoid timezone shifts
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return closeDate;
  }
};

/**
 * Utility function to format Net ARR with currency and sign
 */
export const formatNetARR = (netARR: number): string => {
  const absValue = Math.abs(netARR);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(absValue);
  
  if (netARR < 0) {
    return `-${formatted}`;
  }
  return formatted;
};

