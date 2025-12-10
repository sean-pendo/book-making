/**
 * Priority Executor Service
 * 
 * Orchestrates the priority-based assignment process:
 * 1. Apply holdover filters to identify protected accounts
 * 2. Run HiGHS optimization on remaining accounts with priority-weighted objectives
 * 
 * Never uses greedy assignment - all optimization goes through HiGHS MILP solver.
 */

import { 
  PriorityConfig, 
  getPriorityById, 
  getHoldoverPriorities, 
  getOptimizationPriorities 
} from '@/config/priorityRegistry';
import { 
  runOptimization, 
  SandboxAccount, 
  SandboxRep, 
  SandboxConfig, 
  OptimizedAssignment,
  OptimizationResult 
} from './optimization/optimizationSolver';
import { calculateTop10PercentThreshold } from './commercialPriorityHandlers';
import { supabase } from '@/integrations/supabase/client';

export interface Account {
  sfdc_account_id: string;
  account_name: string;
  calculated_arr: number | null;
  hierarchy_bookings_arr_converted: number | null;
  cre_count: number | null;
  cre_risk: boolean | null;
  sales_territory: string | null;
  geo: string | null;
  owner_id: string | null;
  owner_name: string | null;
  exclude_from_reassignment: boolean | null;
  pe_firm: string | null;
  is_customer: boolean | null;
  is_parent: boolean | null;
  hq_country: string | null;
  renewal_quarter: string | null;
}

export interface SalesRep {
  rep_id: string;
  name: string;
  region: string | null;
  sub_region: string | null;
  is_renewal_specialist: boolean | null;
  is_strategic_rep: boolean;
  is_active: boolean | null;
  include_in_assignments: boolean | null;
  flm: string | null;
  slm: string | null;
}

export interface AssignmentConfig {
  customer_target_arr: number;
  customer_max_arr: number;
  capacity_variance_percent: number;
  territory_mappings: Record<string, string>;
  max_cre_per_rep: number;
  assignment_mode: string;
  priority_config: PriorityConfig[];
  rs_arr_threshold: number;
}

export interface PriorityExecutionResult {
  protectedAccounts: ProtectedAccount[];
  optimizationResult: OptimizationResult;
  executionStats: ExecutionStats;
}

export interface ProtectedAccount {
  account: Account;
  reason: string;
  priority_id: string;
  assigned_rep_id: string | null;
  assigned_rep_name: string | null;
}

export interface ExecutionStats {
  total_accounts: number;
  protected_count: number;
  optimized_count: number;
  holdover_breakdown: Record<string, number>;
  execution_time_ms: number;
}

/**
 * Main entry point: execute assignment with priority configuration
 */
export async function executeAssignmentWithPriorities(
  buildId: string,
  accounts: Account[],
  reps: SalesRep[],
  config: AssignmentConfig
): Promise<PriorityExecutionResult> {
  const startTime = performance.now();
  
  console.log(`[PriorityExecutor] Starting execution for ${accounts.length} accounts, ${reps.length} reps`);
  console.log(`[PriorityExecutor] Mode: ${config.assignment_mode}, Priorities: ${config.priority_config.length}`);

  // PHASE 1: Apply holdover filters
  const holdoverPriorities = getHoldoverPriorities(config.priority_config);
  console.log(`[PriorityExecutor] Phase 1: Applying ${holdoverPriorities.length} holdover priorities`);
  
  const { protectedAccounts, assignableAccounts, holdoverBreakdown } = await applyHoldovers(
    accounts,
    reps,
    holdoverPriorities,
    config
  );
  
  console.log(`[PriorityExecutor] Protected: ${protectedAccounts.length}, Assignable: ${assignableAccounts.length}`);

  // PHASE 2: Run HiGHS optimization on remaining accounts
  const optimizationPriorities = getOptimizationPriorities(config.priority_config);
  console.log(`[PriorityExecutor] Phase 2: Running HiGHS with ${optimizationPriorities.length} optimization priorities`);
  
  // Convert to sandbox format
  const sandboxAccounts = convertToSandboxAccounts(assignableAccounts);
  const sandboxReps = convertToSandboxReps(reps, config);
  const sandboxConfig = buildSandboxConfig(config, optimizationPriorities);
  
  // Run optimization
  const optimizationResult = await runOptimization(sandboxAccounts, sandboxReps, sandboxConfig);
  
  const executionTime = performance.now() - startTime;
  
  const executionStats: ExecutionStats = {
    total_accounts: accounts.length,
    protected_count: protectedAccounts.length,
    optimized_count: optimizationResult.assignments.length,
    holdover_breakdown: holdoverBreakdown,
    execution_time_ms: Math.round(executionTime)
  };
  
  console.log(`[PriorityExecutor] Completed in ${executionTime.toFixed(0)}ms`, executionStats);
  
  return {
    protectedAccounts,
    optimizationResult,
    executionStats
  };
}

/**
 * Apply holdover priority filters to identify protected accounts
 */
async function applyHoldovers(
  accounts: Account[],
  reps: SalesRep[],
  holdoverPriorities: PriorityConfig[],
  config: AssignmentConfig
): Promise<{
  protectedAccounts: ProtectedAccount[];
  assignableAccounts: Account[];
  holdoverBreakdown: Record<string, number>;
}> {
  const protectedAccounts: ProtectedAccount[] = [];
  const protectedIds = new Set<string>();
  const holdoverBreakdown: Record<string, number> = {};
  
  // Sort by position (lower = higher priority)
  const sortedPriorities = [...holdoverPriorities].sort((a, b) => a.position - b.position);
  
  // Calculate Top 10% threshold if needed
  let top10Threshold = 0;
  if (sortedPriorities.some(p => p.id === 'top_10_percent')) {
    top10Threshold = calculateTop10PercentThreshold(accounts);
    console.log(`[PriorityExecutor] Top 10% ARR threshold: $${top10Threshold.toLocaleString()}`);
  }
  
  // Build rep lookup for name resolution
  const repMap = new Map(reps.map(r => [r.rep_id, r]));
  
  for (const priority of sortedPriorities) {
    const definition = getPriorityById(priority.id);
    if (!definition || !priority.enabled) continue;
    
    let matchCount = 0;
    
    for (const account of accounts) {
      // Skip if already protected
      if (protectedIds.has(account.sfdc_account_id)) continue;
      
      let isProtected = false;
      let reason = '';
      
      switch (priority.id) {
        case 'manual_holdover':
          if (account.exclude_from_reassignment) {
            isProtected = true;
            reason = 'Marked as excluded from reassignment';
          }
          break;
          
        case 'geo_and_continuity':
          // Check if current owner matches geography - the strongest retention signal
          if (account.owner_id && account.sales_territory) {
            const currentRep = repMap.get(account.owner_id);
            if (currentRep) {
              const targetRegion = config.territory_mappings[account.sales_territory] || account.geo;
              if (currentRep.region === targetRegion) {
                isProtected = true;
                reason = `Geography + Continuity match (${currentRep.region})`;
              }
            }
          }
          break;
          
        case 'pe_firm':
          if (account.pe_firm) {
            isProtected = true;
            reason = `PE-owned (${account.pe_firm})`;
          }
          break;
          
        case 'top_10_percent':
          const accountARR = account.hierarchy_bookings_arr_converted || 0;
          if (accountARR >= top10Threshold && top10Threshold > 0) {
            isProtected = true;
            reason = `Top 10% ARR ($${accountARR.toLocaleString()})`;
          }
          break;
          
        case 'cre_risk':
          if (account.cre_risk) {
            isProtected = true;
            reason = 'CRE Risk - At Risk account';
          }
          break;
      }
      
      if (isProtected) {
        const currentRep = account.owner_id ? repMap.get(account.owner_id) : null;
        
        protectedAccounts.push({
          account,
          reason,
          priority_id: priority.id,
          assigned_rep_id: account.owner_id,
          assigned_rep_name: currentRep?.name || account.owner_name
        });
        protectedIds.add(account.sfdc_account_id);
        matchCount++;
      }
    }
    
    holdoverBreakdown[priority.id] = matchCount;
    console.log(`[PriorityExecutor] Holdover '${definition.name}': ${matchCount} accounts protected`);
  }
  
  // Filter out protected accounts
  const assignableAccounts = accounts.filter(a => !protectedIds.has(a.sfdc_account_id));
  
  return { protectedAccounts, assignableAccounts, holdoverBreakdown };
}

/**
 * Convert accounts to sandbox format for HiGHS
 */
function convertToSandboxAccounts(accounts: Account[]): SandboxAccount[] {
  return accounts.map(a => ({
    sfdc_account_id: a.sfdc_account_id,
    account_name: a.account_name,
    calculated_arr: a.calculated_arr || 0,
    cre_count: a.cre_count || 0,
    sales_territory: a.sales_territory || '',
    geo: a.geo || '',
    owner_id: a.owner_id,
    owner_name: a.owner_name,
    is_strategic: false
  }));
}

/**
 * Convert reps to sandbox format for HiGHS
 */
function convertToSandboxReps(reps: SalesRep[], config: AssignmentConfig): SandboxRep[] {
  return reps
    .filter(r => r.is_active && r.include_in_assignments)
    .map(r => ({
      rep_id: r.rep_id,
      name: r.name,
      region: r.region || '',
      is_strategic_rep: r.is_strategic_rep,
      is_active: r.is_active ?? true,
      include_in_assignments: r.include_in_assignments ?? true
    }));
}

/**
 * Build sandbox config with priority-weighted objectives
 */
function buildSandboxConfig(
  config: AssignmentConfig,
  optimizationPriorities: PriorityConfig[]
): SandboxConfig {
  // Calculate weights from enabled optimization priorities
  // Higher position priority gets higher weight contribution
  let geoWeight = 0;
  let continuityWeight = 0;
  let balanceWeight = 0;
  
  // Normalize weights based on priority positions and weights
  const totalWeight = optimizationPriorities.reduce((sum, p) => sum + p.weight, 0);
  
  for (const priority of optimizationPriorities) {
    if (!priority.enabled) continue;
    
    const normalizedWeight = (priority.weight / totalWeight) * 100;
    
    switch (priority.id) {
      case 'geography':
      case 'sub_region':
        geoWeight += normalizedWeight;
        break;
      case 'continuity':
        continuityWeight += normalizedWeight;
        break;
      case 'arr_balance':
      case 'renewal_balance':
        balanceWeight += normalizedWeight;
        break;
    }
  }
  
  // Ensure weights sum to 100
  const weightSum = geoWeight + continuityWeight + balanceWeight;
  if (weightSum > 0) {
    geoWeight = Math.round((geoWeight / weightSum) * 100);
    continuityWeight = Math.round((continuityWeight / weightSum) * 100);
    balanceWeight = 100 - geoWeight - continuityWeight;
  } else {
    // Default weights if no optimization priorities
    geoWeight = 40;
    continuityWeight = 30;
    balanceWeight = 30;
  }
  
  return {
    target_arr: config.customer_target_arr,
    variance_pct: config.capacity_variance_percent / 100,
    max_arr: config.customer_max_arr,
    max_cre_per_rep: config.max_cre_per_rep,
    geo_weight: geoWeight,
    continuity_weight: continuityWeight,
    balance_weight: balanceWeight,
    p4_only_overflow: true,
    territory_mappings: config.territory_mappings
  };
}

/**
 * Combine protected and optimized results into final assignments
 */
export function combineResults(
  protectedAccounts: ProtectedAccount[],
  optimizationResult: OptimizationResult
): OptimizedAssignment[] {
  // Convert protected accounts to assignment format
  const protectedAssignments: OptimizedAssignment[] = protectedAccounts
    .filter(p => p.assigned_rep_id) // Only include those with assigned reps
    .map(p => ({
      sfdc_account_id: p.account.sfdc_account_id,
      account_name: p.account.account_name,
      assigned_rep_id: p.assigned_rep_id!,
      assigned_rep_name: p.assigned_rep_name || '',
      account_arr: p.account.calculated_arr || 0,
      geo_match: true, // Protected accounts keep current assignment
      continuity_maintained: true,
      rationale: `Protected: ${p.reason}`
    }));
  
  return [...protectedAssignments, ...optimizationResult.assignments];
}

/**
 * Load assignment configuration from database
 */
export async function loadAssignmentConfig(buildId: string): Promise<AssignmentConfig | null> {
  const { data, error } = await supabase
    .from('assignment_configuration')
    .select('*')
    .eq('build_id', buildId)
    .maybeSingle();
  
  if (error || !data) {
    console.error('[PriorityExecutor] Failed to load config:', error);
    return null;
  }
  
  return {
    customer_target_arr: data.customer_target_arr || 2000000,
    customer_max_arr: data.customer_max_arr || 3000000,
    capacity_variance_percent: data.capacity_variance_percent || 10,
    territory_mappings: (data.territory_mappings as Record<string, string>) || {},
    max_cre_per_rep: data.max_cre_per_rep || 3,
    assignment_mode: data.assignment_mode || 'ENT',
    priority_config: (data.priority_config as PriorityConfig[]) || [],
    rs_arr_threshold: data.rs_arr_threshold || 25000
  };
}

