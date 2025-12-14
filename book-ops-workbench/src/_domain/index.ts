/**
 * ============================================================================
 * CORE MODULE - Single Source of Truth for Business Logic
 * ============================================================================
 * 
 * This is the central hub for all business rules in Book Builder.
 * Import everything from here rather than individual files.
 * 
 * USAGE:
 * ------
 *   import { 
 *     getAccountARR,        // from calculations.ts
 *     classifyTeamTier,     // from tiers.ts
 *     normalizeRegion,      // from normalization.ts
 *     TIER_THRESHOLDS,      // from constants.ts
 *     GEO_MATCH_SCORES,     // from constants.ts
 *   } from '@/_domain';
 * 
 * MODULE OVERVIEW:
 * ----------------
 * - calculations.ts  → ARR, ATR, Pipeline formulas
 * - tiers.ts         → SMB/Growth/MM/ENT classification
 * - geography.ts     → Region hierarchy & territory mapping
 * - constants.ts     → Thresholds, defaults, magic numbers
 * - normalization.ts → Typo handling for imports
 * 
 * DOCUMENTATION:
 * --------------
 * Full documentation: src/core/MASTER_LOGIC.md
 * 
 * CONTRIBUTING:
 * -------------
 * When adding new business logic:
 * 1. Add to appropriate module (or create new one)
 * 2. Export from this index.ts
 * 3. Update MASTER_LOGIC.md
 * 4. Add JSDoc with @see link to the doc
 * 
 * ============================================================================
 */

// Re-export all domain modules
// Each module handles a specific area of business logic

/** ARR, ATR, Pipeline calculations */
export * from './calculations';

/** Team tier (SMB/Growth/MM/ENT) and expansion tier classification */
export * from './tiers';

/** Region hierarchy, territory mapping, geo scoring */
export * from './geography';

/** Thresholds, defaults, configuration values */
export * from './constants';

/** Typo handling and data normalization */
export * from './normalization';

