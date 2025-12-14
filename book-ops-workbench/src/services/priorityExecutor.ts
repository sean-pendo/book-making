/**
 * Priority Executor Service
 * 
 * ⚠️ DEPRECATION NOTICE (2025-12-11):
 * The EXECUTION FUNCTIONS in this file are NOT USED by the UI.
 * The UI uses `simplifiedAssignmentEngine.ts` via `useAssignmentEngine.ts` hook.
 * 
 * STILL IN USE (DO NOT DELETE):
 * - Type exports: Account, SalesRep (used by parentalAlignmentService, commercialPriorityHandlers)
 * 
 * DEAD CODE (execution functions never called):
 * - executeAssignmentWithPriorities()
 * - filterAccountsByPriority()
 * - combineResults()
 * - loadAssignmentConfig()
 * 
 * TODO: Consider moving types to a shared types file and removing dead execution code.
 * 
 * Original description:
 * Orchestrates the priority-based assignment process:
 * 1. Apply holdover filters to identify protected accounts
 * 2. For each optimization priority, run HiGHS separately for customers and prospects
 */

import { 
  PriorityConfig, 
  getPriorityById, 
  getHoldoverPriorities, 
  getOptimizationPriorities,
  SubConditionConfig
} from '@/config/priorityRegistry';
import { 
  runCustomerOptimization,
  runProspectOptimization,
  runStrategicOptimization,
  updateRepWorkloads,
  OptimizationAccount,
  OptimizationRep,
  OptimizedAssignment,
  OptimizationResult,
  CustomerOptimizationConfig,
  ProspectOptimizationConfig,
} from './optimization/optimizationSolver';
// calculateTop10PercentThreshold removed - top_10_arr sub-condition deprecated
import { supabase } from '@/integrations/supabase/client';
import { 
  resolveParentChildConflicts, 
  ParentalAlignmentWarning 
} from './parentalAlignmentService';

// ============================================================================
// Input Types
// ============================================================================

export interface Account {
  sfdc_account_id: string;
  account_name: string;
  calculated_arr: number | null;
  calculated_atr: number | null;
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
  is_strategic: boolean | null;  // Strategic accounts assigned to strategic reps in Priority 0
  hq_country: string | null;
  renewal_quarter: string | null;
  expansion_tier: string | null;
  initial_sale_tier: string | null;
  employees?: number | null;  // For team alignment (Commercial mode)
  // Prospect pipeline
  pipeline_value?: number | null;
  // Stability checks
  renewal_date?: string | null;
  owner_change_date?: string | null;
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
  team?: string | null;  // Team field containing tier values (SMB/Growth/MM/ENT)
  team_tier?: 'SMB' | 'Growth' | 'MM' | 'ENT' | null;  // For team alignment (Commercial mode)
}

export interface AssignmentConfig {
  // Customer ARR targets
  customer_target_arr: number;
  customer_min_arr?: number;  // Hard floor (optional, defaults to target * (1 - variance))
  customer_max_arr: number;   // Hard cap
  capacity_variance_percent: number;
  // Customer ATR targets
  customer_target_atr: number;
  customer_min_atr?: number;  // Hard floor
  customer_max_atr: number;   // Hard cap
  atr_variance: number;
  // Prospect Pipeline targets
  prospect_target_arr?: number;     // Alias for backward compat
  prospect_target_pipeline: number;
  prospect_min_arr?: number;        // Hard floor
  prospect_max_pipeline: number;
  prospect_max_arr?: number;        // Alias for backward compat
  prospect_variance_percent: number;
  // Shared config
  territory_mappings: Record<string, string>;
  max_cre_per_rep: number;
  assignment_mode: string;
  priority_config: PriorityConfig[];
  rs_arr_threshold: number;
  // Capacity override limits (NULL = use code defaults)
  customer_max_accounts?: number;
  prospect_max_accounts?: number;
}

// ============================================================================
// Result Types
// ============================================================================

export interface PriorityExecutionResult {
  protectedAccounts: ProtectedAccount[];
  allAssignments: OptimizedAssignment[];
  customerAssignments: OptimizedAssignment[];
  prospectAssignments: OptimizedAssignment[];
  executionStats: ExecutionStats;
  priorityBreakdown: PriorityOptimizationStats[];
  parentalAlignmentWarnings: ParentalAlignmentWarning[];
}

export interface ProtectedAccount {
  account: Account;
  reason: string;
  priority_id: string;
  sub_condition_id?: string;
  assigned_rep_id: string | null;
  assigned_rep_name: string | null;
}

export interface ExecutionStats {
  total_accounts: number;
  total_customers: number;
  total_prospects: number;
  protected_count: number;
  customer_assigned_count: number;
  prospect_assigned_count: number;
  holdover_breakdown: Record<string, number>;
  execution_time_ms: number;
  dynamic_customer_weight: number;
}

export interface PriorityOptimizationStats {
  priority_id: string;
  priority_name: string;
  customer_count: number;
  prospect_count: number;
  customer_solve_time_ms: number;
  prospect_solve_time_ms: number;
  customer_status: string;
  prospect_status: string;
}

// ============================================================================
// Main Executor
// ============================================================================

/**
 * Main entry point: execute assignment with priority configuration
 * Runs HIGHS optimization at each priority level
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

  // Count customers vs prospects for dynamic weighting
  const customerAccounts = accounts.filter(a => a.is_customer);
  const prospectAccounts = accounts.filter(a => !a.is_customer);
  
  console.log(`[PriorityExecutor] Customers: ${customerAccounts.length}, Prospects: ${prospectAccounts.length}`);

  // Calculate dynamic weight: customers prioritized when more prospects exist
  const dynamicCustomerWeight = prospectAccounts.length / Math.max(customerAccounts.length, 1);
  console.log(`[PriorityExecutor] Dynamic customer weight: ${dynamicCustomerWeight.toFixed(2)}x`);

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

  // PHASE 1.5: Resolve parent-child conflicts (implicit rule, runs before strategic)
  // This determines which owner should get parents when children have different owners
  const { resolutions: parentalResolutions, warnings: parentalWarnings } = await resolveParentChildConflicts(
    buildId,
    assignableAccounts,
    reps
  );
  
  // Convert resolutions to protected accounts with RESOLVED owner (not current owner)
  const repMap = new Map(reps.map(r => [r.rep_id, r]));
  for (const resolution of parentalResolutions) {
    const account = assignableAccounts.find(a => a.sfdc_account_id === resolution.parentAccountId);
    if (account) {
      protectedAccounts.push({
        account,
        reason: 'Parent-Child Alignment',
        priority_id: 'parent_child_alignment',
        assigned_rep_id: resolution.resolvedOwnerId,
        assigned_rep_name: resolution.resolvedOwnerName
      });
    }
  }
  
  // Remove resolved parents from assignable pool
  const resolvedParentIds = new Set(parentalResolutions.map(r => r.parentAccountId));
  const assignableAfterParental = assignableAccounts.filter(
    a => !resolvedParentIds.has(a.sfdc_account_id)
  );
  
  if (parentalResolutions.length > 0) {
    console.log(`[PriorityExecutor] Parent-Child Alignment: ${parentalResolutions.length} parents resolved, ${parentalWarnings.length} warnings`);
  }

  // PHASE 2: Run HiGHS at each optimization priority
  const optimizationPriorities = getOptimizationPriorities(config.priority_config);
  console.log(`[PriorityExecutor] Phase 2: Running ${optimizationPriorities.length} optimization priorities`);
  
  // Initialize rep workloads
  let optimizationReps = initializeOptimizationReps(reps);
  let remainingAccounts = assignableAfterParental;
  
  const allCustomerAssignments: OptimizedAssignment[] = [];
  const allProspectAssignments: OptimizedAssignment[] = [];
  const priorityBreakdown: PriorityOptimizationStats[] = [];
  
  // Build optimization configs
  const customerConfig = buildCustomerConfig(config);
  const prospectConfig = buildProspectConfig(config);
  
  // ============================================================================
  // PRIORITY 0: Strategic Optimization
  // Strategic accounts are assigned exclusively to strategic reps
  // ============================================================================
  const strategicAccounts = remainingAccounts.filter(a => a.is_strategic === true);
  const strategicReps = reps.filter(r => r.is_strategic_rep);
  
  if (strategicAccounts.length > 0) {
    console.log(`[PriorityExecutor] Priority 0 (Strategic): ${strategicAccounts.length} accounts → ${strategicReps.length} reps`);
    
    if (strategicReps.length === 0) {
      console.warn(`[PriorityExecutor] WARNING: ${strategicAccounts.length} strategic accounts but no strategic reps available!`);
      priorityBreakdown.push({
        priority_id: 'strategic_p0',
        priority_name: 'Priority 0: Strategic',
        customer_count: strategicAccounts.filter(a => a.is_customer).length,
        prospect_count: strategicAccounts.filter(a => !a.is_customer).length,
        customer_solve_time_ms: 0,
        prospect_solve_time_ms: 0,
        customer_status: 'infeasible',
        prospect_status: 'infeasible'
      });
    } else {
      // Convert to optimization format
      const strategicOptAccounts = convertToOptimizationAccounts(strategicAccounts);
      
      // Run strategic optimization
      const strategicResult = await runStrategicOptimization(
        strategicOptAccounts,
        optimizationReps,
        config.max_cre_per_rep
      );
      
      if (strategicResult.status === 'optimal' && strategicResult.assignments.length > 0) {
        // Split assignments into customers and prospects for stats
        const customerAssignments = strategicResult.assignments.filter(a => a.account_arr > 0 || a.account_atr > 0);
        const prospectAssignments = strategicResult.assignments.filter(a => a.account_pipeline > 0 && a.account_arr === 0);
        
        allCustomerAssignments.push(...customerAssignments);
        allProspectAssignments.push(...prospectAssignments);
        optimizationReps = updateRepWorkloads(optimizationReps, strategicResult.assignments);
        
        console.log(`[PriorityExecutor] Strategic optimization: ${strategicResult.assignments.length} assignments`);
        
        priorityBreakdown.push({
          priority_id: 'strategic_p0',
          priority_name: 'Priority 0: Strategic',
          customer_count: customerAssignments.length,
          prospect_count: prospectAssignments.length,
          customer_solve_time_ms: strategicResult.solve_time_ms,
          prospect_solve_time_ms: 0,
          customer_status: 'optimal',
          prospect_status: 'optimal'
        });
      } else {
        console.warn(`[PriorityExecutor] Strategic optimization failed: ${strategicResult.error_message || strategicResult.status}`);
        priorityBreakdown.push({
          priority_id: 'strategic_p0',
          priority_name: 'Priority 0: Strategic',
          customer_count: 0,
          prospect_count: 0,
          customer_solve_time_ms: strategicResult.solve_time_ms,
          prospect_solve_time_ms: 0,
          customer_status: strategicResult.status,
          prospect_status: strategicResult.status
        });
      }
    }
    
    // Remove strategic accounts from remaining pool
    const assignedStrategicIds = new Set(
      [...allCustomerAssignments, ...allProspectAssignments]
        .filter(a => a.rationale.includes('Strategic'))
        .map(a => a.sfdc_account_id)
    );
    remainingAccounts = remainingAccounts.filter(a => !a.is_strategic || !assignedStrategicIds.has(a.sfdc_account_id));
    console.log(`[PriorityExecutor] Remaining after strategic: ${remainingAccounts.length} accounts`);
  }
  
  // ============================================================================
  // PRIORITY 1+: Regular Optimization
  // ============================================================================
  
  // Sort priorities by position
  const sortedPriorities = [...optimizationPriorities].sort((a, b) => a.position - b.position);
  
  for (const priority of sortedPriorities) {
    if (!priority.enabled) continue;
    
    const definition = getPriorityById(priority.id);
    const priorityName = definition?.name || priority.id;
    
    console.log(`[PriorityExecutor] Processing priority: ${priorityName}`);
    
    // Filter accounts matching this priority's criteria
    const { matchingAccounts, nonMatchingAccounts } = filterAccountsByPriority(
      remainingAccounts,
      reps,
      priority,
      config
    );
    
    console.log(`[PriorityExecutor] ${priorityName}: ${matchingAccounts.length} matching accounts`);
    
    if (matchingAccounts.length === 0) {
      priorityBreakdown.push({
        priority_id: priority.id,
        priority_name: priorityName,
        customer_count: 0,
        prospect_count: 0,
        customer_solve_time_ms: 0,
        prospect_solve_time_ms: 0,
        customer_status: 'skipped',
        prospect_status: 'skipped'
      });
      continue;
    }
    
    // Convert to optimization format
    const optimizationAccounts = convertToOptimizationAccounts(matchingAccounts);
    
    // Split into customers and prospects
    const customers = optimizationAccounts.filter(a => a.is_customer);
    const prospects = optimizationAccounts.filter(a => !a.is_customer);
    
    let customerResult: OptimizationResult = { status: 'optimal', assignments: [], solve_time_ms: 0, objective_value: 0 };
    let prospectResult: OptimizationResult = { status: 'optimal', assignments: [], solve_time_ms: 0, objective_value: 0 };
    
    // Run customer optimization (weighted higher when more prospects exist)
    if (customers.length > 0) {
      console.log(`[PriorityExecutor] Running customer optimization: ${customers.length} accounts`);
      customerResult = await runCustomerOptimization(
        customers,
        optimizationReps,
        customerConfig,
        config.max_cre_per_rep
      );
      
      if (customerResult.status === 'optimal') {
        allCustomerAssignments.push(...customerResult.assignments);
        optimizationReps = updateRepWorkloads(optimizationReps, customerResult.assignments);
      }
    }
    
    // Run prospect optimization
    if (prospects.length > 0) {
      console.log(`[PriorityExecutor] Running prospect optimization: ${prospects.length} accounts`);
      prospectResult = await runProspectOptimization(
        prospects,
        optimizationReps,
        prospectConfig,
        config.max_cre_per_rep
      );
      
      if (prospectResult.status === 'optimal') {
        allProspectAssignments.push(...prospectResult.assignments);
        optimizationReps = updateRepWorkloads(optimizationReps, prospectResult.assignments);
      }
    }
    
    priorityBreakdown.push({
      priority_id: priority.id,
      priority_name: priorityName,
      customer_count: customers.length,
      prospect_count: prospects.length,
      customer_solve_time_ms: customerResult.solve_time_ms,
      prospect_solve_time_ms: prospectResult.solve_time_ms,
      customer_status: customerResult.status,
      prospect_status: prospectResult.status
    });
    
    // Update remaining accounts (remove assigned)
    const assignedIds = new Set([
      ...customerResult.assignments.map(a => a.sfdc_account_id),
      ...prospectResult.assignments.map(a => a.sfdc_account_id)
    ]);
    
    remainingAccounts = nonMatchingAccounts.concat(
      matchingAccounts.filter(a => !assignedIds.has(a.sfdc_account_id))
    );
  }
  
  const executionTime = performance.now() - startTime;
  
  const executionStats: ExecutionStats = {
    total_accounts: accounts.length,
    total_customers: customerAccounts.length,
    total_prospects: prospectAccounts.length,
    protected_count: protectedAccounts.length,
    customer_assigned_count: allCustomerAssignments.length,
    prospect_assigned_count: allProspectAssignments.length,
    holdover_breakdown: holdoverBreakdown,
    execution_time_ms: Math.round(executionTime),
    dynamic_customer_weight: dynamicCustomerWeight
  };
  
  console.log(`[PriorityExecutor] Completed in ${executionTime.toFixed(0)}ms`, executionStats);
  
  return {
    protectedAccounts,
    allAssignments: [...allCustomerAssignments, ...allProspectAssignments],
    customerAssignments: allCustomerAssignments,
    prospectAssignments: allProspectAssignments,
    executionStats,
    priorityBreakdown,
    parentalAlignmentWarnings: parentalWarnings
  };
}

// ============================================================================
// Priority Filtering
// ============================================================================

/**
 * Filter accounts by priority criteria
 * Returns accounts that match and those that don't
 */
function filterAccountsByPriority(
  accounts: Account[],
  reps: SalesRep[],
  priority: PriorityConfig,
  config: AssignmentConfig
): { matchingAccounts: Account[]; nonMatchingAccounts: Account[] } {
  const repMap = new Map(reps.map(r => [r.rep_id, r]));
  
  const matching: Account[] = [];
  const nonMatching: Account[] = [];
  
  for (const account of accounts) {
    let matches = false;
    
    switch (priority.id) {
      case 'geo_and_continuity':
        // Account matches if current owner's region matches account's territory mapping
        if (account.owner_id && account.sales_territory) {
          const currentRep = repMap.get(account.owner_id);
          if (currentRep) {
            const targetRegion = config.territory_mappings[account.sales_territory] || account.geo;
            matches = currentRep.region === targetRegion;
          }
        }
        break;
        
      case 'geography':
        // Account matches if there's a valid territory mapping
        if (account.sales_territory) {
          const targetRegion = config.territory_mappings[account.sales_territory] || account.geo;
          // Check if any rep is in this region
          matches = reps.some(r => r.is_active && r.include_in_assignments && r.region === targetRegion);
        }
        break;
        
      case 'continuity':
        // Account matches if it has a current owner who is still active
        if (account.owner_id) {
          const currentRep = repMap.get(account.owner_id);
          matches = currentRep !== undefined && currentRep.is_active === true && currentRep.include_in_assignments === true;
        }
        break;
        
      case 'team_alignment':
        // Team alignment applies GAMMA/EPSILON penalties in the LP solver
        // All accounts go through - the solver handles tier mismatch penalties
        matches = true;
        break;
        
      case 'arr_balance':
      case 'balance':
        // All remaining accounts go through balance optimization
        matches = true;
        break;
        
      default:
        // Unknown priority - include in balance
        matches = true;
    }
    
    if (matches) {
      matching.push(account);
    } else {
      nonMatching.push(account);
    }
  }
  
  return { matchingAccounts: matching, nonMatchingAccounts: nonMatching };
}

// ============================================================================
// Holdover Processing
// ============================================================================

function isSubConditionEnabled(subConditions: SubConditionConfig[] | undefined, subConditionId: string): boolean {
  if (!subConditions) return false;
  const sc = subConditions.find(s => s.id === subConditionId);
  return sc?.enabled ?? false;
}

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
  
  const sortedPriorities = [...holdoverPriorities].sort((a, b) => a.position - b.position);
  
  // Build workload map from current account ownership (separate customer/prospect counts)
  const workloadMap = new Map<string, { 
    customerCount: number; 
    prospectCount: number; 
    totalARR: number 
  }>();

  for (const account of accounts) {
    if (!account.owner_id) continue;
    const current = workloadMap.get(account.owner_id) || { customerCount: 0, prospectCount: 0, totalARR: 0 };
    
    if (account.is_customer) {
      current.customerCount++;
    } else {
      current.prospectCount++;
    }
    current.totalARR += account.calculated_arr || account.hierarchy_bookings_arr_converted || 0;
    workloadMap.set(account.owner_id, current);
  }

  // Get max limits with fallback defaults (NULL in DB = use code defaults)
  const customerMaxAccounts = config.customer_max_accounts ?? 8;
  const prospectMaxAccounts = config.prospect_max_accounts ?? 30;
  const customerMaxARR = config.customer_max_arr;
  
  const renewalDateThreshold = new Date();
  renewalDateThreshold.setDate(renewalDateThreshold.getDate() + 90);
  
  const repMap = new Map(reps.map(r => [r.rep_id, r]));
  
  for (const priority of sortedPriorities) {
    const definition = getPriorityById(priority.id);
    if (!definition || !priority.enabled) continue;
    
    let matchCount = 0;
    
    for (const account of accounts) {
      if (protectedIds.has(account.sfdc_account_id)) continue;
      
      let isProtected = false;
      let reason = '';
      let subConditionId: string | undefined;
      
      switch (priority.id) {
        case 'manual_holdover':
          if (account.exclude_from_reassignment) {
            isProtected = true;
            reason = 'P0: Excluded from reassignment';
          }
          break;
          
        case 'stability_accounts':
          const subConditions = priority.subConditions || [];
          
          if (isSubConditionEnabled(subConditions, 'cre_risk') && account.cre_risk) {
            isProtected = true;
            reason = 'P1: Stability - CRE At-Risk';
            subConditionId = 'cre_risk';
          }
          
          if (!isProtected && isSubConditionEnabled(subConditions, 'renewal_soon') && account.renewal_date) {
            const renewalDate = new Date(account.renewal_date);
            if (renewalDate <= renewalDateThreshold) {
              isProtected = true;
              reason = `P1: Stability - Renewal in ${Math.ceil((renewalDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days`;
              subConditionId = 'renewal_soon';
            }
          }
          
          if (!isProtected && isSubConditionEnabled(subConditions, 'pe_firm') && account.pe_firm) {
            isProtected = true;
            reason = `P1: Stability - PE Firm (${account.pe_firm})`;
            subConditionId = 'pe_firm';
          }
          
          if (!isProtected && isSubConditionEnabled(subConditions, 'recent_owner_change') && account.owner_change_date) {
            const changeDate = new Date(account.owner_change_date);
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            if (changeDate >= threeMonthsAgo) {
              isProtected = true;
              reason = 'P1: Stability - Recent Owner Change';
              subConditionId = 'recent_owner_change';
            }
          }
          break;
          
        case 'pe_firm':
          if (account.pe_firm) {
            isProtected = true;
            reason = `PE-owned (${account.pe_firm})`;
          }
          break;
          
        case 'cre_risk':
          if (account.cre_risk) {
            isProtected = true;
            reason = 'CRE Risk - At Risk account';
          }
          break;
          
        case 'sales_tools_bucket':
          // Route customer accounts under $25K ARR to Sales Tools (no owner assignment)
          // Only applies to customers, not prospects
          if (account.is_customer) {
            const accountARR = account.hierarchy_bookings_arr_converted || account.calculated_arr || 0;
            if (accountARR < config.rs_arr_threshold) {
              isProtected = true;
              reason = `P1: Routed to Sales Tools (ARR $${accountARR.toLocaleString()} < $${config.rs_arr_threshold.toLocaleString()})`;
            }
          }
          break;
      }
      
      if (isProtected) {
        // Special handling for Sales Tools bucket - assigns NULL rep (no owner)
        if (priority.id === 'sales_tools_bucket') {
          protectedAccounts.push({
            account,
            reason,
            priority_id: priority.id,
            sub_condition_id: subConditionId,
            assigned_rep_id: null,  // NULL rep for Sales Tools
            assigned_rep_name: 'Sales Tools'
          });
          protectedIds.add(account.sfdc_account_id);
          matchCount++;
          continue;
        }
        
        const currentRep = account.owner_id ? repMap.get(account.owner_id) : null;
        
        // Skip holdover if rep is inactive or missing - applies to ALL priorities
        if (!currentRep || !currentRep.is_active) {
          console.log(`[Holdover Skip] ${account.account_name}: No active owner - passing to optimization`);
          continue;
        }
        
        // Capacity override: ONLY applies to stability_accounts, NOT P0 manual_holdover
        // Manual holdovers are explicitly excluded by users and should be respected regardless of capacity
        if (priority.id === 'stability_accounts') {
          const workload = workloadMap.get(account.owner_id);
          
          const atAccountLimit = account.is_customer 
            ? (workload && customerMaxAccounts && workload.customerCount >= customerMaxAccounts)
            : (workload && prospectMaxAccounts && workload.prospectCount >= prospectMaxAccounts);
          
          const atARRLimit = account.is_customer && workload && customerMaxARR && workload.totalARR >= customerMaxARR;
          
          if (atAccountLimit || atARRLimit) {
            const countType = account.is_customer ? 'customers' : 'prospects';
            const count = account.is_customer ? workload?.customerCount : workload?.prospectCount;
            console.log(`[Capacity Override] ${account.account_name}: ${currentRep.name} at capacity (${count} ${countType}, $${workload?.totalARR?.toLocaleString()} ARR)`);
            continue; // Don't protect - let optimization handle it
          }
        }
        
        // Normal protection - account stays with current owner
        protectedAccounts.push({
          account,
          reason,
          priority_id: priority.id,
          sub_condition_id: subConditionId,
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
  
  const assignableAccounts = accounts.filter(a => !protectedIds.has(a.sfdc_account_id));
  
  return { protectedAccounts, assignableAccounts, holdoverBreakdown };
}

// ============================================================================
// Data Conversion
// ============================================================================

function getTier(account: Account): 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Tier 4' | null {
  const tier = account.expansion_tier || account.initial_sale_tier;
  if (!tier) return null;
  
  const normalized = tier.toLowerCase().trim();
  if (normalized === 'tier 1' || normalized === 'tier1') return 'Tier 1';
  if (normalized === 'tier 2' || normalized === 'tier2') return 'Tier 2';
  if (normalized === 'tier 3' || normalized === 'tier3') return 'Tier 3';
  if (normalized === 'tier 4' || normalized === 'tier4') return 'Tier 4';
  return null;
}

function convertToOptimizationAccounts(accounts: Account[]): OptimizationAccount[] {
  return accounts.map(a => ({
    sfdc_account_id: a.sfdc_account_id,
    account_name: a.account_name,
    is_customer: a.is_customer ?? false,
    is_strategic: a.is_strategic ?? false,
    calculated_arr: a.calculated_arr || a.hierarchy_bookings_arr_converted || 0,
    calculated_atr: a.calculated_atr || 0,
    pipeline_value: a.pipeline_value || 0,
    tier: getTier(a),
    cre_count: a.cre_count || 0,
    employees: a.employees,  // For team alignment (Commercial mode)
    sales_territory: a.sales_territory || '',
    geo: a.geo || '',
    owner_id: a.owner_id,
    owner_name: a.owner_name,
  }));
}

function initializeOptimizationReps(reps: SalesRep[]): OptimizationRep[] {
  return reps
    .filter(r => r.is_active && r.include_in_assignments)
    .map(r => ({
      rep_id: r.rep_id,
      name: r.name,
      region: r.region || '',
      is_strategic_rep: r.is_strategic_rep,
      is_active: r.is_active ?? true,
      include_in_assignments: r.include_in_assignments ?? true,
      team_tier: (r.team as 'SMB' | 'Growth' | 'MM' | 'ENT' | null) ?? r.team_tier,  // Uses 'team' field (contains tier values) with team_tier as fallback
      current_arr: 0,
      current_atr: 0,
      current_pipeline: 0,
      current_tier1_count: 0,
      current_tier2_count: 0,
      current_tier3_count: 0,
      current_tier4_count: 0,
    }));
}

function buildCustomerConfig(config: AssignmentConfig): CustomerOptimizationConfig {
  const arrTarget = config.customer_target_arr || 2000000;
  const arrVariance = (config.capacity_variance_percent || 10) / 100;
  const atrTarget = config.customer_target_atr || 500000;
  const atrVariance = (config.atr_variance || 15) / 100;
  
  return {
    arr: {
      target: arrTarget,
      variance_pct: arrVariance,
      min: config.customer_min_arr ?? Math.round(arrTarget * (1 - arrVariance)),
      max: config.customer_max_arr || 3000000,
    },
    atr: {
      target: atrTarget,
      variance_pct: atrVariance,
      min: config.customer_min_atr ?? Math.round(atrTarget * (1 - atrVariance)),
      max: config.customer_max_atr || 750000,
    },
  };
}

function buildProspectConfig(config: AssignmentConfig): ProspectOptimizationConfig {
  const pipelineTarget = config.prospect_target_pipeline || config.prospect_target_arr || 1000000;
  const pipelineVariance = (config.prospect_variance_percent || 15) / 100;
  
  return {
    pipeline: {
      target: pipelineTarget,
      variance_pct: pipelineVariance,
      min: config.prospect_min_arr ?? Math.round(pipelineTarget * (1 - pipelineVariance)),
      max: config.prospect_max_pipeline || config.prospect_max_arr || 1500000,
    },
  };
}

// ============================================================================
// Result Helpers
// ============================================================================

/**
 * Combine protected and optimized results into final assignments
 */
export function combineResults(
  protectedAccounts: ProtectedAccount[],
  assignments: OptimizedAssignment[]
): OptimizedAssignment[] {
  // Regular protected accounts (with rep assigned)
  const protectedAssignments: OptimizedAssignment[] = protectedAccounts
    .filter(p => p.assigned_rep_id)
    .map(p => ({
      sfdc_account_id: p.account.sfdc_account_id,
      account_name: p.account.account_name,
      assigned_rep_id: p.assigned_rep_id!,
      assigned_rep_name: p.assigned_rep_name || '',
      account_arr: p.account.calculated_arr || 0,
      account_atr: p.account.calculated_atr || 0,
      account_pipeline: p.account.pipeline_value || 0,
      tier: getTier(p.account),
      rationale: p.reason
    }));
  
  // Sales Tools accounts (NULL rep) - handle separately
  const salesToolsAssignments: OptimizedAssignment[] = protectedAccounts
    .filter(p => p.assigned_rep_id === null && p.priority_id === 'sales_tools_bucket')
    .map(p => ({
      sfdc_account_id: p.account.sfdc_account_id,
      account_name: p.account.account_name,
      assigned_rep_id: '',  // Empty string for DB compatibility
      assigned_rep_name: 'Sales Tools',
      account_arr: p.account.calculated_arr || 0,
      account_atr: p.account.calculated_atr || 0,
      account_pipeline: p.account.pipeline_value || 0,
      tier: getTier(p.account),
      rationale: p.reason
    }));
  
  return [...protectedAssignments, ...salesToolsAssignments, ...assignments];
}

// ============================================================================
// Config Loading
// ============================================================================

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
    // Customer ARR
    customer_target_arr: data.customer_target_arr || 2000000,
    customer_max_arr: data.customer_max_arr || 3000000,
    capacity_variance_percent: data.capacity_variance_percent || 10,
    // Customer ATR
    customer_target_atr: data.customer_target_atr || 500000,
    customer_max_atr: data.customer_max_atr || 750000,
    atr_variance: data.atr_variance || 15,
    // Prospect Pipeline
    prospect_target_pipeline: data.prospect_target_arr || 1000000,
    prospect_max_pipeline: data.prospect_max_arr || 1500000,
    prospect_variance_percent: data.prospect_variance_percent || 15,
    // Shared
    territory_mappings: (data.territory_mappings as Record<string, string>) || {},
    max_cre_per_rep: data.max_cre_per_rep || 3,
    assignment_mode: data.assignment_mode || 'ENT',
    priority_config: (data.priority_config as PriorityConfig[]) || [],
    rs_arr_threshold: data.rs_arr_threshold || 25000,
    // Capacity override limits (NULL = use code defaults)
    customer_max_accounts: (data as any).customer_max_accounts ?? null,
    prospect_max_accounts: (data as any).prospect_max_accounts ?? null
  };
}

// ============================================================================
// Legacy Exports (for backwards compatibility)
// ============================================================================

// Legacy result type that matches old interface
export interface LegacyOptimizationResult {
  status: 'optimal' | 'infeasible' | 'error';
  assignments: OptimizedAssignment[];
  solve_time_ms: number;
  objective_value: number;
  error_message?: string;
}

export { OptimizedAssignment, OptimizationResult };
