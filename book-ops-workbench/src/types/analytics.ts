/**
 * Analytics Types for Phase 4 - LP Engine Success Metrics
 * 
 * These types support the analytics dashboards across:
 * - Data Overview tab (pre-assignment insights)
 * - Assignment preview dialog (current state before generation)
 * - Balancing tab (before/after comparison)
 */

// ============================================
// CONSTANTS
// ============================================

/**
 * ARR bucket definitions for analytics charts.
 * Used for histogram/distribution visualizations.
 */
export const ARR_BUCKETS = [
  { label: '$0-50K', min: 0, max: 50000 },
  { label: '$50K-100K', min: 50000, max: 100000 },
  { label: '$100K-500K', min: 100000, max: 500000 },
  { label: '$500K-1M', min: 500000, max: 1000000 },
  { label: '$1M+', min: 1000000, max: Infinity },
] as const;

export type ArrBucketLabel = typeof ARR_BUCKETS[number]['label'];

/**
 * Geography scoring weights for ANALYTICS VISUALIZATION.
 * 
 * UNIFIED with @/_domain/constants.ts GEO_MATCH_SCORES
 * to ensure consistent scoring across engine and dashboards.
 * 
 * @see @/_domain/constants.ts for authoritative values
 * @see @/_domain/MASTER_LOGIC.mdc Section 4.3 for documentation
 */
import { GEO_MATCH_SCORES as _GEO_MATCH_SCORES } from '@/_domain/constants';
export { GEO_MATCH_SCORES } from '@/_domain/constants';

// Alias for backwards compatibility - derives from _domain constants
export const GEO_SCORE_WEIGHTS = {
  exact: _GEO_MATCH_SCORES.EXACT_MATCH,
  sibling: _GEO_MATCH_SCORES.SAME_SUB_REGION,
  parent: _GEO_MATCH_SCORES.SAME_PARENT,
  global: _GEO_MATCH_SCORES.GLOBAL_FALLBACK,
} as const;

/**
 * Team alignment scoring weights for ANALYTICS VISUALIZATION.
 * 
 * Unified with optimization model scoring.
 * 
 * @see @/_domain/MASTER_LOGIC.mdc Section 9.3 for Team Alignment Score
 */
export const TEAM_ALIGNMENT_WEIGHTS = {
  exact: 1.0,      // Account tier matches rep tier exactly
  oneOff: 0.8,     // One tier level difference (1 - 0.20)
  twoOff: 0.6,     // Two tier levels difference (1 - 0.40)
} as const;

// ============================================
// LP ENGINE SUCCESS METRICS
// ============================================

/**
 * Detailed balance metrics with drill-down for visualization
 * Supports bell curve, MSE scoring, and tolerance bands
 */
export interface BalanceMetricsDetail {
  /** Main MSE-based score (0-1, higher = more balanced) */
  score: number;
  
  /** Average ARR per rep */
  mean: number;
  
  /** Standard deviation */
  stdDev: number;
  
  /** Variance (stdDev²) */
  variance: number;
  
  /** Coefficient of variation (stdDev / mean) */
  coeffOfVariation: number;
  
  /** Mean Squared Error from target */
  mse: number;
  
  /** Root Mean Squared Error */
  rmse: number;
  
  /** Target load (either configured or calculated as mean) */
  targetLoad: number;
  
  /** Tolerance percentage (from config, default 15%) */
  tolerancePct: number;
  
  /** Min acceptable load (target * (1 - tolerance)) */
  minAcceptable: number;
  
  /** Max acceptable load (target * (1 + tolerance)) */
  maxAcceptable: number;
  
  /** Rep distribution for bell curve */
  distribution: RepLoadDistribution[];
  
  /** Outlier summary */
  outliers: {
    underloaded: number;
    overloaded: number;
    inRange: number;
  };
  
  /** Total reps in calculation */
  repCount: number;
  
  /** Total ARR across all reps */
  totalARR: number;
}

export interface RepLoadDistribution {
  repId: string;
  repName: string;
  arrLoad: number;
  /** Deviation from target (arrLoad - target) */
  deviation: number;
  /** Z-score: (arrLoad - mean) / stdDev */
  zScore: number;
  /** Whether this rep is within tolerance */
  inRange: boolean;
}

/**
 * The 5 core success metrics from the LP Engine
 * These must appear in ALL analytics views
 */
export interface LPSuccessMetrics {
  /** How evenly ARR/ATR is distributed across reps (0-1, higher = more balanced) */
  balanceScore: number;

  /** Detailed balance breakdown (optional for drill-down) */
  balanceDetail?: BalanceMetricsDetail;

  /** Account stability with current owner (0-1, % accounts with same owner) */
  continuityScore: number;

  /** Detailed continuity breakdown with actual counts (optional for drill-down) */
  continuityMetrics?: ContinuityMetrics;

  /** Weighted geo alignment score (0-1, based on GEO_SCORE_WEIGHTS) */
  geographyScore: number;

  /**
   * Account tier matching rep tier (0-1, based on TEAM_ALIGNMENT_WEIGHTS)
   * null = N/A (no accounts have tier data)
   * @see MASTER_LOGIC.mdc §5.1.1 - Team Alignment Scoring with Missing Data
   */
  teamAlignmentScore: number | null;

  /** Average % of target load across all reps (can be null if no target set) */
  capacityUtilization: number | null;
}

// ============================================
// CONTINUITY METRICS
// ============================================

/**
 * Detailed continuity metrics for UI display
 * 
 * Provides actual counts (not just the percentage) so tooltips
 * can show accurate "Retained: X / Changed: Y / Excluded: Z" breakdowns.
 * 
 * @see MASTER_LOGIC.mdc §13.7.1 - Continuity Metrics Structure
 */
export interface ContinuityMetrics {
  /** The continuity score (0-1), same as retainedCount / eligibleCount */
  score: number;
  
  /** Accounts staying with same owner (new_owner_id = owner_id OR new_owner_id IS NULL) */
  retainedCount: number;
  
  /** Accounts moving to different owner (eligibleCount - retainedCount) */
  changedCount: number;
  
  /** Total accounts eligible for continuity tracking (owner exists in reps, not backfill source) */
  eligibleCount: number;
  
  /** Accounts excluded from tracking (owner not in reps file) */
  excludedCount: number;
}

// ============================================
// GEO ALIGNMENT METRICS
// ============================================

/** Breakdown of geo alignment for a single rep region */
export interface RegionGeoBreakdown {
  region: string;
  aligned: number;
  misaligned: number;
  unassigned: number;
  total: number;
}

export interface GeoAlignmentMetrics {
  /** Number of accounts where geo matches rep region */
  aligned: number;
  
  /** Number of accounts where geo differs from rep region */
  misaligned: number;
  
  /** Number of accounts with no assigned owner */
  unassigned: number;
  
  /** Alignment rate as percentage (aligned / (aligned + misaligned) * 100) */
  alignmentRate: number;
  
  /** Breakdown by rep region */
  byRegion?: RegionGeoBreakdown[];
}

// ============================================
// DISTRIBUTION METRICS
// ============================================

export interface TierDistribution {
  tier1: number;
  tier2: number;
  standard: number;
}

export interface TierAlignmentBreakdown {
  exactMatch: number;
  oneLevelMismatch: number;
  twoPlusLevelMismatch: number;
  unassigned: number;
  /** Accounts where tier data is missing (N/A) - not a mismatch, just unknown */
  unknown: number;
}

export interface ArrBucket {
  bucket: string;
  count: number;
  totalARR: number;
}

export interface RegionMetrics {
  region: string;
  accounts: number;
  customers: number;
  prospects: number;
  arr: number;
  atr: number;
  pipeline: number;
  repCount: number;
}

export interface OwnerCoverage {
  /** Accounts with a valid owner_id that exists in sales_reps */
  withOwner: number;
  
  /** Accounts without owner or with owner not in sales_reps */
  orphaned: number;
  
  /** Coverage percentage */
  coverageRate: number;
}

// ============================================
// METRICS SNAPSHOT
// ============================================

/**
 * Complete snapshot of all metrics at a point in time
 * Used for both "before" (original owner_id) and "after" (new_owner_id) states
 */
export interface MetricsSnapshot {
  /** The 5 LP success metrics */
  lpMetrics: LPSuccessMetrics;
  
  /** Breakdown by region */
  byRegion: RegionMetrics[];
  
  /** Geo alignment breakdown */
  geoAlignment: GeoAlignmentMetrics;
  
  /** ARR distribution buckets */
  arrBuckets: ArrBucket[];
  
  /** Account tier distribution */
  tierDistribution: TierDistribution;
  
  /** Tier alignment breakdown (exact match vs mismatches) */
  tierAlignmentBreakdown: TierAlignmentBreakdown;
  
  /** Owner coverage stats */
  ownerCoverage: OwnerCoverage;
  
  /** Per-rep distribution data for charts */
  repDistribution: RepDistributionData[];
  
  /** Totals for quick access */
  totals: {
    accounts: number;
    customers: number;
    prospects: number;
    arr: number;
    atr: number;
    pipeline: number;
  };
}

// ============================================
// BEFORE/AFTER COMPARISON
// ============================================

/**
 * Comparison between original (owner_id) and proposed (new_owner_id) states
 */
export interface MetricsComparison {
  /** Metrics based on accounts.owner_id */
  original: MetricsSnapshot;
  
  /** Metrics based on accounts.new_owner_id */
  proposed: MetricsSnapshot;
  
  /** Difference between proposed and original LP metrics */
  deltas: LPSuccessMetrics;
  
  /** Whether there are any proposed assignments */
  hasProposedAssignments: boolean;
}

// ============================================
// CHART DATA TYPES
// ============================================

export interface PieChartData {
  name: string;
  value: number;
  color?: string;
  percentage?: number;
}

export interface BarChartData {
  name: string;
  value: number;
  before?: number;
  after?: number;
  color?: string;
}

export interface BeforeAfterData {
  metric: string;
  before: number;
  after: number;
  delta: number;
  deltaPercent: number;
  improved: boolean;
}

// ============================================
// REP DISTRIBUTION DATA (for Data Overview charts)
// ============================================

export interface RepDistributionData {
  repId: string;
  repName: string;
  region: string;
  arr: number;
  atr: number;
  pipeline: number;
  // Total counts (backward compatible)
  customerAccounts: number;
  prospectAccounts: number;
  totalAccounts: number;
  // Parent/child breakdown for tooltip
  parentCustomers: number;
  childCustomers: number;
  parentProspects: number;
  childProspects: number;
  // Strategic rep flag for distinct chart coloring
  isStrategicRep?: boolean;
}

export type RepDistributionMetric = 'arr' | 'atr' | 'pipeline' | 'accounts';

// ============================================
// COMPONENT PROPS
// ============================================

export interface LPScoreCardProps {
  label: string;
  score: number | null;
  description?: string;
  colorScheme?: 'default' | 'success' | 'warning' | 'danger';
  showAsPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export interface LPScoresSummaryProps {
  metrics: LPSuccessMetrics;
  showCapacity?: boolean;
  variant?: 'horizontal' | 'grid';
}

export interface VarianceIndicatorProps {
  before: number;
  after: number;
  format?: 'percentage' | 'currency' | 'number';
  size?: 'sm' | 'md' | 'lg';
}


