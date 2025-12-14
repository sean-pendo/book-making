/**
 * Data Loader
 * 
 * Loads all data needed for Pure Optimization LP solve:
 * - Accounts (parents only, with ARR source priority)
 * - Sales Reps (filtered by eligibility)
 * - Opportunities (for prospect pipeline value)
 * - Territory Mappings
 * - Assignment Configuration
 */

import { supabase } from '@/integrations/supabase/client';
import { getAccountARR } from '@/_domain';
import type { 
  AggregatedAccount, 
  EligibleRep, 
  LPConfiguration,
  LPEngineConfig
} from '../types';
import { getDefaultLPConfiguration } from '../types';

export interface LoadedBuildData {
  accounts: AggregatedAccount[];
  customerAccounts: AggregatedAccount[];
  prospectAccounts: AggregatedAccount[];
  eligibleReps: EligibleRep[];
  strategicReps: EligibleRep[];
  regularReps: EligibleRep[];
  pipelineMap: Map<string, number>;
  territoryMappings: Record<string, string>;
  lpConfig: LPConfiguration;
  targetArr: number;
  hardCapArr: number;
}

// ARR calculation: imported from @/_domain (single source of truth)

/**
 * Fetch all accounts with pagination (Supabase default limit is 1000)
 */
async function fetchAllAccounts(buildId: string): Promise<any[]> {
  const PAGE_SIZE = 1000;
  const allRows: any[] = [];
  let page = 0;
  let hasMore = true;
  
  while (hasMore) {
    const { data, error, count } = await supabase
      .from('accounts')
      .select('*', { count: 'exact' })
      .eq('build_id', buildId)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    
    if (error) throw new Error(`Failed to load accounts: ${error.message}`);
    
    if (data) {
      allRows.push(...data);
    }
    
    // Check if there are more pages
    const totalCount = count || 0;
    hasMore = (page + 1) * PAGE_SIZE < totalCount;
    page++;
  }
  
  console.log(`[DataLoader] Fetched ${allRows.length} accounts with pagination`);
  return allRows;
}

/**
 * Fetch all opportunities with pagination (Supabase default limit is 1000)
 */
async function fetchAllOpportunities(buildId: string): Promise<any[]> {
  const PAGE_SIZE = 1000;
  const allRows: any[] = [];
  let page = 0;
  let hasMore = true;
  
  while (hasMore) {
    const { data, error, count } = await supabase
      .from('opportunities')
      .select('sfdc_account_id, net_arr', { count: 'exact' })
      .eq('build_id', buildId)
      .gt('net_arr', 0)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    
    if (error) throw new Error(`Failed to load opportunities: ${error.message}`);
    
    if (data) {
      allRows.push(...data);
    }
    
    // Check if there are more pages
    const totalCount = count || 0;
    hasMore = (page + 1) * PAGE_SIZE < totalCount;
    page++;
  }
  
  return allRows;
}

/**
 * Load all build data for LP optimization
 */
export async function loadBuildData(buildId: string): Promise<LoadedBuildData> {
  console.log(`[DataLoader] Loading build data for ${buildId}...`);
  
  // Parallel fetch all data sources WITH PAGINATION for accounts/opportunities
  const [
    rawAccounts,
    repsResult,
    rawOpportunities,
    configResult
  ] = await Promise.all([
    fetchAllAccounts(buildId),
    supabase
      .from('sales_reps')
      .select('*')
      .eq('build_id', buildId),
    fetchAllOpportunities(buildId),
    supabase
      .from('assignment_configuration')
      .select('*')
      .eq('build_id', buildId)
      .eq('account_scope', 'all')
      .maybeSingle()
  ]);
  
  if (repsResult.error) throw new Error(`Failed to load reps: ${repsResult.error.message}`);
  
  const rawReps = repsResult.data || [];
  const rawConfig = configResult.data;
  
  console.log(`[DataLoader] Loaded: ${rawAccounts.length} accounts, ${rawReps.length} reps, ${rawOpportunities.length} opportunities`);
  
  // Build pipeline map for prospects
  const pipelineMap = new Map<string, number>();
  rawOpportunities.forEach(opp => {
    const current = pipelineMap.get(opp.sfdc_account_id) || 0;
    pipelineMap.set(opp.sfdc_account_id, current + (opp.net_arr || 0));
  });
  
  // Helper to determine tier from expansion_tier or initial_sale_tier
  const getTier = (a: any): 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Tier 4' | null => {
    // For customers, use expansion_tier; for prospects, use initial_sale_tier
    const tierStr = a.is_customer ? a.expansion_tier : a.initial_sale_tier;
    if (!tierStr) return null;
    
    // Extract tier number from strings like "Expansion Tier 3" or "Initial Tier 2"
    const match = tierStr.match(/Tier\s*(\d)/i);
    if (match) {
      const num = parseInt(match[1]);
      if (num >= 1 && num <= 4) return `Tier ${num}` as 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Tier 4';
    }
    return null;
  };

  // Transform accounts to AggregatedAccount format (parents only)
  const accounts: AggregatedAccount[] = rawAccounts
    .filter(a => a.is_parent)
    .map(a => ({
      sfdc_account_id: a.sfdc_account_id,
      account_name: a.account_name,
      aggregated_arr: getAccountARR(a),
      aggregated_atr: a.atr ?? 0,
      pipeline_value: pipelineMap.get(a.sfdc_account_id) || 0,
      child_ids: [],
      is_parent: true,
      owner_id: a.owner_id,
      owner_name: a.owner_name,
      owner_change_date: a.owner_change_date,
      owners_lifetime_count: a.owners_lifetime_count,
      is_customer: a.is_customer ?? false,
      is_strategic: a.is_strategic ?? false,
      sales_territory: a.sales_territory,
      geo: a.geo,
      employees: a.employees,
      enterprise_vs_commercial: a.enterprise_vs_commercial,
      tier: getTier(a),
      expansion_tier: a.expansion_tier,
      initial_sale_tier: a.initial_sale_tier,
      cre_risk: a.cre_risk,
      renewal_date: a.renewal_date,
      pe_firm: a.pe_firm,
      exclude_from_reassignment: a.exclude_from_reassignment
    }));
  
  // Add child IDs to parents
  const childAccounts = rawAccounts.filter(a => !a.is_parent && a.parent_id);
  const parentMap = new Map(accounts.map(a => [a.sfdc_account_id, a]));
  
  for (const child of childAccounts) {
    const parent = parentMap.get(child.parent_id);
    if (parent) {
      parent.child_ids.push(child.sfdc_account_id);
      // Aggregate ATR from children (ARR already in hierarchy_bookings_arr_converted)
      parent.aggregated_atr += child.atr ?? 0;
    }
  }
  
  // Separate customers and prospects
  const customerAccounts = accounts.filter(a => a.is_customer);
  const prospectAccounts = accounts.filter(a => !a.is_customer);
  
  // Filter and transform reps
  const eligibleReps: EligibleRep[] = rawReps
    .filter(r => 
      r.is_active !== false &&
      r.include_in_assignments !== false &&
      r.is_manager !== true
    )
    .map(r => ({
      rep_id: r.rep_id,
      name: r.name,
      region: r.region,
      team: r.team,
      team_tier: r.team_tier,
      is_active: r.is_active ?? true,
      include_in_assignments: r.include_in_assignments ?? true,
      is_strategic_rep: r.is_strategic_rep ?? false,
      is_backfill_source: r.is_backfill_source,
      is_backfill_target: r.is_backfill_target,
      backfill_target_rep_id: r.backfill_target_rep_id,
      current_arr: 0 // Will be calculated during preprocessing
    }));
  
  const strategicReps = eligibleReps.filter(r => r.is_strategic_rep);
  const regularReps = eligibleReps.filter(r => !r.is_strategic_rep);
  
  console.log(`[DataLoader] Eligible reps: ${eligibleReps.length} (${strategicReps.length} strategic, ${regularReps.length} regular)`);
  console.log(`[DataLoader] Accounts: ${customerAccounts.length} customers, ${prospectAccounts.length} prospects`);
  
  // Parse LP configuration with defaults
  const lpConfig = parseLPConfiguration(rawConfig);
  
  // Get capacity limits
  const targetArr = rawConfig?.customer_target_arr ?? 2000000;
  const hardCapArr = rawConfig?.customer_max_arr ?? 3000000;
  
  return {
    accounts,
    customerAccounts,
    prospectAccounts,
    eligibleReps,
    strategicReps,
    regularReps,
    pipelineMap,
    territoryMappings: (rawConfig?.territory_mappings as Record<string, string>) || {},
    lpConfig,
    targetArr,
    hardCapArr
  };
}

/**
 * Parse LP configuration from database with defaults
 * 
 * Reads min/max/variance from both:
 * 1. lp_balance_config JSON column (if present)
 * 2. Top-level columns (customer_min_arr, customer_max_arr, etc.)
 */
function parseLPConfiguration(config: any): LPConfiguration {
  const defaults = getDefaultLPConfiguration();
  
  if (!config) return defaults;
  
  // Read variance from top-level config columns
  const arrVariance = config.capacity_variance_percent ? config.capacity_variance_percent / 100 : 0.10;
  const atrVariance = config.atr_variance ? config.atr_variance / 100 : 0.15;
  const pipelineVariance = config.prospect_variance_percent ? config.prospect_variance_percent / 100 : 0.15;
  
  return {
    optimization_model: (config.optimization_model as 'waterfall' | 'relaxed_optimization') ?? 'waterfall',
    lp_objectives_customer: {
      ...defaults.lp_objectives_customer,
      ...(config.lp_objectives_customer || {})
    },
    lp_objectives_prospect: {
      ...defaults.lp_objectives_prospect,
      ...(config.lp_objectives_prospect || {})
    },
    lp_balance_config: {
      ...defaults.lp_balance_config,
      ...(config.lp_balance_config || {}),
      // Override with top-level config values (these are the values from the UI)
      arr_min: config.customer_min_arr ?? defaults.lp_balance_config.arr_min,
      arr_max: config.customer_max_arr ?? defaults.lp_balance_config.arr_max,
      arr_variance: arrVariance,
      atr_min: config.atr_min ?? defaults.lp_balance_config.atr_min,
      atr_max: config.atr_max ?? defaults.lp_balance_config.atr_max,
      atr_variance: atrVariance,
      pipeline_min: config.prospect_min_arr ?? defaults.lp_balance_config.pipeline_min,
      pipeline_max: config.prospect_max_arr ?? defaults.lp_balance_config.pipeline_max,
      pipeline_variance: pipelineVariance
    },
    lp_constraints: {
      ...defaults.lp_constraints,
      ...(config.lp_constraints || {})
    },
    lp_stability_config: {
      ...defaults.lp_stability_config,
      ...(config.lp_stability_config || {})
    },
    lp_continuity_params: {
      ...defaults.lp_continuity_params,
      ...(config.lp_continuity_params || {})
    },
    lp_geography_params: {
      ...defaults.lp_geography_params,
      ...(config.lp_geography_params || {})
    },
    lp_team_params: {
      ...defaults.lp_team_params,
      ...(config.lp_team_params || {})
    },
    lp_solver_params: {
      ...defaults.lp_solver_params,
      ...(config.lp_solver_params || {})
    }
  };
}

