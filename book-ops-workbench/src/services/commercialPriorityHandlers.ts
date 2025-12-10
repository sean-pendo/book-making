/**
 * Commercial Priority Handlers
 * 
 * Handlers for Commercial mode-specific priorities:
 * - Top 10% ARR calculation (runtime)
 * - Renewal Specialist routing logic
 * - PE Firm protection
 */

import { Account, SalesRep } from './priorityExecutor';

/**
 * Calculate the ARR threshold for Top 10% accounts
 * Accounts at or above this threshold are considered "top performers"
 * and should not be routed to Renewal Specialists
 */
export function calculateTop10PercentThreshold(accounts: Account[]): number {
  // Filter to accounts with valid ARR values
  const accountsWithARR = accounts
    .map(a => a.hierarchy_bookings_arr_converted || a.calculated_arr || 0)
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
 * Determine if an account should be routed to a Renewal Specialist
 */
export function shouldRouteToRenewalSpecialist(
  account: Account,
  rsThreshold: number,
  top10Threshold: number
): { shouldRoute: boolean; reason: string } {
  const accountARR = account.hierarchy_bookings_arr_converted || account.calculated_arr || 0;
  
  // PE Firms never go to RS
  if (account.pe_firm) {
    return { 
      shouldRoute: false, 
      reason: `PE-owned account (${account.pe_firm}) - keep with current AE` 
    };
  }
  
  // Top 10% never go to RS
  if (top10Threshold > 0 && accountARR >= top10Threshold) {
    return { 
      shouldRoute: false, 
      reason: `Top 10% ARR ($${accountARR.toLocaleString()}) - keep with current AE` 
    };
  }
  
  // Only customers with ARR <= threshold go to RS
  if (!account.is_customer) {
    return { 
      shouldRoute: false, 
      reason: 'Prospect accounts are not routed to Renewal Specialists' 
    };
  }
  
  if (accountARR <= rsThreshold) {
    return { 
      shouldRoute: true, 
      reason: `ARR $${accountARR.toLocaleString()} <= threshold $${rsThreshold.toLocaleString()}` 
    };
  }
  
  return { 
    shouldRoute: false, 
    reason: `ARR $${accountARR.toLocaleString()} > threshold $${rsThreshold.toLocaleString()} - keep with AE` 
  };
}

/**
 * Filter reps to only those eligible for a given account based on RS routing
 */
export function getEligibleRepsForAccount(
  account: Account,
  reps: SalesRep[],
  rsThreshold: number,
  top10Threshold: number
): SalesRep[] {
  const { shouldRoute } = shouldRouteToRenewalSpecialist(account, rsThreshold, top10Threshold);
  
  if (shouldRoute) {
    // Account should go to RS - filter to RS reps only
    const rsReps = reps.filter(r => r.is_renewal_specialist);
    return rsReps.length > 0 ? rsReps : reps; // Fallback to all reps if no RS
  } else {
    // Account should go to AE - filter out RS reps
    const aeReps = reps.filter(r => !r.is_renewal_specialist);
    return aeReps.length > 0 ? aeReps : reps; // Fallback to all reps if no AEs
  }
}

/**
 * Calculate RS workload metrics for Commercial mode
 */
export interface RSWorkloadMetrics {
  totalRSAccounts: number;
  totalRSARR: number;
  rsRepCount: number;
  avgAccountsPerRS: number;
  avgARRPerRS: number;
  rsAccountsByRep: Record<string, { count: number; arr: number }>;
}

export function calculateRSWorkloadMetrics(
  accounts: Account[],
  reps: SalesRep[],
  assignments: Map<string, string>, // account_id -> rep_id
  rsThreshold: number
): RSWorkloadMetrics {
  const rsReps = reps.filter(r => r.is_renewal_specialist);
  const rsRepIds = new Set(rsReps.map(r => r.rep_id));
  
  const rsAccountsByRep: Record<string, { count: number; arr: number }> = {};
  let totalRSAccounts = 0;
  let totalRSARR = 0;
  
  // Initialize all RS reps
  rsReps.forEach(r => {
    rsAccountsByRep[r.rep_id] = { count: 0, arr: 0 };
  });
  
  // Calculate metrics
  for (const account of accounts) {
    const assignedRepId = assignments.get(account.sfdc_account_id);
    if (!assignedRepId || !rsRepIds.has(assignedRepId)) continue;
    
    const accountARR = account.hierarchy_bookings_arr_converted || account.calculated_arr || 0;
    
    totalRSAccounts++;
    totalRSARR += accountARR;
    
    if (rsAccountsByRep[assignedRepId]) {
      rsAccountsByRep[assignedRepId].count++;
      rsAccountsByRep[assignedRepId].arr += accountARR;
    }
  }
  
  return {
    totalRSAccounts,
    totalRSARR,
    rsRepCount: rsReps.length,
    avgAccountsPerRS: rsReps.length > 0 ? totalRSAccounts / rsReps.length : 0,
    avgARRPerRS: rsReps.length > 0 ? totalRSARR / rsReps.length : 0,
    rsAccountsByRep
  };
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
 * Filter reps to match an account's sub-region for EMEA mode
 */
export function getEMEAEligibleReps(
  account: Account,
  reps: SalesRep[]
): SalesRep[] {
  const accountSubRegion = getEMEASubRegion(account);
  
  // Find reps with matching sub-region
  const matchingReps = reps.filter(r => r.sub_region === accountSubRegion);
  
  if (matchingReps.length > 0) {
    return matchingReps;
  }
  
  // Fallback: Check for RO_EMEA reps who handle overflow
  const roEmeaReps = reps.filter(r => r.sub_region === 'RO_EMEA');
  if (roEmeaReps.length > 0) {
    return roEmeaReps;
  }
  
  // Final fallback: all EMEA reps
  return reps;
}

