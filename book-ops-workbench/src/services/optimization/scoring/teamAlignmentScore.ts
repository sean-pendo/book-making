/**
 * Team Alignment Score
 * 
 * Measures how well an account's complexity matches a rep's tier.
 * Uses employee count to classify account tier:
 * - SMB: < 100 employees
 * - Growth: 100-499 employees
 * - MM: 500-1499 employees
 * - ENT: 1500+ employees
 * 
 * Scoring based on tier distance:
 * - Exact match: 1.0
 * - 1 level: 0.60
 * - 2 levels: 0.25
 * - 3 levels: 0.05
 * 
 * Penalty when rep is "reaching down" (higher tier rep for lower tier account)
 */

import type { 
  AggregatedAccount, 
  EligibleRep, 
  LPTeamParams 
} from '../types';
import { TIER_ORDER } from '../types';
import { classifyTeamTier } from '@/_domain';

/**
 * Get tier index from tier name
 * Returns -1 if unknown
 */
export function getTierIndex(tier: string | null | undefined): number {
  if (!tier) return -1;
  const idx = TIER_ORDER.indexOf(tier as any);
  return idx >= 0 ? idx : -1;
}

// Tier classification: uses classifyTeamTier from @/_domain (single source of truth)

/**
 * Calculate team alignment score for an account-rep pair
 *
 * @param account - The account to score
 * @param rep - The potential rep to assign
 * @param params - Scoring parameters
 * @returns Score in range [0, 1], or null if either tier is unknown (N/A)
 *
 * @see MASTER_LOGIC.mdc §5.1.1 - Team Alignment Scoring with Missing Data
 */
export function teamAlignmentScore(
  account: AggregatedAccount,
  rep: EligibleRep,
  params: LPTeamParams
): number | null {
  // Determine account tier from employee count
  const accountTier = classifyTeamTier(account.employees);

  // Determine rep tier (prefer team_tier, fallback to team)
  const repTier = rep.team_tier || rep.team;

  // Get tier indices
  const accountIdx = getTierIndex(accountTier);
  const repIdx = getTierIndex(repTier);

  // Unknown tier for either → N/A (null), not a mismatch
  // Missing data should not penalize the assignment
  if (accountIdx === -1 || repIdx === -1) {
    return null;
  }

  const distance = Math.abs(accountIdx - repIdx);

  // Base score by distance
  let baseScore: number;
  switch (distance) {
    case 0:
      baseScore = params.exact_match_score;
      break;
    case 1:
      baseScore = params.one_level_score;
      break;
    case 2:
      baseScore = params.two_level_score;
      break;
    default:
      baseScore = params.three_level_score;
  }

  // Apply "reaching down" penalty
  // If rep tier is higher (larger index) than account tier, apply penalty
  // This discourages putting ENT reps on SMB accounts
  if (repIdx > accountIdx) {
    const penalty = params.reaching_down_penalty * distance;
    baseScore = Math.max(0, baseScore - penalty);
  }

  return baseScore;
}

/**
 * Debug helper: explain team alignment score breakdown
 */
export function explainTeamAlignmentScore(
  account: AggregatedAccount,
  rep: EligibleRep,
  params: LPTeamParams
): string {
  const accountTier = classifyTeamTier(account.employees);
  const repTier = rep.team_tier || rep.team;

  const accountIdx = getTierIndex(accountTier);
  const repIdx = getTierIndex(repTier);

  // N/A cases - missing data is not a mismatch
  if (accountIdx === -1) {
    return `N/A (account tier unknown: ${account.employees ?? 'null'} employees)`;
  }

  if (repIdx === -1) {
    return `N/A (rep tier unknown: ${repTier || 'null'})`;
  }

  const distance = Math.abs(accountIdx - repIdx);

  let distanceLabel: string;
  let baseScore: number;
  switch (distance) {
    case 0:
      distanceLabel = 'exact match';
      baseScore = params.exact_match_score;
      break;
    case 1:
      distanceLabel = '1 level';
      baseScore = params.one_level_score;
      break;
    case 2:
      distanceLabel = '2 levels';
      baseScore = params.two_level_score;
      break;
    default:
      distanceLabel = `${distance} levels`;
      baseScore = params.three_level_score;
  }

  let explanation = `${accountTier} (account) vs ${repTier} (rep): ${distanceLabel} → ${baseScore}`;

  if (repIdx > accountIdx) {
    const penalty = params.reaching_down_penalty * distance;
    const finalScore = Math.max(0, baseScore - penalty);
    explanation += ` - ${penalty.toFixed(2)} reaching-down penalty = ${finalScore.toFixed(2)}`;
  }

  return explanation;
}
