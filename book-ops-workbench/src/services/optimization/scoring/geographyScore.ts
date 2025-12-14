/**
 * Geography Score
 * 
 * Measures how well an account's territory matches a rep's region.
 * Uses region hierarchy for scoring:
 * - Exact match: 1.0
 * - Sibling region: 0.65
 * - Same parent region: 0.40
 * - Cross-region: 0.20
 * - Unknown: 0.50
 */

import type { 
  AggregatedAccount, 
  EligibleRep, 
  LPGeographyParams 
} from '../types';
import { REGION_HIERARCHY, REGION_SIBLINGS } from '../types';

/**
 * Auto-map a territory name to a known region
 * This is a fallback when territory_mappings doesn't have an entry
 */
function autoMapTerritory(territory: string): string | null {
  if (!territory) return null;
  
  const normalized = territory.toLowerCase().trim();
  
  // Direct region names
  for (const [parent, children] of Object.entries(REGION_HIERARCHY)) {
    if (normalized === parent.toLowerCase()) {
      return parent;
    }
    for (const child of children) {
      if (normalized === child.toLowerCase()) {
        return child;
      }
    }
  }
  
  // Common patterns
  if (normalized.includes('amer') || normalized.includes('americas')) return 'AMER';
  if (normalized.includes('emea') || normalized.includes('europe')) return 'EMEA';
  if (normalized.includes('apac') || normalized.includes('asia')) return 'APAC';
  
  if (normalized.includes('northeast') || normalized.includes('north east') || normalized.includes('ne ')) return 'North East';
  if (normalized.includes('southeast') || normalized.includes('south east') || normalized.includes('se ')) return 'South East';
  if (normalized.includes('central') || normalized.includes('midwest')) return 'Central';
  if (normalized.includes('west') && !normalized.includes('east')) return 'West';
  
  if (normalized.includes('uk') || normalized.includes('united kingdom') || normalized.includes('britain')) return 'UK';
  if (normalized.includes('dach') || normalized.includes('germany') || normalized.includes('austria')) return 'DACH';
  if (normalized.includes('france') || normalized.includes('french')) return 'France';
  if (normalized.includes('nordic')) return 'Nordics';
  if (normalized.includes('benelux') || normalized.includes('netherlands') || normalized.includes('belgium')) return 'Benelux';
  
  if (normalized.includes('anz') || normalized.includes('australia') || normalized.includes('new zealand')) return 'ANZ';
  if (normalized.includes('japan')) return 'Japan';
  if (normalized.includes('singapore') || normalized.includes('sea')) return 'Singapore';
  
  return null;
}

/**
 * Get mapped region for a territory, with fallback to auto-mapping
 */
export function getMappedRegion(
  territory: string | null,
  territoryMappings: Record<string, string>
): string | null {
  if (!territory) return null;
  
  // Check explicit mapping first
  const mapped = territoryMappings[territory];
  if (mapped) return mapped;
  
  // Fallback to auto-mapping
  return autoMapTerritory(territory);
}

/**
 * Get the parent macro-region for a region
 */
export function getParentRegion(region: string): string | null {
  for (const [parent, children] of Object.entries(REGION_HIERARCHY)) {
    if (children.includes(region)) {
      return parent;
    }
  }
  // Check if region IS a parent (AMER, EMEA, APAC)
  if (REGION_HIERARCHY[region]) {
    return region;
  }
  return null;
}

/**
 * Check if two regions are siblings (adjacent in same parent)
 */
export function areSiblingRegions(region1: string, region2: string): boolean {
  const siblings = REGION_SIBLINGS[region1];
  return siblings ? siblings.includes(region2) : false;
}

/**
 * Calculate geography score for an account-rep pair
 * 
 * @param account - The account to score
 * @param rep - The potential rep to assign
 * @param territoryMappings - Map of territory → region
 * @param params - Scoring parameters
 * @returns Score in range [0, 1]
 */
export function geographyScore(
  account: AggregatedAccount,
  rep: EligibleRep,
  territoryMappings: Record<string, string>,
  params: LPGeographyParams
): number {
  const accountTerritory = account.sales_territory;
  const repRegion = rep.region;
  
  // Missing data → unknown score
  if (!accountTerritory || !repRegion) {
    return params.unknown_territory_score;
  }
  
  // Map territory to region
  const accountRegion = getMappedRegion(accountTerritory, territoryMappings);
  
  // Could not determine region
  if (!accountRegion) {
    return params.unknown_territory_score;
  }
  
  // Exact match
  if (accountRegion === repRegion) {
    return params.exact_match_score;
  }
  
  // Sibling regions
  if (areSiblingRegions(accountRegion, repRegion)) {
    return params.sibling_score;
  }
  
  // Same parent (macro-region)
  const accountParent = getParentRegion(accountRegion);
  const repParent = getParentRegion(repRegion);
  
  if (accountParent && repParent && accountParent === repParent) {
    return params.parent_score;
  }
  
  // Cross-region
  return params.global_score;
}

/**
 * Debug helper: explain geography score breakdown
 */
export function explainGeographyScore(
  account: AggregatedAccount,
  rep: EligibleRep,
  territoryMappings: Record<string, string>,
  params: LPGeographyParams
): string {
  const accountTerritory = account.sales_territory;
  const repRegion = rep.region;
  
  if (!accountTerritory || !repRegion) {
    return `Unknown territory → ${params.unknown_territory_score}`;
  }
  
  const accountRegion = getMappedRegion(accountTerritory, territoryMappings);
  
  if (!accountRegion) {
    return `Territory "${accountTerritory}" unmapped → ${params.unknown_territory_score}`;
  }
  
  if (accountRegion === repRegion) {
    return `Exact match: ${accountRegion} = ${repRegion} → ${params.exact_match_score}`;
  }
  
  if (areSiblingRegions(accountRegion, repRegion)) {
    return `Sibling: ${accountRegion} ↔ ${repRegion} → ${params.sibling_score}`;
  }
  
  const accountParent = getParentRegion(accountRegion);
  const repParent = getParentRegion(repRegion);
  
  if (accountParent && repParent && accountParent === repParent) {
    return `Same parent (${accountParent}): ${accountRegion} - ${repRegion} → ${params.parent_score}`;
  }
  
  return `Cross-region: ${accountRegion} ✗ ${repRegion} → ${params.global_score}`;
}
