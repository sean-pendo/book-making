// Utility functions for consistent ARR and ATR calculations across the application

export interface AccountData {
  is_parent?: boolean;
  arr?: number | null;
  calculated_arr?: number | null;
  hierarchy_bookings_arr_converted?: number | null;
  calculated_atr?: number | null;
  atr?: number | null;
}

/**
 * Get the correct ARR value for an account based on its type and available data
 * For parent accounts: prioritize calculated_arr (includes split ownership adjustments), then hierarchy_bookings_arr_converted, then arr
 * For child accounts: use calculated_arr (includes opportunities), then arr
 */
export function getAccountARR(account: AccountData): number {
  if (account.is_parent) {
    return account.calculated_arr || account.hierarchy_bookings_arr_converted || account.arr || 0;
  }
  return account.calculated_arr || account.arr || 0;
}

/**
 * Get the correct ATR value for an account
 * After our database function update, calculated_atr contains the proper hierarchy roll-up
 * IMPORTANT: ATR only includes opportunities with opportunity_type = 'Renewals'
 */
export function getAccountATR(account: AccountData): number {
  return account.calculated_atr || account.atr || 0;
}

/**
 * Format currency values consistently
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
 * Check if an account has meaningful ARR (greater than 0)
 */
export function hasARR(account: AccountData): boolean {
  return getAccountARR(account) > 0;
}

/**
 * Check if an account has meaningful ATR (greater than 0)
 */
export function hasATR(account: AccountData): boolean {
  return getAccountATR(account) > 0;
}