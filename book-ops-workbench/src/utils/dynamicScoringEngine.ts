/**
 * Dynamic Scoring Engine - Calculates assignment scores based on configurable weights
 */

export interface ScoringWeights {
  // Geographic Rule Weights
  geoMatch?: number;
  territoryAlignment?: number;
  distancePenalty?: number;
  
  // Continuity Rule Weights
  continuityBonus?: number;
  ownershipDuration?: number;
  regionalOverride?: number;
  
  // Balance Rule Weights
  balanceImpact?: number;
  arrWeight?: number;
  accountCountWeight?: number;
  variancePenalty?: number;
  
  // Threshold Rule Weights
  minimumEnforcement?: number;
  thresholdPriority?: number;
  
  // Round Robin Weights
  fairnessScore?: number;
  sequentialBonus?: number;
  
  // Tier Balance Weights
  tierDistributionWeight?: number;
  tier1Bonus?: number;
  tier2Bonus?: number;
  tier3Bonus?: number;
  tier4Bonus?: number;
  
  // CRE Balance Weights
  creDistributionWeight?: number;
  maxCREPerRep?: number;
  creOverloadPenalty?: number;
  
  // Custom weights (extensible)
  [key: string]: number | undefined;
}

export interface ScoringContext {
  account: any;
  rep: any;
  currentWorkload?: {
    currentARR: number;
    currentAccounts: number;
    proposedARR: number;
    proposedAccounts: number;
  };
  allRepsWorkload?: Map<string, any>;
  averageARR?: number;
  averageAccounts?: number;
  territoryMappings?: Record<string, string>;
}

export class DynamicScoringEngine {
  /**
   * Calculate geographic assignment score
   */
  static calculateGeoScore(
    context: ScoringContext,
    weights: ScoringWeights
  ): number {
    let score = 0;
    const { account, rep, territoryMappings } = context;
    
    // Base geographic match
    const accountTerritory = account.sales_territory || account.geo;
    const targetRegion = territoryMappings?.[accountTerritory];
    
    if (targetRegion && rep.region === targetRegion) {
      score += weights.geoMatch || 100;
      
      // Perfect territory alignment bonus
      if (account.sales_territory === rep.region) {
        score += weights.territoryAlignment || 80;
      }
    } else {
      // Apply distance penalty for mismatch
      score += weights.distancePenalty || -20;
    }
    
    return score;
  }

  /**
   * Calculate continuity score
   */
  static calculateContinuityScore(
    context: ScoringContext,
    weights: ScoringWeights
  ): number {
    let score = 0;
    const { account, rep } = context;
    
    // Check if rep is current owner
    if (account.owner_id === rep.rep_id) {
      score += weights.continuityBonus || 75;
      
      // Additional bonus based on ownership duration (if available)
      // This could be enhanced with actual duration data
      score += weights.ownershipDuration || 50;
      
      // Regional alignment bonus for continuity
      if (account.sales_territory && rep.region && account.sales_territory === rep.region) {
        score += weights.regionalOverride || 30;
      }
    }
    
    return score;
  }

  /**
   * Calculate balance score
   */
  static calculateBalanceScore(
    context: ScoringContext,
    weights: ScoringWeights
  ): number {
    let score = 0;
    const { account, currentWorkload, averageARR, averageAccounts } = context;
    
    if (!currentWorkload) {
      return weights.balanceImpact || 50;
    }
    
    // HANDLE CLEAN SLATE: If averages are 0 (all reps start fresh), use equal distribution logic
    if (!averageARR || averageARR === 0 || !averageAccounts || averageAccounts === 0) {
      // Prefer reps with lower current workload (even if all are 0)
      const currentARR = currentWorkload.proposedARR || 0;
      const currentAccounts = currentWorkload.proposedAccounts || 0;
      
      // Base score: higher for less-loaded reps
      // This creates natural round-robin when everyone starts at 0
      const arrFactor = Math.max(0, 100 - currentARR / 10000); // Gradually lower score as ARR grows
      const accountFactor = Math.max(0, 100 - currentAccounts * 2); // Gradually lower score as accounts grow
      
      score = (arrFactor * 0.6 + accountFactor * 0.4) * ((weights.balanceImpact || 50) / 100);
      return score;
    }
    
    // NORMAL OPERATION: Calculate deviation-based balance score
    const newARR = currentWorkload.proposedARR + (account.calculated_arr || 0);
    const newAccounts = currentWorkload.proposedAccounts + 1;
    
    // ARR balance factor
    const arrWeight = weights.arrWeight || 0.6;
    const arrDeviation = Math.abs(newARR - averageARR) / averageARR;
    const arrBalanceScore = (1 - arrDeviation) * 100 * arrWeight;
    
    // Account count balance factor
    const accountWeight = weights.accountCountWeight || 0.4;
    const accountDeviation = Math.abs(newAccounts - averageAccounts) / averageAccounts;
    const accountBalanceScore = (1 - accountDeviation) * 100 * accountWeight;
    
    // Combined balance score
    score = (arrBalanceScore + accountBalanceScore) * (weights.balanceImpact || 50) / 100;
    
    // Apply variance penalty if this creates significant imbalance
    if (arrDeviation > 0.25 || accountDeviation > 0.25) {
      score += weights.variancePenalty || -25;
    }
    
    return score;
  }

  /**
   * Calculate minimum threshold priority score
   */
  static calculateThresholdScore(
    context: ScoringContext,
    weights: ScoringWeights,
    minARR: number,
    minAccounts: number
  ): number {
    let score = 0;
    const { currentWorkload } = context;
    
    if (!currentWorkload) {
      return 0;
    }
    
    // High priority for reps below minimum
    const isBelowMinimum = 
      currentWorkload.proposedARR < minARR || 
      currentWorkload.proposedAccounts < minAccounts;
    
    if (isBelowMinimum) {
      score += weights.minimumEnforcement || 100;
      
      // Additional priority based on how far below minimum
      const arrShortfall = Math.max(0, minARR - currentWorkload.proposedARR) / minARR;
      const accountShortfall = Math.max(0, minAccounts - currentWorkload.proposedAccounts) / minAccounts;
      const maxShortfall = Math.max(arrShortfall, accountShortfall);
      
      score += maxShortfall * (weights.thresholdPriority || 90);
    }
    
    return score;
  }

  /**
   * Calculate round-robin fairness score
   */
  static calculateRoundRobinScore(
    context: ScoringContext,
    weights: ScoringWeights,
    roundRobinIndex: number,
    totalReps: number
  ): number {
    let score = 0;
    const { currentWorkload, allRepsWorkload } = context;
    
    if (!currentWorkload || !allRepsWorkload) {
      return weights.fairnessScore || 60;
    }
    
    // Base fairness score
    score += weights.fairnessScore || 60;
    
    // Bonus for maintaining round-robin sequence
    const expectedIndex = roundRobinIndex % totalReps;
    const actualAssignments = currentWorkload.proposedAccounts;
    const isInSequence = actualAssignments === expectedIndex;
    
    if (isInSequence) {
      score += weights.sequentialBonus || 40;
    }
    
    return score;
  }

  /**
   * Calculate tier balance score
   */
  static calculateTierBalanceScore(
    context: ScoringContext,
    weights: ScoringWeights,
    allRepsTierCounts: Map<string, Record<string, number>>
  ): number {
    let score = 0;
    const { account, rep } = context;
    
    const accountTier = account.enterprise_vs_commercial || account.expansion_tier || 'Unknown';
    const repTierCounts = allRepsTierCounts.get(rep.rep_id) || {};
    const currentTierCount = repTierCounts[accountTier] || 0;
    
    // Calculate average tier count across all reps
    let totalTierCount = 0;
    let repCount = 0;
    allRepsTierCounts.forEach((tierCounts) => {
      totalTierCount += tierCounts[accountTier] || 0;
      repCount++;
    });
    const avgTierCount = repCount > 0 ? totalTierCount / repCount : 0;
    
    // Score higher for reps with fewer accounts in this tier
    const tierDeviation = currentTierCount - avgTierCount;
    const baseScore = weights.tierDistributionWeight || 40;
    
    // Higher score if below average, lower score if above average
    score = baseScore * (1 - (tierDeviation / Math.max(avgTierCount, 1)));
    
    // Add tier-specific bonuses
    if (accountTier.toLowerCase().includes('tier 1') || accountTier.toLowerCase().includes('enterprise')) {
      score += (weights.tier1Bonus || 20) * (1 - (tierDeviation / Math.max(avgTierCount, 1)));
    } else if (accountTier.toLowerCase().includes('tier 2')) {
      score += (weights.tier2Bonus || 15) * (1 - (tierDeviation / Math.max(avgTierCount, 1)));
    } else if (accountTier.toLowerCase().includes('tier 3')) {
      score += (weights.tier3Bonus || 10) * (1 - (tierDeviation / Math.max(avgTierCount, 1)));
    } else if (accountTier.toLowerCase().includes('tier 4')) {
      score += (weights.tier4Bonus || 5) * (1 - (tierDeviation / Math.max(avgTierCount, 1)));
    }
    
    return Math.max(0, score);
  }

  /**
   * Calculate CRE balance score
   */
  static calculateCREBalanceScore(
    context: ScoringContext,
    weights: ScoringWeights,
    maxCRE: number
  ): number {
    let score = 0;
    const { account, currentWorkload } = context;
    
    if (!currentWorkload) {
      return 0;
    }
    
    const hasCRE = account.cre_count > 0 || account.cre_risk === true;
    const currentCRECount = currentWorkload.proposedAccounts || 0; // Should track CRE count specifically
    
    // Hard cap enforcement
    if (currentCRECount >= maxCRE && hasCRE) {
      return weights.creOverloadPenalty || -100; // Eliminate this rep
    }
    
    // Score based on remaining capacity
    const remainingCapacity = maxCRE - currentCRECount;
    const baseScore = weights.creDistributionWeight || 30;
    
    score = baseScore * (remainingCapacity / maxCRE);
    
    return score;
  }

  /**
   * Calculate composite score for an assignment
   */
  static calculateCompositeScore(
    context: ScoringContext,
    activeRules: Array<{
      rule_type: string;
      scoring_weights: ScoringWeights;
      priority: number;
    }>,
    additionalFactors?: {
      minARR?: number;
      minAccounts?: number;
      roundRobinIndex?: number;
      totalReps?: number;
      allRepsTierCounts?: Map<string, Record<string, number>>;
      maxCRE?: number;
    }
  ): number {
    let totalScore = 0;
    let totalWeight = 0;
    
    for (const rule of activeRules) {
      let ruleScore = 0;
      const weights = rule.scoring_weights;
      
      // Calculate score based on rule type
      switch (rule.rule_type) {
        case 'GEO_FIRST':
          ruleScore = this.calculateGeoScore(context, weights);
          break;
        case 'CONTINUITY':
          ruleScore = this.calculateContinuityScore(context, weights);
          break;
        case 'SMART_BALANCE':
          ruleScore = this.calculateBalanceScore(context, weights);
          break;
        case 'MIN_THRESHOLDS':
          if (additionalFactors?.minARR && additionalFactors?.minAccounts) {
            ruleScore = this.calculateThresholdScore(
              context,
              weights,
              additionalFactors.minARR,
              additionalFactors.minAccounts
            );
          }
          break;
        case 'ROUND_ROBIN':
          if (additionalFactors?.roundRobinIndex !== undefined && additionalFactors?.totalReps) {
            ruleScore = this.calculateRoundRobinScore(
              context,
              weights,
              additionalFactors.roundRobinIndex,
              additionalFactors.totalReps
            );
          }
          break;
        case 'TIER_BALANCE':
          if (additionalFactors?.allRepsTierCounts) {
            ruleScore = this.calculateTierBalanceScore(
              context,
              weights,
              additionalFactors.allRepsTierCounts
            );
          }
          break;
        case 'CRE_BALANCE':
          if (additionalFactors?.maxCRE !== undefined) {
            ruleScore = this.calculateCREBalanceScore(
              context,
              weights,
              additionalFactors.maxCRE
            );
          }
          break;
      }
      
      // Weight by rule priority (higher priority = more weight)
      const priorityWeight = 1 / (rule.priority || 1);
      totalScore += ruleScore * priorityWeight;
      totalWeight += priorityWeight;
    }
    
    // Return weighted average
    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  /**
   * Find best rep for account using multi-factor scoring
   */
  static findBestRep(
    account: any,
    eligibleReps: any[],
    activeRules: Array<{
      rule_type: string;
      scoring_weights: ScoringWeights;
      priority: number;
    }>,
    workloads: Map<string, any>,
    additionalFactors?: {
      minARR?: number;
      minAccounts?: number;
      averageARR?: number;
      averageAccounts?: number;
      territoryMappings?: Record<string, string>;
      allRepsTierCounts?: Map<string, Record<string, number>>;
      maxCRE?: number;
    }
  ): { rep: any; score: number } | null {
    let bestRep: any = null;
    let bestScore = -Infinity;
    
    for (const rep of eligibleReps) {
      const workload = workloads.get(rep.rep_id);
      
      const context: ScoringContext = {
        account,
        rep,
        currentWorkload: workload,
        allRepsWorkload: workloads,
        averageARR: additionalFactors?.averageARR,
        averageAccounts: additionalFactors?.averageAccounts,
        territoryMappings: additionalFactors?.territoryMappings
      };
      
      const score = this.calculateCompositeScore(context, activeRules, additionalFactors);
      
      if (score > bestScore) {
        bestScore = score;
        bestRep = rep;
      }
    }
    
    return bestRep ? { rep: bestRep, score: bestScore } : null;
  }
}
