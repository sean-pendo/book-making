/**
 * Metrics Calculator
 * 
 * Calculates success metrics after LP solve:
 * - Balance variance (ARR, ATR, Pipeline)
 * - Continuity rate
 * - Geography match rate
 * - Team alignment rate
 * - Capacity utilization
 */

import type { 
  LPAssignmentProposal, 
  EligibleRep, 
  AggregatedAccount,
  LPMetrics,
  RepLoad
} from '../types';

/**
 * Calculate coefficient of variation (CV) as a percentage
 * CV = (std dev / mean) * 100
 */
function calculateCV(values: number[]): number {
  if (values.length === 0) return 0;
  
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  
  return (stdDev / mean) * 100;
}

/**
 * Calculate per-rep loads from proposals
 */
export function calculateRepLoads(
  proposals: LPAssignmentProposal[],
  accounts: AggregatedAccount[],
  reps: EligibleRep[],
  targetArr: number
): RepLoad[] {
  const accountMap = new Map(accounts.map(a => [a.sfdc_account_id, a]));
  
  // Initialize rep loads
  const repLoadMap = new Map<string, RepLoad>();
  
  const totalARR = accounts.reduce((sum, a) => sum + a.aggregated_arr, 0);
  const totalATR = accounts.reduce((sum, a) => sum + a.aggregated_atr, 0);
  const totalPipeline = accounts.reduce((sum, a) => sum + a.pipeline_value, 0);
  const numReps = reps.length;
  
  for (const rep of reps) {
    repLoadMap.set(rep.rep_id, {
      repId: rep.rep_id,
      repName: rep.name,
      arr: 0,
      atr: 0,
      pipeline: 0,
      accountCount: 0,
      arrTarget: targetArr || totalARR / numReps,
      atrTarget: totalATR / numReps,
      pipelineTarget: totalPipeline / numReps,
      arrDeviation: 0,
      atrDeviation: 0,
      pipelineDeviation: 0,
      arrUtilization: 0,
      feasibilitySlack: 0
    });
  }
  
  // Accumulate loads from proposals
  for (const proposal of proposals) {
    const account = accountMap.get(proposal.accountId);
    if (!account) continue;
    
    const load = repLoadMap.get(proposal.repId);
    if (!load) continue;
    
    load.arr += account.aggregated_arr;
    load.atr += account.aggregated_atr;
    load.pipeline += account.pipeline_value;
    load.accountCount += 1;
  }
  
  // Calculate deviations and utilization
  for (const load of repLoadMap.values()) {
    load.arrDeviation = load.arr - load.arrTarget;
    load.atrDeviation = load.atr - load.atrTarget;
    load.pipelineDeviation = load.pipeline - load.pipelineTarget;
    load.arrUtilization = load.arrTarget > 0 ? (load.arr / load.arrTarget) * 100 : 0;
  }
  
  return Array.from(repLoadMap.values());
}

/**
 * Calculate all success metrics
 */
export function calculateMetrics(
  proposals: LPAssignmentProposal[],
  accounts: AggregatedAccount[],
  reps: EligibleRep[],
  repLoads: RepLoad[],
  originalOwners: Map<string, string>,
  solveTimeMs: number
): LPMetrics {
  const accountMap = new Map(accounts.map(a => [a.sfdc_account_id, a]));
  const repMap = new Map(reps.map(r => [r.rep_id, r]));
  
  // Balance metrics
  const arrValues = repLoads.map(r => r.arr);
  const atrValues = repLoads.map(r => r.atr);
  const pipelineValues = repLoads.map(r => r.pipeline);
  
  const arr_variance_percent = calculateCV(arrValues);
  const atr_variance_percent = calculateCV(atrValues.filter(v => v > 0));
  const pipeline_variance_percent = calculateCV(pipelineValues.filter(v => v > 0));
  
  const max_overload_percent = Math.max(...repLoads.map(r => r.arrUtilization), 0);
  
  // Continuity metrics
  let sameOwnerCount = 0;
  let sameOwnerARR = 0;
  let highValueSameOwnerCount = 0;
  let highValueTotalCount = 0;
  let totalARR = 0;
  
  const HIGH_VALUE_THRESHOLD = 500000;
  
  for (const proposal of proposals) {
    const account = accountMap.get(proposal.accountId);
    if (!account) continue;
    
    const originalOwner = originalOwners.get(proposal.accountId) || account.owner_id;
    const isSameOwner = proposal.repId === originalOwner;
    
    totalARR += account.aggregated_arr;
    
    if (isSameOwner) {
      sameOwnerCount++;
      sameOwnerARR += account.aggregated_arr;
    }
    
    if (account.aggregated_arr >= HIGH_VALUE_THRESHOLD) {
      highValueTotalCount++;
      if (isSameOwner) {
        highValueSameOwnerCount++;
      }
    }
  }
  
  const continuity_rate = proposals.length > 0 ? (sameOwnerCount / proposals.length) * 100 : 0;
  const high_value_continuity_rate = highValueTotalCount > 0 
    ? (highValueSameOwnerCount / highValueTotalCount) * 100 
    : 100;
  const arr_stayed_percent = totalARR > 0 ? (sameOwnerARR / totalARR) * 100 : 0;
  
  // Geography metrics
  let exactGeoCount = 0;
  let siblingGeoCount = 0;
  let crossRegionCount = 0;
  
  for (const proposal of proposals) {
    if (proposal.scores.geography >= 1.0) {
      exactGeoCount++;
    } else if (proposal.scores.geography >= 0.65) {
      siblingGeoCount++;
    } else if (proposal.scores.geography <= 0.25) {
      crossRegionCount++;
    }
  }
  
  const exact_geo_match_rate = proposals.length > 0 ? (exactGeoCount / proposals.length) * 100 : 0;
  const sibling_geo_match_rate = proposals.length > 0 ? ((exactGeoCount + siblingGeoCount) / proposals.length) * 100 : 0;
  const cross_region_rate = proposals.length > 0 ? (crossRegionCount / proposals.length) * 100 : 0;
  
  // Team alignment metrics
  let exactTierCount = 0;
  let oneLevelCount = 0;
  
  for (const proposal of proposals) {
    if (proposal.scores.teamAlignment >= 1.0) {
      exactTierCount++;
    } else if (proposal.scores.teamAlignment >= 0.6) {
      oneLevelCount++;
    }
  }
  
  const exact_tier_match_rate = proposals.length > 0 ? (exactTierCount / proposals.length) * 100 : 0;
  const one_level_mismatch_rate = proposals.length > 0 ? (oneLevelCount / proposals.length) * 100 : 0;
  
  // Feasibility metrics
  const feasibility_slack_total = repLoads.reduce((sum, r) => sum + r.feasibilitySlack, 0);
  const reps_over_capacity = repLoads.filter(r => r.arrUtilization > 100).length;
  
  return {
    arr_variance_percent,
    atr_variance_percent,
    pipeline_variance_percent,
    max_overload_percent,
    continuity_rate,
    high_value_continuity_rate,
    arr_stayed_percent,
    exact_geo_match_rate,
    sibling_geo_match_rate,
    cross_region_rate,
    exact_tier_match_rate,
    one_level_mismatch_rate,
    feasibility_slack_total,
    reps_over_capacity,
    solve_time_ms: solveTimeMs,
    total_accounts: proposals.length,
    total_reps: reps.length
  };
}

/**
 * Format metrics for display
 */
export function formatMetricsSummary(metrics: LPMetrics): string {
  return [
    `Balance: ARR CV ${metrics.arr_variance_percent.toFixed(1)}%, Max Load ${metrics.max_overload_percent.toFixed(0)}%`,
    `Continuity: ${metrics.continuity_rate.toFixed(0)}% (High-Value: ${metrics.high_value_continuity_rate.toFixed(0)}%)`,
    `Geography: ${metrics.sibling_geo_match_rate.toFixed(0)}% in region (${metrics.exact_geo_match_rate.toFixed(0)}% exact)`,
    `Team: ${metrics.exact_tier_match_rate.toFixed(0)}% exact tier match`,
    `Solve time: ${metrics.solve_time_ms}ms`
  ].join('\n');
}

