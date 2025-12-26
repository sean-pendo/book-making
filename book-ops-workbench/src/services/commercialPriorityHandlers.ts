/**
 * Commercial Priority Handlers
 * 
 * Handlers for Commercial mode-specific priorities:
 * - Top 10% ARR calculation (runtime)
 * - PE Firm protection
 * 
 * DEPRECATED in v1.3.9: Renewal Specialist (RS) routing removed
 * - is_renewal_specialist field no longer used
 * - All reps are treated equally regardless of RS designation
 */

import { Account, SalesRep } from './optimization/types';
import { getAccountARR } from '@/_domain';

/**
 * Calculate the ARR threshold for Top 10% accounts
 * Accounts at or above this threshold are considered "top performers"
 */
export function calculateTop10PercentThreshold(accounts: Account[]): number {
  // Filter to accounts with valid ARR values
  const accountsWithARR = accounts
    .map(a => getAccountARR(a))
    .filter(arr => arr > 0)
    .sort((a, b) => b - a); // Sort descending
  
  if (accountsWithARR.length === 0) {
    return 0;
  }
  
  // Get the 10th percentile index (top 10% = bottom 10% of sorted desc array)
  const index = Math.ceil(accountsWithARR.length * 0.1) - 1;
  const threshold = accountsWithARR[Math.max(0, index)];
  
  console.log(`[CommercialHandlers] Top 10% threshold calculated: $${threshold.toLocaleString()} (${index + 1} of ${accountsWithARR.length} accounts)`);
  
  return threshold;
}

/**
 * EMEA Sub-Region Mapping
 * Maps country codes to EMEA sub-regions
 */
export const EMEA_COUNTRY_TO_SUBREGION: Record<string, string> = {
  // DACH
  'DE': 'DACH',
  'AT': 'DACH',
  'CH': 'DACH',
  'Germany': 'DACH',
  'Austria': 'DACH',
  'Switzerland': 'DACH',
  
  // UKI
  'GB': 'UKI',
  'UK': 'UKI',
  'IE': 'UKI',
  'United Kingdom': 'UKI',
  'Ireland': 'UKI',
  
  // Nordics
  'SE': 'Nordics',
  'NO': 'Nordics',
  'DK': 'Nordics',
  'FI': 'Nordics',
  'IS': 'Nordics',
  'Sweden': 'Nordics',
  'Norway': 'Nordics',
  'Denmark': 'Nordics',
  'Finland': 'Nordics',
  'Iceland': 'Nordics',
  
  // France
  'FR': 'France',
  'France': 'France',
  
  // Benelux
  'NL': 'Benelux',
  'BE': 'Benelux',
  'LU': 'Benelux',
  'Netherlands': 'Benelux',
  'Belgium': 'Benelux',
  'Luxembourg': 'Benelux',
  
  // Middle East
  'AE': 'Middle_East',
  'SA': 'Middle_East',
  'IL': 'Middle_East',
  'QA': 'Middle_East',
  'BH': 'Middle_East',
  'KW': 'Middle_East',
  'OM': 'Middle_East',
  'United Arab Emirates': 'Middle_East',
  'Saudi Arabia': 'Middle_East',
  'Israel': 'Middle_East',
  'Qatar': 'Middle_East',
  'Bahrain': 'Middle_East',
  'Kuwait': 'Middle_East',
  'Oman': 'Middle_East'
};

/**
 * Get the EMEA sub-region for an account based on its HQ country
 */
export function getEMEASubRegion(account: Account): string {
  const country = account.hq_country || '';
  
  // Try direct match
  if (EMEA_COUNTRY_TO_SUBREGION[country]) {
    return EMEA_COUNTRY_TO_SUBREGION[country];
  }
  
  // Try uppercase
  if (EMEA_COUNTRY_TO_SUBREGION[country.toUpperCase()]) {
    return EMEA_COUNTRY_TO_SUBREGION[country.toUpperCase()];
  }
  
  // Default to RO-EMEA (Rest of EMEA)
  return 'RO_EMEA';
}

/**
 * Filter reps to match an account's EMEA region
 * 
 * Note: Uses rep.region field directly, not sub_region (deprecated in v1.3.9)
 * EMEA regions: DACH, UKI, Nordics, France, Benelux, Middle_East, RO_EMEA
 */
export function getEMEAEligibleReps(
  account: Account,
  reps: SalesRep[]
): SalesRep[] {
  const accountSubRegion = getEMEASubRegion(account);
  
  // Find reps with matching region (using region field, not deprecated sub_region)
  const matchingReps = reps.filter(r => r.region === accountSubRegion);
  
  if (matchingReps.length > 0) {
    return matchingReps;
  }
  
  // Fallback: Check for RO_EMEA reps who handle overflow
  const roEmeaReps = reps.filter(r => r.region === 'RO_EMEA');
  if (roEmeaReps.length > 0) {
    return roEmeaReps;
  }
  
  // Final fallback: all EMEA reps
  return reps;
}

