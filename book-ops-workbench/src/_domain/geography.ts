/**
 * ============================================================================
 * GEOGRAPHY & TERRITORY MAPPING
 * ============================================================================
 * 
 * This module handles all geographic/territorial logic:
 * - Region hierarchy (AMER → North East, South East, Central, West)
 * - Territory-to-region mapping (auto-detect from strings)
 * - Geo match scoring for optimization
 * 
 * THE REGION HIERARCHY:
 * ---------------------
 * 
 *   AMER (Americas)
 *   ├── North East (NY, MA, PA, etc.)
 *   ├── South East (TX, FL, GA, etc.)
 *   ├── Central (IL, OH, CO, etc.)
 *   └── West (CA, WA, OR, etc.)
 *   
 *   EMEA (Europe, Middle East, Africa)
 *   ├── UK
 *   ├── DACH (Germany, Austria, Switzerland)
 *   ├── France
 *   ├── Nordics
 *   └── Southern Europe
 *   
 *   APAC (Asia-Pacific)
 *   ├── ANZ (Australia, New Zealand)
 *   ├── Japan
 *   ├── Southeast Asia
 *   └── India
 * 
 * USAGE:
 * ------
 *   import { 
 *     autoMapTerritoryToUSRegion,
 *     calculateGeoMatchScore,
 *     REGION_HIERARCHY
 *   } from '@/_domain';
 * 
 * @see MASTER_LOGIC.mdc §4 (Geography & Territories)
 * 
 * ============================================================================
 */

import { GEO_MATCH_SCORES } from './constants';

// =============================================================================
// TYPES
// =============================================================================

/** Top-level geographic regions */
export type ParentRegion = 'AMER' | 'EMEA' | 'APAC';

/** Sub-regions within Americas */
export type AMERSubRegion = 'North East' | 'South East' | 'Central' | 'West';

/** Sub-regions within EMEA */
export type EMEASubRegion = 'UK' | 'DACH' | 'France' | 'Nordics' | 'Southern Europe';

/** Sub-regions within APAC */
export type APACSubRegion = 'ANZ' | 'Japan' | 'Southeast Asia' | 'India';

/** Any valid region (parent or sub-region) */
export type Region = ParentRegion | AMERSubRegion | EMEASubRegion | APACSubRegion;

// =============================================================================
// REGION HIERARCHY
// =============================================================================

/**
 * REGION HIERARCHY
 * ----------------
 * Maps parent regions to their sub-regions.
 * 
 * HIERARCHY (most specific wins):
 *   Global
 *   └── AMER / EMEA / APAC  (Parent)
 *       └── North East / UK / ANZ  (Sub-Region)
 *           └── NYC / Boston / etc. (Territory - mapped dynamically)
 * 
 * SCORING BASED ON HIERARCHY:
 * - Exact match: 1.00 (NYC → NYC)
 * - Same sub-region: 0.85 (NYC → North East)
 * - Same parent: 0.65 (NYC → AMER)
 * - Global fallback: 0.40 (NYC → Global)
 * - Cross-region: 0.20 (NYC → EMEA)
 * 
 * @see src/_domain/MASTER_LOGIC.mdc#region-hierarchy
 */
export const REGION_HIERARCHY: Record<ParentRegion, string[]> = {
  AMER: ['North East', 'South East', 'Central', 'West'],
  EMEA: ['UK', 'DACH', 'France', 'Nordics', 'Southern Europe', 'Benelux', 'Middle East', 'Africa'],
  APAC: ['ANZ', 'Japan', 'Southeast Asia', 'India', 'Greater China', 'Korea'],
};

/**
 * REGION ANCESTRY (Upward Traversal)
 * -----------------------------------
 * Maps each region to its parent chain up to Global.
 * Used by the assignment engine to find fallback reps.
 * 
 * Example: 'North East' → ['AMER', 'Global']
 * Meaning: A North East account can fallback to AMER rep, then Global rep.
 */
export const REGION_ANCESTRY: Record<string, string[]> = {
  // AMER sub-regions
  'North East': ['AMER', 'Global'],
  'South East': ['AMER', 'Global'],
  'Central': ['AMER', 'Global'],
  'West': ['AMER', 'Global'],
  'AMER': ['Global'],
  // EMEA sub-regions
  'UK': ['EMEA', 'Global'],
  'UKI': ['EMEA', 'Global'],
  'DACH': ['EMEA', 'Global'],
  'France': ['EMEA', 'Global'],
  'Nordics': ['EMEA', 'Global'],
  'Southern Europe': ['EMEA', 'Global'],
  'Benelux': ['EMEA', 'Global'],
  'Middle East': ['EMEA', 'Global'],
  'Africa': ['EMEA', 'Global'],
  'RO-EMEA': ['EMEA', 'Global'],
  'EMEA': ['Global'],
  // APAC sub-regions
  'ANZ': ['APAC', 'Global'],
  'Japan': ['APAC', 'Global'],
  'Southeast Asia': ['APAC', 'Global'],
  'Singapore': ['APAC', 'Global'],
  'India': ['APAC', 'Global'],
  'Greater China': ['APAC', 'Global'],
  'Korea': ['APAC', 'Global'],
  'RO-APAC': ['APAC', 'Global'],
  'APAC': ['Global'],
  // Global and Other
  'Global': [],
  'Other': ['Global'],
};

/**
 * REGION SIBLINGS
 * ---------------
 * @deprecated The sibling concept is replaced by hierarchy scoring.
 * Kept for backwards compatibility - all sub-regions of same parent are "siblings".
 * Use getParentRegion() and SAME_SUB_REGION score instead.
 */
export const REGION_SIBLINGS: Record<string, string[]> = {
  // AMER
  'North East': ['South East', 'Central', 'West'],
  'South East': ['North East', 'Central', 'West'],
  'Central': ['North East', 'South East', 'West'],
  'West': ['North East', 'South East', 'Central'],
  // EMEA
  'UK': ['DACH', 'France', 'Nordics', 'Southern Europe', 'Benelux', 'Middle East', 'Africa'],
  'DACH': ['UK', 'France', 'Nordics', 'Southern Europe', 'Benelux', 'Middle East', 'Africa'],
  'France': ['UK', 'DACH', 'Nordics', 'Southern Europe', 'Benelux', 'Middle East', 'Africa'],
  'Nordics': ['UK', 'DACH', 'France', 'Southern Europe', 'Benelux', 'Middle East', 'Africa'],
  'Southern Europe': ['UK', 'DACH', 'France', 'Nordics', 'Benelux', 'Middle East', 'Africa'],
  'Benelux': ['UK', 'DACH', 'France', 'Nordics', 'Southern Europe', 'Middle East', 'Africa'],
  'Middle East': ['UK', 'DACH', 'France', 'Nordics', 'Southern Europe', 'Benelux', 'Africa'],
  'Africa': ['UK', 'DACH', 'France', 'Nordics', 'Southern Europe', 'Benelux', 'Middle East'],
  // APAC
  'ANZ': ['Japan', 'Southeast Asia', 'India', 'Greater China', 'Korea'],
  'Japan': ['ANZ', 'Southeast Asia', 'India', 'Greater China', 'Korea'],
  'Southeast Asia': ['ANZ', 'Japan', 'India', 'Greater China', 'Korea'],
  'India': ['ANZ', 'Japan', 'Southeast Asia', 'Greater China', 'Korea'],
  'Greater China': ['ANZ', 'Japan', 'Southeast Asia', 'India', 'Korea'],
  'Korea': ['ANZ', 'Japan', 'Southeast Asia', 'India', 'Greater China'],
};

// =============================================================================
// US Territory Mapping
// =============================================================================

interface RegionConfig {
  states: string[];
  cities: string[];
  keywords: string[];
}

/**
 * US region configuration for auto-mapping territories
 * @see MASTER_LOGIC.mdc §4.2
 */
export const US_REGION_CONFIG: Record<AMERSubRegion, RegionConfig> = {
  'North East': {
    states: ['ME', 'NH', 'VT', 'MA', 'RI', 'CT', 'NY', 'NJ', 'PA', 'DE'],
    cities: ['BOSTON', 'NEW YORK', 'PHILADELPHIA', 'BUFFALO', 'PITTSBURGH', 'TORONTO', 'MONTREAL', 'QUEBEC', 'OTTAWA'],
    keywords: ['NEW ENGLAND', 'QUEBEC', 'ONTARIO', 'TRI-STATE', 'NORTHEAST', 'NORTH EAST'],
  },
  'South East': {
    states: ['MD', 'DC', 'VA', 'WV', 'NC', 'SC', 'GA', 'FL', 'AL', 'MS', 'LA', 'AR', 'TN', 'KY', 'TX', 'OK'],
    cities: ['ATLANTA', 'MIAMI', 'ORLANDO', 'CHARLOTTE', 'RALEIGH', 'NASHVILLE', 'NEW ORLEANS', 'BIRMINGHAM', 'DALLAS', 'AUSTIN', 'HOUSTON', 'SAN ANTONIO', 'TAMPA'],
    keywords: ['SOUTH EAST', 'SOUTHEAST', 'GULF COAST', 'MID-ATLANTIC', 'AUSTIN – HOUSTON', 'AUSTIN - HOUSTON', 'CHESAPEAKE'],
  },
  'Central': {
    states: ['ND', 'SD', 'NE', 'KS', 'MO', 'IA', 'MN', 'WI', 'IL', 'IN', 'OH', 'MI', 'CO', 'WY', 'MT', 'ID'],
    cities: ['CHICAGO', 'MINNEAPOLIS', 'ST LOUIS', 'KANSAS CITY', 'CLEVELAND', 'COLUMBUS', 'DETROIT', 'DENVER', 'CALGARY', 'EDMONTON'],
    keywords: ['GREAT LAKES', 'MIDWEST', 'MOUNTAIN', 'ALBERTA', 'CENTRAL'],
  },
  'West': {
    states: ['WA', 'OR', 'CA', 'NV', 'UT', 'AZ', 'AK', 'HI', 'NM'],
    cities: ['SEATTLE', 'PORTLAND', 'SAN FRANCISCO', 'SAN DIEGO', 'LOS ANGELES', 'SACRAMENTO', 'LAS VEGAS', 'PHOENIX', 'TUCSON', 'SALT LAKE CITY', 'VANCOUVER', 'ALBUQUERQUE'],
    keywords: ['NOR CAL', 'SO CAL', 'PAC NW', 'PACIFIC NORTHWEST', 'BRITISH COLUMBIA', 'SOUTHWEST', 'SOUTH WEST'],
  },
};

// =============================================================================
// Territory Mapping Functions
// =============================================================================

/**
 * Auto-map a territory string to a known US region
 * 
 * **Priority:**
 * 1. Keywords (most specific)
 * 2. Cities
 * 3. State codes
 * 
 * @see MASTER_LOGIC.mdc §4.2
 */
export function autoMapTerritoryToUSRegion(territory: string): AMERSubRegion | null {
  if (!territory) return null;
  
  const normalized = territory.toUpperCase().trim();
  
  // Priority 1: Check keywords first (most specific)
  for (const [regionName, config] of Object.entries(US_REGION_CONFIG)) {
    if (config.keywords.some(keyword => normalized.includes(keyword))) {
      return regionName as AMERSubRegion;
    }
  }
  
  // Priority 2: Check cities
  for (const [regionName, config] of Object.entries(US_REGION_CONFIG)) {
    if (config.cities.some(city => normalized.includes(city))) {
      return regionName as AMERSubRegion;
    }
  }
  
  // Priority 3: Check state codes
  for (const [regionName, config] of Object.entries(US_REGION_CONFIG)) {
    if (config.states.some(state => normalized.includes(state))) {
      return regionName as AMERSubRegion;
    }
  }
  
  return null;
}

/**
 * Auto-map a territory to a parent region (AMER, EMEA, APAC)
 */
export function autoMapTerritoryToParentRegion(territory: string): ParentRegion | null {
  if (!territory) return null;
  
  const normalized = territory.toLowerCase().trim();
  
  if (normalized.includes('amer') || normalized.includes('americas') || normalized.includes('us') || normalized.includes('usa')) {
    return 'AMER';
  }
  if (normalized.includes('emea') || normalized.includes('europe') || normalized.includes('uk') || normalized.includes('germany')) {
    return 'EMEA';
  }
  if (normalized.includes('apac') || normalized.includes('asia') || normalized.includes('australia') || normalized.includes('japan')) {
    return 'APAC';
  }
  
  return null;
}

// =============================================================================
// Geo Scoring
// =============================================================================

/**
 * Get the parent region for a sub-region
 */
export function getParentRegion(region: string): ParentRegion | null {
  for (const [parent, children] of Object.entries(REGION_HIERARCHY)) {
    if (children.includes(region)) {
      return parent as ParentRegion;
    }
  }
  // Check if it's already a parent region
  if (region in REGION_HIERARCHY) {
    return region as ParentRegion;
  }
  return null;
}

/**
 * Calculate geo match score between account territory and rep region
 * 
 * HIERARCHY-BASED SCORING (more specific = higher score):
 * 
 * 1. Exact match (NYC → NYC): 1.00
 * 2. Account in rep's sub-region (NYC → North East): 0.85
 * 3. Both in same parent (NYC → AMER): 0.65
 * 4. Rep is Global (NYC → Global): 0.40
 * 5. Cross-region (NYC → EMEA): 0.20
 * 
 * @see src/_domain/MASTER_LOGIC.mdc#geo-match-scoring
 */
export function calculateGeoMatchScore(
  accountRegion: string | null,
  repRegion: string | null
): number {
  if (!accountRegion || !repRegion) return GEO_MATCH_SCORES.UNKNOWN;
  
  const normAccount = accountRegion.trim().toLowerCase();
  const normRep = repRegion.trim().toLowerCase();
  
  // Check if rep is "Global" - can take anything but lowest priority
  if (normRep === 'global' || normRep === 'worldwide') {
    return GEO_MATCH_SCORES.GLOBAL_FALLBACK;
  }
  
  // 1. Exact match (most specific)
  if (normAccount === normRep) {
    return GEO_MATCH_SCORES.EXACT_MATCH;
  }
  
  // Get parent regions for both
  const accountParent = getParentRegion(accountRegion);
  const repParent = getParentRegion(repRegion);
  
  // Check if rep's region is a parent and account is within that parent
  // e.g., Rep is "AMER", Account is "North East" → SAME_PARENT (0.65)
  if (repRegion.toUpperCase() === accountParent) {
    return GEO_MATCH_SCORES.SAME_PARENT;
  }
  
  // 2. Account is in same sub-region as rep
  // e.g., Rep is "North East", Account territory maps to "North East"
  const accountSubRegion = autoMapTerritoryToUSRegion(accountRegion);
  if (accountSubRegion && accountSubRegion.toLowerCase() === normRep) {
    return GEO_MATCH_SCORES.SAME_SUB_REGION;
  }
  
  // 3. Both in same parent region (siblings)
  if (accountParent && repParent && accountParent === repParent) {
    return GEO_MATCH_SCORES.SAME_SUB_REGION;
  }
  
  // 4. Cross-region (different parents)
  if (accountParent && repParent && accountParent !== repParent) {
    return GEO_MATCH_SCORES.CROSS_REGION;
  }
  
  return GEO_MATCH_SCORES.UNKNOWN;
}

/**
 * Alias for autoMapTerritoryToUSRegion for backwards compatibility
 */
export const autoMapTerritoryToRegion = autoMapTerritoryToUSRegion;

