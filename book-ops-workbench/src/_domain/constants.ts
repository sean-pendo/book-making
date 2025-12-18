/**
 * ============================================================================
 * BUSINESS CONSTANTS
 * ============================================================================
 * 
 * All magic numbers, thresholds, and default values live here.
 * 
 * WHY THIS FILE EXISTS:
 * - No magic numbers scattered across the codebase
 * - Easy to find and update thresholds
 * - Changes propagate to all consumers automatically
 * 
 * NAMING CONVENTION:
 * - Use SCREAMING_SNAKE_CASE for constants
 * - Group related constants in objects
 * - Add comments explaining the "why" not just the "what"
 * 
 * @see MASTER_LOGIC.mdc (various sections)
 * 
 * ============================================================================
 */

// =============================================================================
// TIER THRESHOLDS (EMPLOYEE COUNT)
// =============================================================================

/**
 * TIER THRESHOLDS
 * ---------------
 * Employee count thresholds for team tier classification.
 * 
 * IMPORTANT: These are MAX values, not min values!
 * - SMB: employees <= 99 (i.e., < 100)
 * - Growth: employees <= 499 (i.e., 100-499)
 * - MM: employees <= 1499 (i.e., 500-1499)
 * - ENT: employees > 1499 (i.e., 1500+)
 * 
 * WHY THESE NUMBERS:
 * These align with common B2B SaaS market segmentation.
 * Adjust if your company uses different thresholds.
 * 
 * @see MASTER_LOGIC.mdc §5.1
 */
export const TIER_THRESHOLDS = {
  /** SMB = employees less than 100 (so max is 99) */
  SMB_MAX: 99,
  
  /** Growth = employees 100-499 (so max is 499) */
  GROWTH_MAX: 499,
  
  /** MM = employees 500-1499 (so max is 1499) */
  MM_MAX: 1499,
  
  // ENT = employees 1500+ (no max, it's the top tier)
} as const;

/**
 * DEFAULT ENTERPRISE THRESHOLD
 * ----------------------------
 * Used when build doesn't have a custom enterprise_threshold configured.
 * Accounts with more employees than this are considered Enterprise.
 */
export const DEFAULT_ENTERPRISE_THRESHOLD = 1500;

/**
 * HIGH VALUE ARR THRESHOLD (Legacy Default)
 * ------------------------------------------
 * Threshold for identifying high-value accounts in metrics/analytics.
 * 
 * NOTE: This does NOT override tier classification.
 * Team tier is determined by employee count only.
 * 
 * Used for:
 * - High-value continuity metrics
 * - Analytics dashboards
 * 
 * @see MASTER_LOGIC.mdc §10.8
 */
export const HIGH_VALUE_ARR_THRESHOLD = 100_000;

/**
 * TIER 1 PRIORITY EMPLOYEE THRESHOLD
 * -----------------------------------
 * Employee count threshold for considering an account as "Tier 1 priority"
 * in assignment logic (distinct from team tier classification).
 * 
 * Accounts with > 1000 employees are considered high-priority for
 * assignment purposes, even if they're technically Mid-Market tier.
 */
export const TIER_1_PRIORITY_EMPLOYEE_THRESHOLD = 1000;

// =============================================================================
// BALANCE VARIANCE DEFAULTS
// =============================================================================

/**
 * DEFAULT VARIANCE PERCENTAGES
 * ----------------------------
 * How much deviation from the target is acceptable for each metric.
 * 
 * Used in balance constraints:
 * - min = target * (1 - variance)
 * - max = target * (1 + variance)
 * 
 * WHY DIFFERENT VALUES:
 * - ARR/ATR: 25% variance allows for natural account size differences
 * - Account Count: 15% is tighter because count is easier to balance
 * - Tier: 20% allows some flexibility in tier distribution
 * 
 * @see MASTER_LOGIC.mdc §12
 */
export const DEFAULT_VARIANCE = {
  /** ARR variance: ±25% */
  ARR: 0.25,
  
  /** ATR variance: ±25% */
  ATR: 0.25,
  
  /** Pipeline variance: ±25% */
  PIPELINE: 0.25,
  
  /** Account count variance: ±15% (tighter) */
  ACCOUNT_COUNT: 0.15,
  
  /** Tier distribution variance: ±20% */
  TIER: 0.20,
} as const;

// =============================================================================
// GEOGRAPHY SCORING
// =============================================================================

/**
 * GEO MATCH SCORES
 * ----------------
 * Scores used when calculating geographic alignment in optimization.
 * 
 * Higher score = better match = preferred assignment.
 * 
 * HIERARCHY OF SPECIFICITY (more specific = higher score):
 * 
 *   Global
 *   └── AMER / EMEA / APAC  (Parent Region)
 *       └── North East / UK / ANZ  (Sub-Region)
 *           └── NYC / Boston / etc.  (Territory - most specific)
 * 
 * SCORING:
 * - 1.00: Exact match (NYC account → NYC rep)
 * - 0.85: Same sub-region (NYC account → North East rep)
 * - 0.65: Same parent (NYC account → AMER rep)
 * - 0.40: Global fallback (NYC account → Global rep)
 * - 0.20: Cross-region (NYC account → EMEA rep) - avoid!
 * 
 * @see src/_domain/MASTER_LOGIC.mdc#geo-match-scoring
 */
export const GEO_MATCH_SCORES = {
  /** Account territory matches rep region exactly (NYC → NYC) */
  EXACT_MATCH: 1.0,
  
  /** Same sub-region (NYC → North East) */
  SAME_SUB_REGION: 0.85,
  
  /** Same parent region (NYC → AMER) */
  SAME_PARENT: 0.65,
  
  /** Global rep can take anything, but least preferred */
  GLOBAL_FALLBACK: 0.40,
  
  /** Different parent regions (AMER ↔ EMEA) - avoid this! */
  CROSS_REGION: 0.20,
  
  /** Can't determine - use neutral score */
  UNKNOWN: 0.50,
  
  /** @deprecated Use SAME_SUB_REGION instead */
  SIBLING_REGION: 0.85,
} as const;

// =============================================================================
// CONTINUITY
// =============================================================================

/**
 * DEFAULT CONTINUITY DAYS
 * -----------------------
 * Number of days a rep must have owned an account to trigger
 * "continuity" protection (account stays with current owner).
 * 
 * WHY 90 DAYS:
 * - Rep has invested time building relationship
 * - Switching would disrupt momentum
 * - Typically one quarter of relationship building
 * 
 * Can be overridden in assignment configuration.
 */
export const DEFAULT_CONTINUITY_DAYS = 90;

// =============================================================================
// IMPORT/BATCH PROCESSING
// =============================================================================

/**
 * BATCH SIZES
 * -----------
 * Batch sizes for database operations to avoid timeouts.
 * 
 * WHY BATCH:
 * - Supabase has limits on request size
 * - Large operations can timeout
 * - Batching provides progress feedback
 */
export const BATCH_SIZES = {
  /** Batch size for import operations */
  IMPORT: 500,
  
  /** Batch size for update operations */
  UPDATE: 100,
  
  /** Batch size for delete operations */
  DELETE: 1000,
} as const;

/**
 * SUPABASE LIMITS
 * ---------------
 * Known limits in Supabase that we need to work around.
 * 
 * IMPORTANT: Supabase returns max 1000 rows by default!
 * Always use pagination for large tables.
 */
export const SUPABASE_LIMITS = {
  /** Default page size when fetching (must use .range() for more) */
  DEFAULT_PAGE_SIZE: 1000,
  
  /** Max rows per insert operation */
  MAX_ROWS_PER_INSERT: 500,
} as const;

// =============================================================================
// OPTIMIZATION WEIGHTS
// =============================================================================

/**
 * DEFAULT OPTIMIZATION WEIGHTS
 * ----------------------------
 * How much each factor matters in the LP optimization.
 * 
 * All weights should sum to 1.0 for each category.
 * 
 * CUSTOMER WEIGHTS:
 * - ARR is most important (50%) - revenue is king
 * - ATR matters (25%) - renewal timing affects workload
 * - Tier balance (25%) - fair distribution of priority accounts
 * 
 * PROSPECT WEIGHTS:
 * - Pipeline is most important (50%) - potential revenue
 * - Tier balance (50%) - fair distribution of high-potential accounts
 */
export const DEFAULT_OPTIMIZATION_WEIGHTS = {
  CUSTOMER: {
    ARR: 0.50,
    ATR: 0.25,
    TIER: 0.25,
  },
  PROSPECT: {
    PIPELINE: 0.50,
    TIER: 0.50,
  },
} as const;

// =============================================================================
// SALES TOOLS BUCKET
// =============================================================================

/**
 * SALES TOOLS ARR THRESHOLD
 * -------------------------
 * Customer accounts with ARR below this threshold are routed to Sales Tools
 * instead of being assigned to individual reps.
 * 
 * WHY $25K:
 * - Low-value accounts don't justify dedicated rep time
 * - Sales Tools provides self-service/automated handling
 * - Frees up rep capacity for higher-value accounts
 * 
 * @see MASTER_LOGIC.mdc Section 8.1 (Priority P1: Sales Tools Bucket)
 */
export const SALES_TOOLS_ARR_THRESHOLD = 25_000;

/**
 * SALES TOOLS PSEUDO-REP
 * ----------------------
 * Identifier used for the Sales Tools pseudo-rep in analytics.
 * Sales Tools is not a real rep - it's a bucket for low-ARR customers.
 *
 * This appears in analytics dashboards as a distinct category
 * with no FLM/SLM hierarchy (reports directly under itself).
 *
 * @see MASTER_LOGIC.mdc Section 10.4 (Sales Tools Routing)
 */
export const SALES_TOOLS_REP_ID = '__SALES_TOOLS__';
export const SALES_TOOLS_REP_NAME = 'Sales Tools';

// =============================================================================
// WORKLOAD BALANCING
// =============================================================================

/**
 * DEFAULT OVERLOAD VARIANCE
 * -------------------------
 * A rep is considered "overloaded" when their workload exceeds
 * the target by more than this variance percentage.
 * 
 * Example: At 20% variance, if target is 10 accounts, rep with 12+ is overloaded.
 * 
 * WHY 20%:
 * - Aligns with balance variance bands
 * - Triggers visual warning in dashboards
 * - Configurable per-build in assignment_configuration
 * 
 * @see MASTER_LOGIC.mdc §12
 */
export const DEFAULT_OVERLOAD_VARIANCE = 0.20;

/**
 * DEFAULT MAX ARR PER REP
 * -----------------------
 * Default maximum ARR a single rep should manage.
 * Used when no custom threshold is configured.
 * 
 * WHY $2.5M:
 * - Represents reasonable workload for enterprise rep
 * - Ensures accounts are distributed across team
 * - Can be overridden in assignment configuration
 */
export const DEFAULT_MAX_ARR_PER_REP = 2_500_000;

// =============================================================================
// CRE RISK LEVELS
// =============================================================================

/**
 * CRE RISK THRESHOLDS
 * -------------------
 * Thresholds for categorizing accounts by Customer Renewal risk count.
 * Used for badge display and filtering in dashboards.
 * 
 * Categories:
 * - None: 0 CRE cases
 * - Low: 1-2 CRE cases
 * - Medium: 3-5 CRE cases
 * - High: 6+ CRE cases
 * 
 * WHY THESE NUMBERS:
 * - Based on typical renewal event volume per account
 * - Aligns with operational capacity thresholds
 */
export const CRE_RISK_THRESHOLDS = {
  /** Max count for "Low" risk (1-2 cases) */
  LOW_MAX: 2,
  
  /** Max count for "Medium" risk (3-5 cases) */
  MEDIUM_MAX: 5,
  
  // High = 6+ (no max, it's the top tier)
} as const;

/**
 * Helper to get CRE risk level from count
 */
export function getCRERiskLevel(creCount: number): 'none' | 'low' | 'medium' | 'high' {
  if (creCount === 0) return 'none';
  if (creCount <= CRE_RISK_THRESHOLDS.LOW_MAX) return 'low';
  if (creCount <= CRE_RISK_THRESHOLDS.MEDIUM_MAX) return 'medium';
  return 'high';
}

// =============================================================================
// PRIORITY WEIGHTING
// =============================================================================

/**
 * PRIORITY WEIGHT CALCULATION
 * ---------------------------
 * Calculates the weight for a priority based on its position.
 * Higher position (lower number) = higher weight.
 * 
 * Formula: weight = 1.0 / position
 * 
 * | Position | Weight |
 * |----------|--------|
 * | 1        | 1.00   |
 * | 2        | 0.50   |
 * | 3        | 0.33   |
 * | 4        | 0.25   |
 * | 5        | 0.20   |
 * | 6        | 0.17   |
 * 
 * Used in the LP solver to weight factors based on priority configuration.
 * Higher priorities have more influence on the optimization objective.
 * 
 * @see MASTER_LOGIC.mdc §10.2.1
 */
export function calculatePriorityWeight(position: number): number {
  if (position <= 0) return 0;
  return 1.0 / position;
}

/**
 * DEFAULT PRIORITY WEIGHTS
 * ------------------------
 * Default weights for each scoring factor when no priority config is set.
 * These represent a balanced weighting across all factors.
 * 
 * Used as fallbacks when:
 * - Priority is disabled in config
 * - Priority config is not loaded
 * - Running in legacy mode without priority customization
 */
export const DEFAULT_PRIORITY_WEIGHTS = {
  /** Geography matching (default weight if not customized) */
  GEOGRAPHY: 0.30,
  
  /** Continuity - keeping accounts with current owner */
  CONTINUITY: 0.25,
  
  /** Team alignment - matching account tier to rep tier */
  TEAM_ALIGNMENT: 0.20,
  
  /** Balance - even workload distribution */
  BALANCE: 0.25,
} as const;

/**
 * LP SCORING FACTORS
 * ------------------
 * Base scores for each factor before weighting.
 * These are multiplied by priority weights to get final contribution.
 * 
 * All scores are normalized to 0-100 range for consistency.
 */
export const LP_SCORING_FACTORS = {
  /** Max bonus for continuity (current owner match) */
  CONTINUITY_MATCH_BONUS: 100,
  
  /** Max score for perfect geography match */
  GEOGRAPHY_MAX_SCORE: 100,
  
  /** Max score for perfect team tier match */
  TEAM_ALIGNMENT_MAX_SCORE: 100,
  
  /** Max balance bonus for underloaded rep */
  BALANCE_MAX_BONUS: 100,
  
  /** Base coefficient to ensure positive values */
  BASE_COEFFICIENT: 10,
} as const;

/**
 * LP PENALTY CONSTANTS (Big-M System)
 * ------------------------------------
 * Three-tier penalty system for balance constraints.
 * @see MASTER_LOGIC.mdc §11.3 Three-Tier Penalty System
 * 
 * BigM is intentionally HUGE (100.0) to dominate assignment scores.
 * Assignment scores range 0-110 per account, so BigM must exceed this
 * significantly to prevent accumulation of small violations.
 * 
 * At VERY_HEAVY intensity (25x), BigM penalty reaches 1250.0 per normalized unit,
 * completely preventing any violation of max limits.
 * 
 * Ratios: Alpha:Beta:BigM = 1:10:1000
 * 
 * Used by: lpProblemBuilder.ts, simplifiedAssignmentEngine.ts
 */
export const LP_PENALTY = {
  /** Alpha: Small penalty for deviation within variance band */
  ALPHA: 0.01,
  
  /** Beta: Medium penalty for deviation in buffer zone (between variance and hard cap) */
  BETA: 0.1,
  
  /** BigM: HUGE penalty for deviation beyond absolute limits - must dominate all assignment scores */
  BIG_M: 100.0,
} as const;

/**
 * BALANCE INTENSITY PRESETS
 * -------------------------
 * Controls the trade-off between continuity and balance.
 * Higher multiplier = balance matters more, continuity may be sacrificed.
 * 
 * Applied to all LP_PENALTY values (Alpha, Beta, BigM) for:
 * - ARR balance
 * - ATR balance (customers)
 * - Pipeline balance (prospects)
 * - Tier balance (all)
 * 
 * At HEAVY (10x), the BigM penalty (100.0) becomes 500.0 per normalized unit,
 * which strongly discourages exceeding max limits.
 * 
 * At VERY_HEAVY (100x), the BigM penalty (100.0) becomes 5000.0 per normalized unit,
 * completely dominating any assignment score (0.1-1.0 range per account),
 * making max limits effectively hard constraints.
 * 
 * @see MASTER_LOGIC.mdc §11.3.1
 */
export const BALANCE_INTENSITY_PRESETS = {
  VERY_LIGHT: { label: 'Very Light', multiplier: 0.1, description: 'Preserve fit; balance rarely overrides' },
  LIGHT: { label: 'Light', multiplier: 0.5, description: 'Slight preference for balance' },
  NORMAL: { label: 'Normal', multiplier: 1.0, description: 'Balanced trade-off (default)' },
  HEAVY: { label: 'Heavy', multiplier: 10.0, description: 'Strong preference for even distribution' },
  VERY_HEAVY: { label: 'Very Heavy', multiplier: 100.0, description: 'Force even distribution; max limits strictly enforced' },
} as const;

export type BalanceIntensity = keyof typeof BALANCE_INTENSITY_PRESETS;

/**
 * Get the penalty multiplier for a given balance intensity
 * @see MASTER_LOGIC.mdc §11.3.1
 */
export function getBalancePenaltyMultiplier(intensity: BalanceIntensity): number {
  return BALANCE_INTENSITY_PRESETS[intensity].multiplier;
}

/**
 * SOLVER MODE
 * -----------
 * Controls routing strategy for LP solver calls.
 * 
 * - 'browser': Use HiGHS WASM in browser (fast, fallback: GLPK → Cloud Run)
 * - 'cloud': Use Cloud Run native HiGHS (reliable, no fallback)
 * 
 * @see MASTER_LOGIC.mdc §11.11 Solver Routing Strategy
 */
export type SolverMode = 'browser' | 'cloud';

/**
 * LP SCALE LIMITS
 * ---------------
 * Maximum problem sizes for HiGHS WASM in browser.
 * @see MASTER_LOGIC.mdc §11.10 Scale Limits
 * 
 * HiGHS WASM can hang on very large problems due to:
 * - Dense constraint matrices (each balance constraint references all accounts)
 * - MIP branching explosion
 * - WASM memory limitations
 * 
 * When account count exceeds these limits, the engine should fall back to
 * waterfall mode which processes smaller batches per priority level.
 * 
 * Used by: pureOptimizationEngine.ts
 */
export const LP_SCALE_LIMITS = {
  /** 
   * Maximum accounts for global LP optimization (above this, use waterfall)
   * Testing showed HiGHS can handle 8000+ accounts (~85s solve time)
   * but production LP structure may differ. Set conservatively.
   */
  MAX_ACCOUNTS_FOR_GLOBAL_LP: 8000,
  
  /** Warning threshold - log performance warning above this */
  WARN_ACCOUNTS_THRESHOLD: 3000,
} as const;

// =============================================================================
// WORKLOAD SCORING (Legacy AssignmentService)
// =============================================================================

/**
 * WORKLOAD SCORE NORMALIZATION FACTORS
 * ------------------------------------
 * Used by legacy assignmentService.ts to normalize account count and tier count
 * to be comparable with ARR values in a composite workload score.
 * 
 * Formula: workloadScore = (ARR × 0.6) + (accountCount × ACCOUNT_WEIGHT × 0.3) + (tier1Count × TIER1_WEIGHT × 0.1)
 * 
 * These weights convert count-based metrics to dollar-equivalent values:
 * - Each account is worth ~$50K in workload terms
 * - Each Tier 1 account is worth ~$25K additional workload
 * 
 * Note: This is used by the LEGACY assignmentService.ts, not the primary
 * simplifiedAssignmentEngine.ts which uses LP solver for balancing.
 */
export const WORKLOAD_SCORE_WEIGHTS = {
  /** Dollar-equivalent weight per account for workload scoring */
  ACCOUNT_WEIGHT: 50_000,
  
  /** Dollar-equivalent weight per Tier 1 account for workload scoring */
  TIER1_WEIGHT: 25_000,
} as const;

// =============================================================================
// MODEL VERSIONING
// =============================================================================

/**
 * OPTIMIZATION MODEL VERSION
 * --------------------------
 * Semantic version for tracking optimization model changes.
 * Bump when changing scoring functions, penalties, or constraints.
 * 
 * Version Bump Rules:
 * - Major (X.0.0): Breaking changes to scoring formula structure
 *   Example: New scoring factor added, constraint type removed
 * - Minor (0.X.0): New optional features, significant algorithm changes
 *   Example: New balance metric, solver routing change
 * - Patch (0.0.X): Threshold/weight value changes
 *   Example: LP_PENALTY.ALPHA change, DEFAULT_LP_GEOGRAPHY_PARAMS tweak
 * 
 * Used by: optimizationTelemetry.ts
 * @see MASTER_LOGIC.mdc §14.2 Model Versioning
 */
export const OPTIMIZATION_MODEL_VERSION = '1.0.1';
