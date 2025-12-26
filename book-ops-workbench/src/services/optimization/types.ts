/**
 * Pure Optimization LP Engine - Type Definitions
 *
 * Complete type definitions for the weighted LP assignment model.
 * This replaces the cascading priority waterfall with a single global solve.
 */

import type { PriorityConfig } from '@/config/priorityRegistry';
import type { BalanceIntensity } from '@/_domain';

// =============================================================================
// Configuration Types (from database JSONB columns)
// =============================================================================

/**
 * Objective weights configuration - separate for customer vs prospect
 */
export interface LPObjectivesConfig {
  continuity_enabled: boolean;
  continuity_weight: number;
  geography_enabled: boolean;
  geography_weight: number;
  team_alignment_enabled: boolean;
  team_alignment_weight: number;
}

/**
 * Balance metric configuration with relative penalties
 * Penalty of 1.0 = balance matters as much as assignment quality
 */
export interface LPBalanceConfig {
  arr_balance_enabled: boolean;
  arr_penalty: number;
  arr_min?: number;           // Absolute minimum ARR per rep
  arr_max?: number;           // Absolute maximum ARR per rep  
  arr_variance?: number;      // Variance band (e.g., 0.10 for ±10%)
  atr_balance_enabled: boolean;  // Customers only
  atr_penalty: number;
  atr_min?: number;           // Absolute minimum ATR per rep
  atr_max?: number;           // Absolute maximum ATR per rep
  atr_variance?: number;      // Variance band
  pipeline_balance_enabled: boolean;  // Prospects only
  pipeline_penalty: number;
  pipeline_min?: number;      // Absolute minimum Pipeline per rep
  pipeline_max?: number;      // Absolute maximum Pipeline per rep
  pipeline_variance?: number; // Variance band
  /** Balance intensity: how aggressively to enforce balance vs continuity @see MASTER_LOGIC.mdc §11.3.1 */
  balance_intensity?: BalanceIntensity;
}

/**
 * Hard constraint toggles
 * 
 * NOTE: capacity_hard_cap_enabled removed - Big-M penalty system now handles
 * capacity symmetrically via soft penalties for both over and under allocation.
 * @see MASTER_LOGIC.mdc §11.3 - Symmetric balance constraints
 */
export interface LPConstraintsConfig {
  strategic_pool_enabled: boolean;
  locked_accounts_enabled: boolean;
  parent_child_linking_enabled: boolean;
}

/**
 * Stability lock configuration - accounts meeting conditions stay with owner
 */
export interface LPStabilityConfig {
  cre_risk_locked: boolean;
  renewal_soon_locked: boolean;
  renewal_soon_days: number;
  pe_firm_locked: boolean;
  recent_change_locked: boolean;
  recent_change_days: number;
  backfill_migration_enabled: boolean;
}

/**
 * Continuity score formula parameters
 * Score = base + tenure_weight*T + stability_weight*B + value_weight*V
 */
export interface LPContinuityParams {
  tenure_weight: number;        // Weight for tenure component (0.35)
  tenure_max_days: number;      // Max days for full tenure score (730 = 2 years)
  stability_weight: number;     // Weight for stability component (0.30)
  stability_max_owners: number; // Max owners for zero stability (5)
  value_weight: number;         // Weight for value component (0.25)
  value_threshold: number;      // ARR threshold for full value score (2000000)
  base_continuity: number;      // Base score for any continuity (0.10)
}

/**
 * Geography score parameters
 */
export interface LPGeographyParams {
  exact_match_score: number;      // Same region (1.0)
  sibling_score: number;          // Adjacent region (0.65)
  parent_score: number;           // Same macro-region (0.40)
  global_score: number;           // Cross-region (0.20)
  unknown_territory_score: number; // Unknown territory (0.50)
}

/**
 * Team alignment score parameters
 * Tiers: SMB (0) → Growth (1) → MM (2) → ENT (3)
 */
export interface LPTeamParams {
  exact_match_score: number;     // Same tier (1.0)
  one_level_score: number;       // 1 tier difference (0.60)
  two_level_score: number;       // 2 tier difference (0.25)
  three_level_score: number;     // 3 tier difference (0.05)
  reaching_down_penalty: number; // Penalty per level when rep tier > account tier (0.15)
  unknown_tier_score: number;    // Unknown employee count (0.50)
}

/**
 * HiGHS solver configuration
 * 
 * NOTE: feasibility_penalty removed - Big-M penalty system now handles
 * capacity overflow symmetrically via soft penalties.
 * @see MASTER_LOGIC.mdc §11.3 - Symmetric balance constraints
 */
export interface LPSolverParams {
  timeout_seconds: number;
  tie_break_method: 'rank_based' | 'random';
  log_level: 'silent' | 'info' | 'debug';
  use_simplified_model?: boolean;  // Skip Big-M penalty system for numerical stability (default: false)
}

/**
 * Complete LP configuration from assignment_configuration table
 */
export interface LPConfiguration {
  optimization_model: 'waterfall' | 'relaxed_optimization';
  lp_objectives_customer: LPObjectivesConfig;
  lp_objectives_prospect: LPObjectivesConfig;
  lp_balance_config: LPBalanceConfig;
  lp_constraints: LPConstraintsConfig;
  lp_stability_config: LPStabilityConfig;
  lp_continuity_params: LPContinuityParams;
  lp_geography_params: LPGeographyParams;
  lp_team_params: LPTeamParams;
  lp_solver_params: LPSolverParams;
  priority_config?: PriorityConfig[];  // User's configured priority order for rationale labels
}

// =============================================================================
// Data Types (for processing)
// =============================================================================

/**
 * Account with aggregated child data for LP processing
 * Children are aggregated into parent pre-solve
 */
export interface AggregatedAccount {
  sfdc_account_id: string;
  account_name: string;
  
  // ARR source priority: hierarchy_bookings_arr_converted → calculated_arr → arr
  aggregated_arr: number;
  aggregated_atr: number;
  pipeline_value: number;  // Sum of opportunity net_arr (prospects)
  
  // Child tracking
  child_ids: string[];
  is_parent: boolean;
  
  // Current ownership
  owner_id: string | null;
  owner_name: string | null;
  owner_change_date: string | null;
  owners_lifetime_count: number | null;
  
  // Classification
  is_customer: boolean;
  is_strategic: boolean;
  
  // Geography
  sales_territory: string | null;
  geo: string | null;
  
  // Team alignment
  employees: number | null;
  enterprise_vs_commercial: string | null;
  
  // Tier classification (Expansion Tier for customers, Initial Sale Tier for prospects)
  tier: 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Tier 4' | null;
  expansion_tier: string | null;
  initial_sale_tier: string | null;
  
  // Stability indicators
  cre_risk: boolean | null;
  renewal_date: string | null;
  pe_firm: string | null;
  exclude_from_reassignment: boolean | null;
}

/**
 * Sales rep for LP processing
 * Note: 'team' field removed in v1.4.1 - use team_tier instead
 */
export interface EligibleRep {
  rep_id: string;
  name: string;
  region: string | null;
  team_tier: string | null;
  /** Comma-separated PE firm names this rep handles. @see MASTER_LOGIC.mdc §10.7 */
  pe_firms?: string | null;
  
  // Status
  is_active: boolean;
  include_in_assignments: boolean;
  is_strategic_rep: boolean;
  
  // Backfill info
  is_backfill_source: boolean | null;
  is_backfill_target: boolean | null;
  backfill_target_rep_id: string | null;
  
  // Current load (for capacity tracking)
  current_arr: number;
}

/**
 * Result of stability lock check
 */
export interface StabilityLockResult {
  isLocked: boolean;
  lockType: 'backfill_migration' | 'cre_risk' | 'renewal_soon' | 'pe_firm' | 'recent_change' | 'manual_lock' | null;
  targetRepId: string | null;
  reason: string | null;
}

// =============================================================================
// Scoring Types
// =============================================================================

/**
 * Normalized weights (sum to 1.0)
 */
export interface NormalizedWeights {
  wC: number;  // Continuity weight
  wG: number;  // Geography weight
  wT: number;  // Team alignment weight
}

/**
 * Per-assignment scores (all 0-1, or null for N/A)
 *
 * @see MASTER_LOGIC.mdc §5.1.1 - teamAlignment can be null when tier data is missing
 */
export interface AssignmentScores {
  continuity: number;
  geography: number;
  teamAlignment: number | null;  // null = N/A (missing tier data)
  tieBreaker: number;  // Small bonus based on ARR rank
}

/**
 * Per-assignment coefficient for LP objective
 */
export interface AssignmentCoefficient {
  accountId: string;
  repId: string;
  coefficient: number;
  scores: AssignmentScores;
}

// =============================================================================
// LP Problem Types
// =============================================================================

/**
 * Decision variable in LP
 */
export interface DecisionVariable {
  name: string;  // x_{accountId}_{repId}
  accountId: string;
  repId: string;
  coefficient: number;  // Objective coefficient
}

/**
 * Constraint in LP
 */
export interface LPConstraint {
  name: string;
  type: 'eq' | 'le' | 'ge';  // =, <=, >=
  variables: { name: string; coefficient: number }[];
  rhs: number;  // Right-hand side value
}

/**
 * Balance slack variable
 */
export interface BalanceSlack {
  repId: string;
  metric: 'arr' | 'atr' | 'pipeline';
  overVar: string;   // Name of over-target slack
  underVar: string;  // Name of under-target slack
  target: number;
}

/**
 * Slack variable bound definition
 */
export interface SlackBound {
  varName: string;
  lower: number;
  upper: number | null;  // null = unbounded
}

/**
 * Complete LP problem for HiGHS
 * 
 * NOTE: feasibilitySlacks removed - Big-M penalty system now handles
 * capacity overflow symmetrically via soft penalties.
 * @see MASTER_LOGIC.mdc §11.3 - Symmetric balance constraints
 */
export interface LPProblem {
  // Decision variables (binary)
  assignmentVars: DecisionVariable[];

  // Slack variables (continuous)
  balanceSlacks: BalanceSlack[];

  // All slack variable bounds (including Big-M penalty slacks)
  slackBounds: SlackBound[];

  // Constraints
  constraints: LPConstraint[];

  // Objective (maximize)
  objectiveCoefficients: Map<string, number>;

  // Metadata
  numAccounts: number;
  numReps: number;
  numVariables: number;
  numConstraints: number;
}

// =============================================================================
// Solution Types
// =============================================================================

/**
 * Assignment proposal from LP solution
 */
export interface LPAssignmentProposal {
  accountId: string;
  accountName: string;
  repId: string;
  repName: string;
  repRegion: string | null;
  
  // Scoring details
  scores: AssignmentScores;
  totalScore: number;
  
  // Lock info (if locked)
  lockResult: StabilityLockResult | null;
  
  // Human-readable explanation
  rationale: string;
  
  // Was this from strategic pool pre-assignment?
  isStrategicPreAssignment: boolean;
  
  // Child IDs that inherit this assignment
  childIds: string[];
}

/**
 * Per-rep load after assignment
 */
export interface RepLoad {
  repId: string;
  repName: string;
  
  // Load metrics
  arr: number;
  atr: number;
  pipeline: number;
  accountCount: number;
  
  // Targets
  arrTarget: number;
  atrTarget: number;
  pipelineTarget: number;
  
  // Deviation (positive = over, negative = under)
  arrDeviation: number;
  atrDeviation: number;
  pipelineDeviation: number;
  
  // Utilization (load / target)
  arrUtilization: number;
  
  // Feasibility slack used (if any)
  feasibilitySlack: number;
}

/**
 * Success metrics after LP solve
 */
export interface LPMetrics {
  // Balance
  arr_variance_percent: number;
  atr_variance_percent: number;
  pipeline_variance_percent: number;
  max_overload_percent: number;
  
  // Continuity
  continuity_rate: number;
  high_value_continuity_rate: number;  // >$500K accounts
  arr_stayed_percent: number;
  
  // Geography
  exact_geo_match_rate: number;
  sibling_geo_match_rate: number;
  cross_region_rate: number;
  
  // Team alignment
  exact_tier_match_rate: number;
  one_level_mismatch_rate: number;
  
  // Feasibility
  feasibility_slack_total: number;
  reps_over_capacity: number;
  
  // Problem stats
  solve_time_ms: number;
  total_accounts: number;
  total_reps: number;
  
  // Optional: comparison with waterfall
  waterfall_comparison?: {
    balance_improvement: number;
    continuity_delta: number;
    geo_match_delta: number;
  };
}

/**
 * Complete LP solve result
 */
export interface LPSolveResult {
  success: boolean;
  
  // Proposals (including strategic pre-assignments)
  proposals: LPAssignmentProposal[];
  
  // Per-rep load
  repLoads: RepLoad[];
  
  // Metrics
  metrics: LPMetrics;
  
  // Solver info
  solverStatus: 'optimal' | 'feasible' | 'infeasible' | 'timeout' | 'error';
  objectiveValue: number;
  
  // Warnings
  warnings: string[];
  
  // Error (if failed)
  error?: string;
}

// =============================================================================
// Telemetry Types
// =============================================================================

/**
 * Error categories for optimization run failures
 * @see MASTER_LOGIC.mdc §14.3.6
 */
export type OptimizationErrorCategory = 
  | 'data_validation'    // Bad input data
  | 'solver_timeout'     // HiGHS timeout
  | 'solver_infeasible'  // No solution exists
  | 'solver_crash'       // WASM memory error
  | 'network'            // Cloud Run unreachable
  | 'unknown';           // Uncategorized error

/**
 * Configuration snapshot stored with each optimization run
 * @see MASTER_LOGIC.mdc §14.3.2
 */
export interface OptimizationWeightsSnapshot {
  objectives: {
    wC: number;  // Continuity weight
    wG: number;  // Geography weight
    wT: number;  // Team alignment weight
  };
  balance: {
    arr_penalty: number;
    atr_penalty: number;
    pipeline_penalty: number;
  };
  intensity_multiplier: number;
}

/**
 * Telemetry record for optimization runs
 * Captures comprehensive data about every optimization run for analysis.
 * 
 * @see MASTER_LOGIC.mdc §14 - Optimization Telemetry
 */
export interface OptimizationRunRecord {
  // Run context
  build_id: string;
  config_id?: string;  // FK to assignment_configuration
  assignment_type: 'customer' | 'prospect';
  engine_type: 'waterfall' | 'relaxed_optimization';
  model_version: string;
  
  // Config snapshot (for historical analysis)
  weights_snapshot: OptimizationWeightsSnapshot;
  balance_intensity?: string;
  priority_config_snapshot?: unknown[];
  
  // Problem size
  num_accounts: number;
  num_reps: number;
  num_locked_accounts?: number;
  num_strategic_accounts?: number;
  num_variables?: number;      // LP only
  num_constraints?: number;    // LP only
  lp_size_kb?: number;         // LP only
  
  // Solver performance
  solver_type?: 'highs-wasm' | 'cloud-run' | 'glpk';  // null for waterfall
  solver_status: 'optimal' | 'feasible' | 'infeasible' | 'timeout' | 'error' | 'complete';
  solve_time_ms: number;
  objective_value?: number;    // LP only
  
  // Success metrics (all optional - waterfall may not have all)
  // Balance
  arr_variance_percent?: number;
  atr_variance_percent?: number;
  pipeline_variance_percent?: number;
  max_overload_percent?: number;
  
  // Continuity
  continuity_rate?: number;
  high_value_continuity_rate?: number;
  arr_stayed_percent?: number;
  
  // Geography
  exact_geo_match_rate?: number;
  sibling_geo_match_rate?: number;
  cross_region_rate?: number;
  
  // Team alignment
  exact_tier_match_rate?: number;
  one_level_mismatch_rate?: number;
  
  // Feasibility
  feasibility_slack_total?: number;
  reps_over_capacity?: number;
  
  // Error handling
  warnings?: string[];
  error_message?: string;
  error_category?: OptimizationErrorCategory;
}

// =============================================================================
// Engine Types
// =============================================================================

/**
 * Progress callback for UI updates
 * 
 * Extended to provide better transparency for long-running optimizations.
 * @see MASTER_LOGIC.mdc §11.4 (LP Progress Reporting)
 */
export interface LPProgress {
  stage: 'loading' | 'preprocessing' | 'building' | 'solving' | 'postprocessing' | 'complete' | 'error';
  status: string;
  progress: number;  // 0-100
  
  // Stage-specific details
  accountsProcessed?: number;
  totalAccounts?: number;
  constraintsBuilt?: number;
  totalConstraints?: number;
  solveIteration?: number;
  
  // Problem complexity indicators (for transparency during long solves)
  problemSize?: {
    numVariables: number;
    numConstraints: number;
    lpSizeKB: number;
    estimatedTimeMinutes?: number;  // Based on historical data
  };
  
  // Solver activity (for heartbeat during solving stage)
  solverActivity?: {
    solverType: 'cloud-run' | 'highs-wasm' | 'glpk';
    startedAt: number;  // timestamp
    lastHeartbeat?: number;  // timestamp of last activity
  };
  
  // Batch progress (when problem is split)
  batchInfo?: {
    currentBatch: number;
    totalBatches: number;
    batchType: 'customer' | 'prospect';
  };
}

export type LPProgressCallback = (progress: LPProgress) => void;

/**
 * Engine configuration passed to solve()
 */
export interface LPEngineConfig {
  buildId: string;
  assignmentType: 'customer' | 'prospect';
  
  // From database
  lpConfig: LPConfiguration;
  
  // Capacity limits
  targetArr: number;
  hardCapArr: number;
  
  // Territory mapping
  territoryMappings: Record<string, string>;
  
  // Progress callback
  onProgress?: LPProgressCallback;
}

// =============================================================================
// Default Values
// =============================================================================

export const DEFAULT_LP_OBJECTIVES_CUSTOMER: LPObjectivesConfig = {
  continuity_enabled: true,
  continuity_weight: 0.35,
  geography_enabled: true,
  geography_weight: 0.35,
  team_alignment_enabled: true,
  team_alignment_weight: 0.30
};

export const DEFAULT_LP_OBJECTIVES_PROSPECT: LPObjectivesConfig = {
  continuity_enabled: true,
  continuity_weight: 0.20,
  geography_enabled: true,
  geography_weight: 0.45,
  team_alignment_enabled: true,
  team_alignment_weight: 0.35
};

export const DEFAULT_LP_BALANCE_CONFIG: LPBalanceConfig = {
  arr_balance_enabled: true,
  arr_penalty: 0.5,
  arr_min: 0,              // Will be calculated dynamically from config
  arr_max: 3000000,        // Default hard cap
  arr_variance: 0.10,      // 10% variance band
  atr_balance_enabled: true,
  atr_penalty: 0.3,
  atr_min: 0,
  atr_max: 750000,
  atr_variance: 0.15,      // 15% variance band
  pipeline_balance_enabled: true,
  pipeline_penalty: 0.4,
  pipeline_min: 0,
  pipeline_max: 1000000,
  pipeline_variance: 0.15  // 15% variance band
};

export const DEFAULT_LP_CONSTRAINTS: LPConstraintsConfig = {
  strategic_pool_enabled: true,
  locked_accounts_enabled: true,
  parent_child_linking_enabled: true
  // NOTE: capacity_hard_cap_enabled removed - Big-M handles capacity symmetrically
};

export const DEFAULT_LP_STABILITY_CONFIG: LPStabilityConfig = {
  cre_risk_locked: true,
  renewal_soon_locked: true,
  renewal_soon_days: 90,
  pe_firm_locked: true,
  recent_change_locked: true,
  recent_change_days: 90,
  backfill_migration_enabled: true
};

export const DEFAULT_LP_CONTINUITY_PARAMS: LPContinuityParams = {
  tenure_weight: 0.35,
  tenure_max_days: 730,
  stability_weight: 0.30,
  stability_max_owners: 5,
  value_weight: 0.25,
  value_threshold: 2000000,
  base_continuity: 0.10
};

/**
 * LP Geography Params - Intentionally tighter than analytics GEO_MATCH_SCORES
 * 
 * The LP solver uses more aggressive scoring to drive stronger geographic
 * alignment during optimization. For reference:
 * - _domain/constants GEO_MATCH_SCORES: sibling=0.85, parent=0.65, global=0.40
 * - LP solver (below): sibling=0.65, parent=0.40, global=0.20
 * 
 * This is intentional per MASTER_LOGIC.mdc - LP needs tighter constraints
 * while analytics shows the softer "display" scores to users.
 */
export const DEFAULT_LP_GEOGRAPHY_PARAMS: LPGeographyParams = {
  exact_match_score: 1.0,
  sibling_score: 0.65,    // vs GEO_MATCH_SCORES.SAME_SUB_REGION (0.85)
  parent_score: 0.40,     // vs GEO_MATCH_SCORES.SAME_PARENT (0.65)
  global_score: 0.20,     // vs GEO_MATCH_SCORES.GLOBAL_FALLBACK (0.40)
  unknown_territory_score: 0.50
};

export const DEFAULT_LP_TEAM_PARAMS: LPTeamParams = {
  exact_match_score: 1.0,
  one_level_score: 0.60,
  two_level_score: 0.25,
  three_level_score: 0.05,
  reaching_down_penalty: 0.15,
  unknown_tier_score: 0.50
};

export const DEFAULT_LP_SOLVER_PARAMS: LPSolverParams = {
  timeout_seconds: 60,
  tie_break_method: 'rank_based',
  log_level: 'info'
  // NOTE: feasibility_penalty removed - Big-M handles capacity overflow symmetrically
};

/**
 * Get complete default configuration
 */
export function getDefaultLPConfiguration(): LPConfiguration {
  return {
    optimization_model: 'waterfall',
    lp_objectives_customer: DEFAULT_LP_OBJECTIVES_CUSTOMER,
    lp_objectives_prospect: DEFAULT_LP_OBJECTIVES_PROSPECT,
    lp_balance_config: DEFAULT_LP_BALANCE_CONFIG,
    lp_constraints: DEFAULT_LP_CONSTRAINTS,
    lp_stability_config: DEFAULT_LP_STABILITY_CONFIG,
    lp_continuity_params: DEFAULT_LP_CONTINUITY_PARAMS,
    lp_geography_params: DEFAULT_LP_GEOGRAPHY_PARAMS,
    lp_team_params: DEFAULT_LP_TEAM_PARAMS,
    lp_solver_params: DEFAULT_LP_SOLVER_PARAMS
  };
}

// =============================================================================
// Region Hierarchy - Re-exported from @/_domain for backwards compatibility
// =============================================================================

export { REGION_HIERARCHY, REGION_SIBLINGS } from '@/_domain';

export const TIER_ORDER = ['SMB', 'Growth', 'MM', 'ENT'] as const;
export type TeamTier = typeof TIER_ORDER[number];

// =============================================================================
// Legacy Types (moved from priorityExecutor.ts)
// Used by: parentalAlignmentService.ts, commercialPriorityHandlers.ts
// =============================================================================

/**
 * Account data for assignment processing
 */
export interface Account {
  sfdc_account_id: string;
  account_name: string;
  calculated_arr: number | null;
  calculated_atr: number | null;
  hierarchy_bookings_arr_converted: number | null;
  cre_count: number | null;
  cre_risk: boolean | null;
  sales_territory: string | null;
  geo: string | null;
  owner_id: string | null;
  owner_name: string | null;
  exclude_from_reassignment: boolean | null;
  pe_firm: string | null;
  is_customer: boolean | null;
  is_parent: boolean | null;
  is_strategic: boolean | null;
  hq_country: string | null;
  renewal_quarter: string | null;
  expansion_tier: string | null;
  initial_sale_tier: string | null;
  employees?: number | null;
  pipeline_value?: number | null;
  renewal_date?: string | null;
  owner_change_date?: string | null;
}

/**
 * Sales rep data for assignment processing
 * Note: 'team' field deprecated in v1.4.1 - use team_tier for tier alignment
 */
export interface SalesRep {
  rep_id: string;
  name: string;
  region: string | null;
  is_strategic_rep: boolean;
  is_active: boolean | null;
  include_in_assignments: boolean | null;
  flm: string | null;
  slm: string | null;
  /** @deprecated Use team_tier instead. Removed from import in v1.4.1 */
  team?: string | null;
  team_tier?: 'SMB' | 'Growth' | 'MM' | 'ENT' | null;
  /** Comma-separated PE firm names this rep handles. @see MASTER_LOGIC.mdc §10.7 */
  pe_firms?: string | null;
}

