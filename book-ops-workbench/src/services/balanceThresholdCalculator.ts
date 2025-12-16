// Balance Threshold Calculator Service
// Calculates dynamic thresholds from account data for normal reps

import { getAccountATR } from '@/_domain';

interface Account {
  sfdc_account_id: string;
  cre_count: number;
  calculated_atr?: number;
  atr?: number;
  expansion_tier?: string;
  renewal_quarter?: string;
  calculated_arr?: number;
  owner_id?: string;
}

interface SalesRep {
  rep_id: string;
  is_strategic_rep: boolean;
  is_active: boolean;
}

interface CalculatedThresholds {
  cre_target: number;
  cre_min: number;
  cre_max: number;
  
  atr_target: number;
  atr_min: number;
  atr_max: number;
  
  tier1_target: number;
  tier1_min: number;
  tier1_max: number;
  
  tier2_target: number;
  tier2_min: number;
  tier2_max: number;
  
  q1_renewal_target: number;
  q1_renewal_min: number;
  q1_renewal_max: number;
  
  q2_renewal_target: number;
  q2_renewal_min: number;
  q2_renewal_max: number;
  
  q3_renewal_target: number;
  q3_renewal_min: number;
  q3_renewal_max: number;
  
  q4_renewal_target: number;
  q4_renewal_min: number;
  q4_renewal_max: number;
  
  last_calculated_at: string;
  based_on_account_count: number;
  based_on_rep_count: number;
  
  // Totals across all accounts
  totalCRE: number;
  totalATR: number;
  totalTier1: number;
  totalTier2: number;
  totalQ1: number;
  totalQ2: number;
  totalQ3: number;
  totalQ4: number;
}

interface VarianceConfig {
  cre_variance: number;
  atr_variance: number;
  tier1_variance: number;
  tier2_variance: number;
  renewal_concentration_max: number;
}

export class BalanceThresholdCalculator {
  
  /**
   * Calculate thresholds from CUSTOMER account data for normal reps only
   * 
   * CALCULATION LOGIC:
   * 1. Sum total CREs across all customer accounts
   * 2. Sum total ATR across all customer accounts  
   * 3. Count Tier 1 accounts
   * 4. Count Tier 2 accounts
   * 5. Count quarterly renewals (Q1, Q2, Q3, Q4)
   * 6. Divide each total by number of ACTIVE NORMAL reps (excludes strategic)
   * 7. Apply variance % to create min/max ranges
   * 
   * Example: 410 accounts, 100 total CREs, 50 active normal reps
   *   Target = 100 / 50 = 2.0 CREs per rep
   *   With 20% variance: Min = 1.6, Max = 2.4
   */
  static calculateThresholds(
    accounts: Account[],
    reps: SalesRep[],
    variances: VarianceConfig
  ): CalculatedThresholds {
    console.log(`\n📊 Calculating Balance Thresholds...`);
    console.log(`   Total Accounts: ${accounts.length}`);
    console.log(`   Total Reps: ${reps.length}`);
    
    // Count only normal (non-strategic) active reps with valid regions
    const normalReps = reps.filter(r => {
      const hasRegion = r.rep_id && (r as any).region && (r as any).region.trim() !== '';
      return !r.is_strategic_rep && r.is_active && hasRegion;
    });
    const normalRepCount = normalReps.length;
    
    const repsWithoutRegion = reps.filter(r => {
      const hasRegion = (r as any).region && (r as any).region.trim() !== '';
      return !r.is_strategic_rep && r.is_active && !hasRegion;
    });
    
    if (repsWithoutRegion.length > 0) {
      console.warn(`   ⚠️ Excluding ${repsWithoutRegion.length} reps without regions from threshold calculation:`,
        repsWithoutRegion.map(r => (r as any).name || r.rep_id).join(', '));
    }
    
    console.log(`   Normal Reps (for threshold calc): ${normalRepCount}`);
    
    if (normalRepCount === 0) {
      throw new Error('No active normal reps found for threshold calculation');
    }
    
    // Aggregate totals from all accounts
    let totalCRE = 0;
    let totalATR = 0;
    let totalTier1 = 0;
    let totalTier2 = 0;
    let q1Count = 0;
    let q2Count = 0;
    let q3Count = 0;
    let q4Count = 0;
    
    accounts.forEach(account => {
      // CRE count
      totalCRE += account.cre_count || 0;
      
      // ATR (use getAccountATR for consistent priority chain)
      totalATR += getAccountATR(account);
      
      // Tier counts
      const tier = account.expansion_tier?.toLowerCase();
      if (tier === 'tier 1' || tier === 'tier1') totalTier1++;
      if (tier === 'tier 2' || tier === 'tier2') totalTier2++;
      
      // Quarterly renewals (handles both "Q1" and "Q1-FY27" formats)
      const quarter = account.renewal_quarter?.toUpperCase() || '';
      if (quarter.startsWith('Q1')) q1Count++;
      if (quarter.startsWith('Q2')) q2Count++;
      if (quarter.startsWith('Q3')) q3Count++;
      if (quarter.startsWith('Q4')) q4Count++;
    });
    
    console.log(`\n📈 Totals Across All Accounts:`);
    console.log(`   CREs: ${totalCRE}`);
    console.log(`   ATR: ${totalATR}`);
    console.log(`   Tier 1: ${totalTier1}`);
    console.log(`   Tier 2: ${totalTier2}`);
    console.log(`   Q1 Renewals: ${q1Count}`);
    console.log(`   Q2 Renewals: ${q2Count}`);
    console.log(`   Q3 Renewals: ${q3Count}`);
    console.log(`   Q4 Renewals: ${q4Count}\n`);
    
    // Calculate targets (divide by normal rep count)
    const creTarget = totalCRE / normalRepCount;
    const atrTarget = totalATR / normalRepCount;
    const tier1Target = totalTier1 / normalRepCount;
    const tier2Target = totalTier2 / normalRepCount;
    
    // Apply variance to create min/max ranges
    const creMin = Math.floor(creTarget * (1 - variances.cre_variance / 100));
    const creMax = Math.ceil(creTarget * (1 + variances.cre_variance / 100));
    
    const atrMin = Math.floor(atrTarget * (1 - variances.atr_variance / 100));
    const atrMax = Math.ceil(atrTarget * (1 + variances.atr_variance / 100));
    
    const tier1Min = Math.floor(tier1Target * (1 - variances.tier1_variance / 100));
    const tier1Max = Math.ceil(tier1Target * (1 + variances.tier1_variance / 100));
    
    const tier2Min = Math.floor(tier2Target * (1 - variances.tier2_variance / 100));
    const tier2Max = Math.ceil(tier2Target * (1 + variances.tier2_variance / 100));
    
    // Quarterly renewal targets with min/max ranges
    const q1Target = q1Count / normalRepCount;
    const q2Target = q2Count / normalRepCount;
    const q3Target = q3Count / normalRepCount;
    const q4Target = q4Count / normalRepCount;
    
    const renewalVariance = variances.renewal_concentration_max / 100;
    
    const q1Min = Math.floor(q1Target * (1 - renewalVariance));
    const q1Max = Math.ceil(q1Target * (1 + renewalVariance));
    
    const q2Min = Math.floor(q2Target * (1 - renewalVariance));
    const q2Max = Math.ceil(q2Target * (1 + renewalVariance));
    
    const q3Min = Math.floor(q3Target * (1 - renewalVariance));
    const q3Max = Math.ceil(q3Target * (1 + renewalVariance));
    
    const q4Min = Math.floor(q4Target * (1 - renewalVariance));
    const q4Max = Math.ceil(q4Target * (1 + renewalVariance));
    
    const result = {
      cre_target: parseFloat(creTarget.toFixed(2)),
      cre_min: creMin,
      cre_max: creMax,
      
      atr_target: parseFloat(atrTarget.toFixed(2)),
      atr_min: atrMin,
      atr_max: atrMax,
      
      tier1_target: parseFloat(tier1Target.toFixed(2)),
      tier1_min: tier1Min,
      tier1_max: tier1Max,
      
      tier2_target: parseFloat(tier2Target.toFixed(2)),
      tier2_min: tier2Min,
      tier2_max: tier2Max,
      
      q1_renewal_target: parseFloat(q1Target.toFixed(2)),
      q1_renewal_min: q1Min,
      q1_renewal_max: q1Max,
      
      q2_renewal_target: parseFloat(q2Target.toFixed(2)),
      q2_renewal_min: q2Min,
      q2_renewal_max: q2Max,
      
      q3_renewal_target: parseFloat(q3Target.toFixed(2)),
      q3_renewal_min: q3Min,
      q3_renewal_max: q3Max,
      
      q4_renewal_target: parseFloat(q4Target.toFixed(2)),
      q4_renewal_min: q4Min,
      q4_renewal_max: q4Max,
      
      last_calculated_at: new Date().toISOString(),
      based_on_account_count: accounts.length,
      based_on_rep_count: normalRepCount,
      
      // Include totals for UI display
      totalCRE: totalCRE,
      totalATR: totalATR,
      totalTier1: totalTier1,
      totalTier2: totalTier2,
      totalQ1: q1Count,
      totalQ2: q2Count,
      totalQ3: q3Count,
      totalQ4: q4Count
    };
    
    console.log(`✅ Calculated Thresholds:`);
    console.log(`   CRE: ${result.cre_min} - ${result.cre_target} - ${result.cre_max}`);
    console.log(`   ATR: ${result.atr_min} - ${result.atr_target} - ${result.atr_max}`);
    console.log(`   Tier 1: ${result.tier1_min} - ${result.tier1_target} - ${result.tier1_max}`);
    console.log(`   Tier 2: ${result.tier2_min} - ${result.tier2_target} - ${result.tier2_max}\n`);
    
    return result;
  }
}
