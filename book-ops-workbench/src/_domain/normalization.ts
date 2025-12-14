/**
 * ============================================================================
 * DATA NORMALIZATION - Handle Typos, Variations, and Non-Standard Values
 * ============================================================================
 * 
 * Imported data is messy! This module normalizes values to ensure consistency.
 * 
 * COMMON PROBLEMS THIS SOLVES:
 * - Region variations: "NYC", "California", "Global" → proper region names
 * - PE firm typos: "JMI" vs "JMI Private Equity" vs "JMI Equity"
 * - Team tier variations: "grwth", "enterprise", "small business"
 * 
 * HOW TO ADD NEW ALIASES:
 * 1. Find the appropriate *_ALIASES constant below
 * 2. Add the lowercase variation as the key
 * 3. Add the canonical value as the value
 * 4. Update src/core/MASTER_LOGIC.md#data-normalization
 * 
 * USAGE:
 *   import { normalizeRegion, normalizePEFirm } from '@/_domain';
 *   
 *   const region = normalizeRegion('NYC');  // → 'North East'
 *   const pe = normalizePEFirm('JMI');      // → 'JMI Private Equity'
 * 
 * DOCUMENTATION: src/core/MASTER_LOGIC.md#data-normalization
 * 
 * ============================================================================
 */

// =============================================================================
// REGION/TERRITORY NORMALIZATION
// =============================================================================

/**
 * Common aliases and typos for regions
 * Maps non-standard values → standard region names
 */
export const REGION_ALIASES: Record<string, string> = {
  // Global/catch-all → needs manual mapping or default
  'global': 'UNMAPPED',
  'worldwide': 'UNMAPPED',
  'all': 'UNMAPPED',
  'n/a': 'UNMAPPED',
  'na': 'UNMAPPED',
  'tbd': 'UNMAPPED',
  '': 'UNMAPPED',
  
  // NYC variations → North East
  'nyc': 'North East',
  'new york': 'North East',
  'new york city': 'North East',
  'ny': 'North East',
  'manhattan': 'North East',
  'brooklyn': 'North East',
  'tri-state': 'North East',
  'tristate': 'North East',
  
  // California variations → West
  'california': 'West',
  'ca': 'West',
  'san francisco': 'West',
  'sf': 'West',
  'bay area': 'West',
  'los angeles': 'West',
  'la': 'West',
  'san diego': 'West',
  'silicon valley': 'West',
  'norcal': 'West',
  'nor cal': 'West',
  'socal': 'West',
  'so cal': 'West',
  
  // Texas variations → South East
  'texas': 'South East',
  'tx': 'South East',
  'dallas': 'South East',
  'houston': 'South East',
  'austin': 'South East',
  'san antonio': 'South East',
  
  // Florida variations → South East
  'florida': 'South East',
  'fl': 'South East',
  'miami': 'South East',
  'tampa': 'South East',
  'orlando': 'South East',
  
  // Chicago variations → Central
  'chicago': 'Central',
  'illinois': 'Central',
  'il': 'Central',
  'midwest': 'Central',
  'mid-west': 'Central',
  
  // Denver variations → Central
  'denver': 'Central',
  'colorado': 'Central',
  'co': 'Central',
  
  // Seattle/Pacific NW → West
  'seattle': 'West',
  'washington': 'West',
  'wa': 'West',
  'pacific northwest': 'West',
  'pac nw': 'West',
  'portland': 'West',
  'oregon': 'West',
  'or': 'West',
  
  // Boston/New England → North East
  'boston': 'North East',
  'massachusetts': 'North East',
  'ma': 'North East',
  'new england': 'North East',
  
  // DC/Mid-Atlantic → South East
  'dc': 'South East',
  'washington dc': 'South East',
  'washington d.c.': 'South East',
  'mid-atlantic': 'South East',
  'mid atlantic': 'South East',
  'virginia': 'South East',
  'va': 'South East',
  'maryland': 'South East',
  'md': 'South East',
  
  // EMEA variations
  'emea': 'EMEA',
  'europe': 'EMEA',
  'uk': 'UK',
  'united kingdom': 'UK',
  'britain': 'UK',
  'great britain': 'UK',
  'england': 'UK',
  'london': 'UK',
  'germany': 'DACH',
  'dach': 'DACH',
  'france': 'France',
  'paris': 'France',
  'nordics': 'Nordics',
  'scandinavia': 'Nordics',
  
  // APAC variations
  'apac': 'APAC',
  'asia': 'APAC',
  'asia pacific': 'APAC',
  'australia': 'ANZ',
  'anz': 'ANZ',
  'new zealand': 'ANZ',
  'japan': 'Japan',
  'singapore': 'Southeast Asia',
  'india': 'India',
  
  // Standard region names (pass through)
  'north east': 'North East',
  'northeast': 'North East',
  'south east': 'South East',
  'southeast': 'South East',
  'central': 'Central',
  'west': 'West',
  'amer': 'AMER',
  'americas': 'AMER',
};

/**
 * Normalize a region/territory value to standard format
 * 
 * @param value - Raw region value from import
 * @returns Normalized region name or 'UNMAPPED' if no match
 * 
 * @example
 * normalizeRegion('NYC') // → 'North East'
 * normalizeRegion('California') // → 'West'
 * normalizeRegion('Global') // → 'UNMAPPED'
 */
export function normalizeRegion(value: string | null | undefined): string {
  if (!value) return 'UNMAPPED';
  
  const normalized = value.toLowerCase().trim();
  
  // Check direct alias match
  if (REGION_ALIASES[normalized]) {
    return REGION_ALIASES[normalized];
  }
  
  // Check if value contains any alias as a substring
  for (const [alias, region] of Object.entries(REGION_ALIASES)) {
    if (alias && normalized.includes(alias)) {
      return region;
    }
  }
  
  // Return original value if it looks like a valid region name
  const titleCase = value.trim().split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  
  return titleCase || 'UNMAPPED';
}

/**
 * Check if a region value needs normalization
 */
export function regionNeedsNormalization(value: string | null | undefined): boolean {
  if (!value) return true;
  const normalized = normalizeRegion(value);
  return normalized === 'UNMAPPED' || normalized !== value;
}

// =============================================================================
// PE Firm Normalization
// =============================================================================

/**
 * Common PE firm name variations and typos
 * Maps variations → canonical firm name
 */
export const PE_FIRM_ALIASES: Record<string, string> = {
  // JMI
  'jmi': 'JMI Private Equity',
  'jmi equity': 'JMI Private Equity',
  'jmi private equity': 'JMI Private Equity',
  'jmi pe': 'JMI Private Equity',
  
  // PSG
  'psg': 'PSG Private Equity',
  'psg equity': 'PSG Private Equity',
  'psg private equity': 'PSG Private Equity',
  'psg pe': 'PSG Private Equity',
  
  // TPG
  'tpg': 'TPG Capital',
  'tpg capital': 'TPG Capital',
  'tpg capital private equity': 'TPG Capital',
  'tpg pe': 'TPG Capital',
  
  // Bregal
  'bregal': 'Bregal Sagemount',
  'bregal sagemount': 'Bregal Sagemount',
  'bregal sagemount private equity': 'Bregal Sagemount',
  
  // LLR
  'llr': 'LLR Partners',
  'llr partners': 'LLR Partners',
  'llr equity': 'LLR Partners',
  
  // Vista
  'vista': 'Vista Equity Partners',
  'vista equity': 'Vista Equity Partners',
  'vista equity partners': 'Vista Equity Partners',
  
  // Thoma Bravo
  'thoma bravo': 'Thoma Bravo',
  'thoma': 'Thoma Bravo',
  'thomabravo': 'Thoma Bravo',
  
  // Silver Lake
  'silver lake': 'Silver Lake',
  'silverlake': 'Silver Lake',
  
  // Insight
  'insight': 'Insight Partners',
  'insight partners': 'Insight Partners',
  'insight venture partners': 'Insight Partners',
  
  // General Atlantic
  'ga': 'General Atlantic',
  'general atlantic': 'General Atlantic',
  
  // Empty/None
  '': null,
  'n/a': null,
  'na': null,
  'none': null,
  'null': null,
  '-': null,
};

/**
 * Normalize a PE firm name to canonical format
 * 
 * @param value - Raw PE firm name from import
 * @returns Normalized firm name or null if empty/unknown
 * 
 * @example
 * normalizePEFirm('JMI') // → 'JMI Private Equity'
 * normalizePEFirm('tpg capital private equity') // → 'TPG Capital'
 */
export function normalizePEFirm(value: string | null | undefined): string | null {
  if (!value) return null;
  
  const normalized = value.toLowerCase().trim();
  
  // Check for empty/null values
  if (PE_FIRM_ALIASES[normalized] === null) {
    return null;
  }
  
  // Check direct alias match
  if (PE_FIRM_ALIASES[normalized]) {
    return PE_FIRM_ALIASES[normalized];
  }
  
  // Check if value contains any known firm name
  for (const [alias, canonical] of Object.entries(PE_FIRM_ALIASES)) {
    if (alias && canonical && normalized.includes(alias)) {
      return canonical;
    }
  }
  
  // Return original value with title case if no match
  return value.trim();
}

// =============================================================================
// Team Tier Normalization
// =============================================================================

/**
 * Normalize team tier values
 */
export const TEAM_TIER_ALIASES: Record<string, string> = {
  'smb': 'SMB',
  'small': 'SMB',
  'small business': 'SMB',
  
  'growth': 'Growth',
  'grwth': 'Growth', // common typo
  
  'mm': 'MM',
  'mid market': 'MM',
  'mid-market': 'MM',
  'midmarket': 'MM',
  
  'ent': 'ENT',
  'enterprise': 'ENT',
  'large': 'ENT',
  'strategic': 'ENT',
};

/**
 * Normalize team tier value
 */
export function normalizeTeamTier(value: string | null | undefined): string | null {
  if (!value) return null;
  
  const normalized = value.toLowerCase().trim();
  return TEAM_TIER_ALIASES[normalized] || value.toUpperCase();
}

// =============================================================================
// Generic String Normalization
// =============================================================================

/**
 * Clean and normalize a string value
 * - Trims whitespace
 * - Normalizes unicode
 * - Removes extra spaces
 */
export function normalizeString(value: string | null | undefined): string {
  if (!value) return '';
  
  return value
    .trim()
    .normalize('NFKC') // Normalize unicode
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .replace(/[\u200B-\u200D\uFEFF]/g, ''); // Remove zero-width chars
}

/**
 * Check if two strings are equivalent after normalization
 */
export function stringsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const normA = normalizeString(a).toLowerCase();
  const normB = normalizeString(b).toLowerCase();
  return normA === normB;
}

// =============================================================================
// Batch Normalization
// =============================================================================

export interface NormalizationResult {
  original: string;
  normalized: string;
  wasChanged: boolean;
}

/**
 * Normalize an array of region values and return statistics
 */
export function normalizeRegions(values: string[]): {
  results: NormalizationResult[];
  stats: { total: number; changed: number; unmapped: number };
} {
  const results = values.map(v => ({
    original: v,
    normalized: normalizeRegion(v),
    wasChanged: normalizeRegion(v) !== v,
  }));
  
  return {
    results,
    stats: {
      total: values.length,
      changed: results.filter(r => r.wasChanged).length,
      unmapped: results.filter(r => r.normalized === 'UNMAPPED').length,
    },
  };
}

