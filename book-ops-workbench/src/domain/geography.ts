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
 *   } from '@/domain';
 * 
 * DOCUMENTATION: docs/core/business_logic.md#3-geography--territory-mapping
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
 * Used for:
 * - Determining if two regions are siblings
 * - Calculating geo match scores
 * - Validating region assignments
 * 
 * @see docs/core/business_logic.md#region-hierarchy
 */
export const REGION_HIERARCHY: Record<ParentRegion, string[]> = {
  AMER: ['North East', 'South East', 'Central', 'West'],
  EMEA: ['UK', 'DACH', 'France', 'Nordics', 'Southern Europe'],
  APAC: ['ANZ', 'Japan', 'Southeast Asia', 'India'],
};

/**
 * REGION SIBLINGS
 * ---------------
 * Maps each sub-region to its sibling regions (same parent).
 * 
 * Used for geo scoring:
 * - Exact match = 1.0
 * - Sibling match = 0.65 (this map)
 * - Same parent = 0.40
 * - Cross-region = 0.20
 */
export const REGION_SIBLINGS: Record<string, string[]> = {
  'North East': ['South East', 'Central', 'West'],
  'South East': ['North East', 'Central', 'West'],
  'Central': ['North East', 'South East', 'West'],
  'West': ['North East', 'South East', 'Central'],
  'UK': ['DACH', 'France', 'Nordics', 'Southern Europe'],
  'DACH': ['UK', 'France', 'Nordics', 'Southern Europe'],
  'France': ['UK', 'DACH', 'Nordics', 'Southern Europe'],
  'Nordics': ['UK', 'DACH', 'France', 'Southern Europe'],
  'Southern Europe': ['UK', 'DACH', 'France', 'Nordics'],
  'ANZ': ['Japan', 'Southeast Asia', 'India'],
  'Japan': ['ANZ', 'Southeast Asia', 'India'],
  'Southeast Asia': ['ANZ', 'Japan', 'India'],
  'India': ['ANZ', 'Japan', 'Southeast Asia'],
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
 * @see docs/core/business_logic.md#auto-mapping-patterns
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
 * @see docs/core/business_logic.md#territory-mapping-logic
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
 * @see docs/core/business_logic.md#geo-match-score-for-optimization
 */
export function calculateGeoMatchScore(
  accountRegion: string | null,
  repRegion: string | null
): number {
  if (!accountRegion || !repRegion) return GEO_MATCH_SCORES.UNKNOWN;
  
  const normAccount = accountRegion.trim();
  const normRep = repRegion.trim();
  
  // Exact match
  if (normAccount.toLowerCase() === normRep.toLowerCase()) {
    return GEO_MATCH_SCORES.EXACT_MATCH;
  }
  
  // Sibling region (same parent)
  const siblings = REGION_SIBLINGS[normRep];
  if (siblings?.some(s => s.toLowerCase() === normAccount.toLowerCase())) {
    return GEO_MATCH_SCORES.SIBLING_REGION;
  }
  
  // Same parent region
  const accountParent = getParentRegion(normAccount);
  const repParent = getParentRegion(normRep);
  if (accountParent && repParent && accountParent === repParent) {
    return GEO_MATCH_SCORES.SAME_PARENT;
  }
  
  // Cross-region
  if (accountParent && repParent) {
    return GEO_MATCH_SCORES.CROSS_REGION;
  }
  
  return GEO_MATCH_SCORES.UNKNOWN;
}

