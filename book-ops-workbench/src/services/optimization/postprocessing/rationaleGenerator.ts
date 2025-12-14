/**
 * Rationale Generator
 * 
 * Generates human-readable explanations for each assignment.
 * Based on the dominant scoring factor and lock status.
 * 
 * Priority codes (for UI categorization):
 * - P0: Manual/Strategic locks
 * - P1: Stability locks (CRE, renewal, PE, recent change)
 * - P2: Geography + Continuity (both strong)
 * - P3: Geography Match (dominant factor)
 * - P4: Account Continuity (dominant factor)
 * - RO: Balance-driven / Residual Optimization
 */

import type { 
  AggregatedAccount, 
  EligibleRep, 
  AssignmentScores, 
  NormalizedWeights,
  StabilityLockResult 
} from '../types';

/**
 * Generate a human-readable rationale for an assignment
 */
export function generateRationale(
  account: AggregatedAccount,
  assignedRep: EligibleRep,
  scores: AssignmentScores,
  weights: NormalizedWeights,
  lockResult: StabilityLockResult | null
): string {
  // Locked accounts have specific rationales
  if (lockResult?.isLocked && lockResult.lockType) {
    return generateLockRationale(lockResult, assignedRep);
  }
  
  // Calculate weighted contributions
  const contributions = [
    { name: 'Continuity', value: scores.continuity * weights.wC, raw: scores.continuity },
    { name: 'Geography', value: scores.geography * weights.wG, raw: scores.geography },
    { name: 'Team Match', value: scores.teamAlignment * weights.wT, raw: scores.teamAlignment },
  ].sort((a, b) => b.value - a.value);
  
  const totalScore = contributions.reduce((s, c) => s + c.value, 0);
  const top = contributions[0];
  const second = contributions[1];
  
  // Check for combined Geography + Continuity (P2)
  const hasStrongGeo = scores.geography >= 0.65;
  const hasStrongContinuity = scores.continuity >= 0.4;
  
  if (hasStrongGeo && hasStrongContinuity) {
    return `P2: Geography + Continuity → ${assignedRep.name} (${assignedRep.region || 'matching region'}, relationship maintained, score ${totalScore.toFixed(2)})`;
  }
  
  // Geography dominant (P3)
  if (top.name === 'Geography' && top.raw >= 1.0) {
    return `P3: Geography Match → ${assignedRep.name} (${assignedRep.region || 'matching region'} - exact geo match, score ${totalScore.toFixed(2)})`;
  }
  
  if (top.name === 'Geography' && top.raw >= 0.65) {
    return `P3: Geography Match → ${assignedRep.name} (${assignedRep.region || 'nearby region'} - sibling region, score ${totalScore.toFixed(2)})`;
  }
  
  if (top.name === 'Geography' && top.raw >= 0.4) {
    return `P3: Geography Match → ${assignedRep.name} (${assignedRep.region || 'same macro-region'} - regional alignment, score ${totalScore.toFixed(2)})`;
  }
  
  // Continuity dominant (P4)
  if (top.name === 'Continuity' && top.raw > 0.7) {
    return `P4: Account Continuity → ${assignedRep.name} (long-term relationship, score ${totalScore.toFixed(2)})`;
  }
  
  if (top.name === 'Continuity' && top.raw > 0.4) {
    return `P4: Account Continuity → ${assignedRep.name} (relationship maintained, score ${totalScore.toFixed(2)})`;
  }
  
  // Team alignment as a factor (falls to RO since not in priority list)
  if (top.name === 'Team Match' && top.raw >= 1.0) {
    return `RO: Team Alignment → ${assignedRep.name} (${assignedRep.team_tier || assignedRep.team || 'matching tier'} - exact tier match, score ${totalScore.toFixed(2)})`;
  }
  
  if (top.name === 'Team Match' && top.raw >= 0.6) {
    return `RO: Team Alignment → ${assignedRep.name} (${assignedRep.team_tier || assignedRep.team || 'close tier'} - good tier alignment, score ${totalScore.toFixed(2)})`;
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
 * P0: Manual locks / Strategic assignments
 * P1: Stability locks (CRE, renewal, PE, recent change, backfill)
 */
function generateLockRationale(
  lock: StabilityLockResult,
  rep: EligibleRep
): string {
  switch (lock.lockType) {
    case 'manual_lock':
      return `P0: Excluded from reassignment → ${rep.name} (manually locked)`;
    
    case 'backfill_migration':
      return `P1: Stability Lock → ${rep.name} (backfill migration from departing rep)`;
    
    case 'cre_risk':
      return `P1: Stability Lock → ${rep.name} (CRE at-risk - relationship stability)`;
    
    case 'renewal_soon':
      return `P1: Stability Lock → ${rep.name} (${lock.reason || 'renewal within threshold'})`;
    
    case 'pe_firm':
      return `P1: Stability Lock → ${rep.name} (${lock.reason || 'PE firm portfolio alignment'})`;
    
    case 'recent_change':
      return `P1: Stability Lock → ${rep.name} (${lock.reason || 'recently changed owner'})`;
    
    default:
      return `P1: Stability Lock → ${rep.name} (stability constraint)`;
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
    `Team: ${(scores.teamAlignment * 100).toFixed(0)}% × ${(weights.wT * 100).toFixed(0)}% = ${(scores.teamAlignment * weights.wT * 100).toFixed(1)}`
  ];
  
  const total = scores.continuity * weights.wC + scores.geography * weights.wG + scores.teamAlignment * weights.wT;
  parts.push(`Total: ${(total * 100).toFixed(1)}%`);
  
  return parts.join(' | ');
}

