/**
 * ============================================================================
 * TIER CLASSIFICATION LOGIC
 * ============================================================================
 * 
 * This module handles all tier-related classifications:
 * 
 * 1. TEAM TIERS (SMB, Growth, MM, ENT) - Based on employee count
 *    Used for: Account-Rep alignment, workload balancing
 * 
 * 2. EXPANSION TIERS (Tier 1-4) - Based on scoring/potential
 *    Used for: Prioritization, focus lists
 * 
 * DO NOT hardcode tier thresholds elsewhere! Import from here:
 * 
 *   import { classifyTeamTier, TIER_THRESHOLDS } from '@/domain';
 * 
 * DOCUMENTATION: docs/core/business_logic.md#team-tiers-employee-based
 * 
 * ============================================================================
 */

import { TIER_THRESHOLDS, HIGH_VALUE_ARR_THRESHOLD } from './constants';

// =============================================================================
// TYPES
// =============================================================================

/**
 * TEAM TIER
 * ---------
 * Classification based on employee count.
 * Used to match accounts with reps who specialize in that segment.
 * 
 * SMB = Small Business (scrappy, high volume)
 * Growth = Scaling companies (transitioning)
 * MM = Mid-Market (established, complex deals)
 * ENT = Enterprise (large, strategic, long sales cycles)
 */
export type TeamTier = 'SMB' | 'Growth' | 'MM' | 'ENT';

/**
 * EXPANSION TIER
 * --------------
 * Classification based on potential/scoring.
 * Used for prioritization and focus.
 * 
 * Tier 1 = Highest potential, most attention
 * Tier 4 = Lowest potential, maintenance mode
 */
export type ExpansionTier = 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Tier 4';

/**
 * Order of team tiers from smallest to largest.
 * Used for calculating tier distance in alignment scoring.
 */
export const TEAM_TIER_ORDER: TeamTier[] = ['SMB', 'Growth', 'MM', 'ENT'];

// =============================================================================
// TEAM TIER CLASSIFICATION (EMPLOYEE-BASED)
// =============================================================================

/**
 * CLASSIFY TEAM TIER
 * ------------------
 * Determines the team tier based on employee count.
 * 
 * THRESHOLDS (from constants.ts):
 * - SMB:    < 100 employees   (TIER_THRESHOLDS.SMB_MAX = 99)
 * - Growth: 100-499 employees (TIER_THRESHOLDS.GROWTH_MAX = 499)
 * - MM:     500-1499 employees (TIER_THRESHOLDS.MM_MAX = 1499)
 * - ENT:    1500+ employees
 * 
 * NULL/UNDEFINED HANDLING:
 * If employee count is unknown, defaults to SMB (smallest tier).
 * This is a conservative approach - better to underestimate than overestimate.
 * 
 * @example
 * classifyTeamTier(50)    // → 'SMB'
 * classifyTeamTier(250)   // → 'Growth'
 * classifyTeamTier(800)   // → 'MM'
 * classifyTeamTier(5000)  // → 'ENT'
 * classifyTeamTier(null)  // → 'SMB' (default)
 * 
 * @see docs/core/business_logic.md#team-tiers-employee-based
 */
export function classifyTeamTier(employees: number | null | undefined): TeamTier {
  // No data? Default to SMB (conservative estimate)
  if (employees === null || employees === undefined || employees <= TIER_THRESHOLDS.SMB_MAX) {
    return 'SMB';
  }
  
  // Growth tier: 100-499 employees
  if (employees <= TIER_THRESHOLDS.GROWTH_MAX) {
    return 'Growth';
  }
  
  // Mid-Market tier: 500-1499 employees
  if (employees <= TIER_THRESHOLDS.MM_MAX) {
    return 'MM';
  }
  
  // Enterprise tier: 1500+ employees
  return 'ENT';
}

/**
 * GET TIER INDEX
 * --------------
 * Returns the numeric position of a tier in the tier order.
 * Used for calculating alignment penalties.
 * 
 * SMB = 0, Growth = 1, MM = 2, ENT = 3
 * 
 * Returns -1 for unknown tiers.
 */
export function getTierIndex(tier: TeamTier | string | null | undefined): number {
  if (!tier) return -1;
  const idx = TEAM_TIER_ORDER.indexOf(tier as TeamTier);
  return idx >= 0 ? idx : -1;
}

/**
 * GET TIER DISTANCE
 * -----------------
 * Calculates how many tier levels apart two tiers are.
 * Used for alignment penalty calculation in optimization.
 * 
 * SCORING:
 * - 0 = Perfect match (no penalty)
 * - 1 = One level apart (small penalty)
 * - 2+ = Two or more levels apart (large penalty)
 * 
 * @example
 * getTierDistance('SMB', 'SMB')     // → 0 (perfect)
 * getTierDistance('SMB', 'Growth')  // → 1 (one level)
 * getTierDistance('SMB', 'ENT')     // → 3 (three levels!)
 * 
 * @see docs/core/business_logic.md#team-tiers-employee-based
 */
export function getTierDistance(tier1: TeamTier, tier2: TeamTier): number {
  const idx1 = getTierIndex(tier1);
  const idx2 = getTierIndex(tier2);
  
  // Unknown tier? Treat as 2-level mismatch (moderate penalty)
  if (idx1 < 0 || idx2 < 0) return 2;
  
  return Math.abs(idx1 - idx2);
}

// =============================================================================
// ENTERPRISE CLASSIFICATION (LEGACY)
// =============================================================================

/**
 * Parameters needed for enterprise classification
 */
export interface EnterpriseCheckParams {
  /** Explicit enterprise/commercial flag from Salesforce */
  enterprise_vs_commercial?: string | null;
  
  /** Employee count for threshold check */
  employees?: number | null;
  
  /** ARR for high-value check */
  arr?: number | null;
  
  /** Optional custom threshold (default: 1500) */
  enterpriseThreshold?: number;
}

/**
 * IS ENTERPRISE
 * -------------
 * Legacy classification - determines if account is "Enterprise" tier.
 * 
 * An account is Enterprise if ANY of these are true:
 * 1. enterprise_vs_commercial field = 'Enterprise'
 * 2. employees > threshold (default 1500)
 * 3. ARR > $100,000 (high-value indicator)
 * 
 * WHY MULTIPLE CRITERIA:
 * - Some imports have explicit flags
 * - Some rely on employee count
 * - Some small companies have big contracts (high ARR)
 * 
 * @example
 * isEnterprise({ enterprise_vs_commercial: 'Enterprise' }) // → true
 * isEnterprise({ employees: 2000 })                        // → true
 * isEnterprise({ arr: 150000 })                            // → true
 * isEnterprise({ employees: 50, arr: 5000 })               // → false
 * 
 * @see docs/core/business_logic.md#enterprise-classification-legacy
 */
export function isEnterprise(account: EnterpriseCheckParams): boolean {
  const threshold = account.enterpriseThreshold ?? 1500;
  
  return (
    // Explicit Salesforce flag
    account.enterprise_vs_commercial === 'Enterprise' ||
    
    // Large employee count
    (account.employees != null && account.employees > threshold) ||
    
    // High-value contract (small company, big deal)
    (account.arr != null && account.arr > HIGH_VALUE_ARR_THRESHOLD)
  );
}

// =============================================================================
// EXPANSION TIER HELPERS
// =============================================================================

/**
 * PARSE EXPANSION TIER
 * --------------------
 * Normalizes expansion tier values from various import formats.
 * 
 * Handles common variations:
 * - "Tier 1", "1", "T1", "High" → Tier 1
 * - "Tier 2", "2", "T2", "Medium" → Tier 2
 * - etc.
 * 
 * @example
 * parseExpansionTier('Tier 1')  // → 'Tier 1'
 * parseExpansionTier('1')       // → 'Tier 1'
 * parseExpansionTier('High')    // → 'Tier 1'
 * parseExpansionTier('junk')    // → null
 */
export function parseExpansionTier(value: string | null | undefined): ExpansionTier | null {
  if (!value) return null;
  
  const normalized = value.toLowerCase().trim();
  
  // Check for tier indicators
  if (normalized.includes('1') || normalized === 'high') return 'Tier 1';
  if (normalized.includes('2') || normalized === 'medium') return 'Tier 2';
  if (normalized.includes('3') || normalized === 'low') return 'Tier 3';
  if (normalized.includes('4') || normalized === 'minimal') return 'Tier 4';
  
  return null;
}

/**
 * GET ACCOUNT EXPANSION TIER
 * --------------------------
 * Extracts expansion tier from account fields.
 * Checks expansion_tier first, then falls back to initial_sale_tier.
 * 
 * WHY TWO FIELDS:
 * - expansion_tier: For existing customers (upsell potential)
 * - initial_sale_tier: For new deals (close probability)
 * 
 * @example
 * getAccountExpansionTier({ expansion_tier: 'Tier 1' })       // → 'Tier 1'
 * getAccountExpansionTier({ initial_sale_tier: 'High' })      // → 'Tier 1'
 * getAccountExpansionTier({ expansion_tier: null })           // → null
 */
export function getAccountExpansionTier(account: {
  expansion_tier?: string | null;
  initial_sale_tier?: string | null;
}): ExpansionTier | null {
  // Try expansion tier first (customers), then initial sale tier (prospects)
  return (
    parseExpansionTier(account.expansion_tier) ||
    parseExpansionTier(account.initial_sale_tier)
  );
}
