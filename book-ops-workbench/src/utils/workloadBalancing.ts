// Workload balancing utilities for territory management
import type { OwnerMetrics } from '@/services/buildDataService';

export interface WorkloadBalancingConfig {
  targetVariancePercent: number; // e.g., 15 for 15% variance
  arrWeight: number; // Weight for ARR balancing (primary factor)
  accountCountWeight: number; // Weight for account count balancing
  tierMixWeight: number; // Weight for tier mix balancing
  maxARRVariance: number; // Maximum ARR variance allowed (e.g., 25% = 1.25x)
  maxAccountVariance: number; // Maximum account variance allowed (e.g., 15% = 1.15x)
}

export interface WorkloadBalancingResult {
  isBalanced: boolean;
  overloadedReps: string[];
  underloadedReps: string[];
  compositeBalance: {
    score: number; // 0-100, where 100 is perfect balance
    grade: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Critical';
  };
  variance: {
    accountCount: number;
    arr: number;
    tierMix: number;
    overall: number;
  };
  imbalanceTypes: string[]; // Types of detected imbalances
  suggestions: WorkloadSuggestion[];
}

export interface WorkloadSuggestion {
  fromRep: string;
  toRep: string;
  accountsToMove: number;
  estimatedARRTransfer: number;
  rationale: string;
}

export const DEFAULT_WORKLOAD_CONFIG: WorkloadBalancingConfig = {
  targetVariancePercent: 15,
  arrWeight: 0.50, // ARR is the primary balancing factor
  accountCountWeight: 0.30, // Account distribution is secondary
  tierMixWeight: 0.20, // Tier mix balance is tertiary
  maxARRVariance: 25, // 25% ARR variance tolerance
  maxAccountVariance: 15, // 15% account count variance tolerance
};

/**
 * Analyze workload distribution with enhanced multi-factor balance assessment
 */
export function analyzeWorkloadBalance(
  ownerMetrics: OwnerMetrics[],
  config: WorkloadBalancingConfig = DEFAULT_WORKLOAD_CONFIG
): WorkloadBalancingResult {
  if (ownerMetrics.length === 0) {
    return {
      isBalanced: true,
      overloadedReps: [],
      underloadedReps: [],
      compositeBalance: { score: 100, grade: 'Excellent' },
      variance: { accountCount: 0, arr: 0, tierMix: 0, overall: 0 },
      imbalanceTypes: [],
      suggestions: []
    };
  }

  // Calculate comprehensive averages and metrics
  const avgParentAccounts = ownerMetrics.reduce((sum, rep) => sum + rep.accounts.parents, 0) / ownerMetrics.length;
  const avgARR = ownerMetrics.reduce((sum, rep) => sum + rep.arr, 0) / ownerMetrics.length;
  const avgTier1Percentage = ownerMetrics.reduce((sum, rep) => sum + (rep.tierPercentages?.tier1 || 0), 0) / ownerMetrics.length;

  // Enhanced variance calculations with business impact
  const accountVariance = calculateCoefficientOfVariation(ownerMetrics.map(rep => rep.accounts.parents));
  const arrVariance = calculateCoefficientOfVariation(ownerMetrics.map(rep => rep.arr));
  const tierVariance = calculateCoefficientOfVariation(ownerMetrics.map(rep => rep.tierPercentages?.tier1 || 0));

  // Composite balance score calculation (0-100)
  const arrBalanceScore = Math.max(0, 100 - (arrVariance * 2)); // ARR variance heavily penalized
  const accountBalanceScore = Math.max(0, 100 - (accountVariance * 1.5));
  const tierBalanceScore = Math.max(0, 100 - (tierVariance * 1));

  const compositeScore = 
    (arrBalanceScore * config.arrWeight) +
    (accountBalanceScore * config.accountCountWeight) +
    (tierBalanceScore * config.tierMixWeight);

  // Determine balance grade
  const grade = compositeScore >= 90 ? 'Excellent' :
                compositeScore >= 75 ? 'Good' :
                compositeScore >= 60 ? 'Fair' :
                compositeScore >= 40 ? 'Poor' : 'Critical';

  // Identify specific imbalance types
  const imbalanceTypes: string[] = [];
  if (arrVariance > config.maxARRVariance) imbalanceTypes.push('ARR Imbalance');
  if (accountVariance > config.maxAccountVariance) imbalanceTypes.push('Account Count Imbalance');
  if (tierVariance > 25) imbalanceTypes.push('Tier Distribution Imbalance');

  // Enhanced rep classification with multi-factor analysis
  const overloadedReps: string[] = [];
  const underloadedReps: string[] = [];

  ownerMetrics.forEach(rep => {
    // Calculate deviation ratios for each metric
    const accountRatio = avgParentAccounts > 0 ? rep.accounts.parents / avgParentAccounts : 1;
    const arrRatio = avgARR > 0 ? rep.arr / avgARR : 1;
    const tierRatio = avgTier1Percentage > 0 ? (rep.tierPercentages?.tier1 || 0) / avgTier1Percentage : 1;

    // Composite overload/underload score
    const overloadScore = 
      (accountRatio > 1 + (config.maxAccountVariance / 100) ? config.accountCountWeight : 0) +
      (arrRatio > 1 + (config.maxARRVariance / 100) ? config.arrWeight : 0) +
      (tierRatio > 1.5 ? config.tierMixWeight : 0);

    const underloadScore = 
      (accountRatio < 1 - (config.maxAccountVariance / 100) ? config.accountCountWeight : 0) +
      (arrRatio < 1 - (config.maxARRVariance / 100) ? config.arrWeight : 0) +
      (tierRatio < 0.5 ? config.tierMixWeight : 0);

    // Threshold for classification (weighted by importance)
    if (overloadScore >= 0.4) { // Lower threshold for more sensitive detection
      overloadedReps.push(rep.rep_id);
    } else if (underloadScore >= 0.4) {
      underloadedReps.push(rep.rep_id);
    }
  });

  // Overall variance calculation
  const overallVariance = 
    (arrVariance * config.arrWeight) +
    (accountVariance * config.accountCountWeight) +
    (tierVariance * config.tierMixWeight);

  // Generate enhanced rebalancing suggestions
  const suggestions = generateEnhancedRebalancingSuggestions(ownerMetrics, config);

  return {
    isBalanced: compositeScore >= 75 && imbalanceTypes.length === 0,
    overloadedReps,
    underloadedReps,
    compositeBalance: { score: Math.round(compositeScore), grade },
    variance: {
      accountCount: accountVariance,
      arr: arrVariance,
      tierMix: tierVariance,
      overall: overallVariance,
    },
    imbalanceTypes,
    suggestions
  };
}

/**
 * Calculate coefficient of variation (CV) as percentage
 */
function calculateCoefficientOfVariation(values: number[]): number {
  if (values.length === 0) return 0;

  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  if (mean === 0) return 0;

  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const standardDeviation = Math.sqrt(variance);
  
  return (standardDeviation / mean) * 100;
}

/**
 * Generate enhanced rebalancing suggestions with multi-factor optimization
 */
function generateEnhancedRebalancingSuggestions(
  ownerMetrics: OwnerMetrics[],
  config: WorkloadBalancingConfig
): WorkloadSuggestion[] {
  const suggestions: WorkloadSuggestion[] = [];
  
  // Calculate averages for all metrics
  const avgParentAccounts = ownerMetrics.reduce((sum, rep) => sum + rep.accounts.parents, 0) / ownerMetrics.length;
  const avgARR = ownerMetrics.reduce((sum, rep) => sum + rep.arr, 0) / ownerMetrics.length;
  const avgTier1Percentage = ownerMetrics.reduce((sum, rep) => sum + (rep.tierPercentages?.tier1 || 0), 0) / ownerMetrics.length;

  // Sort by composite workload score (ARR-weighted)
  const sortedByCompositeLoad = [...ownerMetrics].sort((a, b) => {
    const aScore = 
      (a.arr * config.arrWeight) + 
      (a.accounts.parents * config.accountCountWeight) + 
      ((a.tierPercentages?.tier1 || 0) * config.tierMixWeight * avgARR / Math.max(avgTier1Percentage, 1)); // Normalize tier impact by ARR
    
    const bScore = 
      (b.arr * config.arrWeight) + 
      (b.accounts.parents * config.accountCountWeight) + 
      ((b.tierPercentages?.tier1 || 0) * config.tierMixWeight * avgARR / Math.max(avgTier1Percentage, 1));
    
    return bScore - aScore;
  });

  // Generate sophisticated rebalancing suggestions
  const topOverloaded = sortedByCompositeLoad.slice(0, Math.ceil(sortedByCompositeLoad.length / 3));
  const bottomUnderloaded = sortedByCompositeLoad.slice(-Math.ceil(sortedByCompositeLoad.length / 3)).reverse();

  for (let i = 0; i < Math.min(topOverloaded.length, bottomUnderloaded.length, 5); i++) {
    const overloadedRep = topOverloaded[i];
    const underloadedRep = bottomUnderloaded[i];

    // Multi-factor imbalance detection
    const accountImbalance = overloadedRep.accounts.parents > avgParentAccounts * (1 + config.maxAccountVariance / 100) &&
                           underloadedRep.accounts.parents < avgParentAccounts * (1 - config.maxAccountVariance / 100);
    
    const arrImbalance = overloadedRep.arr > avgARR * (1 + config.maxARRVariance / 100) &&
                        underloadedRep.arr < avgARR * (1 - config.maxARRVariance / 100);

    if (accountImbalance || arrImbalance) {
      // Smart calculation of accounts to move based on both metrics
      const accountExcess = Math.max(0, overloadedRep.accounts.parents - avgParentAccounts);
      const accountDeficit = Math.max(0, avgParentAccounts - underloadedRep.accounts.parents);
      const accountsToMove = Math.min(
        Math.ceil(accountExcess / 2), 
        Math.ceil(accountDeficit / 2),
        Math.max(1, Math.ceil(avgParentAccounts * 0.1)) // Max 10% of average
      );

      const estimatedARRTransfer = overloadedRep.accounts.parents > 0 
        ? (overloadedRep.arr / overloadedRep.accounts.parents) * accountsToMove 
        : 0;

      // Enhanced rationale with multiple factors
      const overloadFactors = [];
      const underloadFactors = [];

      if (overloadedRep.accounts.parents > avgParentAccounts * 1.15) {
        overloadFactors.push(`${overloadedRep.accounts.parents} accounts (+${((overloadedRep.accounts.parents - avgParentAccounts) / avgParentAccounts * 100).toFixed(0)}%)`);
      }
      if (overloadedRep.arr > avgARR * 1.25) {
        overloadFactors.push(`$${(overloadedRep.arr / 1000000).toFixed(1)}M ARR (+${((overloadedRep.arr - avgARR) / avgARR * 100).toFixed(0)}%)`);
      }

      if (underloadedRep.accounts.parents < avgParentAccounts * 0.85) {
        underloadFactors.push(`${underloadedRep.accounts.parents} accounts (-${((avgParentAccounts - underloadedRep.accounts.parents) / avgParentAccounts * 100).toFixed(0)}%)`);
      }
      if (underloadedRep.arr < avgARR * 0.75) {
        underloadFactors.push(`$${(underloadedRep.arr / 1000000).toFixed(1)}M ARR (-${((avgARR - underloadedRep.arr) / avgARR * 100).toFixed(0)}%)`);
      }

      suggestions.push({
        fromRep: overloadedRep.rep_id,
        toRep: underloadedRep.rep_id,
        accountsToMove,
        estimatedARRTransfer,
        rationale: `Multi-factor rebalancing: ${overloadedRep.name} (${overloadFactors.join(', ')}) → ${underloadedRep.name} (${underloadFactors.join(', ')}). Moving ${accountsToMove} accounts would transfer ~$${(estimatedARRTransfer / 1000000).toFixed(1)}M ARR.`
      });
    }
  }

  return suggestions.slice(0, 5); // Limit to top 5 suggestions
}

/**
 * Get workload status for a rep
 */
export function getRepWorkloadStatus(
  rep: OwnerMetrics,
  ownerMetrics: OwnerMetrics[],
  config: WorkloadBalancingConfig = DEFAULT_WORKLOAD_CONFIG
): 'Overloaded' | 'Balanced' | 'Light' {
  if (ownerMetrics.length === 0) return 'Balanced';

  const avgParentAccounts = ownerMetrics.reduce((sum, r) => sum + r.accounts.parents, 0) / ownerMetrics.length;
  const threshold = avgParentAccounts * (config.targetVariancePercent / 100);

  if (rep.accounts.parents > avgParentAccounts + threshold) return 'Overloaded';
  if (rep.accounts.parents < avgParentAccounts - threshold) return 'Light';
  return 'Balanced';
}

/**
 * Enhanced assignment validation with multi-factor balance checking
 */
export function validateAssignmentBalance(
  repId: string,
  additionalAccounts: number,
  additionalARR: number,
  ownerMetrics: OwnerMetrics[],
  config: WorkloadBalancingConfig = DEFAULT_WORKLOAD_CONFIG
): { valid: boolean; reason?: string; severity: 'low' | 'medium' | 'high' } {
  const rep = ownerMetrics.find(r => r.rep_id === repId);
  if (!rep) return { valid: false, reason: 'Rep not found', severity: 'high' };

  const avgParentAccounts = ownerMetrics.reduce((sum, r) => sum + r.accounts.parents, 0) / ownerMetrics.length;
  const avgARR = ownerMetrics.reduce((sum, r) => sum + r.arr, 0) / ownerMetrics.length;
  
  const newAccountCount = rep.accounts.parents + additionalAccounts;
  const newARR = rep.arr + additionalARR;

  // Enhanced thresholds with different severity levels
  const accountSoftLimit = avgParentAccounts * (1 + config.maxAccountVariance / 100);
  const accountHardLimit = avgParentAccounts * (1 + (config.maxAccountVariance * 1.5) / 100);
  
  const arrSoftLimit = avgARR * (1 + config.maxARRVariance / 100);
  const arrHardLimit = avgARR * (1 + (config.maxARRVariance * 1.5) / 100);

  // Hard limits (blocking)
  if (newAccountCount > accountHardLimit) {
    return { 
      valid: false, 
      reason: `Would severely exceed account limit: ${newAccountCount} > ${accountHardLimit.toFixed(1)} (${(config.maxAccountVariance * 1.5).toFixed(0)}% over average)`,
      severity: 'high'
    };
  }

  if (newARR > arrHardLimit) {
    return { 
      valid: false, 
      reason: `Would severely exceed ARR limit: $${(newARR/1000000).toFixed(1)}M > $${(arrHardLimit/1000000).toFixed(1)}M (${(config.maxARRVariance * 1.5).toFixed(0)}% over average)`,
      severity: 'high'
    };
  }

  // Soft limits (warnings)
  if (newAccountCount > accountSoftLimit || newARR > arrSoftLimit) {
    const warnings = [];
    if (newAccountCount > accountSoftLimit) {
      warnings.push(`account count: ${newAccountCount} > ${accountSoftLimit.toFixed(1)}`);
    }
    if (newARR > arrSoftLimit) {
      warnings.push(`ARR: $${(newARR/1000000).toFixed(1)}M > $${(arrSoftLimit/1000000).toFixed(1)}M`);
    }
    
    return { 
      valid: true, 
      reason: `Warning - Would exceed soft limits (${warnings.join(', ')})`,
      severity: 'medium'
    };
  }

  return { valid: true, severity: 'low' };
}

/**
 * Calculate enhanced workload score for assignment prioritization
 */
export function calculateWorkloadScore(
  rep: OwnerMetrics,
  ownerMetrics: OwnerMetrics[],
  config: WorkloadBalancingConfig = DEFAULT_WORKLOAD_CONFIG
): number {
  if (ownerMetrics.length === 0) return 0;

  const avgParentAccounts = ownerMetrics.reduce((sum, r) => sum + r.accounts.parents, 0) / ownerMetrics.length;
  const avgARR = ownerMetrics.reduce((sum, r) => sum + r.arr, 0) / ownerMetrics.length;
  const avgTier1Percentage = ownerMetrics.reduce((sum, r) => sum + (r.tierPercentages?.tier1 || 0), 0) / ownerMetrics.length;

  // Normalize each factor (lower is better for assignment)
  const accountScore = avgParentAccounts > 0 ? (rep.accounts.parents / avgParentAccounts) : 1;
  const arrScore = avgARR > 0 ? (rep.arr / avgARR) : 1;
  const tierScore = avgTier1Percentage > 0 ? ((rep.tierPercentages?.tier1 || 0) / avgTier1Percentage) : 1;

  // Composite score (lower values = less loaded = better candidate)
  return (accountScore * config.accountCountWeight) +
         (arrScore * config.arrWeight) +
         (tierScore * config.tierMixWeight);
}