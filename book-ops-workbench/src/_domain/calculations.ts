/**
 * ============================================================================
 * BUSINESS CALCULATIONS - ARR, ATR, Pipeline, and Rep Metrics
 * ============================================================================
 * 
 * This is the SINGLE SOURCE OF TRUTH for all revenue calculations.
 * 
 * DO NOT duplicate this logic elsewhere in the codebase.
 * Instead, import from '@/_domain':
 * 
 *   import { getAccountARR, getAccountATR } from '@/_domain';
 * 
 * @see MASTER_LOGIC.mdc §2 (Revenue Metrics)
 * 
 * ============================================================================
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Minimal account data needed for calculations.
 * These are the fields that matter for ARR/ATR - everything else is optional.
 */
export interface AccountData {
  /** Is this a parent account (top of hierarchy)? */
  is_parent?: boolean;
  
  /** Is this a customer (has revenue) vs prospect (no revenue)? */
  is_customer?: boolean;
  
  /** 
   * Does this parent account have customer children?
   * Used to determine if parent is a customer even if parent ARR is 0.
   * @see MASTER_LOGIC.mdc §3.1.1
   */
  has_customer_hierarchy?: boolean | null;
  
  /** Raw ARR from import */
  arr?: number | null;
  
  /** 
   * Calculated ARR - includes adjustments for:
   * - Hierarchy roll-ups (parent accounts)
   * - Split ownership (children with different owners)
   */
  calculated_arr?: number | null;
  
  /** 
   * Hierarchy bookings ARR - legacy field, sometimes more accurate
   * for parent accounts than regular arr field
   */
  hierarchy_bookings_arr_converted?: number | null;
  
  /** 
   * Calculated ATR - pre-computed from database function
   * Includes hierarchy roll-up from child accounts
   */
  calculated_atr?: number | null;
  
  /** Raw ATR from import */
  atr?: number | null;
}

/**
 * Opportunity data needed for ATR and Pipeline calculations
 */
export interface OpportunityData {
  /** 
   * Type of opportunity - CRITICAL for ATR calculation
   * ATR only counts opportunities where this = 'Renewals'
   */
  opportunity_type?: string | null;
  
  /** 
   * Available to Renew value - the source of ATR
   * This is the actual dollar amount coming up for renewal
   */
  available_to_renew?: number | null;
  
  /** 
   * Net ARR from the opportunity - used for Pipeline calculation
   * This is potential revenue, not actual revenue
   */
  net_arr?: number | null;
  
  /** Fallback if net_arr is not available */
  amount?: number | null;
  
  /** Links opportunity to its account */
  sfdc_account_id: string;
}

// =============================================================================
// ARR CALCULATIONS
// =============================================================================

/**
 * GET ACCOUNT ARR
 * ---------------
 * Returns the correct ARR value for an account.
 * 
 * WHY THE PRIORITY CHAIN EXISTS:
 * - hierarchy_bookings_arr_converted: FIRST - prevents double-counting from children
 *   (children share parent's hierarchy_bookings value, so this is the aggregated source)
 * - calculated_arr: Fallback with adjustments
 * - arr: Raw import value, last resort
 * 
 * IMPORTANT: Same priority for ALL accounts (parent and child) to prevent
 * double-counting when summing across a hierarchy.
 * 
 * @example
 * const arr = getAccountARR(account);
 * console.log(`Account ARR: $${arr}`);
 * 
 * @see src/_domain/MASTER_LOGIC.mdc#arr-calculation
 */
export function getAccountARR(account: AccountData): number {
  // Priority: hierarchy_bookings (aggregated) → calculated → raw arr → 0
  // Same for all accounts to prevent double-counting
  return account.hierarchy_bookings_arr_converted || account.calculated_arr || account.arr || 0;
}

/**
 * Check if an account has meaningful ARR (greater than 0)
 * 
 * @example
 * if (hasARR(account)) {
 *   // This is a paying customer
 * }
 */
export function hasARR(account: AccountData): boolean {
  return getAccountARR(account) > 0;
}

/**
 * IS CUSTOMER
 * -----------
 * Determines if an account is a customer (has revenue) vs prospect (no revenue).
 * 
 * RULE: Customer = getAccountARR() > 0
 * 
 * Uses the same priority chain as getAccountARR() for consistency.
 * 
 * @see src/_domain/MASTER_LOGIC.mdc#account-types
 */
export function isCustomer(account: AccountData): boolean {
  // If explicitly set, trust it
  if (account.is_customer !== undefined) {
    return account.is_customer;
  }
  
  // Otherwise, check if account has any positive ARR
  return getAccountARR(account) > 0;
}

/**
 * IS PARENT CUSTOMER
 * ------------------
 * Determines if a PARENT account should be classified as a customer.
 * 
 * A parent is a customer if:
 * 1. They have direct ARR > 0 (paying us directly), OR
 * 2. They have customer children (has_customer_hierarchy = true)
 * 
 * WHY CHILDREN MATTER:
 * A parent account may have $0 direct ARR but have children who are paying
 * customers. For grouping, rollups, and assignment purposes, this parent 
 * represents a CUSTOMER RELATIONSHIP because they pay us (through children).
 * 
 * USE CASES:
 * - Customer/Prospect grouping in UI
 * - ARR rollup calculations
 * - Assignment engine priority handling
 * - Database sync (syncIsCustomerField)
 * 
 * @example
 * // Use this for parent accounts
 * if (account.is_parent && isParentCustomer(account)) {
 *   // This is a customer parent
 * }
 * 
 * @see MASTER_LOGIC.mdc §3.1.1
 */
export function isParentCustomer(account: AccountData): boolean {
  // Has direct ARR = customer
  if (getAccountARR(account) > 0) return true;
  
  // Has customer children = customer (for grouping purposes)
  if (account.has_customer_hierarchy === true) return true;
  
  return false;
}

/**
 * IS PARENT ACCOUNT
 * -----------------
 * Determines if an account is a parent (top of hierarchy) vs child.
 * 
 * Parent accounts have no ultimate_parent_id (they ARE the ultimate parent).
 * Child accounts have an ultimate_parent_id pointing to their parent.
 * 
 * @example
 * if (isParentAccount(account)) {
 *   // This is a top-level account
 * }
 * 
 * @see MASTER_LOGIC.mdc §3.2
 */
export function isParentAccount(account: { ultimate_parent_id?: string | null }): boolean {
  return !account.ultimate_parent_id || account.ultimate_parent_id.trim() === '';
}

// =============================================================================
// ATR CALCULATIONS
// =============================================================================

/**
 * GET ACCOUNT ATR
 * ---------------
 * Returns the Available To Renew value for an account.
 * 
 * ⚠️ IMPORTANT: ATR is NOT the same as CRE (churn risk)!
 * - ATR = timing (when revenue renews)
 * - CRE = risk (might churn)
 * These are completely independent metrics.
 * 
 * SOURCE OF ATR:
 * ATR is calculated from opportunities where opportunity_type = 'Renewals'
 * The calculated_atr field is pre-computed by a database function.
 * 
 * @see MASTER_LOGIC.mdc §2.2
 */
export function getAccountATR(account: AccountData): number {
  // Priority: calculated (from DB function) → raw atr → 0
  return account.calculated_atr || account.atr || 0;
}

/**
 * Check if an account has meaningful ATR (greater than 0)
 */
export function hasATR(account: AccountData): boolean {
  return getAccountATR(account) > 0;
}

/**
 * IS RENEWAL OPPORTUNITY
 * ----------------------
 * Checks if an opportunity should be included in ATR calculations.
 * 
 * CRITICAL RULE: Only opportunities with opportunity_type = 'Renewals' count!
 * 
 * This is case-insensitive and trims whitespace for data quality.
 * 
 * @see MASTER_LOGIC.mdc §2.2
 */
export function isRenewalOpportunity(opportunity: OpportunityData): boolean {
  // Normalize and compare - handles case and whitespace variations
  return (
    opportunity.opportunity_type?.toLowerCase().trim() === 'renewals'
  );
}

/**
 * CALCULATE ATR FROM OPPORTUNITIES
 * ---------------------------------
 * Sums up the available_to_renew from renewal opportunities only.
 * 
 * Use this when you need to compute ATR from raw opportunity data.
 * Usually, you'll use getAccountATR() instead which uses pre-computed values.
 * 
 * @example
 * const accountOpps = opportunities.filter(o => o.sfdc_account_id === accountId);
 * const atr = calculateATRFromOpportunities(accountOpps);
 */
export function calculateATRFromOpportunities(opportunities: OpportunityData[]): number {
  return opportunities
    .filter(isRenewalOpportunity)  // Only renewal opportunities
    .reduce((sum, opp) => sum + (opp.available_to_renew || 0), 0);
}

// =============================================================================
// PIPELINE CALCULATIONS
// =============================================================================

/**
 * GET OPPORTUNITY PIPELINE VALUE
 * ------------------------------
 * Returns the pipeline value for a single opportunity.
 * 
 * Pipeline = potential revenue from deals that haven't closed yet
 * This applies to PROSPECT accounts, not customers.
 * 
 * Priority: net_arr → amount → 0
 */
export function getOpportunityPipelineValue(opportunity: OpportunityData): number {
  return opportunity.net_arr || opportunity.amount || 0;
}

/**
 * IS EXPANSION OPPORTUNITY
 * ------------------------
 * Checks if an opportunity is an expansion opportunity.
 * Expansion opportunities on customer accounts count toward pipeline.
 * 
 * @see MASTER_LOGIC.mdc §2.3
 */
export function isExpansionOpportunity(opportunity: OpportunityData): boolean {
  return opportunity.opportunity_type?.toLowerCase().trim() === 'expansion';
}

/**
 * IS PIPELINE OPPORTUNITY (for Customer Accounts)
 * ------------------------------------------------
 * Checks if an opportunity from a CUSTOMER account should count toward pipeline.
 * 
 * Only these types count as pipeline on customer accounts:
 * - Expansion: Growing existing product usage
 * - New Subscription: Customer buying a new product line
 * 
 * Renewals do NOT count (they go to ATR instead).
 * Blanks/Other do NOT count.
 * 
 * Note: For PROSPECT accounts, ALL opportunities count toward pipeline.
 * This function is only needed when filtering customer account opportunities.
 * 
 * @see MASTER_LOGIC.mdc §2.3
 */
export function isPipelineOpportunity(opportunity: OpportunityData): boolean {
  const oppType = opportunity.opportunity_type?.toLowerCase().trim();
  return oppType === 'expansion' || oppType === 'new subscription';
}

/**
 * CALCULATE PIPELINE FROM OPPORTUNITIES
 * -------------------------------------
 * Sums up pipeline value from all opportunities.
 * 
 * Includes:
 * - All opportunities from prospect accounts
 * - Expansion opportunities from customer accounts
 * 
 * @example
 * const pipeline = calculatePipelineFromOpportunities(allOpportunities);
 * 
 * @see MASTER_LOGIC.mdc §2.3
 */
export function calculatePipelineFromOpportunities(opportunities: OpportunityData[]): number {
  return opportunities.reduce((sum, opp) => sum + getOpportunityPipelineValue(opp), 0);
}

/**
 * CALCULATE PIPELINE WITH EXPANSION
 * ---------------------------------
 * Enhanced pipeline calculation that includes pipeline opportunities
 * from customer accounts in addition to all prospect opportunities.
 * 
 * @param prospectOpportunities - Opportunities from prospect accounts (all count)
 * @param customerOpportunities - Opportunities from customer accounts (only Expansion + New Subscription count)
 * 
 * @see MASTER_LOGIC.mdc §2.3
 */
export function calculatePipelineWithExpansion(
  prospectOpportunities: OpportunityData[],
  customerOpportunities: OpportunityData[]
): number {
  // All prospect opportunities count
  const prospectPipeline = calculatePipelineFromOpportunities(prospectOpportunities);
  
  // Only Expansion + New Subscription opportunities from customers count (not Renewals)
  const customerPipeline = customerOpportunities
    .filter(isPipelineOpportunity)
    .reduce((sum, opp) => sum + getOpportunityPipelineValue(opp), 0);
  
  return prospectPipeline + customerPipeline;
}

// =============================================================================
// BALANCE TARGET CALCULATIONS
// =============================================================================

/**
 * CALCULATE BALANCE TARGET
 * ------------------------
 * Determines the target value each rep should have for fair distribution.
 * 
 * Formula: Target = Total Value / Number of Active Reps
 * 
 * Used for ARR, ATR, Pipeline, and Account Count balancing.
 * 
 * @example
 * const totalARR = customers.reduce((sum, a) => sum + getAccountARR(a), 0);
 * const targetARRPerRep = calculateBalanceTarget(totalARR, activeReps.length);
 */
export function calculateBalanceTarget(totalValue: number, repCount: number): number {
  if (repCount <= 0) return 0;
  return totalValue / repCount;
}

/**
 * CALCULATE BALANCE RANGE
 * -----------------------
 * Returns the acceptable min/max range based on target and variance.
 * 
 * Reps should fall within this range for fair distribution.
 * Outside this range = imbalanced and needs adjustment.
 * 
 * @param target - The target value per rep
 * @param variancePercent - Variance as decimal (e.g., 0.25 for ±25%)
 * 
 * @example
 * const { min, max } = calculateBalanceRange(1000000, 0.25);
 * // min = 750000, max = 1250000
 */
export function calculateBalanceRange(
  target: number,
  variancePercent: number
): { min: number; max: number } {
  return {
    min: target * (1 - variancePercent),
    max: target * (1 + variancePercent),
  };
}

/**
 * CALCULATE BALANCE MAX
 * ---------------------
 * Determines the maximum value a rep should hold for balanced distribution.
 * 
 * Formula: MAX(target × 1.5, largestAccountValue × 1.2)
 * 
 * WHY THIS FORMULA:
 * - `target × 1.5` allows 50% variance from the average
 * - `largestAccount × 1.2` ensures every account can fit somewhere
 *   (if max < largest account, that account could never be assigned)
 * 
 * The larger of the two is used to handle edge cases:
 * - Small books: largest account may dominate, so use that
 * - Large books: average-based limit is more meaningful
 * 
 * @param target - The target value per rep (totalValue / repCount)
 * @param largestAccountValue - The largest single account's value
 * @param targetMultiplier - Multiplier for target (default 1.5 = 50% over average)
 * @param largestMultiplier - Multiplier for largest account (default 1.2 = 20% buffer)
 * 
 * @see MASTER_LOGIC.mdc §12.1.1
 * 
 * @example
 * const target = calculateBalanceTarget(totalARR, repCount);
 * const largestARR = Math.max(...accounts.map(a => getAccountARR(a)));
 * const maxARRPerRep = calculateBalanceMax(target, largestARR);
 * // If target=$1M and largest=$2M: MAX($1.5M, $2.4M) = $2.4M
 * // If target=$5M and largest=$1M: MAX($7.5M, $1.2M) = $7.5M
 */
export function calculateBalanceMax(
  target: number,
  largestAccountValue: number,
  targetMultiplier: number = 1.5,
  largestMultiplier: number = 1.2
): number {
  return Math.max(
    target * targetMultiplier,
    largestAccountValue * largestMultiplier
  );
}

// =============================================================================
// FORMATTING UTILITIES
// =============================================================================

/**
 * FORMAT CURRENCY
 * ---------------
 * Formats a number as USD currency string.
 * 
 * @example
 * formatCurrency(1234567) // → '$1,234,567'
 * formatCurrency(0)        // → '$0'
 * formatCurrency(null)     // → '$0'
 */
export function formatCurrency(value: number | null | undefined): string {
  if (!value || value === 0) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * FORMAT CURRENCY COMPACT
 * -----------------------
 * Formats large numbers with K/M/B suffixes for compact display.
 * 
 * @example
 * formatCurrencyCompact(1500000)    // → '$1.5M'
 * formatCurrencyCompact(500000)     // → '$500K'
 * formatCurrencyCompact(2500000000) // → '$2.5B'
 */
export function formatCurrencyCompact(value: number | null | undefined): string {
  if (!value || value === 0) return '$0';
  
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

// =============================================================================
// CONTINUITY TRACKING
// =============================================================================

/**
 * GET VALID REP IDS FOR CONTINUITY
 * --------------------------------
 * Builds a set of rep IDs eligible for continuity tracking.
 * 
 * Excludes backfill sources because they are leaving - accounts can't be
 * "retained" with a rep who is departing.
 * 
 * WHY THIS MATTERS:
 * Accounts whose past owner isn't in the current reps list (or is leaving)
 * can never have continuity. Including them in the denominator artificially
 * deflates the continuity percentage. By filtering to only eligible accounts,
 * we get an accurate measure of retention for preservable relationships.
 * 
 * @example
 * const validRepIds = getValidRepIdsForContinuity(salesReps);
 * const eligible = accounts.filter(a => validRepIds.has(a.owner_id));
 * 
 * @see MASTER_LOGIC.mdc §13.4 (Continuity Eligibility)
 */
export function getValidRepIdsForContinuity(
  salesReps: { rep_id: string; is_backfill_source?: boolean }[]
): Set<string> {
  return new Set(
    salesReps
      .filter(r => !r.is_backfill_source)
      .map(r => r.rep_id)
  );
}

/**
 * IS ELIGIBLE FOR CONTINUITY TRACKING
 * -----------------------------------
 * Checks if an account's original owner is eligible for continuity tracking.
 * 
 * Returns false if:
 * - owner_id is null/undefined (no original owner)
 * - owner_id is not in the current reps list (owner left company)
 * - owner is a backfill source (leaving the team)
 * 
 * USE THIS to filter accounts before calculating continuity percentage.
 * Only accounts that COULD be retained should count in the denominator.
 * 
 * @example
 * const validRepIds = getValidRepIdsForContinuity(salesReps);
 * const eligibleAccounts = accounts.filter(a => 
 *   isEligibleForContinuityTracking(a.owner_id, validRepIds)
 * );
 * const continuity = retained.length / eligibleAccounts.length;
 * 
 * @see MASTER_LOGIC.mdc §13.4 (Continuity Eligibility)
 */
export function isEligibleForContinuityTracking(
  ownerId: string | null | undefined,
  validRepIds: Set<string>
): boolean {
  if (!ownerId) return false;
  return validRepIds.has(ownerId);
}

// =============================================================================
// REP BOOK METRICS
// =============================================================================

/**
 * REP BOOK METRICS
 * ----------------
 * Aggregated metrics for a sales rep's book of accounts.
 * Used for before/after comparison when reassigning accounts.
 * 
 * @see MASTER_LOGIC.mdc §13.7
 */
export interface RepBookMetrics {
  /** Total number of parent accounts in the book */
  accountCount: number;
  
  /** Number of customer accounts (is_customer = true) */
  customerCount: number;
  
  /** Number of prospect accounts (is_customer = false) */
  prospectCount: number;
  
  /** Total ARR across all accounts */
  totalARR: number;
  
  /** Total ATR across customer accounts */
  totalATR: number;
  
  /** Total pipeline value from opportunities */
  totalPipeline: number;
  
  /** Count breakdown by expansion tier */
  tierBreakdown: {
    tier1: number;
    tier2: number;
    tier3: number;
    tier4: number;
    unclassified: number;
  };
  
  /** Total CRE cases across all accounts */
  creRiskCount: number;
}

/**
 * Extended account data for rep book metrics calculation.
 * Extends AccountData with additional fields needed for tier/CRE tracking.
 */
export interface RepBookAccountData extends AccountData {
  /** Expansion tier classification */
  expansion_tier?: string | null;
  
  /** Initial sale tier (fallback for expansion_tier) */
  initial_sale_tier?: string | null;
  
  /** Count of Customer Renewal at Risk events */
  cre_count?: number | null;
  
  /** Pipeline value for prospects */
  pipeline_value?: number | null;
  
  /** Whether account is locked from reassignment */
  exclude_from_reassignment?: boolean | null;
}

/**
 * CALCULATE REP BOOK METRICS
 * --------------------------
 * Aggregates all key metrics for a rep's book of accounts.
 * 
 * This is a pure function - it calculates metrics from provided data
 * without any side effects or async operations.
 * 
 * USES:
 * - Reassignment impact preview (before/after comparison)
 * - Rep workload visualization
 * - Balance assessment
 * 
 * @param accounts - Array of accounts owned by the rep
 * @param pipelineByAccount - Map of sfdc_account_id to pipeline value (from opportunities)
 * 
 * @example
 * const metrics = calculateRepBookMetrics(repAccounts, pipelineMap);
 * console.log(`${metrics.customerCount} customers, $${metrics.totalARR} ARR`);
 * 
 * @see MASTER_LOGIC.mdc §13.7
 */
export function calculateRepBookMetrics(
  accounts: RepBookAccountData[],
  pipelineByAccount: Map<string, number> = new Map()
): RepBookMetrics {
  const metrics: RepBookMetrics = {
    accountCount: 0,
    customerCount: 0,
    prospectCount: 0,
    totalARR: 0,
    totalATR: 0,
    totalPipeline: 0,
    tierBreakdown: {
      tier1: 0,
      tier2: 0,
      tier3: 0,
      tier4: 0,
      unclassified: 0,
    },
    creRiskCount: 0,
  };

  for (const account of accounts) {
    // Count accounts
    metrics.accountCount++;
    
    // Customer vs Prospect
    if (isCustomer(account)) {
      metrics.customerCount++;
      metrics.totalATR += getAccountATR(account);
    } else {
      metrics.prospectCount++;
    }
    
    // ARR (applies to all accounts, not just customers)
    metrics.totalARR += getAccountARR(account);
    
    // Pipeline (from map or account field)
    const pipeline = pipelineByAccount.get((account as any).sfdc_account_id) 
      ?? account.pipeline_value 
      ?? 0;
    metrics.totalPipeline += pipeline;
    
    // Tier breakdown
    const tier = account.expansion_tier?.toLowerCase().trim() 
      ?? account.initial_sale_tier?.toLowerCase().trim();
    if (tier?.includes('1')) {
      metrics.tierBreakdown.tier1++;
    } else if (tier?.includes('2')) {
      metrics.tierBreakdown.tier2++;
    } else if (tier?.includes('3')) {
      metrics.tierBreakdown.tier3++;
    } else if (tier?.includes('4')) {
      metrics.tierBreakdown.tier4++;
    } else {
      metrics.tierBreakdown.unclassified++;
    }
    
    // CRE Risk
    metrics.creRiskCount += account.cre_count ?? 0;
  }

  return metrics;
}

/**
 * CALCULATE METRICS DELTA
 * -----------------------
 * Calculates the change between two metric values.
 * Returns both absolute and percentage change.
 * 
 * @param before - Original value
 * @param after - New value
 * 
 * @example
 * const { absolute, percent } = calculateMetricsDelta(1000000, 750000);
 * // absolute = -250000, percent = -25
 * 
 * @see MASTER_LOGIC.mdc §13.7
 */
export function calculateMetricsDelta(
  before: number,
  after: number
): { absolute: number; percent: number } {
  const absolute = after - before;
  const percent = before === 0 ? (after > 0 ? 100 : 0) : ((absolute / before) * 100);
  
  return { absolute, percent };
}
