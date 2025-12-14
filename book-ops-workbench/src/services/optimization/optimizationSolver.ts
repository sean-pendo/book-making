/**
 * Optimization Solver using HiGHS WebAssembly
 * 
 * ⚠️ DEPRECATION NOTICE (2025-12-11):
 * This file is part of the priorityExecutor flow which is NOT USED by the UI.
 * The UI uses `simplifiedAssignmentEngine.ts` which has its OWN HiGHS implementation.
 * 
 * STILL IN USE (DO NOT DELETE):
 * - Type exports via optimization/index.ts (used by sandboxMetricsCalculator)
 * - Types: OptimizationAccount, OptimizationRep, OptimizedAssignment, etc.
 * 
 * DEAD CODE (never called from UI):
 * - runCustomerOptimization()
 * - runProspectOptimization()
 * - runStrategicOptimization()
 * - buildCustomerLPProblem()
 * - buildProspectLPProblem()
 * - Team alignment functions (classifyAccountTeamTier, calculateTeamAlignmentPenalty)
 * 
 * NOTE: Team alignment was implemented HERE but should have been in simplifiedAssignmentEngine.
 * It has since been added to simplifiedAssignmentEngine.ts where it actually runs.
 * 
 * Original description:
 * Formulates account-to-rep assignment as a Mixed Integer Linear Program (MILP).
 */

// Type definitions for the highs package
interface HighsSolution {
  Status: 'Optimal' | 'Infeasible' | 'Unbounded' | 'Error' | string;
  ObjectiveValue: number;
  Columns: Record<string, {
    Index: number;
    Status: string;
    Lower: number;
    Upper: number;
    Type: string;
    Primal: number;
    Dual: number;
    Name: string;
  }>;
  Rows: Array<{
    Index: number;
    Name: string;
    Status: string;
    Lower: number;
    Upper: number;
    Primal: number;
    Dual: number;
  }>;
}

interface HighsInstance {
  solve: (problem: string, options?: Record<string, any>) => HighsSolution;
}

// ============================================================================
// Account Types
// ============================================================================

export interface OptimizationAccount {
  sfdc_account_id: string;
  account_name: string;
  is_customer: boolean;
  is_strategic: boolean;  // Strategic accounts go to Priority 0 with strategic reps
  // Customer metrics
  calculated_arr: number;
  calculated_atr: number;
  // Prospect metrics
  pipeline_value: number;
  // Shared metrics
  tier: 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Tier 4' | null;
  cre_count: number;
  employees?: number | null;  // For team alignment (Commercial mode)
  // Metadata
  sales_territory: string;
  geo: string;
  owner_id: string | null;
  owner_name: string | null;
}

export interface OptimizationRep {
  rep_id: string;
  name: string;
  region: string;
  is_strategic_rep: boolean;
  is_active: boolean;
  include_in_assignments: boolean;
  team_tier?: 'SMB' | 'Growth' | 'MM' | 'ENT' | null;  // For team alignment (Commercial mode)
  // Current workload (for incremental optimization across priorities)
  current_arr: number;
  current_atr: number;
  current_pipeline: number;
  current_tier1_count: number;
  current_tier2_count: number;
  current_tier3_count: number;
  current_tier4_count: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface MetricConfig {
  target: number;
  variance_pct: number;  // 0.05 to 0.30 (5% to 30%)
  min: number;           // Hard floor (must be <= target * (1 - variance))
  max: number;           // Hard cap (must be >= target * (1 + variance))
}

export interface CustomerOptimizationConfig {
  arr: MetricConfig;
  atr: MetricConfig;
  // Tiers are auto-balanced, no config needed
}

export interface ProspectOptimizationConfig {
  pipeline: MetricConfig;
  // Tiers are auto-balanced, no config needed
}

export interface OptimizationConfig {
  type: 'customer' | 'prospect';
  customer?: CustomerOptimizationConfig;
  prospect?: ProspectOptimizationConfig;
  max_cre_per_rep: number;
  territory_mappings: Record<string, string>;
}

// Weights as constants
const CUSTOMER_WEIGHTS = {
  arr: 0.50,
  atr: 0.25,
  tiers: 0.25,
};

const PROSPECT_WEIGHTS = {
  pipeline: 0.50,
  tiers: 0.50,
};

// Penalty coefficients for LP objective function
// Alpha: Light penalty inside target ± variance band
// Beta: Medium penalty in buffer zone (between variance and absolute limits)
// Gamma: Penalty for 1-level team tier mismatch (e.g., Growth account to SMB rep)
// Epsilon: Penalty for 2+ level team tier mismatch (e.g., MM account to SMB rep)
// Big M: Prohibitive penalty for violating absolute min/max
const PENALTY = {
  ALPHA: 1.0,
  BETA: 10.0,
  GAMMA: 100,      // 1-level tier mismatch
  EPSILON: 1000,   // 2+ level tier mismatch
  BIG_M: 1000000,
};

// Team tier classification based on employee count
// Used by team_alignment priority in Commercial mode
type TeamTier = 'SMB' | 'Growth' | 'MM' | 'ENT';

const TEAM_TIER_ORDER: TeamTier[] = ['SMB', 'Growth', 'MM', 'ENT'];

/**
 * Classify account into team tier based on employee count
 * SMB: < 100 employees
 * Growth: 100-499 employees
 * MM: 500-1499 employees
 * ENT: 1500+ employees
 */
export function classifyAccountTeamTier(employees: number | null): TeamTier {
  if (employees === null || employees < 100) return 'SMB';
  if (employees < 500) return 'Growth';
  if (employees < 1500) return 'MM';
  return 'ENT';
}

/**
 * Calculate team alignment penalty for assigning an account to a rep
 * Returns 0 for perfect match, GAMMA for 1-level mismatch, EPSILON for 2+ levels
 */
export function calculateTeamAlignmentPenalty(
  accountTier: TeamTier,
  repTeamTier: TeamTier | null
): number {
  if (!repTeamTier) return 0; // No penalty if rep has no team_tier set
  
  const accountIdx = TEAM_TIER_ORDER.indexOf(accountTier);
  const repIdx = TEAM_TIER_ORDER.indexOf(repTeamTier);
  const distance = Math.abs(accountIdx - repIdx);
  
  if (distance === 0) return 0;              // Perfect match
  if (distance === 1) return PENALTY.GAMMA;  // Adjacent tier (allowed with penalty)
  return PENALTY.EPSILON;                    // 2+ level mismatch (strongly discouraged)
}

// ============================================================================
// Result Types
// ============================================================================

export interface OptimizedAssignment {
  sfdc_account_id: string;
  account_name: string;
  assigned_rep_id: string;
  assigned_rep_name: string;
  account_arr: number;
  account_atr: number;
  account_pipeline: number;
  tier: string | null;
  rationale: string;
}

export interface OptimizationResult {
  status: 'optimal' | 'infeasible' | 'error';
  assignments: OptimizedAssignment[];
  solve_time_ms: number;
  objective_value: number;
  error_message?: string;
  rep_workloads?: RepWorkloadSummary[];
}

export interface RepWorkloadSummary {
  rep_id: string;
  rep_name: string;
  total_arr: number;
  total_atr: number;
  total_pipeline: number;
  tier1_count: number;
  tier2_count: number;
  tier3_count: number;
  tier4_count: number;
  account_count: number;
}

// ============================================================================
// HiGHS Singleton
// ============================================================================

let highsInstance: HighsInstance | null = null;
let highsLoadPromise: Promise<HighsInstance> | null = null;

async function getHighsInstance(): Promise<HighsInstance> {
  if (highsInstance) {
    return highsInstance;
  }
  
  if (highsLoadPromise) {
    return highsLoadPromise;
  }

  highsLoadPromise = (async () => {
    try {
      const highsLoader = (await import('highs')).default;
      
      const highs = await highsLoader({
        locateFile: (file: string) => {
          if (typeof window !== 'undefined') {
            return `https://lovasoa.github.io/highs-js/${file}`;
          }
          return file;
        }
      });
      
      highsInstance = highs;
      console.log('[OptimizationSolver] HiGHS loaded successfully');
      return highs;
    } catch (error) {
      console.error('[OptimizationSolver] Failed to load HiGHS:', error);
      throw error;
    }
  })();

  return highsLoadPromise;
}

// ============================================================================
// LP Problem Builder
// ============================================================================

function sanitizeVarName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
}

/**
 * Calculate tier targets for even distribution
 */
function calculateTierTargets(accounts: OptimizationAccount[], repCount: number): Record<string, number> {
  const tierCounts = { tier1: 0, tier2: 0, tier3: 0, tier4: 0 };
  
  for (const account of accounts) {
    if (account.tier === 'Tier 1') tierCounts.tier1++;
    else if (account.tier === 'Tier 2') tierCounts.tier2++;
    else if (account.tier === 'Tier 3') tierCounts.tier3++;
    else if (account.tier === 'Tier 4') tierCounts.tier4++;
  }
  
  return {
    tier1: repCount > 0 ? tierCounts.tier1 / repCount : 0,
    tier2: repCount > 0 ? tierCounts.tier2 / repCount : 0,
    tier3: repCount > 0 ? tierCounts.tier3 / repCount : 0,
    tier4: repCount > 0 ? tierCounts.tier4 / repCount : 0,
  };
}

/**
 * Build three-tier penalty terms for a single metric (ARR, ATR, or Pipeline).
 * 
 * Returns:
 * - objective: penalty terms for the objective function
 * - constraints: decomposition constraints linking actual value to target + slacks
 * - bounds: bounds on slack variables
 * - slackVars: names of continuous slack variables (for Bounds section)
 * 
 * The decomposition formula:
 *   actual_value = target + alpha_over - alpha_under + beta_over - beta_under + bigM_over - bigM_under
 * 
 * Where:
 * - alpha_over/under: deviation within variance band (bounded by variance * target)
 * - beta_over/under: deviation in buffer zone (bounded by gap to absolute limit)
 * - bigM_over/under: deviation beyond absolute limits (unbounded but hugely penalized)
 */
function buildMetricPenaltyTerms(
  metric: string,           // 'arr', 'atr', 'pipeline'
  repVar: string,           // sanitized rep ID
  valueExpr: string,        // LP expression for sum of metric values assigned to this rep
  target: number,
  variance: number,         // e.g., 0.10 for 10%
  min: number,
  max: number,
  currentWorkload: number,  // rep's existing workload (subtracted from target)
  weight: number            // metric weight for normalization (e.g., 0.50 for ARR)
): { objective: string[], constraints: string[], bounds: string[], slackVars: string[] } {
  const objective: string[] = [];
  const constraints: string[] = [];
  const bounds: string[] = [];
  const slackVars: string[] = [];
  
  // Adjust target for current workload
  const effectiveTarget = Math.max(0, target - currentWorkload);
  const normFactor = Math.max(target, 1); // Normalize by original target to scale penalties
  
  // Calculate zone boundaries
  const prefMin = target * (1 - variance);
  const prefMax = target * (1 + variance);
  
  // Effective bounds after accounting for current workload
  const effectivePrefMin = Math.max(0, prefMin - currentWorkload);
  const effectivePrefMax = Math.max(0, prefMax - currentWorkload);
  const effectiveMin = Math.max(0, min - currentWorkload);
  const effectiveMax = Math.max(0, max - currentWorkload);
  
  // Alpha band size (variance * target, but capped by what's achievable)
  const alphaOverBound = Math.max(0, effectivePrefMax - effectiveTarget);
  const alphaUnderBound = Math.max(0, effectiveTarget - effectivePrefMin);
  
  // Beta band size (gap between variance boundary and absolute limit)
  const betaOverBound = Math.max(0, effectiveMax - effectivePrefMax);
  const betaUnderBound = Math.max(0, effectivePrefMin - effectiveMin);
  
  // Slack variable names
  const alphaOver = `${metric}_alpha_over_${repVar}`;
  const alphaUnder = `${metric}_alpha_under_${repVar}`;
  const betaOver = `${metric}_beta_over_${repVar}`;
  const betaUnder = `${metric}_beta_under_${repVar}`;
  const bigMOver = `${metric}_bigM_over_${repVar}`;
  const bigMUnder = `${metric}_bigM_under_${repVar}`;
  
  slackVars.push(alphaOver, alphaUnder, betaOver, betaUnder, bigMOver, bigMUnder);
  
  // Objective terms (normalized by target, weighted by metric importance)
  const alphaPenalty = (PENALTY.ALPHA * weight / normFactor).toFixed(8);
  const betaPenalty = (PENALTY.BETA * weight / normFactor).toFixed(8);
  const bigMPenalty = (PENALTY.BIG_M * weight / normFactor).toFixed(8);
  
  objective.push(`+ ${alphaPenalty} ${alphaOver}`);
  objective.push(`+ ${alphaPenalty} ${alphaUnder}`);
  objective.push(`+ ${betaPenalty} ${betaOver}`);
  objective.push(`+ ${betaPenalty} ${betaUnder}`);
  objective.push(`+ ${bigMPenalty} ${bigMOver}`);
  objective.push(`+ ${bigMPenalty} ${bigMUnder}`);
  
  // Decomposition constraint: actual = target + (over slacks) - (under slacks)
  // Rearranged: actual - alpha_over + alpha_under - beta_over + beta_under - bigM_over + bigM_under = target
  if (valueExpr) {
    constraints.push(
      ` ${metric}_decomp_${repVar}: ${valueExpr} - ${alphaOver} + ${alphaUnder} - ${betaOver} + ${betaUnder} - ${bigMOver} + ${bigMUnder} = ${effectiveTarget.toFixed(2)}`
    );
  }
  
  // Bounds on slack variables
  bounds.push(` 0 <= ${alphaOver} <= ${alphaOverBound.toFixed(2)}`);
  bounds.push(` 0 <= ${alphaUnder} <= ${alphaUnderBound.toFixed(2)}`);
  bounds.push(` 0 <= ${betaOver} <= ${Math.max(betaOverBound, 0).toFixed(2)}`);
  bounds.push(` 0 <= ${betaUnder} <= ${Math.max(betaUnderBound, 0).toFixed(2)}`);
  // BigM variables are unbounded (penalty prevents use)
  bounds.push(` ${bigMOver} >= 0`);
  bounds.push(` ${bigMUnder} >= 0`);
  
  return { objective, constraints, bounds, slackVars };
}

/**
 * Build tier penalty terms (beta-only, no BigM enforcement).
 * Tiers use soft penalties to approach the average without hard caps.
 */
function buildTierPenaltyTerms(
  tier: number,             // 1, 2, 3, or 4
  repVar: string,
  tierExpr: string,         // LP expression for count of tier accounts assigned to this rep
  tierTarget: number,       // average tier count per rep
  weight: number            // tier weight (e.g., 0.25/4 for customer, 0.50/4 for prospect)
): { objective: string[], constraints: string[], bounds: string[], slackVars: string[] } {
  const objective: string[] = [];
  const constraints: string[] = [];
  const bounds: string[] = [];
  const slackVars: string[] = [];
  
  const tierOver = `tier${tier}_over_${repVar}`;
  const tierUnder = `tier${tier}_under_${repVar}`;
  
  slackVars.push(tierOver, tierUnder);
  
  // Beta penalty for tier deviation (no normalization needed - counts are small integers)
  const tierPenalty = (PENALTY.BETA * weight).toFixed(6);
  
  objective.push(`+ ${tierPenalty} ${tierOver}`);
  objective.push(`+ ${tierPenalty} ${tierUnder}`);
  
  // Decomposition: count = target + over - under
  if (tierExpr) {
    constraints.push(
      ` tier${tier}_decomp_${repVar}: ${tierExpr} - ${tierOver} + ${tierUnder} = ${tierTarget.toFixed(2)}`
    );
  }
  
  // Bounds - unbounded since tiers are soft constraints
  bounds.push(` ${tierOver} >= 0`);
  bounds.push(` ${tierUnder} >= 0`);
  
  return { objective, constraints, bounds, slackVars };
}

/**
 * Build CPLEX LP problem for customer optimization
 * Uses three-tier penalty structure: Alpha (within variance), Beta (buffer), BigM (absolute)
 * Objective: Minimize penalties for ARR, ATR, and Tier deviations
 */
function buildCustomerLPProblem(
  accounts: OptimizationAccount[],
  reps: OptimizationRep[],
  config: CustomerOptimizationConfig,
  maxCRE: number
): string {
  const lines: string[] = [];
  const objectiveTerms: string[] = [];
  const constraints: string[] = [];
  const bounds: string[] = [];
  const binaries: string[] = [];
  const continuousVars: string[] = [];
  
  const activeReps = reps.filter(r => r.is_active && r.include_in_assignments && !r.is_strategic_rep);
  
  if (activeReps.length === 0) {
    throw new Error('No active reps available for customer assignment');
  }
  
  const tierTargets = calculateTierTargets(accounts, activeReps.length);
  
  // Create binary assignment variables x[account, rep]
  for (const account of accounts) {
    for (const rep of activeReps) {
      const varName = `x_${sanitizeVarName(account.sfdc_account_id)}_${sanitizeVarName(rep.rep_id)}`;
      binaries.push(varName);
    }
  }
  
  // Build penalty terms for each rep
  for (const rep of activeReps) {
    const repVar = sanitizeVarName(rep.rep_id);
    
    // Build ARR expression for this rep
    const arrTerms: string[] = [];
    for (const account of accounts) {
      const arr = account.calculated_arr || 0;
      if (arr > 0) {
        const varName = `x_${sanitizeVarName(account.sfdc_account_id)}_${repVar}`;
        arrTerms.push(`${arr} ${varName}`);
      }
    }
    const arrExpr = arrTerms.length > 0 ? arrTerms.join(' + ') : '';
    
    // Build ATR expression for this rep
    const atrTerms: string[] = [];
    for (const account of accounts) {
      const atr = account.calculated_atr || 0;
      if (atr > 0) {
        const varName = `x_${sanitizeVarName(account.sfdc_account_id)}_${repVar}`;
        atrTerms.push(`${atr} ${varName}`);
      }
    }
    const atrExpr = atrTerms.length > 0 ? atrTerms.join(' + ') : '';
    
    // ARR penalty terms (weight: 0.50)
    if (arrExpr) {
      const arrPenalty = buildMetricPenaltyTerms(
        'arr', repVar, arrExpr,
        config.arr.target, config.arr.variance_pct,
        config.arr.min, config.arr.max,
        rep.current_arr, CUSTOMER_WEIGHTS.arr
      );
      objectiveTerms.push(...arrPenalty.objective);
      constraints.push(...arrPenalty.constraints);
      bounds.push(...arrPenalty.bounds);
      continuousVars.push(...arrPenalty.slackVars);
    }
    
    // ATR penalty terms (weight: 0.25)
    if (atrExpr) {
      const atrPenalty = buildMetricPenaltyTerms(
        'atr', repVar, atrExpr,
        config.atr.target, config.atr.variance_pct,
        config.atr.min, config.atr.max,
        rep.current_atr, CUSTOMER_WEIGHTS.atr
      );
      objectiveTerms.push(...atrPenalty.objective);
      constraints.push(...atrPenalty.constraints);
      bounds.push(...atrPenalty.bounds);
      continuousVars.push(...atrPenalty.slackVars);
    }
    
    // Tier penalty terms (beta only, weight: 0.25 split across 4 tiers)
    const tierWeight = CUSTOMER_WEIGHTS.tiers / 4;
    for (const tierNum of [1, 2, 3, 4]) {
      const tierName = `Tier ${tierNum}` as const;
      const tierTerms: string[] = [];
      
      for (const account of accounts) {
        if (account.tier === tierName) {
          const varName = `x_${sanitizeVarName(account.sfdc_account_id)}_${repVar}`;
          tierTerms.push(varName);
        }
      }
      
      if (tierTerms.length > 0) {
        const tierExpr = tierTerms.join(' + ');
        const tierTarget = tierTargets[`tier${tierNum}` as keyof typeof tierTargets] || 0;
        
        const tierPenalty = buildTierPenaltyTerms(
          tierNum, repVar, tierExpr,
          tierTarget + (tierNum === 1 ? rep.current_tier1_count : 
                        tierNum === 2 ? rep.current_tier2_count :
                        tierNum === 3 ? rep.current_tier3_count : rep.current_tier4_count),
          tierWeight
        );
        objectiveTerms.push(...tierPenalty.objective);
        constraints.push(...tierPenalty.constraints);
        bounds.push(...tierPenalty.bounds);
        continuousVars.push(...tierPenalty.slackVars);
      }
    }
    
    // CRE constraint (hard constraint - keep as is)
    const creTerms: string[] = [];
    for (const account of accounts) {
      const cre = account.cre_count || 0;
      if (cre > 0) {
        const varName = `x_${sanitizeVarName(account.sfdc_account_id)}_${repVar}`;
        creTerms.push(`${cre} ${varName}`);
      }
    }
    if (creTerms.length > 0) {
      const creExpr = creTerms.join(' + ');
      constraints.push(` cre_max_${repVar}: ${creExpr} <= ${maxCRE}`);
    }
    
    // Team alignment penalties (GAMMA for 1-level, EPSILON for 2+ level mismatch)
    // Only applies when rep has team_tier set
    if (rep.team_tier) {
      for (const account of accounts) {
        const accountTier = classifyAccountTeamTier(account.employees);
        const penalty = calculateTeamAlignmentPenalty(accountTier, rep.team_tier);
        if (penalty > 0) {
          const varName = `x_${sanitizeVarName(account.sfdc_account_id)}_${repVar}`;
          objectiveTerms.push(`+ ${penalty} ${varName}`);
        }
      }
    }
  }
  
  // Build objective function (Minimize penalties)
  lines.push('Minimize');
  lines.push(' obj:');
  if (objectiveTerms.length > 0) {
    // Remove leading '+' from first term if present
    const firstTerm = objectiveTerms[0].replace(/^\+\s*/, '');
    lines.push('    ' + firstTerm + ' ' + objectiveTerms.slice(1).join(' '));
  } else {
    lines.push('    0');
  }
  
  // Constraints section
  lines.push('Subject To');
  
  // Assignment constraints: each account assigned to exactly one rep
  for (const account of accounts) {
    const assignmentVars: string[] = [];
    for (const rep of activeReps) {
      const varName = `x_${sanitizeVarName(account.sfdc_account_id)}_${sanitizeVarName(rep.rep_id)}`;
      assignmentVars.push(varName);
    }
    if (assignmentVars.length > 0) {
      constraints.push(` assign_${sanitizeVarName(account.sfdc_account_id)}: ${assignmentVars.join(' + ')} = 1`);
    }
  }
  
  lines.push(...constraints);
  
  // Bounds section
  lines.push('Bounds');
  // Binary variable bounds
  for (const varName of binaries) {
    bounds.push(` 0 <= ${varName} <= 1`);
  }
  lines.push(...bounds);
  
  // Binary variables declaration
  lines.push('Binary');
  lines.push(' ' + binaries.join(' '));
  
  lines.push('End');
  
  return lines.join('\n');
}

/**
 * Build CPLEX LP problem for prospect optimization
 * Uses three-tier penalty structure: Alpha (within variance), Beta (buffer), BigM (absolute)
 * Objective: Minimize penalties for Pipeline and Tier deviations
 */
function buildProspectLPProblem(
  accounts: OptimizationAccount[],
  reps: OptimizationRep[],
  config: ProspectOptimizationConfig,
  maxCRE: number
): string {
  const lines: string[] = [];
  const objectiveTerms: string[] = [];
  const constraints: string[] = [];
  const bounds: string[] = [];
  const binaries: string[] = [];
  const continuousVars: string[] = [];
  
  const activeReps = reps.filter(r => r.is_active && r.include_in_assignments && !r.is_strategic_rep);
  
  if (activeReps.length === 0) {
    throw new Error('No active reps available for prospect assignment');
  }
  
  const tierTargets = calculateTierTargets(accounts, activeReps.length);
  
  // Create binary assignment variables x[account, rep]
  for (const account of accounts) {
    for (const rep of activeReps) {
      const varName = `x_${sanitizeVarName(account.sfdc_account_id)}_${sanitizeVarName(rep.rep_id)}`;
      binaries.push(varName);
    }
  }
  
  // Build penalty terms for each rep
  for (const rep of activeReps) {
    const repVar = sanitizeVarName(rep.rep_id);
    
    // Build Pipeline expression for this rep
    const pipelineTerms: string[] = [];
    for (const account of accounts) {
      const pipeline = account.pipeline_value || 0;
      if (pipeline > 0) {
        const varName = `x_${sanitizeVarName(account.sfdc_account_id)}_${repVar}`;
        pipelineTerms.push(`${pipeline} ${varName}`);
      }
    }
    const pipelineExpr = pipelineTerms.length > 0 ? pipelineTerms.join(' + ') : '';
    
    // Pipeline penalty terms (weight: 0.50)
    if (pipelineExpr) {
      const pipelinePenalty = buildMetricPenaltyTerms(
        'pipeline', repVar, pipelineExpr,
        config.pipeline.target, config.pipeline.variance_pct,
        config.pipeline.min, config.pipeline.max,
        rep.current_pipeline, PROSPECT_WEIGHTS.pipeline
      );
      objectiveTerms.push(...pipelinePenalty.objective);
      constraints.push(...pipelinePenalty.constraints);
      bounds.push(...pipelinePenalty.bounds);
      continuousVars.push(...pipelinePenalty.slackVars);
    }
    
    // Tier penalty terms (beta only, weight: 0.50 split across 4 tiers)
    const tierWeight = PROSPECT_WEIGHTS.tiers / 4;
    for (const tierNum of [1, 2, 3, 4]) {
      const tierName = `Tier ${tierNum}` as const;
      const tierTerms: string[] = [];
      
      for (const account of accounts) {
        if (account.tier === tierName) {
          const varName = `x_${sanitizeVarName(account.sfdc_account_id)}_${repVar}`;
          tierTerms.push(varName);
        }
      }
      
      if (tierTerms.length > 0) {
        const tierExpr = tierTerms.join(' + ');
        const tierTarget = tierTargets[`tier${tierNum}` as keyof typeof tierTargets] || 0;
        
        const tierPenalty = buildTierPenaltyTerms(
          tierNum, repVar, tierExpr,
          tierTarget + (tierNum === 1 ? rep.current_tier1_count : 
                        tierNum === 2 ? rep.current_tier2_count :
                        tierNum === 3 ? rep.current_tier3_count : rep.current_tier4_count),
          tierWeight
        );
        objectiveTerms.push(...tierPenalty.objective);
        constraints.push(...tierPenalty.constraints);
        bounds.push(...tierPenalty.bounds);
        continuousVars.push(...tierPenalty.slackVars);
      }
    }
    
    // Team alignment penalties (GAMMA for 1-level, EPSILON for 2+ level mismatch)
    // Only applies when rep has team_tier set
    if (rep.team_tier) {
      for (const account of accounts) {
        const accountTier = classifyAccountTeamTier(account.employees);
        const penalty = calculateTeamAlignmentPenalty(accountTier, rep.team_tier);
        if (penalty > 0) {
          const varName = `x_${sanitizeVarName(account.sfdc_account_id)}_${repVar}`;
          objectiveTerms.push(`+ ${penalty} ${varName}`);
        }
      }
    }
  }
  
  // Build objective function (Minimize penalties)
  lines.push('Minimize');
  lines.push(' obj:');
  if (objectiveTerms.length > 0) {
    // Remove leading '+' from first term if present
    const firstTerm = objectiveTerms[0].replace(/^\+\s*/, '');
    lines.push('    ' + firstTerm + ' ' + objectiveTerms.slice(1).join(' '));
  } else {
    lines.push('    0');
  }
  
  // Constraints section
  lines.push('Subject To');
  
  // Assignment constraints: each account assigned to exactly one rep
  for (const account of accounts) {
    const assignmentVars: string[] = [];
    for (const rep of activeReps) {
      const varName = `x_${sanitizeVarName(account.sfdc_account_id)}_${sanitizeVarName(rep.rep_id)}`;
      assignmentVars.push(varName);
    }
    if (assignmentVars.length > 0) {
      constraints.push(` assign_${sanitizeVarName(account.sfdc_account_id)}: ${assignmentVars.join(' + ')} = 1`);
    }
  }
  
  lines.push(...constraints);
  
  // Bounds section
  lines.push('Bounds');
  // Binary variable bounds
  for (const varName of binaries) {
    bounds.push(` 0 <= ${varName} <= 1`);
  }
  lines.push(...bounds);
  
  // Binary variables declaration
  lines.push('Binary');
  lines.push(' ' + binaries.join(' '));
  
  lines.push('End');
  
  return lines.join('\n');
}

// ============================================================================
// Solution Parser
// ============================================================================

function parseSolution(
  solution: HighsSolution,
  accounts: OptimizationAccount[],
  reps: OptimizationRep[],
  accountType: 'customer' | 'prospect'
): OptimizedAssignment[] {
  const assignments: OptimizedAssignment[] = [];
  
  if (solution.Status !== 'Optimal') {
    return assignments;
  }
  
  const repMap = new Map(reps.map(r => [sanitizeVarName(r.rep_id), r]));
  
  for (const [varName, varData] of Object.entries(solution.Columns)) {
    if (!varName.startsWith('x_')) continue;
    if (varData.Primal < 0.5) continue;
    
    let matchedAccount: OptimizationAccount | undefined;
    let matchedRep: OptimizationRep | undefined;
    
    for (const account of accounts) {
      const sanitizedAccountId = sanitizeVarName(account.sfdc_account_id);
      if (varName.startsWith(`x_${sanitizedAccountId}_`)) {
        const repPart = varName.substring(`x_${sanitizedAccountId}_`.length);
        const rep = repMap.get(repPart);
        if (rep) {
          matchedAccount = account;
          matchedRep = rep;
          break;
        }
      }
    }
    
    if (!matchedAccount || !matchedRep) continue;
    
    // Rationale format: "RO: Balance Optimization → <rep> (<metrics>)"
    // Parsed by BalancingAnalyticsRow.tsx for RO categorization.
    const balanceMetrics = accountType === 'customer' 
      ? 'ARR/ATR/Tier balanced'
      : 'Pipeline/Tier balanced';
    
    assignments.push({
      sfdc_account_id: matchedAccount.sfdc_account_id,
      account_name: matchedAccount.account_name,
      assigned_rep_id: matchedRep.rep_id,
      assigned_rep_name: matchedRep.name,
      account_arr: matchedAccount.calculated_arr || 0,
      account_atr: matchedAccount.calculated_atr || 0,
      account_pipeline: matchedAccount.pipeline_value || 0,
      tier: matchedAccount.tier,
      rationale: `RO: Balance Optimization → ${matchedRep.name} (${balanceMetrics})`
    });
  }
  
  return assignments;
}

// ============================================================================
// Main Optimization Functions
// ============================================================================

/**
 * Run optimization for customer accounts
 * Weights: ARR 50%, ATR 25%, Tiers 25%
 */
export async function runCustomerOptimization(
  accounts: OptimizationAccount[],
  reps: OptimizationRep[],
  config: CustomerOptimizationConfig,
  maxCRE: number = 3
): Promise<OptimizationResult> {
  const startTime = performance.now();
  
  try {
    const customerAccounts = accounts.filter(a => a.is_customer);
    
    if (customerAccounts.length === 0) {
      return {
        status: 'optimal',
        assignments: [],
        solve_time_ms: 0,
        objective_value: 0
      };
    }
    
    console.log(`[OptimizationSolver] Customer optimization: ${customerAccounts.length} accounts, ${reps.length} reps`);
    console.log(`[OptimizationSolver] Weights: ARR ${CUSTOMER_WEIGHTS.arr * 100}%, ATR ${CUSTOMER_WEIGHTS.atr * 100}%, Tiers ${CUSTOMER_WEIGHTS.tiers * 100}%`);
    
    const highs = await getHighsInstance();
    const lpProblem = buildCustomerLPProblem(customerAccounts, reps, config, maxCRE);
    
    console.log(`[OptimizationSolver] LP problem built, ${lpProblem.length} chars`);
    
    const solution = highs.solve(lpProblem, {
      presolve: 'on',
      time_limit: 30.0,
      mip_rel_gap: 0.01,
    });
    
    const solveTime = performance.now() - startTime;
    console.log(`[OptimizationSolver] Customer solve: ${solveTime.toFixed(0)}ms, status: ${solution.Status}`);
    
    if (solution.Status === 'Optimal') {
      const assignments = parseSolution(solution, customerAccounts, reps, 'customer');
      
      return {
        status: 'optimal',
        assignments,
        solve_time_ms: Math.round(solveTime),
        objective_value: solution.ObjectiveValue
      };
    } else if (solution.Status === 'Infeasible') {
      return {
        status: 'infeasible',
        assignments: [],
        solve_time_ms: Math.round(solveTime),
        objective_value: 0,
        error_message: 'No feasible solution for customers. Try increasing ARR/ATR max limits.'
      };
    } else {
      return {
        status: 'error',
        assignments: [],
        solve_time_ms: Math.round(solveTime),
        objective_value: 0,
        error_message: `Solver returned status: ${solution.Status}`
      };
    }
  } catch (error) {
    const solveTime = performance.now() - startTime;
    console.error('[OptimizationSolver] Customer error:', error);
    
    return {
      status: 'error',
      assignments: [],
      solve_time_ms: Math.round(solveTime),
      objective_value: 0,
      error_message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Run optimization for prospect accounts
 * Weights: Pipeline 50%, Tiers 50%
 */
export async function runProspectOptimization(
  accounts: OptimizationAccount[],
  reps: OptimizationRep[],
  config: ProspectOptimizationConfig,
  maxCRE: number = 3
): Promise<OptimizationResult> {
  const startTime = performance.now();
  
  try {
    const prospectAccounts = accounts.filter(a => !a.is_customer);
    
    if (prospectAccounts.length === 0) {
      return {
        status: 'optimal',
        assignments: [],
        solve_time_ms: 0,
        objective_value: 0
      };
    }
    
    console.log(`[OptimizationSolver] Prospect optimization: ${prospectAccounts.length} accounts, ${reps.length} reps`);
    console.log(`[OptimizationSolver] Weights: Pipeline ${PROSPECT_WEIGHTS.pipeline * 100}%, Tiers ${PROSPECT_WEIGHTS.tiers * 100}%`);
    
    const highs = await getHighsInstance();
    const lpProblem = buildProspectLPProblem(prospectAccounts, reps, config, maxCRE);
    
    console.log(`[OptimizationSolver] LP problem built, ${lpProblem.length} chars`);
    
    const solution = highs.solve(lpProblem, {
      presolve: 'on',
      time_limit: 30.0,
      mip_rel_gap: 0.01,
    });
    
    const solveTime = performance.now() - startTime;
    console.log(`[OptimizationSolver] Prospect solve: ${solveTime.toFixed(0)}ms, status: ${solution.Status}`);
    
    if (solution.Status === 'Optimal') {
      const assignments = parseSolution(solution, prospectAccounts, reps, 'prospect');
      
      return {
        status: 'optimal',
        assignments,
        solve_time_ms: Math.round(solveTime),
        objective_value: solution.ObjectiveValue
      };
    } else if (solution.Status === 'Infeasible') {
      return {
        status: 'infeasible',
        assignments: [],
        solve_time_ms: Math.round(solveTime),
        objective_value: 0,
        error_message: 'No feasible solution for prospects. Try increasing Pipeline max limit.'
      };
    } else {
      return {
        status: 'error',
        assignments: [],
        solve_time_ms: Math.round(solveTime),
        objective_value: 0,
        error_message: `Solver returned status: ${solution.Status}`
      };
    }
  } catch (error) {
    const solveTime = performance.now() - startTime;
    console.error('[OptimizationSolver] Prospect error:', error);
    
    return {
      status: 'error',
      assignments: [],
      solve_time_ms: Math.round(solveTime),
      objective_value: 0,
      error_message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Update rep workloads after assignments
 */
export function updateRepWorkloads(
  reps: OptimizationRep[],
  assignments: OptimizedAssignment[]
): OptimizationRep[] {
  const assignmentsByRep = new Map<string, OptimizedAssignment[]>();
  
  for (const assignment of assignments) {
    const existing = assignmentsByRep.get(assignment.assigned_rep_id) || [];
    existing.push(assignment);
    assignmentsByRep.set(assignment.assigned_rep_id, existing);
  }
  
  return reps.map(rep => {
    const repAssignments = assignmentsByRep.get(rep.rep_id) || [];
    
    let addedARR = 0;
    let addedATR = 0;
    let addedPipeline = 0;
    let addedTier1 = 0;
    let addedTier2 = 0;
    let addedTier3 = 0;
    let addedTier4 = 0;
    
    for (const a of repAssignments) {
      addedARR += a.account_arr;
      addedATR += a.account_atr;
      addedPipeline += a.account_pipeline;
      if (a.tier === 'Tier 1') addedTier1++;
      else if (a.tier === 'Tier 2') addedTier2++;
      else if (a.tier === 'Tier 3') addedTier3++;
      else if (a.tier === 'Tier 4') addedTier4++;
    }
    
    return {
      ...rep,
      current_arr: rep.current_arr + addedARR,
      current_atr: rep.current_atr + addedATR,
      current_pipeline: rep.current_pipeline + addedPipeline,
      current_tier1_count: rep.current_tier1_count + addedTier1,
      current_tier2_count: rep.current_tier2_count + addedTier2,
      current_tier3_count: rep.current_tier3_count + addedTier3,
      current_tier4_count: rep.current_tier4_count + addedTier4,
    };
  });
}

// ============================================================================
// Strategic Optimization (Priority 0)
// ============================================================================

/**
 * Build LP problem for strategic accounts using three-tier penalty structure.
 * Strategic optimization uses calculated averages as targets and applies
 * alpha/beta/BigM penalties for ARR, ATR, Pipeline, with beta-only for tiers.
 */
function buildStrategicLPProblem(
  accounts: OptimizationAccount[],
  reps: OptimizationRep[]
): string {
  const lines: string[] = [];
  const objectiveTerms: string[] = [];
  const constraints: string[] = [];
  const bounds: string[] = [];
  const binaries: string[] = [];
  const continuousVars: string[] = [];
  
  if (reps.length === 0 || accounts.length === 0) {
    throw new Error('Strategic optimization requires at least one account and one rep');
  }
  
  // Calculate averages as targets (implicit targets based on total / rep count)
  const customerAccounts = accounts.filter(a => a.is_customer);
  const prospectAccounts = accounts.filter(a => !a.is_customer);
  
  const totalARR = customerAccounts.reduce((sum, a) => sum + (a.calculated_arr || 0), 0);
  const totalATR = customerAccounts.reduce((sum, a) => sum + (a.calculated_atr || 0), 0);
  const totalPipeline = prospectAccounts.reduce((sum, a) => sum + (a.pipeline_value || 0), 0);
  
  const avgARR = reps.length > 0 ? totalARR / reps.length : 0;
  const avgATR = reps.length > 0 ? totalATR / reps.length : 0;
  const avgPipeline = reps.length > 0 ? totalPipeline / reps.length : 0;
  
  // Calculate tier targets
  const tierTargets = calculateTierTargets(accounts, reps.length);
  
  // For strategic, use 20% variance and wide min/max bounds
  const STRATEGIC_VARIANCE = 0.20;
  
  // Create binary assignment variables
  for (let i = 0; i < accounts.length; i++) {
    for (const rep of reps) {
      const varName = `x_${i}_${sanitizeVarName(rep.rep_id)}`;
      binaries.push(varName);
    }
  }
  
  // Build penalty terms for each rep
  for (const rep of reps) {
    const repVar = sanitizeVarName(rep.rep_id);
    
    // Build ARR expression for this rep (customers only)
    const arrTerms: string[] = [];
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      if (account.is_customer) {
        const arr = account.calculated_arr || 0;
        if (arr > 0) {
          arrTerms.push(`${arr} x_${i}_${repVar}`);
        }
      }
    }
    const arrExpr = arrTerms.length > 0 ? arrTerms.join(' + ') : '';
    
    // Build ATR expression for this rep (customers only)
    const atrTerms: string[] = [];
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      if (account.is_customer) {
        const atr = account.calculated_atr || 0;
        if (atr > 0) {
          atrTerms.push(`${atr} x_${i}_${repVar}`);
        }
      }
    }
    const atrExpr = atrTerms.length > 0 ? atrTerms.join(' + ') : '';
    
    // Build Pipeline expression for this rep (prospects only)
    const pipelineTerms: string[] = [];
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      if (!account.is_customer) {
        const pipeline = account.pipeline_value || 0;
        if (pipeline > 0) {
          pipelineTerms.push(`${pipeline} x_${i}_${repVar}`);
        }
      }
    }
    const pipelineExpr = pipelineTerms.length > 0 ? pipelineTerms.join(' + ') : '';
    
    // ARR penalty terms (weight: 0.50 for customers)
    if (arrExpr && avgARR > 0) {
      const arrMin = avgARR * 0.5;  // Allow 50% below average for strategic
      const arrMax = avgARR * 2.0;  // Allow 2x average for strategic
      const arrPenalty = buildMetricPenaltyTerms(
        'arr', repVar, arrExpr,
        avgARR, STRATEGIC_VARIANCE,
        arrMin, arrMax,
        rep.current_arr, CUSTOMER_WEIGHTS.arr
      );
      objectiveTerms.push(...arrPenalty.objective);
      constraints.push(...arrPenalty.constraints);
      bounds.push(...arrPenalty.bounds);
      continuousVars.push(...arrPenalty.slackVars);
    }
    
    // ATR penalty terms (weight: 0.25 for customers)
    if (atrExpr && avgATR > 0) {
      const atrMin = avgATR * 0.5;
      const atrMax = avgATR * 2.0;
      const atrPenalty = buildMetricPenaltyTerms(
        'atr', repVar, atrExpr,
        avgATR, STRATEGIC_VARIANCE,
        atrMin, atrMax,
        rep.current_atr, CUSTOMER_WEIGHTS.atr
      );
      objectiveTerms.push(...atrPenalty.objective);
      constraints.push(...atrPenalty.constraints);
      bounds.push(...atrPenalty.bounds);
      continuousVars.push(...atrPenalty.slackVars);
    }
    
    // Pipeline penalty terms (weight: 0.50 for prospects)
    if (pipelineExpr && avgPipeline > 0) {
      const pipelineMin = avgPipeline * 0.5;
      const pipelineMax = avgPipeline * 2.0;
      const pipelinePenalty = buildMetricPenaltyTerms(
        'pipeline', repVar, pipelineExpr,
        avgPipeline, STRATEGIC_VARIANCE,
        pipelineMin, pipelineMax,
        rep.current_pipeline, PROSPECT_WEIGHTS.pipeline
      );
      objectiveTerms.push(...pipelinePenalty.objective);
      constraints.push(...pipelinePenalty.constraints);
      bounds.push(...pipelinePenalty.bounds);
      continuousVars.push(...pipelinePenalty.slackVars);
    }
    
    // Tier penalty terms (beta only, combined weight from customer + prospect)
    const combinedTierWeight = (CUSTOMER_WEIGHTS.tiers + PROSPECT_WEIGHTS.tiers) / (2 * 4);
    for (const tierNum of [1, 2, 3, 4]) {
      const tierName = `Tier ${tierNum}` as const;
      const tierTerms: string[] = [];
      
      for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        if (account.tier === tierName) {
          tierTerms.push(`x_${i}_${repVar}`);
        }
      }
      
      if (tierTerms.length > 0) {
        const tierExpr = tierTerms.join(' + ');
        const tierTarget = tierTargets[`tier${tierNum}` as keyof typeof tierTargets] || 0;
        
        const tierPenalty = buildTierPenaltyTerms(
          tierNum, repVar, tierExpr,
          tierTarget,
          combinedTierWeight
        );
        objectiveTerms.push(...tierPenalty.objective);
        constraints.push(...tierPenalty.constraints);
        bounds.push(...tierPenalty.bounds);
        continuousVars.push(...tierPenalty.slackVars);
      }
    }
  }
  
  // Build objective function (Minimize penalties)
  lines.push('Minimize');
  lines.push(' obj:');
  if (objectiveTerms.length > 0) {
    const firstTerm = objectiveTerms[0].replace(/^\+\s*/, '');
    lines.push('    ' + firstTerm + ' ' + objectiveTerms.slice(1).join(' '));
  } else {
    lines.push('    0');
  }
  
  // Constraints section
  lines.push('Subject To');
  
  // Assignment constraints: each account assigned to exactly one rep
  for (let i = 0; i < accounts.length; i++) {
    const assignmentVars = reps.map(rep => `x_${i}_${sanitizeVarName(rep.rep_id)}`);
    constraints.push(` assign_${i}: ${assignmentVars.join(' + ')} = 1`);
  }
  
  lines.push(...constraints);
  
  // Bounds section
  lines.push('Bounds');
  for (const varName of binaries) {
    bounds.push(` 0 <= ${varName} <= 1`);
  }
  lines.push(...bounds);
  
  // Binary variables declaration
  lines.push('Binary');
  lines.push(' ' + binaries.join(' '));
  
  lines.push('End');
  
  return lines.join('\n');
}

/**
 * Run strategic optimization for Priority 0
 * Assigns strategic accounts to strategic reps using average-based balancing
 */
export async function runStrategicOptimization(
  accounts: OptimizationAccount[],
  reps: OptimizationRep[],
  maxCRE: number = 3
): Promise<OptimizationResult> {
  const startTime = performance.now();
  
  try {
    // Filter to strategic only
    const strategicAccounts = accounts.filter(a => a.is_strategic);
    const strategicReps = reps.filter(r => r.is_strategic_rep && r.is_active && r.include_in_assignments);
    
    // Edge case handling
    if (strategicAccounts.length === 0) {
      console.log('⚠️ Strategic optimization: No strategic accounts found');
      return {
        status: 'optimal',
        assignments: [],
        solve_time_ms: 0,
        objective_value: 0
      };
    }
    
    if (strategicReps.length === 0) {
      console.warn('⚠️ Strategic optimization: Strategic accounts exist but no strategic reps available');
      return {
        status: 'infeasible',
        assignments: [],
        solve_time_ms: performance.now() - startTime,
        objective_value: 0,
        error_message: 'Strategic accounts exist but no strategic reps are available to assign them'
      };
    }
    
    console.log(`🎯 Running strategic optimization: ${strategicAccounts.length} accounts → ${strategicReps.length} reps`);
    
    const lpProblem = buildStrategicLPProblem(strategicAccounts, strategicReps);
    const highs = await getHighsInstance();
    
    const solution = highs.solve(lpProblem, { time_limit: 30, mip_rel_gap: 0.02 });
    
    if (solution.Status !== 'Optimal') {
      console.warn('Strategic optimization did not find optimal solution:', solution.Status);
      return {
        status: solution.Status === 'Infeasible' ? 'infeasible' : 'error',
        assignments: [],
        solve_time_ms: performance.now() - startTime,
        objective_value: 0,
        error_message: `Solver returned: ${solution.Status}`
      };
    }
    
    // Parse solution
    const assignments: OptimizedAssignment[] = [];
    
    for (let i = 0; i < strategicAccounts.length; i++) {
      const account = strategicAccounts[i];
      
      for (let j = 0; j < strategicReps.length; j++) {
        const rep = strategicReps[j];
        const varName = `x_${i}_${sanitizeVarName(rep.rep_id)}`;
        const col = solution.Columns[varName];
        
        if (col && col.Primal > 0.5) {
          assignments.push({
            sfdc_account_id: account.sfdc_account_id,
            account_name: account.account_name,
            assigned_rep_id: rep.rep_id,
            assigned_rep_name: rep.name,
            account_arr: account.calculated_arr || 0,
            account_atr: account.calculated_atr || 0,
            account_pipeline: account.pipeline_value || 0,
            tier: account.tier,
            rationale: `P0: Strategic Account → ${strategicReps[j].name} (strategic rep assignment)`
          });
          break;
        }
      }
    }
    
    console.log(`✅ Strategic optimization complete: ${assignments.length} assignments`);
    
    return {
      status: 'optimal',
      assignments,
      solve_time_ms: performance.now() - startTime,
      objective_value: solution.ObjectiveValue
    };
    
  } catch (error) {
    console.error('Strategic optimization error:', error);
    return {
      status: 'error',
      assignments: [],
      solve_time_ms: performance.now() - startTime,
      objective_value: 0,
      error_message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get default customer optimization config
 */
export function getDefaultCustomerConfig(): CustomerOptimizationConfig {
  return {
    arr: {
      target: 2000000,
      variance_pct: 0.10,
      min: 1800000,  // target * (1 - 0.10)
      max: 3000000,
    },
    atr: {
      target: 500000,
      variance_pct: 0.15,
      min: 425000,   // target * (1 - 0.15)
      max: 750000,
    },
  };
}

/**
 * Get default prospect optimization config
 */
export function getDefaultProspectConfig(): ProspectOptimizationConfig {
  return {
    pipeline: {
      target: 1000000,
      variance_pct: 0.15,
      min: 850000,   // target * (1 - 0.15)
      max: 1500000,
    },
  };
}

// ============================================================================
// Legacy exports for backwards compatibility
// ============================================================================

// Re-export old types with new names for gradual migration
export type SandboxAccount = OptimizationAccount;
export type SandboxRep = OptimizationRep;
export type SandboxConfig = OptimizationConfig;

/**
 * @deprecated Use runCustomerOptimization or runProspectOptimization instead
 */
export async function runOptimization(
  accounts: OptimizationAccount[],
  reps: OptimizationRep[],
  config: OptimizationConfig
): Promise<OptimizationResult> {
  console.warn('[OptimizationSolver] runOptimization is deprecated. Use runCustomerOptimization or runProspectOptimization.');
  
  if (config.type === 'customer' && config.customer) {
    return runCustomerOptimization(accounts, reps, config.customer, config.max_cre_per_rep);
  } else if (config.type === 'prospect' && config.prospect) {
    return runProspectOptimization(accounts, reps, config.prospect, config.max_cre_per_rep);
  }
  
  // Fallback: run both and combine
  const customerConfig = config.customer || getDefaultCustomerConfig();
  const prospectConfig = config.prospect || getDefaultProspectConfig();
  
  const customerResult = await runCustomerOptimization(accounts, reps, customerConfig, config.max_cre_per_rep);
  const updatedReps = updateRepWorkloads(reps, customerResult.assignments);
  const prospectResult = await runProspectOptimization(accounts, updatedReps, prospectConfig, config.max_cre_per_rep);
  
  return {
    status: customerResult.status === 'optimal' && prospectResult.status === 'optimal' ? 'optimal' : 'error',
    assignments: [...customerResult.assignments, ...prospectResult.assignments],
    solve_time_ms: customerResult.solve_time_ms + prospectResult.solve_time_ms,
    objective_value: customerResult.objective_value + prospectResult.objective_value,
    error_message: customerResult.error_message || prospectResult.error_message
  };
}

export function getDefaultSandboxConfig(): OptimizationConfig {
  return {
    type: 'customer',
    customer: getDefaultCustomerConfig(),
    prospect: getDefaultProspectConfig(),
    max_cre_per_rep: 3,
    territory_mappings: {}
  };
}
