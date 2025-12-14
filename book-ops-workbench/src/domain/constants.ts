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
 * DOCUMENTATION: docs/core/business_logic.md
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
 * @see docs/core/business_logic.md#team-tiers-employee-based
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
 * HIGH VALUE ARR THRESHOLD
 * ------------------------
 * Accounts with ARR above this are considered "Tier 1" or "Enterprise"
 * even if they have a small employee count.
 * 
 * WHY $100K:
 * A small company with a $100K+ contract is strategically important
 * and should be handled by experienced reps.
 */
export const HIGH_VALUE_ARR_THRESHOLD = 100_000;

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
 * @see docs/core/business_logic.md#balance-constraints
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
 * SCORE MEANINGS:
 * - 1.0: Perfect! Account territory matches rep region exactly
 * - 0.65: Good. Sibling regions (e.g., North East + South East)
 * - 0.40: Okay. Same parent region (both in AMER)
 * - 0.20: Poor. Cross-region (AMER account to EMEA rep)
 * - 0.50: Unknown. Can't determine, use neutral score
 * 
 * @see docs/core/business_logic.md#geo-match-score-for-optimization
 */
export const GEO_MATCH_SCORES = {
  /** Account territory matches rep region exactly */
  EXACT_MATCH: 1.0,
  
  /** Same parent region, different sub-region (e.g., North East ↔ South East) */
  SIBLING_REGION: 0.65,
  
  /** Same parent region (e.g., both in AMER) */
  SAME_PARENT: 0.40,
  
  /** Different parent regions (e.g., AMER ↔ EMEA) - avoid this! */
  CROSS_REGION: 0.20,
  
  /** Can't determine - use neutral score */
  UNKNOWN: 0.50,
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
