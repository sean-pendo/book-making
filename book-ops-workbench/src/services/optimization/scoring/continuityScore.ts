/**
 * Continuity Score
 * 
 * Measures the value of keeping an account with its current owner.
 * Score = base + tenure*T + stability*B + value*V
 * 
 * Where:
 * - T = min(1, days_with_owner / max_days)
 * - B = max(0, 1 - (owner_count - 1) / (max_owners - 1))
 * - V = min(1, arr / value_threshold)
 * 
 * Returns 0 if:
 * - Rep is not the current owner
 * - Rep is a backfill source (leaving)
 * - Account has no current owner
 */

import type { 
  AggregatedAccount, 
  EligibleRep, 
  LPContinuityParams 
} from '../types';

/**
 * Calculate continuity score for an account-rep pair
 * 
 * @param account - The account to score
 * @param rep - The potential rep to assign
 * @param params - Scoring parameters
 * @returns Score in range [0, 1]
 */
export function continuityScore(
  account: AggregatedAccount,
  rep: EligibleRep,
  params: LPContinuityParams
): number {
  // Not current owner → 0
  if (rep.rep_id !== account.owner_id) {
    return 0;
  }
  
  // Backfill source rep → 0 (relationship is ending)
  if (rep.is_backfill_source) {
    return 0;
  }
  
  // No current owner → 0
  if (!account.owner_id) {
    return 0;
  }
  
  // Calculate tenure component
  // T = days with current owner / max days (capped at 1)
  let T = 0;
  if (account.owner_change_date) {
    const changeDate = new Date(account.owner_change_date);
    const now = new Date();
    const daysSinceChange = Math.floor(
      (now.getTime() - changeDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    T = Math.min(1, Math.max(0, daysSinceChange) / params.tenure_max_days);
  }
  
  // Calculate stability component
  // B = 1 - (owner_count - 1) / (max_owners - 1)
  // Fewer owners = higher stability = higher score
  let B = 1;
  const ownerCount = account.owners_lifetime_count ?? 1;
  if (ownerCount > 1 && params.stability_max_owners > 1) {
    B = Math.max(0, 1 - (ownerCount - 1) / (params.stability_max_owners - 1));
  }
  
  // Calculate value component
  // V = arr / value_threshold (capped at 1)
  // Higher ARR = more valuable continuity
  const arr = account.aggregated_arr || 0;
  const V = Math.min(1, arr / params.value_threshold);
  
  // Combine components
  const score = params.base_continuity + 
    params.tenure_weight * T + 
    params.stability_weight * B + 
    params.value_weight * V;
  
  // Cap at 1.0
  return Math.min(1, Math.max(0, score));
}

/**
 * Debug helper: explain continuity score breakdown
 */
export function explainContinuityScore(
  account: AggregatedAccount,
  rep: EligibleRep,
  params: LPContinuityParams
): string {
  if (rep.rep_id !== account.owner_id) {
    return 'Not current owner → 0';
  }
  
  if (rep.is_backfill_source) {
    return 'Rep is backfill source (leaving) → 0';
  }
  
  if (!account.owner_id) {
    return 'No current owner → 0';
  }
  
  // Calculate components
  let T = 0;
  let tenureDays = 0;
  if (account.owner_change_date) {
    const changeDate = new Date(account.owner_change_date);
    tenureDays = Math.floor(
      (Date.now() - changeDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    T = Math.min(1, tenureDays / params.tenure_max_days);
  }
  
  const ownerCount = account.owners_lifetime_count ?? 1;
  const B = Math.max(0, 1 - (ownerCount - 1) / (params.stability_max_owners - 1));
  
  const arr = account.aggregated_arr || 0;
  const V = Math.min(1, arr / params.value_threshold);
  
  const score = Math.min(1, params.base_continuity + 
    params.tenure_weight * T + 
    params.stability_weight * B + 
    params.value_weight * V);
  
  return [
    `Base: ${params.base_continuity.toFixed(2)}`,
    `Tenure: ${params.tenure_weight.toFixed(2)} × ${T.toFixed(2)} (${tenureDays} days)`,
    `Stability: ${params.stability_weight.toFixed(2)} × ${B.toFixed(2)} (${ownerCount} owners)`,
    `Value: ${params.value_weight.toFixed(2)} × ${V.toFixed(2)} ($${(arr/1000000).toFixed(2)}M)`,
    `Total: ${score.toFixed(3)}`
  ].join(' | ');
}

