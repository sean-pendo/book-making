import { supabase } from '@/integrations/supabase/client';

export interface BookImpact {
  // Accounts (parent accounts only)
  accountsBefore: number;
  accountsAfter: number;
  accountsGained: number;
  accountsLost: number;
  netAccountChange: number;
  
  // ARR
  arrBefore: number;
  arrAfter: number;
  arrGained: number;
  arrLost: number;
  netArrChange: number;
  
  // Customer breakdown (parent accounts only)
  customersBefore: number;
  customersAfter: number;
  customersGained: number;
  customersLost: number;
  customerArrBefore: number;
  customerArrAfter: number;
  
  // Prospect breakdown (parent accounts only)
  prospectsBefore: number;
  prospectsAfter: number;
  prospectsGained: number;
  prospectsLost: number;
  prospectArrBefore: number;
  prospectArrAfter: number;
  
  // Details for display
  gainedAccounts: Array<{
    sfdc_account_id: string;
    account_name: string;
    arr: number;
    from_owner_name: string | null;
    is_customer: boolean;
  }>;
  lostAccounts: Array<{
    sfdc_account_id: string;
    account_name: string;
    arr: number;
    to_owner_name: string | null;
    is_customer: boolean;
  }>;
}

/**
 * Calculate the book impact for a manager (FLM or SLM)
 * Shows accounts/ARR gained and lost due to reassignments
 */
export async function calculateBookImpact(
  buildId: string,
  managerName: string,
  managerLevel: 'FLM' | 'SLM',
  visibleFlms?: string[] // Optional: for scoped views
): Promise<BookImpact> {
  // 1. Get all rep IDs for this manager
  let repsQuery = supabase
    .from('sales_reps')
    .select('rep_id, name')
    .eq('build_id', buildId);

  if (visibleFlms && visibleFlms.length > 0) {
    // Scoped to specific FLMs
    repsQuery = repsQuery.in('flm', visibleFlms);
  } else if (managerLevel === 'FLM') {
    repsQuery = repsQuery.eq('flm', managerName);
  } else if (managerLevel === 'SLM') {
    repsQuery = repsQuery.eq('slm', managerName);
  }

  const { data: reps, error: repsError } = await repsQuery;
  if (repsError) throw repsError;

  const repIds = new Set(reps?.map(r => r.rep_id) || []);
  const repNames = new Map(reps?.map(r => [r.rep_id, r.name]) || []);

  if (repIds.size === 0) {
    return {
      accountsBefore: 0,
      accountsAfter: 0,
      accountsGained: 0,
      accountsLost: 0,
      netAccountChange: 0,
      arrBefore: 0,
      arrAfter: 0,
      arrGained: 0,
      arrLost: 0,
      netArrChange: 0,
      customersBefore: 0,
      customersAfter: 0,
      customersGained: 0,
      customersLost: 0,
      customerArrBefore: 0,
      customerArrAfter: 0,
      prospectsBefore: 0,
      prospectsAfter: 0,
      prospectsGained: 0,
      prospectsLost: 0,
      prospectArrBefore: 0,
      prospectArrAfter: 0,
      gainedAccounts: [],
      lostAccounts: [],
    };
  }

  // 2. Get all parent accounts that have any connection to these reps
  // (either owned before or after)
  const repIdsArray = Array.from(repIds);
  
  // Fetch accounts owned by these reps (before or after)
  const accountsPromises = repIdsArray.map(repId =>
    supabase
      .from('accounts')
      .select('sfdc_account_id, account_name, is_parent, is_customer, owner_id, owner_name, new_owner_id, new_owner_name, calculated_arr, hierarchy_bookings_arr_converted, arr')
      .eq('build_id', buildId)
      .eq('is_parent', true)
      .or(`owner_id.eq.${repId},new_owner_id.eq.${repId}`)
  );

  const accountsResults = await Promise.all(accountsPromises);
  const allAccountsRaw = accountsResults.flatMap(r => r.data || []);

  // Dedupe by sfdc_account_id
  const accountsMap = new Map<string, any>();
  allAccountsRaw.forEach(acc => {
    if (!accountsMap.has(acc.sfdc_account_id)) {
      accountsMap.set(acc.sfdc_account_id, acc);
    }
  });
  const accounts = Array.from(accountsMap.values());

  // 3. Calculate before/after
  const getARR = (acc: any): number => {
    return parseFloat(acc.hierarchy_bookings_arr_converted) ||
           parseFloat(acc.calculated_arr) ||
           parseFloat(acc.arr) ||
           0;
  };

  // Before: accounts where owner_id is one of our reps
  const beforeAccounts = accounts.filter(acc => repIds.has(acc.owner_id));
  const arrBefore = beforeAccounts.reduce((sum, acc) => sum + getARR(acc), 0);

  // After: accounts where new_owner_id is one of our reps (or owner_id if no new_owner)
  const afterAccounts = accounts.filter(acc => {
    const effectiveOwner = acc.new_owner_id || acc.owner_id;
    return repIds.has(effectiveOwner);
  });
  const arrAfter = afterAccounts.reduce((sum, acc) => sum + getARR(acc), 0);

  // 4. Calculate gained and lost
  const beforeIds = new Set(beforeAccounts.map(a => a.sfdc_account_id));
  const afterIds = new Set(afterAccounts.map(a => a.sfdc_account_id));

  // Gained: in after but not in before
  const gainedAccounts = afterAccounts
    .filter(acc => !beforeIds.has(acc.sfdc_account_id))
    .map(acc => ({
      sfdc_account_id: acc.sfdc_account_id,
      account_name: acc.account_name,
      arr: getARR(acc),
      from_owner_name: acc.owner_name,
      is_customer: acc.is_customer || false,
    }));

  // Lost: in before but not in after
  const lostAccounts = beforeAccounts
    .filter(acc => !afterIds.has(acc.sfdc_account_id))
    .map(acc => ({
      sfdc_account_id: acc.sfdc_account_id,
      account_name: acc.account_name,
      arr: getARR(acc),
      to_owner_name: acc.new_owner_name,
      is_customer: acc.is_customer || false,
    }));

  const arrGained = gainedAccounts.reduce((sum, acc) => sum + acc.arr, 0);
  const arrLost = lostAccounts.reduce((sum, acc) => sum + acc.arr, 0);

  // 5. Calculate customer/prospect breakdown
  const customersBefore = beforeAccounts.filter(a => a.is_customer).length;
  const customersAfter = afterAccounts.filter(a => a.is_customer).length;
  const customersGained = gainedAccounts.filter(a => a.is_customer).length;
  const customersLost = lostAccounts.filter(a => a.is_customer).length;
  const customerArrBefore = beforeAccounts.filter(a => a.is_customer).reduce((sum, acc) => sum + getARR(acc), 0);
  const customerArrAfter = afterAccounts.filter(a => a.is_customer).reduce((sum, acc) => sum + getARR(acc), 0);
  
  const prospectsBefore = beforeAccounts.filter(a => !a.is_customer).length;
  const prospectsAfter = afterAccounts.filter(a => !a.is_customer).length;
  const prospectsGained = gainedAccounts.filter(a => !a.is_customer).length;
  const prospectsLost = lostAccounts.filter(a => !a.is_customer).length;
  const prospectArrBefore = beforeAccounts.filter(a => !a.is_customer).reduce((sum, acc) => sum + getARR(acc), 0);
  const prospectArrAfter = afterAccounts.filter(a => !a.is_customer).reduce((sum, acc) => sum + getARR(acc), 0);

  return {
    accountsBefore: beforeAccounts.length,
    accountsAfter: afterAccounts.length,
    accountsGained: gainedAccounts.length,
    accountsLost: lostAccounts.length,
    netAccountChange: afterAccounts.length - beforeAccounts.length,
    arrBefore,
    arrAfter,
    arrGained,
    arrLost,
    netArrChange: arrAfter - arrBefore,
    customersBefore,
    customersAfter,
    customersGained,
    customersLost,
    customerArrBefore,
    customerArrAfter,
    prospectsBefore,
    prospectsAfter,
    prospectsGained,
    prospectsLost,
    prospectArrBefore,
    prospectArrAfter,
    gainedAccounts: gainedAccounts.sort((a, b) => b.arr - a.arr),
    lostAccounts: lostAccounts.sort((a, b) => b.arr - a.arr),
  };
}

/**
 * Format currency for display
 */
export function formatImpactCurrency(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  } else if (absValue >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

/**
 * Format a signed number with + or - prefix
 */
export function formatSignedNumber(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `${value}`;
  return '0';
}

/**
 * Format a signed currency value with + or - prefix
 */
export function formatSignedCurrency(value: number): string {
  const formatted = formatImpactCurrency(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

