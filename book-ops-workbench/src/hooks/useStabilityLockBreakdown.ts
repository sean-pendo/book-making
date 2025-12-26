/**
 * Hook to calculate stability lock breakdown for pie chart visualization.
 * 
 * Self-contained hook that fetches data and computes lock breakdown using
 * the same logic as the assignment engine (identifyLockedAccounts).
 * 
 * @see MASTER_LOGIC.mdc §13.4.3 - Stability Lock Breakdown
 * @see MASTER_LOGIC.mdc §11.5 - Account Locking Priorities
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getAccountARR, getAccountATR } from '@/_domain';
import { identifyLockedAccounts } from '@/services/optimization/constraints/stabilityLocks';
import { DEFAULT_LP_STABILITY_CONFIG } from '@/services/optimization/types';
import type { LPStabilityConfig, AggregatedAccount, EligibleRep } from '@/services/optimization/types';
import type { StabilityLockBreakdown } from '@/types/analytics';

/**
 * Columns needed from accounts table for stability lock checking.
 * Minimal set to reduce data transfer.
 */
const ACCOUNT_COLUMNS = `
  sfdc_account_id,
  account_name,
  is_parent,
  owner_id,
  owner_name,
  owner_change_date,
  owners_lifetime_count,
  hierarchy_bookings_arr_converted,
  calculated_arr,
  arr,
  calculated_atr,
  atr,
  is_strategic,
  sales_territory,
  geo,
  employees,
  enterprise_vs_commercial,
  expansion_tier,
  initial_sale_tier,
  cre_risk,
  renewal_date,
  pe_firm,
  exclude_from_reassignment
`;

/**
 * Columns needed from sales_reps table for stability lock checking.
 */
const REP_COLUMNS = `
  rep_id,
  name,
  region,
  team_tier,
  pe_firms,
  is_active,
  include_in_assignments,
  is_strategic_rep,
  is_backfill_source,
  is_backfill_target,
  backfill_target_rep_id
`;

/**
 * Convert raw account from DB to AggregatedAccount for stability checking
 */
function toAggregatedAccount(account: any): AggregatedAccount {
  return {
    sfdc_account_id: account.sfdc_account_id,
    account_name: account.account_name || '',
    aggregated_arr: getAccountARR(account),
    aggregated_atr: getAccountATR(account),
    pipeline_value: 0,
    child_ids: [],
    is_parent: account.is_parent ?? true,
    owner_id: account.owner_id,
    owner_name: account.owner_name,
    owner_change_date: account.owner_change_date,
    owners_lifetime_count: account.owners_lifetime_count || 1,
    is_customer: getAccountARR(account) > 0,
    is_strategic: account.is_strategic || false,
    sales_territory: account.sales_territory,
    geo: account.geo,
    employees: account.employees,
    enterprise_vs_commercial: account.enterprise_vs_commercial,
    tier: null,
    expansion_tier: account.expansion_tier,
    initial_sale_tier: account.initial_sale_tier,
    cre_risk: account.cre_risk,
    renewal_date: account.renewal_date,
    pe_firm: account.pe_firm,
    exclude_from_reassignment: account.exclude_from_reassignment,
  };
}

/**
 * Convert raw rep from DB to EligibleRep for stability checking
 */
function toEligibleRep(rep: any): EligibleRep {
  return {
    rep_id: rep.rep_id,
    name: rep.name,
    region: rep.region,
    team_tier: rep.team_tier || null,
    pe_firms: rep.pe_firms,
    is_active: rep.is_active ?? true,
    include_in_assignments: rep.include_in_assignments ?? true,
    is_strategic_rep: rep.is_strategic_rep || false,
    is_backfill_source: rep.is_backfill_source || false,
    is_backfill_target: rep.is_backfill_target || false,
    backfill_target_rep_id: rep.backfill_target_rep_id || null,
    current_arr: 0,
  };
}

/**
 * Fetch stability lock breakdown for a build.
 */
async function fetchStabilityLockBreakdown(buildId: string): Promise<StabilityLockBreakdown> {
  // Fetch accounts (parents only - children inherit locks)
  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select(ACCOUNT_COLUMNS)
    .eq('build_id', buildId)
    .eq('is_parent', true);

  if (accountsError) {
    console.error('[useStabilityLockBreakdown] Error fetching accounts:', accountsError);
    throw accountsError;
  }

  // Fetch reps
  const { data: reps, error: repsError } = await supabase
    .from('sales_reps')
    .select(REP_COLUMNS)
    .eq('build_id', buildId);

  if (repsError) {
    console.error('[useStabilityLockBreakdown] Error fetching reps:', repsError);
    throw repsError;
  }

  // Fetch stability config from assignment_configuration
  const { data: configData } = await supabase
    .from('assignment_configuration')
    .select('lp_stability_config')
    .eq('build_id', buildId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Merge saved config with defaults, with type guard
  const savedConfig = configData?.lp_stability_config;
  const stabilityConfig: LPStabilityConfig = {
    ...DEFAULT_LP_STABILITY_CONFIG,
    ...(savedConfig && typeof savedConfig === 'object' ? savedConfig as Partial<LPStabilityConfig> : {}),
  };

  // Convert to optimization types
  const aggregatedAccounts = (accounts || []).map(toAggregatedAccount);
  const eligibleReps = (reps || []).map(toEligibleRep);

  // Use the same function as the assignment engine
  const { lockStats } = identifyLockedAccounts(
    aggregatedAccounts,
    eligibleReps,
    stabilityConfig
  );

  const total = Object.values(lockStats).reduce((sum, count) => sum + count, 0);

  return {
    manualLock: lockStats.manual_lock || 0,
    backfillMigration: lockStats.backfill_migration || 0,
    creRisk: lockStats.cre_risk || 0,
    renewalSoon: lockStats.renewal_soon || 0,
    peFirm: lockStats.pe_firm || 0,
    recentChange: lockStats.recent_change || 0,
    total,
  };
}

/**
 * Hook to get stability lock breakdown for a build.
 * 
 * @param buildId - The build ID to fetch breakdown for
 * @returns Query result with StabilityLockBreakdown data
 * 
 * @example
 * const { data: breakdown, isLoading } = useStabilityLockBreakdown(buildId);
 * if (breakdown && breakdown.total > 0) {
 *   // Render pie chart
 * }
 */
export function useStabilityLockBreakdown(buildId: string | undefined) {
  return useQuery({
    queryKey: ['stability-lock-breakdown', buildId],
    queryFn: () => fetchStabilityLockBreakdown(buildId!),
    enabled: !!buildId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

