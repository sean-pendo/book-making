/**
 * Rationale Generator
 *
 * Generates human-readable explanations for each assignment.
 * Based on the dominant scoring factor and lock status.
 *
 * Priority codes are now DYNAMIC based on user's priority_config.
 * Falls back to default positions if no config provided.
 */

import type {
  AggregatedAccount,
  EligibleRep,
  AssignmentScores,
  NormalizedWeights,
  StabilityLockResult
} from '../types';
import { DEFAULT_LP_GEOGRAPHY_PARAMS } from '../types';
import type { PriorityConfig } from '@/config/priorityRegistry';

// =============================================================================
// Mapping Constants
// =============================================================================

/**
 * Map lock types (from StabilityLockResult.lockType) to priority IDs
 */
const LOCK_TYPE_TO_PRIORITY_ID: Record<string, string> = {
  'manual_lock': 'manual_holdover',
  'cre_risk': 'stability_accounts',
  'renewal_soon': 'stability_accounts',
  'pe_firm': 'stability_accounts',
  'recent_change': 'stability_accounts',
  'backfill_migration': 'stability_accounts',
};

/**
 * Fallback positions when config is missing (matches MASTER_LOGIC.mdc default order)
 */
const DEFAULT_PRIORITY_POSITIONS: Record<string, number> = {
  'manual_holdover': 0,
  'sales_tools_bucket': 1,
  'stability_accounts': 2,
  'team_alignment': 3,
  'geo_and_continuity': 4,
  'continuity': 5,
  'geography': 6,
  'arr_balance': 999, // RO - always last
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get priority position label (P0, P1, ... or RO) for a given priority ID
 * 
 * Uses priority_config from database when available, falls back to defaults.
 * Exported for use by waterfall engine to ensure consistent position labels.
 */
export function getPositionLabel(priorityId: string, priorityConfig?: PriorityConfig[]): string {
  // If config provided and not empty, use it
  if (priorityConfig?.length) {
    const config = priorityConfig.find(p => p.id === priorityId && p.enabled);
    if (config && config.position !== undefined) {
      // arr_balance (residual) should always show as RO
      if (priorityId === 'arr_balance') return 'RO';
      return `P${config.position}`;
    }
    // If priority not found or disabled, treat as residual
    return 'RO';
  }

  // Fallback to defaults when no config
  const defaultPos = DEFAULT_PRIORITY_POSITIONS[priorityId];
  if (defaultPos === undefined || priorityId === 'arr_balance') return 'RO';
  return `P${defaultPos}`;
}

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Generate a human-readable rationale for an assignment
 */
export function generateRationale(
  account: AggregatedAccount,
  assignedRep: EligibleRep,
  scores: AssignmentScores,
  weights: NormalizedWeights,
  lockResult: StabilityLockResult | null,
  priorityConfig?: PriorityConfig[]
): string {
  // Locked accounts have specific rationales
  if (lockResult?.isLocked && lockResult.lockType) {
    return generateLockRationale(lockResult, assignedRep, priorityConfig);
  }

  // Calculate weighted contributions (handle N/A team alignment)
  const contributions = [
    { name: 'Continuity', value: scores.continuity * weights.wC, raw: scores.continuity },
    { name: 'Geography', value: scores.geography * weights.wG, raw: scores.geography },
    // Team alignment: null = N/A, treated as 0 contribution but not a mismatch
    { name: 'Team Match', value: scores.teamAlignment !== null ? scores.teamAlignment * weights.wT : 0, raw: scores.teamAlignment },
  ].sort((a, b) => b.value - a.value);

  const totalScore = contributions.reduce((s, c) => s + c.value, 0);
  const top = contributions[0];

  // Check for combined Geography + Continuity
  const hasStrongGeo = scores.geography >= DEFAULT_LP_GEOGRAPHY_PARAMS.sibling_score;
  const hasStrongContinuity = scores.continuity >= DEFAULT_LP_GEOGRAPHY_PARAMS.parent_score;

  if (hasStrongGeo && hasStrongContinuity) {
    const label = getPositionLabel('geo_and_continuity', priorityConfig);
    return `${label}: Geography + Continuity → ${assignedRep.name} (${assignedRep.region || 'matching region'}, relationship maintained, score ${totalScore.toFixed(2)})`;
  }

  // Geography dominant
  if (top.name === 'Geography' && top.raw >= DEFAULT_LP_GEOGRAPHY_PARAMS.exact_match_score) {
    const label = getPositionLabel('geography', priorityConfig);
    return `${label}: Geography Match → ${assignedRep.name} (${assignedRep.region || 'matching region'} - exact geo match, score ${totalScore.toFixed(2)})`;
  }

  if (top.name === 'Geography' && top.raw >= DEFAULT_LP_GEOGRAPHY_PARAMS.sibling_score) {
    const label = getPositionLabel('geography', priorityConfig);
    return `${label}: Geography Match → ${assignedRep.name} (${assignedRep.region || 'nearby region'} - sibling region, score ${totalScore.toFixed(2)})`;
  }

  if (top.name === 'Geography' && top.raw >= DEFAULT_LP_GEOGRAPHY_PARAMS.parent_score) {
    const label = getPositionLabel('geography', priorityConfig);
    return `${label}: Geography Match → ${assignedRep.name} (${assignedRep.region || 'same macro-region'} - regional alignment, score ${totalScore.toFixed(2)})`;
  }

  // Continuity dominant
  if (top.name === 'Continuity' && top.raw > 0.7) {
    const label = getPositionLabel('continuity', priorityConfig);
    return `${label}: Account Continuity → ${assignedRep.name} (long-term relationship, score ${totalScore.toFixed(2)})`;
  }

  if (top.name === 'Continuity' && top.raw > 0.4) {
    const label = getPositionLabel('continuity', priorityConfig);
    return `${label}: Account Continuity → ${assignedRep.name} (relationship maintained, score ${totalScore.toFixed(2)})`;
  }

  // Team alignment as a factor
  // Skip if N/A (null)
  if (top.name === 'Team Match' && top.raw !== null && top.raw >= 1.0) {
    const label = getPositionLabel('team_alignment', priorityConfig);
    return `${label}: Team Alignment → ${assignedRep.name} (${assignedRep.team_tier || assignedRep.team || 'matching tier'} - exact tier match, score ${totalScore.toFixed(2)})`;
  }

  if (top.name === 'Team Match' && top.raw !== null && top.raw >= 0.6) {
    const label = getPositionLabel('team_alignment', priorityConfig);
    return `${label}: Team Alignment → ${assignedRep.name} (${assignedRep.team_tier || assignedRep.team || 'close tier'} - good tier alignment, score ${totalScore.toFixed(2)})`;
  }

  // Balance-driven (RO)
  if (totalScore < 0.3) {
    return `RO: Balance Optimization → ${assignedRep.name} (best available for balance, score ${totalScore.toFixed(2)})`;
  }

  // Generic optimized (RO)
  return `RO: Optimized → ${assignedRep.name} (${top.name.toLowerCase()} was primary factor, score ${totalScore.toFixed(2)})`;
}

/**
 * Generate rationale for locked accounts
 * Uses priority config to determine correct position labels
 */
function generateLockRationale(
  lock: StabilityLockResult,
  rep: EligibleRep,
  priorityConfig?: PriorityConfig[]
): string {
  const priorityId = LOCK_TYPE_TO_PRIORITY_ID[lock.lockType || ''] || 'stability_accounts';
  const label = getPositionLabel(priorityId, priorityConfig);

  switch (lock.lockType) {
    case 'manual_lock':
      return `${label}: Excluded from reassignment → ${rep.name} (manually locked)`;

    case 'backfill_migration':
      return `${label}: Stability Lock → ${rep.name} (backfill migration from departing rep)`;

    case 'cre_risk':
      return `${label}: Stability Lock → ${rep.name} (CRE at-risk - relationship stability)`;

    case 'renewal_soon':
      return `${label}: Stability Lock → ${rep.name} (${lock.reason || 'renewal within threshold'})`;

    case 'pe_firm':
      return `${label}: Stability Lock → ${rep.name} (${lock.reason || 'PE firm portfolio alignment'})`;

    case 'recent_change':
      return `${label}: Stability Lock → ${rep.name} (${lock.reason || 'recently changed owner'})`;

    default:
      return `${label}: Stability Lock → ${rep.name} (stability constraint)`;
  }
}

/**
 * Generate detailed score breakdown for debugging
 */
export function generateScoreBreakdown(
  scores: AssignmentScores,
  weights: NormalizedWeights
): string {
  const parts = [
    `Continuity: ${(scores.continuity * 100).toFixed(0)}% × ${(weights.wC * 100).toFixed(0)}% = ${(scores.continuity * weights.wC * 100).toFixed(1)}`,
    `Geography: ${(scores.geography * 100).toFixed(0)}% × ${(weights.wG * 100).toFixed(0)}% = ${(scores.geography * weights.wG * 100).toFixed(1)}`,
    // Handle N/A team alignment
    scores.teamAlignment !== null
      ? `Team: ${(scores.teamAlignment * 100).toFixed(0)}% × ${(weights.wT * 100).toFixed(0)}% = ${(scores.teamAlignment * weights.wT * 100).toFixed(1)}`
      : `Team: N/A (missing tier data)`
  ];

  const teamContribution = scores.teamAlignment !== null ? scores.teamAlignment * weights.wT : 0;
  const total = scores.continuity * weights.wC + scores.geography * weights.wG + teamContribution;
  parts.push(`Total: ${(total * 100).toFixed(1)}%`);

  return parts.join(' | ');
}
