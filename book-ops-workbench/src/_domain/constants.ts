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
