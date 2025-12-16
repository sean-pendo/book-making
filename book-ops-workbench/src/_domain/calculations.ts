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
 * Enhanced pipeline calculation that includes expansion opportunities
 * from customer accounts in addition to all prospect opportunities.
 * 
 * @param prospectOpportunities - Opportunities from prospect accounts (all count)
 * @param customerOpportunities - Opportunities from customer accounts (only expansion counts)
 * 
 * @see MASTER_LOGIC.mdc §2.3
 */
export function calculatePipelineWithExpansion(
  prospectOpportunities: OpportunityData[],
  customerOpportunities: OpportunityData[]
): number {
  // All prospect opportunities count
  const prospectPipeline = calculatePipelineFromOpportunities(prospectOpportunities);
  
  // Only expansion opportunities from customers count
  const expansionPipeline = customerOpportunities
    .filter(isExpansionOpportunity)
    .reduce((sum, opp) => sum + getOpportunityPipelineValue(opp), 0);
  
  return prospectPipeline + expansionPipeline;
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
