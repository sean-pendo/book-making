/**
 * Sandbox Metrics Calculator
 * 
 * Calculates success metrics for comparing baseline vs optimized assignments
 */

import { SandboxAccount, SandboxRep, SandboxConfig, OptimizedAssignment } from './optimizationSolver';

export interface RepMetrics {
  rep_id: string;
  rep_name: string;
  region: string;
  total_arr: number;
  account_count: number;
  cre_count: number;
  geo_match_count: number;
  continuity_count: number;
  utilization_pct: number; // ARR / target
  within_band: boolean;
}

export interface SandboxMetrics {
  // Assignment counts
  total_accounts: number;
  assigned_accounts: number;
  unassigned_accounts: number;
  
  // Geographic alignment
  geo_alignment_pct: number;
  geo_match_count: number;
  geo_mismatch_count: number;
  
  // Continuity
  continuity_pct: number;
  continuity_maintained_count: number;
  reassignment_count: number;
  
  // ARR Balance
  arr_total: number;
  arr_mean: number;
  arr_std_dev: number;
  arr_variance_cv: number;  // Coefficient of variation (std/mean)
  arr_min: number;
  arr_max: number;
  arr_range: number;
  
  // Capacity utilization
  reps_within_band: number;
  reps_below_min: number;
  reps_above_preferred_max: number;
  reps_at_hard_cap: number;
  capacity_utilization_mean: number;
  
  // CRE distribution
  cre_total: number;
  cre_max_per_rep: number;
  cre_over_limit_count: number;
  
  // Greedy overflow detection
  greedy_overflow_count: number;
  
  // Per-rep breakdown
  rep_metrics: RepMetrics[];
}

/**
 * Calculate metrics from a set of assignments
 */
export function calculateMetrics(
  accounts: SandboxAccount[],
  reps: SandboxRep[],
  assignments: OptimizedAssignment[],
  config: SandboxConfig
): SandboxMetrics {
  const activeReps = reps.filter(r => r.is_active && r.include_in_assignments);
  
  // Initialize rep tracking
  const repStats = new Map<string, {
    total_arr: number;
    account_count: number;
    cre_count: number;
    geo_match_count: number;
    continuity_count: number;
  }>();
  
  for (const rep of activeReps) {
    repStats.set(rep.rep_id, {
      total_arr: 0,
      account_count: 0,
      cre_count: 0,
      geo_match_count: 0,
      continuity_count: 0
    });
  }
  
  // Build account lookup
  const accountMap = new Map(accounts.map(a => [a.sfdc_account_id, a]));
  
  // Process assignments
  let geoMatchCount = 0;
  let continuityCount = 0;
  let assignedCount = 0;
  let totalCRE = 0;
  
  for (const assignment of assignments) {
    const repStat = repStats.get(assignment.assigned_rep_id);
    if (!repStat) continue;
    
    const account = accountMap.get(assignment.sfdc_account_id);
    if (!account) continue;
    
    assignedCount++;
    repStat.account_count++;
    repStat.total_arr += assignment.account_arr;
    repStat.cre_count += account.cre_count || 0;
    totalCRE += account.cre_count || 0;
    
    if (assignment.geo_match) {
      geoMatchCount++;
      repStat.geo_match_count++;
    }
    
    if (assignment.continuity_maintained) {
      continuityCount++;
      repStat.continuity_count++;
    }
  }
  
  // Calculate ARR statistics
  const arrValues = Array.from(repStats.values()).map(s => s.total_arr);
  const arrTotal = arrValues.reduce((sum, v) => sum + v, 0);
  const arrMean = arrValues.length > 0 ? arrTotal / arrValues.length : 0;
  const arrVariance = arrValues.length > 0
    ? arrValues.reduce((sum, v) => sum + Math.pow(v - arrMean, 2), 0) / arrValues.length
    : 0;
  const arrStdDev = Math.sqrt(arrVariance);
  const arrMin = arrValues.length > 0 ? Math.min(...arrValues) : 0;
  const arrMax = arrValues.length > 0 ? Math.max(...arrValues) : 0;
  
  // Calculate capacity bands
  const minARR = config.target_arr * (1 - config.variance_pct);
  const maxPreferredARR = config.target_arr * (1 + config.variance_pct);
  
  let repsWithinBand = 0;
  let repsBelowMin = 0;
  let repsAbovePreferred = 0;
  let repsAtHardCap = 0;
  let creMaxPerRep = 0;
  let creOverLimitCount = 0;
  let greedyOverflowCount = 0;
  
  const repMetrics: RepMetrics[] = [];
  
  for (const rep of activeReps) {
    const stats = repStats.get(rep.rep_id)!;
    const utilizationPct = config.target_arr > 0 ? stats.total_arr / config.target_arr : 0;
    const withinBand = stats.total_arr >= minARR && stats.total_arr <= maxPreferredARR;
    
    if (withinBand) repsWithinBand++;
    if (stats.total_arr < minARR) repsBelowMin++;
    if (stats.total_arr > maxPreferredARR) repsAbovePreferred++;
    if (stats.total_arr >= config.max_arr * 0.95) repsAtHardCap++;
    
    if (stats.cre_count > creMaxPerRep) creMaxPerRep = stats.cre_count;
    if (stats.cre_count > config.max_cre_per_rep) creOverLimitCount++;
    
    // Detect greedy overflow: rep above preferred max got assignments when better options existed
    if (stats.total_arr > maxPreferredARR && stats.account_count > 0) {
      // Check if there were other reps in same region with capacity
      const repRegion = rep.region;
      const sameRegionReps = activeReps.filter(r => 
        r.region === repRegion && 
        r.rep_id !== rep.rep_id
      );
      const hadBetterOptions = sameRegionReps.some(r => {
        const otherStats = repStats.get(r.rep_id);
        return otherStats && otherStats.total_arr < maxPreferredARR;
      });
      if (hadBetterOptions) {
        greedyOverflowCount++;
      }
    }
    
    repMetrics.push({
      rep_id: rep.rep_id,
      rep_name: rep.name,
      region: rep.region,
      total_arr: stats.total_arr,
      account_count: stats.account_count,
      cre_count: stats.cre_count,
      geo_match_count: stats.geo_match_count,
      continuity_count: stats.continuity_count,
      utilization_pct: utilizationPct * 100,
      within_band: withinBand
    });
  }
  
  // Calculate utilization mean
  const utilizationValues = repMetrics.map(r => r.utilization_pct);
  const capacityUtilizationMean = utilizationValues.length > 0
    ? utilizationValues.reduce((sum, v) => sum + v, 0) / utilizationValues.length
    : 0;
  
  // Count accounts with current owners for continuity denominator
  const accountsWithOwners = accounts.filter(a => a.owner_id).length;
  
  return {
    // Assignment counts
    total_accounts: accounts.length,
    assigned_accounts: assignedCount,
    unassigned_accounts: accounts.length - assignedCount,
    
    // Geographic alignment
    geo_alignment_pct: assignedCount > 0 ? (geoMatchCount / assignedCount) * 100 : 0,
    geo_match_count: geoMatchCount,
    geo_mismatch_count: assignedCount - geoMatchCount,
    
    // Continuity
    continuity_pct: accountsWithOwners > 0 ? (continuityCount / accountsWithOwners) * 100 : 0,
    continuity_maintained_count: continuityCount,
    reassignment_count: accountsWithOwners - continuityCount,
    
    // ARR Balance
    arr_total: arrTotal,
    arr_mean: arrMean,
    arr_std_dev: arrStdDev,
    arr_variance_cv: arrMean > 0 ? (arrStdDev / arrMean) * 100 : 0,
    arr_min: arrMin,
    arr_max: arrMax,
    arr_range: arrMax - arrMin,
    
    // Capacity utilization
    reps_within_band: repsWithinBand,
    reps_below_min: repsBelowMin,
    reps_above_preferred_max: repsAbovePreferred,
    reps_at_hard_cap: repsAtHardCap,
    capacity_utilization_mean: capacityUtilizationMean,
    
    // CRE distribution
    cre_total: totalCRE,
    cre_max_per_rep: creMaxPerRep,
    cre_over_limit_count: creOverLimitCount,
    
    // Greedy overflow
    greedy_overflow_count: greedyOverflowCount,
    
    // Per-rep breakdown
    rep_metrics: repMetrics.sort((a, b) => b.total_arr - a.total_arr)
  };
}

/**
 * Calculate baseline metrics from current account assignments (owner_id/owner_name)
 */
export function calculateBaselineMetrics(
  accounts: SandboxAccount[],
  reps: SandboxRep[],
  config: SandboxConfig
): SandboxMetrics {
  // Convert current assignments to OptimizedAssignment format
  const currentAssignments: OptimizedAssignment[] = [];
  
  for (const account of accounts) {
    if (!account.owner_id) continue;
    
    // Find the rep
    const rep = reps.find(r => r.rep_id === account.owner_id);
    if (!rep) continue;
    
    const targetRegion = config.territory_mappings[account.sales_territory] || account.geo;
    const geoMatch = rep.region === targetRegion;
    
    currentAssignments.push({
      sfdc_account_id: account.sfdc_account_id,
      account_name: account.account_name,
      assigned_rep_id: account.owner_id,
      assigned_rep_name: account.owner_name || rep.name,
      account_arr: account.calculated_arr || 0,
      geo_match: geoMatch,
      continuity_maintained: true, // By definition, current owner = continuity
      rationale: 'Current assignment'
    });
  }
  
  return calculateMetrics(accounts, reps, currentAssignments, config);
}

/**
 * Calculate delta between two metric sets
 */
export interface MetricsDelta {
  metric: string;
  baseline: number;
  optimized: number;
  delta: number;
  delta_pct: number;
  improved: boolean;
  unit: string;
}

export function calculateMetricsDelta(
  baseline: SandboxMetrics,
  optimized: SandboxMetrics
): MetricsDelta[] {
  const deltas: MetricsDelta[] = [];
  
  // Helper to add a delta entry
  const addDelta = (
    metric: string,
    baselineVal: number,
    optimizedVal: number,
    unit: string,
    higherIsBetter: boolean
  ) => {
    const delta = optimizedVal - baselineVal;
    const deltaPct = baselineVal !== 0 ? (delta / baselineVal) * 100 : 0;
    const improved = higherIsBetter ? delta > 0 : delta < 0;
    
    deltas.push({
      metric,
      baseline: baselineVal,
      optimized: optimizedVal,
      delta,
      delta_pct: deltaPct,
      improved,
      unit
    });
  };
  
  // Core metrics
  addDelta('Geographic Alignment', baseline.geo_alignment_pct, optimized.geo_alignment_pct, '%', true);
  addDelta('Continuity Rate', baseline.continuity_pct, optimized.continuity_pct, '%', true);
  addDelta('ARR Variance (CV)', baseline.arr_variance_cv, optimized.arr_variance_cv, '%', false);
  addDelta('ARR Range', baseline.arr_range, optimized.arr_range, '$', false);
  addDelta('Reps Within Band', baseline.reps_within_band, optimized.reps_within_band, 'reps', true);
  addDelta('Reps Below Min', baseline.reps_below_min, optimized.reps_below_min, 'reps', false);
  addDelta('Reps Above Max', baseline.reps_above_preferred_max, optimized.reps_above_preferred_max, 'reps', false);
  addDelta('Max CRE Per Rep', baseline.cre_max_per_rep, optimized.cre_max_per_rep, 'CRE', false);
  addDelta('CRE Over Limit', baseline.cre_over_limit_count, optimized.cre_over_limit_count, 'reps', false);
  addDelta('Greedy Overflow', baseline.greedy_overflow_count, optimized.greedy_overflow_count, 'reps', false);
  addDelta('Assigned Accounts', baseline.assigned_accounts, optimized.assigned_accounts, 'accounts', true);
  
  return deltas;
}

/**
 * Format currency value for display
 */
export function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

/**
 * Format percentage for display
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

