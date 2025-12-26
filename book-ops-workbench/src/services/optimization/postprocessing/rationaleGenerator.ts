/**
 * Rationale Generator
 *
 * Generates human-readable explanations for each assignment.
 * Shows percentage contribution breakdowns when multiple factors are significant.
 *
 * Priority codes are now DYNAMIC based on user's priority_config.
 * Falls back to default positions if no config provided.
 * 
 * @see MASTER_LOGIC.mdc §11.9.1 - Rationale Transparency
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
import { SIGNIFICANT_CONTRIBUTION_THRESHOLD } from '@/_domain';

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
// Contribution Types
// =============================================================================

interface Contribution {
  name: string;
  id: string;
  value: number;
  raw: number | null;
  pct: number;
}

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Generate a human-readable rationale for an assignment
 * 
 * Shows percentage breakdowns when multiple factors contribute ≥10%.
 * Omits factors with null values (e.g., team alignment when tier data missing).
 * 
 * @see MASTER_LOGIC.mdc §11.9.1 - Rationale Transparency
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

  // Calculate weighted contributions, filtering null team alignment
  const rawContributions: Array<{ name: string; id: string; value: number; raw: number | null }> = [
    { name: 'Geography', id: 'geography', value: scores.geography * weights.wG, raw: scores.geography },
    { name: 'Continuity', id: 'continuity', value: scores.continuity * weights.wC, raw: scores.continuity },
  ];
  
  // Only include team alignment if not null (N/A)
  if (scores.teamAlignment !== null) {
    rawContributions.push({ 
      name: 'Team', 
      id: 'team_alignment', 
      value: scores.teamAlignment * weights.wT, 
      raw: scores.teamAlignment 
    });
  }

  // Calculate total and percentages (renormalized when team is N/A)
  const total = rawContributions.reduce((s, c) => s + c.value, 0);
  
  // Build contribution list with percentages
  const contributions: Contribution[] = rawContributions
    .map(c => ({
      ...c,
      pct: total > 0 ? c.value / total : 0
    }))
    .sort((a, b) => b.pct - a.pct);

  // Filter to significant contributions (≥10%)
  const significant = contributions.filter(c => c.pct >= SIGNIFICANT_CONTRIBUTION_THRESHOLD);
  
  // Get priority label based on dominant factor
  const label = getDominantPriorityLabel(contributions, scores, priorityConfig);
  
  // Balance-driven (low total score)
  if (total < 0.3) {
    return `RO: ${assignedRep.name} - optimized for balance`;
  }

  // Build breakdown string
  const breakdown = buildContributionBreakdown(significant, contributions[0]);

  return `${label}: ${assignedRep.name} - ${breakdown}`;
}

/**
 * Determine the priority label based on dominant factors
 */
function getDominantPriorityLabel(
  contributions: Contribution[],
  scores: AssignmentScores,
  priorityConfig?: PriorityConfig[]
): string {
  if (contributions.length === 0) return 'RO';
  
  const top = contributions[0];
  
  // Check for combined Geography + Continuity (both strong)
  const hasStrongGeo = scores.geography >= DEFAULT_LP_GEOGRAPHY_PARAMS.sibling_score;
  const hasStrongContinuity = scores.continuity >= DEFAULT_LP_GEOGRAPHY_PARAMS.parent_score;
  
  if (hasStrongGeo && hasStrongContinuity) {
    return getPositionLabel('geo_and_continuity', priorityConfig);
  }
  
  // Use dominant factor for label
  return getPositionLabel(top.id, priorityConfig);
}

/**
 * Build natural language contribution breakdown
 * 
 * Multi-factor: "Geography (65%), Continuity (25%), Team (10%)"
 * Single dominant: "exact geographic match" (natural description)
 */
function buildContributionBreakdown(
  significant: Contribution[],
  top: Contribution
): string {
  // Single dominant factor - use natural language description
  if (significant.length <= 1) {
    return getSingleFactorDescription(top);
  }
  
  // Multi-factor - show percentage breakdown
  return significant
    .map(c => `${c.name} (${Math.round(c.pct * 100)}%)`)
    .join(', ');
}

/**
 * Get natural language description for a single dominant factor
 */
function getSingleFactorDescription(top: Contribution): string {
  if (top.name === 'Geography') {
    if (top.raw !== null && top.raw >= 1.0) return 'exact geographic match';
    if (top.raw !== null && top.raw >= 0.65) return 'strong regional alignment';
    if (top.raw !== null && top.raw >= 0.40) return 'regional alignment';
    return 'geographic optimization';
  }
  
  if (top.name === 'Continuity') {
    if (top.raw !== null && top.raw > 0.7) return 'long-term relationship preserved';
    if (top.raw !== null && top.raw > 0.4) return 'relationship continuity';
    return 'continuity consideration';
  }
  
  if (top.name === 'Team') {
    if (top.raw !== null && top.raw >= 1.0) return 'exact tier match';
    if (top.raw !== null && top.raw >= 0.6) return 'good tier alignment';
    return 'team alignment';
  }
  
  return 'optimized assignment';
}

/**
 * Generate rationale for locked accounts
 * Uses priority config to determine correct position labels
 * 
 * @see MASTER_LOGIC.mdc §11.9 - Rationale Generation
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
      // P0 manual lock - keep as-is
      return `${label}: Excluded from reassignment → ${rep.name} (manually locked)`;

    case 'backfill_migration':
      // Distinct from stability - accounts MUST move to new owner
      return `${label}: Backfill Migration → ${rep.name} (from departing owner)`;

    case 'cre_risk':
      // Stable account - CRE at-risk
      return `${label}: Stable Account → ${rep.name} (CRE at-risk)`;

    case 'renewal_soon':
      // Stable account - renewal coming soon
      return `${label}: Stable Account → ${rep.name} (${lock.reason || 'renewal soon'})`;

    case 'pe_firm':
      // Stable account - PE firm alignment
      return `${label}: Stable Account → ${rep.name} (${lock.reason || 'PE firm alignment'})`;

    case 'recent_change':
      // Stable account - recently changed owner
      return `${label}: Stable Account → ${rep.name} (${lock.reason || 'recent owner change'})`;

    default:
      return `${label}: Stable Account → ${rep.name} (stability constraint)`;
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
