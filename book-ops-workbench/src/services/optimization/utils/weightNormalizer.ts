/**
 * Weight Normalizer
 *
 * Ensures objective weights sum to 1.0 (100%).
 * Handles disabled objectives by redistributing their weight.
 *
 * NEW: Derives weights from user's priority configuration positions.
 * @see MASTER_LOGIC.mdc §10.2.1
 */

import type { LPObjectivesConfig, NormalizedWeights } from '../types';
import type { PriorityConfig } from '@/config/priorityRegistry';
import { calculatePriorityWeight } from '@/_domain';

/**
 * Normalize objective weights to sum to 1.0
 * Only considers enabled objectives
 * 
 * @param config - Objective configuration with enables and weights
 * @returns Normalized weights that sum to 1.0
 */
export function normalizeWeights(config: LPObjectivesConfig): NormalizedWeights {
  const activeWeights: { key: 'wC' | 'wG' | 'wT'; weight: number }[] = [];
  
  if (config.continuity_enabled) {
    activeWeights.push({ key: 'wC', weight: config.continuity_weight });
  }
  if (config.geography_enabled) {
    activeWeights.push({ key: 'wG', weight: config.geography_weight });
  }
  if (config.team_alignment_enabled) {
    activeWeights.push({ key: 'wT', weight: config.team_alignment_weight });
  }
  
  // If no objectives enabled, return zeros
  if (activeWeights.length === 0) {
    return { wC: 0, wG: 0, wT: 0 };
  }
  
  // Calculate total and normalize
  const total = activeWeights.reduce((sum, w) => sum + w.weight, 0);
  
  if (total === 0) {
    // All weights are zero - distribute equally
    const equalWeight = 1.0 / activeWeights.length;
    return {
      wC: config.continuity_enabled ? equalWeight : 0,
      wG: config.geography_enabled ? equalWeight : 0,
      wT: config.team_alignment_enabled ? equalWeight : 0
    };
  }
  
  return {
    wC: config.continuity_enabled ? config.continuity_weight / total : 0,
    wG: config.geography_enabled ? config.geography_weight / total : 0,
    wT: config.team_alignment_enabled ? config.team_alignment_weight / total : 0
  };
}

/**
 * Adjust weights when one changes, keeping sum at 1.0
 * 
 * @param config - Current configuration
 * @param changedKey - Which weight changed ('continuity' | 'geography' | 'team_alignment')
 * @param newValue - New value for the changed weight
 * @returns Updated configuration with normalized weights
 */
export function adjustLinkedWeights(
  config: LPObjectivesConfig,
  changedKey: 'continuity' | 'geography' | 'team_alignment',
  newValue: number
): LPObjectivesConfig {
  const result = { ...config };
  
  // Set the changed weight
  result[`${changedKey}_weight`] = newValue;
  
  // Get other enabled weights
  const others = (['continuity', 'geography', 'team_alignment'] as const).filter(k => 
    k !== changedKey && config[`${k}_enabled`]
  );
  
  if (others.length === 0) {
    // Only one objective enabled - cap at 1.0
    result[`${changedKey}_weight`] = Math.min(1, newValue);
    return result;
  }
  
  // Calculate how much the other weights need to adjust
  const oldValue = config[`${changedKey}_weight`];
  const delta = newValue - oldValue;
  
  // Get current sum of other weights
  const otherSum = others.reduce((sum, k) => sum + config[`${k}_weight`], 0);
  
  if (otherSum === 0) {
    // Other weights are zero - distribute equally
    const eachAdjust = -delta / others.length;
    others.forEach(k => {
      result[`${k}_weight`] = Math.max(0.05, eachAdjust);
    });
  } else {
    // Distribute delta proportionally to other weights
    others.forEach(k => {
      const proportion = config[`${k}_weight`] / otherSum;
      const adjustment = -delta * proportion;
      result[`${k}_weight`] = Math.max(0.05, Math.min(0.9, config[`${k}_weight`] + adjustment));
    });
  }
  
  // Final normalization pass
  const enabledKeys = (['continuity', 'geography', 'team_alignment'] as const).filter(k =>
    result[`${k}_enabled`]
  );
  const sum = enabledKeys.reduce((s, k) => s + result[`${k}_weight`], 0);
  
  if (sum > 0) {
    enabledKeys.forEach(k => {
      result[`${k}_weight`] = result[`${k}_weight`] / sum;
    });
  }
  
  return result;
}

/**
 * Check if weights are properly normalized (sum to 1.0 within tolerance)
 */
export function areWeightsNormalized(weights: NormalizedWeights, tolerance = 0.01): boolean {
  const sum = weights.wC + weights.wG + weights.wT;
  return Math.abs(sum - 1.0) <= tolerance;
}

/**
 * Format weights for display
 */
export function formatWeights(weights: NormalizedWeights): string {
  return `C: ${(weights.wC * 100).toFixed(0)}%, G: ${(weights.wG * 100).toFixed(0)}%, T: ${(weights.wT * 100).toFixed(0)}%`;
}

/**
 * Derive LP objective weights from user's priority configuration positions.
 *
 * This bridges the user's priority order (P0, P1, P2...) to the LP solver's
 * objective weights. Lower position numbers = higher priority = higher weight.
 *
 * **Formula:**
 * - `raw_weight = 1 / (position + 1)` — positions are 0-indexed
 * - `geo_and_continuity` contributes 50% of its weight to both geography and continuity
 * - Normalize: `final_weight = raw_weight / sum(all_raw_weights)`
 *
 * @param priorityConfig - User's priority configuration from assignment_configuration
 * @returns Normalized weights (wC, wG, wT) that sum to 1.0
 * @see MASTER_LOGIC.mdc §10.2.1
 */
export function deriveWeightsFromPriorityConfig(
  priorityConfig: PriorityConfig[]
): NormalizedWeights {
  const getPositionWeight = (id: string): number => {
    const p = priorityConfig.find(c => c.id === id && c.enabled);
    // calculatePriorityWeight expects 1-indexed, positions are 0-indexed
    // Position 0 (P0) → 1/1 = 1.0, Position 5 (P5) → 1/6 = 0.17
    return p !== undefined && p.position !== undefined
      ? calculatePriorityWeight(p.position + 1)
      : 0;
  };

  // geo_and_continuity contributes 50% to both geo and continuity
  // This allows a single priority to boost both factors proportionally
  const geoAndCont = getPositionWeight('geo_and_continuity');
  const rawG = getPositionWeight('geography') + geoAndCont * 0.5;
  const rawC = getPositionWeight('continuity') + geoAndCont * 0.5;
  const rawT = getPositionWeight('team_alignment');

  const total = rawG + rawC + rawT;
  if (total === 0) {
    // Fallback to defaults if no LP-relevant priorities are enabled
    console.log('[WeightNormalizer] No LP priorities enabled, using defaults');
    return { wC: 0.35, wG: 0.35, wT: 0.30 };
  }

  // Ensure minimum weights to prevent degenerate LP problems
  // When only one factor is enabled, give small weights to others
  const MIN_WEIGHT = 0.05;
  let wC = rawC / total;
  let wG = rawG / total;
  let wT = rawT / total;

  // If any weight is 0, set it to minimum and re-normalize
  const needsMinimum = wC === 0 || wG === 0 || wT === 0;
  if (needsMinimum) {
    wC = Math.max(wC, MIN_WEIGHT);
    wG = Math.max(wG, MIN_WEIGHT);
    wT = Math.max(wT, MIN_WEIGHT);
    const newTotal = wC + wG + wT;
    wC /= newTotal;
    wG /= newTotal;
    wT /= newTotal;
    console.log(`[WeightNormalizer] Applied minimum weights to prevent degenerate LP`);
  }

  console.log(`[WeightNormalizer] Derived weights: C=${wC.toFixed(3)}, G=${wG.toFixed(3)}, T=${wT.toFixed(3)}`);

  return { wG, wC, wT };
}
