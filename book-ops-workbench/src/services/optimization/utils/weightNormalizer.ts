/**
 * Weight Normalizer
 * 
 * Ensures objective weights sum to 1.0 (100%).
 * Handles disabled objectives by redistributing their weight.
 */

import type { LPObjectivesConfig, NormalizedWeights } from '../types';

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
