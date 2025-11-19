// Fiscal Year calculations based on February start (Feb-Jan cycle)
// Q1: Feb-Apr, Q2: May-Jul, Q3: Aug-Oct, Q4: Nov-Jan

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

export function getFiscalYear(date: string | Date): number {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return 0;
    
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    
    // If we're in Jan, we're still in the previous fiscal year
    return month === 1 ? year - 1 : year;
  } catch {
    return 0;
  }
}

export function getCurrentFiscalYear(): number {
  return getFiscalYear(new Date());
}

export function isCurrentFiscalYear(date: string | Date): boolean {
  return getFiscalYear(date) === getCurrentFiscalYear();
}