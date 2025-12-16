/**
 * LP Problem Builder
 * 
 * Builds the complete LP problem for HiGHS solver:
 * - Decision variables (binary assignment vars, continuous slack vars)
 * - Objective function (maximize scores - deviation penalties)
 * - Constraints (assignment, capacity, stability, balance)
 * 
 * Uses THREE-TIER PENALTY SYSTEM (Big-M) for balance:
 * - Alpha zone: within variance band (small penalty)
 * - Beta zone: between variance and absolute limits (medium penalty)
 * - Big-M zone: beyond absolute limits (huge penalty)
 */

import type {
  AggregatedAccount,
  EligibleRep,
  LPConfiguration,
  LPConstraint,
  DecisionVariable,
  BalanceSlack,
  LPProblem,
  StabilityLockResult,
  NormalizedWeights,
  AssignmentScores
} from '../types';
import { continuityScore } from '../scoring/continuityScore';
import { geographyScore } from '../scoring/geographyScore';
import { teamAlignmentScore } from '../scoring/teamAlignmentScore';
import { normalizeWeights, deriveWeightsFromPriorityConfig } from '../utils/weightNormalizer';
import { LP_PENALTY } from '@/_domain';

/**
 * Three-tier penalty constants
 * @see _domain/constants.ts LP_PENALTY
 * @see _domain/MASTER_LOGIC.mdc §11.3 Three-Tier Penalty System
 * 
 * NUMERICAL STABILITY FIX (December 2025):
 * Values are normalized for HiGHS WASM stability. Original conceptual
 * values (0.01, 1.0, 1000.0) caused coefficient magnitude mismatch.
 * The relative ratios (1:10:100) are preserved.
 */
const PENALTY = LP_PENALTY;


/**
 * Metric weights for normalization
 */
const CUSTOMER_WEIGHTS = {
  arr: 0.50,
  atr: 0.25,
  tiers: 0.25
};

const PROSPECT_WEIGHTS = {
  pipeline: 0.50,
  tiers: 0.50
};

/**
 * Three-tier penalty slack variables for a metric
 */
interface MetricPenaltySlacks {
  alphaOver: string;
  alphaUnder: string;
  betaOver: string;
  betaUnder: string;
  bigMOver: string;
  bigMUnder: string;
}

/**
 * Build three-tier penalty terms for a single metric (ARR, ATR, or Pipeline)
 */
function buildMetricPenaltyTerms(
  metric: string,
  repId: string,
  target: number,
  variance: number,
  min: number,
  max: number,
  weight: number
): {
  slacks: MetricPenaltySlacks;
  penalties: Map<string, number>;
  bounds: { varName: string; lower: number; upper: number | null }[];
} {
  // NUMERICAL STABILITY: Normalize slack bounds to 0-1 scale
  // This keeps all coefficients in a numerically stable range
  const normFactor = Math.max(target, 1);
  
  // Calculate zone boundaries (in original units)
  const prefMin = target * (1 - variance);
  const prefMax = target * (1 + variance);
  
  // Zone sizes in original units, then normalize to 0-1 scale
  const alphaOverBound = Math.max(0, (prefMax - target) / normFactor);
  const alphaUnderBound = Math.max(0, (target - prefMin) / normFactor);
  const betaOverBound = Math.max(0, (max - prefMax) / normFactor);
  const betaUnderBound = Math.max(0, (prefMin - min) / normFactor);
  
  // Slack variable names
  const slacks: MetricPenaltySlacks = {
    alphaOver: `${metric}_alpha_over_${repId}`,
    alphaUnder: `${metric}_alpha_under_${repId}`,
    betaOver: `${metric}_beta_over_${repId}`,
    betaUnder: `${metric}_beta_under_${repId}`,
    bigMOver: `${metric}_bigM_over_${repId}`,
    bigMUnder: `${metric}_bigM_under_${repId}`
  };
  
  // Penalty coefficients (negative because we maximize, penalties reduce score)
  // NUMERICAL STABILITY: Penalties are now in the same scale as assignment scores (0.1-1.0)
  // No division by normFactor - keeps coefficients in stable range
  const penalties = new Map<string, number>();
  const alphaPenalty = PENALTY.ALPHA * weight;  // ~0.0005 for ARR (weight=0.5)
  const betaPenalty = PENALTY.BETA * weight;     // ~0.005 for ARR
  const bigMPenalty = PENALTY.BIG_M * weight;    // ~0.05 for ARR
  
  penalties.set(slacks.alphaOver, -alphaPenalty);
  penalties.set(slacks.alphaUnder, -alphaPenalty);
  penalties.set(slacks.betaOver, -betaPenalty);
  penalties.set(slacks.betaUnder, -betaPenalty);
  penalties.set(slacks.bigMOver, -bigMPenalty);
  penalties.set(slacks.bigMUnder, -bigMPenalty);
  
  // Bounds on slack variables (normalized to 0-1 scale)
  const bounds = [
    { varName: slacks.alphaOver, lower: 0, upper: alphaOverBound },
    { varName: slacks.alphaUnder, lower: 0, upper: alphaUnderBound },
    { varName: slacks.betaOver, lower: 0, upper: betaOverBound },
    { varName: slacks.betaUnder, lower: 0, upper: betaUnderBound },
    { varName: slacks.bigMOver, lower: 0, upper: null }, // Unbounded (but normalized)
    { varName: slacks.bigMUnder, lower: 0, upper: null }  // Unbounded (but normalized)
  ];
  
  return { slacks, penalties, bounds };
}

export interface BuildProblemInput {
  accounts: AggregatedAccount[];
  reps: EligibleRep[];
  lockedAccounts: Array<{ account: AggregatedAccount; lock: StabilityLockResult }>;
  config: LPConfiguration;
  assignmentType: 'customer' | 'prospect';
  territoryMappings: Record<string, string>;
  hardCapArr: number;
}

export interface ProblemBuildResult {
  problem: LPProblem;
  accountScores: Map<string, Map<string, AssignmentScores>>;
  weights: NormalizedWeights;
}

/**
 * Build the complete LP problem
 */
export function buildLPProblem(input: BuildProblemInput): ProblemBuildResult {
  const { accounts, reps, lockedAccounts, config, assignmentType, territoryMappings, hardCapArr } = input;

  // IMPORTANT: Combine unlocked accounts AND locked accounts for full problem
  // Locked accounts need variables too (so they contribute to capacity/balance constraints)
  const lockedAccountsList = lockedAccounts.map(la => la.account);
  const allAccountsInProblem = [...accounts, ...lockedAccountsList];

  console.log(`[LPBuilder] Building problem: ${accounts.length} unlocked + ${lockedAccountsList.length} locked = ${allAccountsInProblem.length} accounts, ${reps.length} reps, ${assignmentType} mode`);
  
  // Derive weights from priority_config positions (SSOT)
  // Falls back to lp_objectives if priority_config is empty
  const weights = config.priority_config && config.priority_config.length > 0
    ? deriveWeightsFromPriorityConfig(config.priority_config)
    : normalizeWeights(
        assignmentType === 'customer'
          ? config.lp_objectives_customer
          : config.lp_objectives_prospect
      );

  const weightSource = config.priority_config?.length ? 'priorities' : 'defaults';
  console.log(`[LPBuilder] Weights: C=${weights.wC.toFixed(2)}, G=${weights.wG.toFixed(2)}, T=${weights.wT.toFixed(2)} (from ${weightSource})`);
  
  // Calculate all scores and build decision variables
  const assignmentVars: DecisionVariable[] = [];
  const accountScores = new Map<string, Map<string, AssignmentScores>>();
  const objectiveCoefficients = new Map<string, number>();
  
  // Sort ALL accounts by ARR for tie-breaking
  const sortedAccounts = [...allAccountsInProblem].sort((a, b) => b.aggregated_arr - a.aggregated_arr);
  const accountRanks = new Map<string, number>();
  sortedAccounts.forEach((a, i) => accountRanks.set(a.sfdc_account_id, i));
  
  const numAccounts = allAccountsInProblem.length;
  
  // Build variables for ALL accounts (unlocked + locked)
  for (const account of allAccountsInProblem) {
    const repScores = new Map<string, AssignmentScores>();
    
    for (const rep of reps) {
      const varName = `x_${account.sfdc_account_id}_${rep.rep_id}`;
      
      // Calculate scores
      const contScore = continuityScore(account, rep, config.lp_continuity_params);
      const geoScore = geographyScore(account, rep, territoryMappings, config.lp_geography_params);
      const teamScore = teamAlignmentScore(account, rep, config.lp_team_params);

      // Rank-based tie-breaker (higher ARR = higher rank = higher score)
      const rank = accountRanks.get(account.sfdc_account_id) || 0;
      const tieBreaker = 1 - (rank / numAccounts);

      const scores: AssignmentScores = {
        continuity: contScore,
        geography: geoScore,
        teamAlignment: teamScore,  // Can be null (N/A)
        tieBreaker
      };
      repScores.set(rep.rep_id, scores);

      // Calculate coefficient with weight redistribution for N/A team alignment
      // When teamScore is null, redistribute team weight to continuity & geography
      let coefficient: number;
      if (teamScore === null) {
        // N/A: redistribute wT proportionally to wC and wG
        const totalCG = weights.wC + weights.wG;
        const adjustedWC = totalCG > 0 ? (weights.wC + weights.wT * (weights.wC / totalCG)) : weights.wC;
        const adjustedWG = totalCG > 0 ? (weights.wG + weights.wT * (weights.wG / totalCG)) : weights.wG;
        coefficient = adjustedWC * contScore + adjustedWG * geoScore + 0.001 * tieBreaker;
      } else {
        coefficient =
          weights.wC * contScore +
          weights.wG * geoScore +
          weights.wT * teamScore +
          0.001 * tieBreaker;
      }
      
      assignmentVars.push({
        name: varName,
        accountId: account.sfdc_account_id,
        repId: rep.rep_id,
        coefficient
      });
      
      objectiveCoefficients.set(varName, coefficient);
    }
    
    accountScores.set(account.sfdc_account_id, repScores);
  }
  
  // Build THREE-TIER PENALTY slack variables (Big-M system)
  const balanceSlacks: BalanceSlack[] = [];
  const balanceConfig = config.lp_balance_config;

  // Get absolute limits from config (with fallbacks)
  const arrMin = config.lp_balance_config.arr_min ?? 0;
  const arrMax = config.lp_balance_config.arr_max ?? hardCapArr;
  const arrVariance = config.lp_balance_config.arr_variance ?? 0.10;
  const atrMin = config.lp_balance_config.atr_min ?? 0;
  const atrMax = config.lp_balance_config.atr_max ?? 1000000;
  const atrVariance = config.lp_balance_config.atr_variance ?? 0.15;
  const pipelineMin = config.lp_balance_config.pipeline_min ?? 0;
  const pipelineMax = config.lp_balance_config.pipeline_max ?? 1000000;
  const pipelineVariance = config.lp_balance_config.pipeline_variance ?? 0.15;

  // Calculate targets using ALL accounts in problem
  const totalARR = allAccountsInProblem.reduce((sum, a) => sum + a.aggregated_arr, 0);
  const totalATR = allAccountsInProblem.reduce((sum, a) => sum + a.aggregated_atr, 0);
  const totalPipeline = allAccountsInProblem.reduce((sum, a) => sum + a.pipeline_value, 0);
  const numReps = reps.length;

  // Protect against division by zero
  const arrTarget = numReps > 0 ? totalARR / numReps : 0;
  const atrTarget = numReps > 0 ? totalATR / numReps : 0;
  const pipelineTarget = numReps > 0 ? totalPipeline / numReps : 0;

  console.log(`[LPBuilder] Big-M Penalty Config: ARR target=${arrTarget.toFixed(0)}, min=${arrMin}, max=${arrMax}, variance=${arrVariance}`);

  // Store all penalty slack bounds for later use in LP generation
  const penaltySlackBounds: { varName: string; lower: number; upper: number | null }[] = [];

  for (const rep of reps) {
    // ARR balance with Big-M penalty (always for customers and prospects)
    if (balanceConfig.arr_balance_enabled && arrTarget > 0) {
      const metricWeight = assignmentType === 'customer' ? CUSTOMER_WEIGHTS.arr : PROSPECT_WEIGHTS.pipeline;
      const penaltyTerms = buildMetricPenaltyTerms(
        'arr', rep.rep_id, arrTarget, arrVariance, arrMin, arrMax, metricWeight
      );

      // Add penalties to objective
      for (const [varName, penalty] of penaltyTerms.penalties) {
        objectiveCoefficients.set(varName, penalty);
      }

      // Store bounds
      penaltySlackBounds.push(...penaltyTerms.bounds);

      // Still need old-style slack for balance constraints (using alpha as primary)
      balanceSlacks.push({
        repId: rep.rep_id,
        metric: 'arr',
        overVar: penaltyTerms.slacks.alphaOver,
        underVar: penaltyTerms.slacks.alphaUnder,
        target: arrTarget
      });
    }

    // ATR balance with Big-M penalty (customers only)
    if (balanceConfig.atr_balance_enabled && assignmentType === 'customer' && atrTarget > 0) {
      const penaltyTerms = buildMetricPenaltyTerms(
        'atr', rep.rep_id, atrTarget, atrVariance, atrMin, atrMax, CUSTOMER_WEIGHTS.atr
      );

      for (const [varName, penalty] of penaltyTerms.penalties) {
        objectiveCoefficients.set(varName, penalty);
      }
      penaltySlackBounds.push(...penaltyTerms.bounds);

      balanceSlacks.push({
        repId: rep.rep_id,
        metric: 'atr',
        overVar: penaltyTerms.slacks.alphaOver,
        underVar: penaltyTerms.slacks.alphaUnder,
        target: atrTarget
      });
    }

    // Pipeline balance with Big-M penalty (prospects only)
    if (balanceConfig.pipeline_balance_enabled && assignmentType === 'prospect' && pipelineTarget > 0) {
      const penaltyTerms = buildMetricPenaltyTerms(
        'pipeline', rep.rep_id, pipelineTarget, pipelineVariance, pipelineMin, pipelineMax, PROSPECT_WEIGHTS.pipeline
      );

      for (const [varName, penalty] of penaltyTerms.penalties) {
        objectiveCoefficients.set(varName, penalty);
      }
      penaltySlackBounds.push(...penaltyTerms.bounds);

      balanceSlacks.push({
        repId: rep.rep_id,
        metric: 'pipeline',
        overVar: penaltyTerms.slacks.alphaOver,
        underVar: penaltyTerms.slacks.alphaUnder,
        target: pipelineTarget
      });
    }
  }
  
  // Calculate tier counts and targets
  const tierCounts = { tier1: 0, tier2: 0, tier3: 0, tier4: 0 };
  for (const account of allAccountsInProblem) {
    if (account.tier === 'Tier 1') tierCounts.tier1++;
    else if (account.tier === 'Tier 2') tierCounts.tier2++;
    else if (account.tier === 'Tier 3') tierCounts.tier3++;
    else if (account.tier === 'Tier 4') tierCounts.tier4++;
  }
  
  const tierTargets = {
    tier1: numReps > 0 ? tierCounts.tier1 / numReps : 0,
    tier2: numReps > 0 ? tierCounts.tier2 / numReps : 0,
    tier3: numReps > 0 ? tierCounts.tier3 / numReps : 0,
    tier4: numReps > 0 ? tierCounts.tier4 / numReps : 0
  };
  
  console.log(`[LPBuilder] Tier counts: T1=${tierCounts.tier1}, T2=${tierCounts.tier2}, T3=${tierCounts.tier3}, T4=${tierCounts.tier4}`);
  console.log(`[LPBuilder] Tier targets per rep: T1=${tierTargets.tier1.toFixed(1)}, T2=${tierTargets.tier2.toFixed(1)}, T3=${tierTargets.tier3.toFixed(1)}, T4=${tierTargets.tier4.toFixed(1)}`);
  
  // Tier balance with Big-M penalty (all tiers individually, not grouped)
  // Weight is split across 4 tiers: 25% total → 6.25% each for customers, 50% → 12.5% each for prospects
  const tierWeight = assignmentType === 'customer' 
    ? CUSTOMER_WEIGHTS.tiers / 4 
    : PROSPECT_WEIGHTS.tiers / 4;
  
  for (const rep of reps) {
    for (const tierNum of [1, 2, 3, 4] as const) {
      const tierKey = `tier${tierNum}` as keyof typeof tierTargets;
      const tierTarget = tierTargets[tierKey];
      
      // Only add constraint if there are accounts of this tier
      if (tierTarget > 0) {
        // For tier counts: min=0, max=2*target (allow up to double), variance=50%
        const tierMin = 0;
        const tierMax = Math.max(tierTarget * 2, 1);
        const tierVariance = 0.50; // 50% variance for tier counts
        
        const penaltyTerms = buildMetricPenaltyTerms(
          `tier${tierNum}`, rep.rep_id, tierTarget, tierVariance, tierMin, tierMax, tierWeight
        );
        
        for (const [varName, penalty] of penaltyTerms.penalties) {
          objectiveCoefficients.set(varName, penalty);
        }
        penaltySlackBounds.push(...penaltyTerms.bounds);
      }
    }
  }
  
  // Feasibility slack variables
  const feasibilitySlacks: { repId: string; name: string }[] = [];
  const feasibilityPenalty = config.lp_solver_params.feasibility_penalty;
  
  console.log(`[LPBuilder] Feasibility penalty from config: ${feasibilityPenalty}`);
  
  for (const rep of reps) {
    const slackVar = `feas_${rep.rep_id}`;
    feasibilitySlacks.push({ repId: rep.rep_id, name: slackVar });
    objectiveCoefficients.set(slackVar, -feasibilityPenalty);
  }
  
  // Build constraints
  const constraints: LPConstraint[] = [];
  
  // 1. Assignment constraints: each account assigned to exactly one rep
  // This applies to ALL accounts (unlocked + locked)
  for (const account of allAccountsInProblem) {
    const vars = reps.map(rep => ({
      name: `x_${account.sfdc_account_id}_${rep.rep_id}`,
      coefficient: 1
    }));
    
    constraints.push({
      name: `assign_${account.sfdc_account_id}`,
      type: 'eq',
      variables: vars,
      rhs: 1
    });
  }
  
  // 2. Stability lock constraints
  for (const { account, lock } of lockedAccounts) {
    if (lock.targetRepId) {
      const varName = `x_${account.sfdc_account_id}_${lock.targetRepId}`;
      constraints.push({
        name: `lock_${account.sfdc_account_id}`,
        type: 'eq',
        variables: [{ name: varName, coefficient: 1 }],
        rhs: 1
      });
    }
  }
  
  // 3. Capacity constraints with feasibility slack
  // Include ALL accounts (locked accounts also consume capacity)
  if (config.lp_constraints.capacity_hard_cap_enabled) {
    for (const rep of reps) {
      const vars = allAccountsInProblem.map(account => ({
        name: `x_${account.sfdc_account_id}_${rep.rep_id}`,
        coefficient: account.aggregated_arr
      }));
      
      // Add feasibility slack (positive contribution to LHS)
      vars.push({
        name: `feas_${rep.rep_id}`,
        coefficient: -1 // Slack reduces effective load
      });
      
      constraints.push({
        name: `cap_${rep.rep_id}`,
        type: 'le',
        variables: vars,
        rhs: hardCapArr
      });
    }
  }
  
  // 4. Balance decomposition constraints using Big-M penalty system
  // NUMERICAL STABILITY: All values normalized by target to keep coefficients in 0-2 range
  // Decomposition formula: actual/target = 1 + alpha_over - alpha_under + beta_over - beta_under + bigM_over - bigM_under
  // Rearranged: (actual/target) - alpha_over + alpha_under - beta_over + beta_under - bigM_over + bigM_under = 1
  
  // ARR balance (all account types)
  if (balanceConfig.arr_balance_enabled && arrTarget > 0) {
    const arrNormFactor = arrTarget; // Normalize by target
    for (const rep of reps) {
      const loadVars = allAccountsInProblem.map(account => ({
        name: `x_${account.sfdc_account_id}_${rep.rep_id}`,
        coefficient: account.aggregated_arr / arrNormFactor  // Normalized: each account contributes its fraction of target
      }));
      
      // Decomposition constraint with all six slacks (all in normalized 0-1 scale)
      constraints.push({
        name: `arr_decomp_${rep.rep_id}`,
        type: 'eq',
        variables: [
          ...loadVars,
          { name: `arr_alpha_over_${rep.rep_id}`, coefficient: -1 },
          { name: `arr_alpha_under_${rep.rep_id}`, coefficient: 1 },
          { name: `arr_beta_over_${rep.rep_id}`, coefficient: -1 },
          { name: `arr_beta_under_${rep.rep_id}`, coefficient: 1 },
          { name: `arr_bigM_over_${rep.rep_id}`, coefficient: -1 },
          { name: `arr_bigM_under_${rep.rep_id}`, coefficient: 1 }
        ],
        rhs: 1  // Normalized: target / target = 1
      });
    }
  }
  
  // 5. ATR balance constraints (customers only) with Big-M - NORMALIZED
  if (balanceConfig.atr_balance_enabled && assignmentType === 'customer' && atrTarget > 0) {
    const atrNormFactor = atrTarget;
    for (const rep of reps) {
      const loadVars = allAccountsInProblem.map(account => ({
        name: `x_${account.sfdc_account_id}_${rep.rep_id}`,
        coefficient: account.aggregated_atr / atrNormFactor
      }));
      
      constraints.push({
        name: `atr_decomp_${rep.rep_id}`,
        type: 'eq',
        variables: [
          ...loadVars,
          { name: `atr_alpha_over_${rep.rep_id}`, coefficient: -1 },
          { name: `atr_alpha_under_${rep.rep_id}`, coefficient: 1 },
          { name: `atr_beta_over_${rep.rep_id}`, coefficient: -1 },
          { name: `atr_beta_under_${rep.rep_id}`, coefficient: 1 },
          { name: `atr_bigM_over_${rep.rep_id}`, coefficient: -1 },
          { name: `atr_bigM_under_${rep.rep_id}`, coefficient: 1 }
        ],
        rhs: 1  // Normalized
      });
    }
  }
  
  // 6. Pipeline balance constraints (prospects only) with Big-M - NORMALIZED
  if (balanceConfig.pipeline_balance_enabled && assignmentType === 'prospect' && pipelineTarget > 0) {
    const pipelineNormFactor = pipelineTarget;
    for (const rep of reps) {
      const loadVars = allAccountsInProblem.map(account => ({
        name: `x_${account.sfdc_account_id}_${rep.rep_id}`,
        coefficient: account.pipeline_value / pipelineNormFactor
      }));
      
      constraints.push({
        name: `pipeline_decomp_${rep.rep_id}`,
        type: 'eq',
        variables: [
          ...loadVars,
          { name: `pipeline_alpha_over_${rep.rep_id}`, coefficient: -1 },
          { name: `pipeline_alpha_under_${rep.rep_id}`, coefficient: 1 },
          { name: `pipeline_beta_over_${rep.rep_id}`, coefficient: -1 },
          { name: `pipeline_beta_under_${rep.rep_id}`, coefficient: 1 },
          { name: `pipeline_bigM_over_${rep.rep_id}`, coefficient: -1 },
          { name: `pipeline_bigM_under_${rep.rep_id}`, coefficient: 1 }
        ],
        rhs: 1  // Normalized
      });
    }
  }
  
  // 7. Tier balance constraints with Big-M (each tier individually) - NORMALIZED
  for (const tierNum of [1, 2, 3, 4] as const) {
    const tierKey = `tier${tierNum}` as keyof typeof tierTargets;
    const tierTarget = tierTargets[tierKey];
    
    if (tierTarget > 0) {
      const tierNormFactor = tierTarget;  // Normalize by tier target
      for (const rep of reps) {
        // Build tier count expression: sum of x vars for accounts of this tier
        const tierVars = allAccountsInProblem
          .filter(account => account.tier === `Tier ${tierNum}`)
          .map(account => ({
            name: `x_${account.sfdc_account_id}_${rep.rep_id}`,
            coefficient: 1 / tierNormFactor  // Each account contributes fraction of target
          }));
        
        if (tierVars.length > 0) {
          constraints.push({
            name: `tier${tierNum}_decomp_${rep.rep_id}`,
            type: 'eq',
            variables: [
              ...tierVars,
              { name: `tier${tierNum}_alpha_over_${rep.rep_id}`, coefficient: -1 },
              { name: `tier${tierNum}_alpha_under_${rep.rep_id}`, coefficient: 1 },
              { name: `tier${tierNum}_beta_over_${rep.rep_id}`, coefficient: -1 },
              { name: `tier${tierNum}_beta_under_${rep.rep_id}`, coefficient: 1 },
              { name: `tier${tierNum}_bigM_over_${rep.rep_id}`, coefficient: -1 },
              { name: `tier${tierNum}_bigM_under_${rep.rep_id}`, coefficient: 1 }
            ],
            rhs: 1  // Normalized: target / target = 1
          });
        }
      }
    }
  }
  
  const problem: LPProblem = {
    assignmentVars,
    balanceSlacks,
    feasibilitySlacks,
    slackBounds: penaltySlackBounds,  // Include all Big-M penalty slack bounds
    constraints,
    objectiveCoefficients,
    numAccounts: allAccountsInProblem.length,
    numReps: reps.length,
    numVariables: assignmentVars.length + penaltySlackBounds.length + feasibilitySlacks.length,
    numConstraints: constraints.length
  };
  
  console.log(`[LPBuilder] Problem built: ${problem.numVariables} variables, ${problem.numConstraints} constraints`);
  
  return { problem, accountScores, weights };
}

