// Fiscal Year calculations based on February start (Feb-Jan cycle)
// Q1: Feb-Apr, Q2: May-Jul, Q3: Aug-Oct, Q4: Nov-Jan
// FY'27 starts Feb 1, 2026

export function getFiscalQuarter(date: string | Date): 'Q1' | 'Q2' | 'Q3' | 'Q4' | null {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    
    const month = d.getMonth() + 1; // 1-based month
    
    // Fiscal year starts in February
    if (month >= 2 && month <= 4) return 'Q1'; // Feb-Apr
    if (month >= 5 && month <= 7) return 'Q2'; // May-Jul  
    if (month >= 8 && month <= 10) return 'Q3'; // Aug-Oct
    return 'Q4'; // Nov-Jan
  } catch {
    return null;
  }
}

/**
 * Get the fiscal year number for a date.
 * FY starts Feb 1, so:
 * - Feb 2026 - Jan 2027 = FY27
 * - Feb 2027 - Jan 2028 = FY28
 * 
 * @returns Full fiscal year number (e.g., 2027 for FY27)
 */
export function getFiscalYear(date: string | Date): number {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return 0;
    
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    
    // FY = calendar year + 1 for Feb-Dec, calendar year for Jan
    // Jan 2027 is still FY27 (same as Feb-Dec 2026)
    // Feb 2026 is FY27 (calendar year + 1)
    return month === 1 ? year : year + 1;
  } catch {
    return 0;
  }
}

/**
 * Get the fiscal quarter label in format "Q#-FY##"
 * Example: Nov 2026 → "Q4-FY27", Feb 2026 → "Q1-FY27"
 * 
 * @param date - The date to get the fiscal quarter label for
 * @returns Formatted string like "Q4-FY27" or null if invalid date
 */
export function getFiscalQuarterLabel(date: string | Date): string | null {
  try {
    const quarter = getFiscalQuarter(date);
    const fiscalYear = getFiscalYear(date);
    
    if (!quarter || !fiscalYear) return null;
    
    // Get last 2 digits of fiscal year (2027 → 27)
    const fyShort = fiscalYear % 100;
    
    return `${quarter}-FY${fyShort}`;
  } catch {
    return null;
  }
}

export function getCurrentFiscalYear(): number {
  return getFiscalYear(new Date());
}

export function isCurrentFiscalYear(date: string | Date): boolean {
  return getFiscalYear(date) === getCurrentFiscalYear();
}