import { autoMapTerritoryToRegion } from '@/utils/territoryAutoMapping';

/**
 * Simplified Assignment Engine - Waterfall Logic
 * 
 * STRATEGIC ACCOUNTS (Priority Override):
 * - Strategic accounts ALWAYS stay with strategic reps
 * - No capacity limits apply to strategic reps
 * - Distribution is even across all active strategic reps
 * - Sorted by: Current ownership > Lowest workload
 * 
 * NORMAL ACCOUNTS (Priority Order):
 * 1. Keep with current owner IF same geography AND has capacity (CRE threshold not enforced)
 * 2. Assign to any rep in same geography with most capacity
 * 3. Zero-Net-ARR Prospects: Balance distribution by account count (assign to rep with lowest count)
 * 3b. Keep with current owner IF has capacity (any geography)
 * 4. Assign to any rep (any region) with most capacity
 * 
 * Global Constraints (normal accounts only):
 * - Customer ARR capacity: targetARR * (1 + capacity_variance%)
 * - Prospect Net ARR capacity: Use Net ARR thresholds
 * - Zero-Net-ARR prospects: Dynamic count-based capacity (totalProspects / activeReps * 1.5)
 * - CRE hard cap: Max 3 CRE accounts per rep
 * - Parent/child accounts must have same owner
 * 
 * Note: Strategic reps are completely separate from normal rep pool
 */

import { supabase } from '@/integrations/supabase/client';

interface Account {
  id: string;
  sfdc_account_id: string;
  account_name: string;
  arr: number;
  calculated_arr: number | null;
  calculated_atr?: number | null;
  sales_territory?: string | null;
  geo?: string | null;
  owner_id: string | null;
  owner_name: string | null;
  is_customer: boolean;
  is_parent: boolean;
  expansion_tier: string | null;
  cre_count: number;
  exclude_from_reassignment: boolean;
  parent_id?: string | null;
  ultimate_parent_id?: string | null;
  renewal_quarter?: string | null;
}

interface SalesRep {
  id: string;
  rep_id: string;
  name: string;
  region: string | null;
  is_active: boolean;
  is_strategic_rep: boolean;
  include_in_assignments: boolean;
}

interface AssignmentConfiguration {
  customer_target_arr: number;
  customer_max_arr: number;
  prospect_target_arr: number;
  prospect_max_arr: number;
  max_cre_per_rep: number;
  capacity_variance_percent?: number;
  max_tier1_per_rep?: number;
  max_tier2_per_rep?: number;
  territory_mappings?: Record<string, string> | null;
  
  // Balance thresholds (calculated or overridden)
  cre_target?: number;
  cre_max?: number;
  cre_max_override?: number;
  atr_target?: number;
  atr_max?: number;
  atr_max_override?: number;
  tier1_target?: number;
  tier1_max?: number;
  tier1_max_override?: number;
  tier2_target?: number;
  tier2_max?: number;
  tier2_max_override?: number;
  q1_renewal_target?: number;
  q2_renewal_target?: number;
  q3_renewal_target?: number;
  q4_renewal_target?: number;
  last_calculated_at?: string | null;
}

interface AssignmentWarning {
  severity: 'low' | 'medium' | 'high';
  type: 'continuity_broken' | 'cross_region' | 'cre_risk' | 'tier_concentration' | 'unassigned' | 'parent_child_separated' | 'strategic_overflow' | 'capacity_exceeded';
  accountOrRep: string;
  reason: string;
  details: string;
}

interface AssignmentProposal {
  account: Account;
  proposedRep: SalesRep;
  currentOwner: SalesRep | null;
  rationale: string;
  warnings: AssignmentWarning[];
  ruleApplied: string;
  arr: number;
}

interface WorkloadState {
  arr: number;
  netARR: number;  // For prospects (from opportunities with net_arr > 0)
  accounts: number;
  cre: number;
  atr: number;
  tier1: number;
  tier2: number;
  q1_renewals: number;
  q2_renewals: number;
  q3_renewals: number;
  q4_renewals: number;
}

export class WaterfallAssignmentEngine {
  private buildId: string;
  private assignmentType: 'customer' | 'prospect';
  private config: AssignmentConfiguration;
  private workloadMap: Map<string, WorkloadState>;
  private repMap: Map<string, SalesRep>;
  private warnings: AssignmentWarning[];
  private opportunitiesMap: Map<string, number>;  // Map sfdc_account_id -> net_arr
  private totalProspectCount: number = 0;  // Track total prospects for dynamic capacity calculation

  constructor(buildId: string, assignmentType: 'customer' | 'prospect', config: AssignmentConfiguration, opportunities?: Array<{sfdc_account_id: string, net_arr: number}>) {
    this.buildId = buildId;
    this.assignmentType = assignmentType;
    this.config = {
      ...config,
      capacity_variance_percent: config.capacity_variance_percent ?? 10,
      max_tier1_per_rep: config.max_tier1_per_rep ?? 5,
      max_tier2_per_rep: config.max_tier2_per_rep ?? 8
    };
    this.workloadMap = new Map();
    this.repMap = new Map();
    this.warnings = [];
    this.opportunitiesMap = new Map();

    // Build opportunities map for Net ARR calculation
    if (opportunities) {
      opportunities.forEach(opp => {
        const existing = this.opportunitiesMap.get(opp.sfdc_account_id) || 0;
        this.opportunitiesMap.set(opp.sfdc_account_id, existing + (opp.net_arr || 0));
      });
      console.log(`📊 Loaded ${this.opportunitiesMap.size} accounts with Net ARR data, total opportunities: ${opportunities.length}`);
    }

    console.log(`🎯 Waterfall Engine initialized:`, {
      type: assignmentType,
      targetARR: this.getTargetARR() / 1000000 + 'M',
      capacityLimit: this.getCapacityLimit() / 1000000 + 'M',
      maxCRE: this.config.max_cre_per_rep
    });
  }

  private getTargetARR(): number {
    return this.assignmentType === 'customer'
      ? this.config.customer_target_arr
      : this.config.prospect_target_arr;
  }

  private getCapacityLimit(): number {
    // Use the configured max ARR directly as the hard cap
    return this.assignmentType === 'customer'
      ? this.config.customer_max_arr
      : this.config.prospect_max_arr;
  }

  private getMinimumThreshold(): number {
    // Calculate minimum threshold based on target and variance
    const target = this.getTargetARR();
    const variance = this.config.capacity_variance_percent || 10;
    return target * (1 - variance / 100);
  }

  async generateAssignments(
    accounts: Account[],
    reps: SalesRep[]
  ): Promise<{ proposals: AssignmentProposal[], warnings: AssignmentWarning[] }> {
    console.log(`🚀 Starting waterfall assignment: ${accounts.length} accounts, ${reps.length} reps`);

    // Fetch territory mappings and apply to accounts missing geo
    const { data: configData } = await supabase
      .from('assignment_configuration')
      .select('territory_mappings')
      .eq('build_id', this.buildId)
      .single();

    const territoryMappings = configData?.territory_mappings || {};
    
    // Apply territory mappings to accounts with missing geo but present sales_territory
    accounts = accounts.map(account => {
      if (!account.geo && account.sales_territory && territoryMappings[account.sales_territory]) {
        return {
          ...account,
          geo: territoryMappings[account.sales_territory]
        };
      }
      return account;
    });

    this.warnings = [];
    
    // Initialize workload and rep map
    reps.forEach(rep => {
      this.repMap.set(rep.rep_id, rep);
      this.workloadMap.set(rep.rep_id, {
        arr: 0,
        netARR: 0,  // Track Net ARR separately for prospects
        accounts: 0,
        cre: 0,
        atr: 0,
        tier1: 0,
        tier2: 0,
        q1_renewals: 0,
        q2_renewals: 0,
        q3_renewals: 0,
        q4_renewals: 0
      });
    });

    // Filter to only parent accounts matching type
    const assignableAccounts = accounts.filter(a => {
      if (!a.is_parent) return false;
      if (a.exclude_from_reassignment) return false;
      if (this.assignmentType === 'customer' && !a.is_customer) return false;
      if (this.assignmentType === 'prospect' && a.is_customer) return false;
      return true;
    });

    // Store total count for dynamic capacity calculation
    this.totalProspectCount = assignableAccounts.length;

    console.log(`✅ Filtered to ${assignableAccounts.length} assignable parent accounts`);
    
    // Log prospect assignment summary
    if (this.assignmentType === 'prospect') {
      const withNetARR = assignableAccounts.filter(a => (this.opportunitiesMap.get(a.sfdc_account_id) || 0) > 0).length;
      const withoutNetARR = assignableAccounts.length - withNetARR;
      const activeReps = reps.filter(r => r.is_active && r.include_in_assignments && !r.is_strategic_rep).length;
      const targetPerRep = Math.ceil(assignableAccounts.length / activeReps);
      const maxPerRep = Math.round(targetPerRep * 1.5); // 50% variance
      console.log(`📊 Prospect Assignment Summary:
  - Total Prospects: ${assignableAccounts.length}
  - With Net ARR > 0: ${withNetARR}
  - With Net ARR = 0: ${withoutNetARR}
  - Active Reps: ${activeReps}
  - Target per Rep: ~${targetPerRep} accounts
  - Max per Rep: ~${maxPerRep} accounts (50% variance)`);
    }

    // Prioritize: Strategic first, then Tier 1, then by Net ARR (for prospects) or ARR (for customers) descending
    const sortedAccounts = assignableAccounts.sort((a, b) => {
      const aIsStrategic = this.isStrategicAccount(a);
      const bIsStrategic = this.isStrategicAccount(b);
      if (aIsStrategic && !bIsStrategic) return -1;
      if (!aIsStrategic && bIsStrategic) return 1;
      
      const aTier1 = a.expansion_tier === 'Tier 1' ? 1 : 0;
      const bTier1 = b.expansion_tier === 'Tier 1' ? 1 : 0;
      if (aTier1 !== bTier1) return bTier1 - aTier1;
      
      // Use Net ARR for prospects, ARR for customers
      if (this.assignmentType === 'prospect') {
        const aNetARR = this.opportunitiesMap.get(a.sfdc_account_id) || 0;
        const bNetARR = this.opportunitiesMap.get(b.sfdc_account_id) || 0;
        return bNetARR - aNetARR; // Higher Net ARR first
      } else {
        const aARR = a.calculated_arr || a.arr || 0;
        const bARR = b.calculated_arr || b.arr || 0;
        return bARR - aARR;
      }
    });

    const proposals: AssignmentProposal[] = [];

    for (const account of sortedAccounts) {
      try {
        const proposal = this.assignSingleAccount(account, reps);
        proposals.push(proposal);
        this.updateWorkload(proposal.proposedRep.rep_id, account);
      } catch (error) {
        console.error(`Failed to assign ${account.account_name}:`, error);
        this.warnings.push({
          severity: 'high',
          type: 'unassigned',
          accountOrRep: account.account_name,
          reason: (error as Error).message,
          details: `No eligible reps available for this account`
        });
      }
    }

    // Post-process: Check for warnings
    this.checkPostAssignmentWarnings(reps);

    console.log(`✅ Generated ${proposals.length} proposals with ${this.warnings.length} warnings`);
    return { proposals, warnings: this.warnings };
  }

  private assignSingleAccount(account: Account, allReps: SalesRep[]): AssignmentProposal {
    const accountARR = account.calculated_arr || account.arr || 0;
    const currentOwner = account.owner_id ? this.repMap.get(account.owner_id) || null : null;
    const accountIsStrategic = this.isStrategicAccount(account);

    // STRATEGIC ACCOUNTS: Always keep with strategic reps, ignore capacity limits
    if (accountIsStrategic) {
      const strategicReps = allReps.filter(rep => 
        rep.is_active && 
        rep.include_in_assignments &&
        rep.is_strategic_rep
      );

      if (strategicReps.length === 0) {
        throw new Error('No active strategic reps available for strategic account');
      }

      // Priority 1 for Strategic: Keep with current owner if they're a strategic rep
      if (currentOwner && currentOwner.is_strategic_rep) {
        return {
          account,
          proposedRep: currentOwner,
          currentOwner,
          rationale: 'Strategic Account Continuity',
          warnings: [],
          ruleApplied: 'Strategic Pool: Continuity',
          arr: accountARR
        };
      }

      // Priority 2 for Strategic: Distribute evenly among strategic reps (find rep with least load)
      const bestStrategicRep = this.findMostCapacityRep(strategicReps);
      return {
        account,
        proposedRep: bestStrategicRep,
        currentOwner,
        rationale: 'Strategic Account - Even Distribution',
        warnings: currentOwner ? [{
          severity: 'medium' as const,
          type: 'continuity_broken' as const,
          accountOrRep: account.account_name,
          reason: `Strategic account reassigned from ${currentOwner.name} to ${bestStrategicRep.name}`,
          details: 'Maintaining even distribution across strategic rep pool'
        }] : [],
        ruleApplied: 'Strategic Pool: Even Distribution',
        arr: accountARR
      };
    }

    // NORMAL ACCOUNTS: Standard waterfall logic with capacity checks
    console.log(`\n🔍 Assigning ${account.account_name} (ARR: ${(accountARR/1000000).toFixed(2)}M, CRE: ${account.cre_count}, Tier: ${account.expansion_tier || 'none'})`);
    
    
    // Waterfall Priority 1: Keep with current owner if same geography AND has capacity
    // hasCapacity() automatically handles minimum thresholds - reps below minimum are treated as having capacity
    if (currentOwner && !currentOwner.is_strategic_rep) {
      const isSameGeography = this.isSameGeography(account, currentOwner);
      
      if (isSameGeography && this.hasCapacity(currentOwner.rep_id, accountARR, account.cre_count, account, currentOwner)) {
        const currentOwnerWorkload = this.workloadMap.get(currentOwner.rep_id)!;
        console.log(`✅ P1: ${account.account_name} staying with ${currentOwner.name} (Continuity + Geo) - Rep: ${(currentOwnerWorkload.arr/1000000).toFixed(2)}M ARR, ${currentOwnerWorkload.cre} CRE`);
        return {
          account,
          proposedRep: currentOwner,
          currentOwner,
          rationale: 'Account Continuity + Geography Match',
          warnings: [],
          ruleApplied: 'Priority 1: Continuity + Geography',
          arr: accountARR
        };
      } else if (isSameGeography) {
        console.log(`⚠️ P1: ${account.account_name} can't stay with ${currentOwner.name} - at capacity`);
      }
    }

    // Waterfall Priority 2: Assign to rep in same geography - prioritize under-minimum reps
    const sameGeoReps = allReps.filter(rep => 
      rep.is_active && 
      rep.include_in_assignments &&
      !rep.is_strategic_rep && // Exclude strategic reps from normal pool
      this.isSameGeography(account, rep) &&
      this.hasCapacity(rep.rep_id, accountARR, account.cre_count, account, rep)
    );

    if (sameGeoReps.length > 0) {
      let bestRep: SalesRep;
      
      if (this.assignmentType === 'prospect') {
        // For prospects, sort by lowest account count
        bestRep = sameGeoReps.sort((a, b) => {
          const workloadA = this.workloadMap.get(a.rep_id)!;
          const workloadB = this.workloadMap.get(b.rep_id)!;
          return workloadA.accounts - workloadB.accounts;
        })[0];
        console.log(`✅ P2: ${account.account_name} assigned to ${bestRep.name} (Geo Match + Lowest Count) - Rep Count: ${this.workloadMap.get(bestRep.rep_id)!.accounts}`);
      } else {
        // For customers, use existing ARR-based logic
        const minThreshold = this.getMinimumThreshold();
        
        // First try to find reps below minimum threshold in this geography
        const underMinReps = sameGeoReps.filter(rep => {
          const workload = this.workloadMap.get(rep.rep_id)!;
          return workload.arr < minThreshold;
        });
        
        if (underMinReps.length > 0) {
          // Assign to most under-loaded rep below minimum
          bestRep = underMinReps.sort((a, b) => {
            const workloadA = this.workloadMap.get(a.rep_id)!;
            const workloadB = this.workloadMap.get(b.rep_id)!;
            return workloadA.arr - workloadB.arr;
          })[0];
          console.log(`✅ P2: ${account.account_name} assigned to ${bestRep.name} (Geo + Below Min) - Rep ARR: ${(this.workloadMap.get(bestRep.rep_id)!.arr/1000000).toFixed(2)}M < ${(minThreshold/1000000).toFixed(2)}M`);
        } else {
          // All reps at or above minimum, pick by capacity + balance
          bestRep = this.findMostCapacityRep(sameGeoReps);
          console.log(`✅ P2: ${account.account_name} assigned to ${bestRep.name} (Geo Match) - Rep ARR: ${(this.workloadMap.get(bestRep.rep_id)!.arr/1000000).toFixed(2)}M`);
        }
      }
      
      const accountWarnings: AssignmentWarning[] = [];
      
      if (currentOwner && currentOwner.rep_id !== bestRep.rep_id) {
        accountWarnings.push({
          severity: 'medium',
          type: 'continuity_broken',
          accountOrRep: account.account_name,
          reason: `Changed from ${currentOwner.name} to ${bestRep.name}`,
          details: `Current owner at capacity or doesn't match geography`
        });
      }

      const isUnderMin = this.assignmentType === 'customer' && sameGeoReps.some(r => {
        const workload = this.workloadMap.get(r.rep_id)!;
        return workload.arr < this.getMinimumThreshold();
      });

      return {
        account,
        proposedRep: bestRep,
        currentOwner,
        rationale: isUnderMin ? 'Geography Match + Balancing' : 'Geography Match',
        warnings: accountWarnings,
        ruleApplied: 'Priority 2: Geography Match',
        arr: accountARR
      };
    }


    // Waterfall Priority 3b: Keep with current owner even if different geography, if has capacity
    // hasCapacity() automatically handles minimum thresholds - reps below minimum are treated as having capacity
    if (currentOwner && !currentOwner.is_strategic_rep) {
      if (this.hasCapacity(currentOwner.rep_id, accountARR, account.cre_count, account, currentOwner)) {
        const accountWarnings: AssignmentWarning[] = [];
        
        // Warn about cross-region assignment
        if (!this.isSameGeography(account, currentOwner)) {
          accountWarnings.push({
            severity: 'low',
            type: 'cross_region',
            accountOrRep: account.account_name,
            reason: `Account territory ${account.sales_territory || 'unknown'} assigned to ${currentOwner.region || 'unknown'} rep`,
            details: `Maintaining continuity with current owner despite geography mismatch`
          });
        }
        
        console.log(`✅ P3b: ${account.account_name} staying with ${currentOwner.name} (Continuity Cross-Geo) - ARR: ${(accountARR/1000000).toFixed(2)}M`);
        
        return {
          account,
          proposedRep: currentOwner,
          currentOwner,
          rationale: 'Current/Past Owner - Any Geography',
          warnings: accountWarnings,
          ruleApplied: 'Priority 3b: Current Owner',
          arr: accountARR
        };
      } else {
        console.log(`⚠️ P3b: ${account.account_name} can't stay with ${currentOwner.name} - at capacity`);
      }
    }

    // Waterfall Priority 4: Assign to best available rep globally - prioritize under-minimum
    const anyReps = allReps.filter(rep =>
      rep.is_active &&
      rep.include_in_assignments &&
      !rep.is_strategic_rep && // Exclude strategic reps from normal pool
      this.hasCapacity(rep.rep_id, accountARR, account.cre_count, account, rep)
    );

    if (anyReps.length > 0) {
      let bestRep: SalesRep;
      
      if (this.assignmentType === 'prospect') {
        // For prospects, sort by lowest account count
        bestRep = this.findMostCapacityRep(anyReps);
        console.log(`✅ P4: ${account.account_name} assigned to ${bestRep.name} (Best Available + Lowest Count) - Rep Count: ${this.workloadMap.get(bestRep.rep_id)!.accounts}`);
      } else {
        // For customers, use existing ARR-based logic
        const minThreshold = this.getMinimumThreshold();
        
        // First try to find reps below minimum threshold globally
        const underMinReps = anyReps.filter(rep => {
          const workload = this.workloadMap.get(rep.rep_id)!;
          return workload.arr < minThreshold;
        });
        
        if (underMinReps.length > 0) {
          // Assign to most under-loaded rep below minimum, using balance score
          bestRep = underMinReps.sort((a, b) => {
            const workloadA = this.workloadMap.get(a.rep_id)!;
            const workloadB = this.workloadMap.get(b.rep_id)!;
            const scoreA = this.calculateBalanceScore(workloadA);
            const scoreB = this.calculateBalanceScore(workloadB);
            return scoreA - scoreB; // Lower score = more under-loaded
          })[0];
          console.log(`✅ P4: ${account.account_name} assigned to ${bestRep.name} (Best Available + Below Min) - Rep ARR: ${(this.workloadMap.get(bestRep.rep_id)!.arr/1000000).toFixed(2)}M < ${(minThreshold/1000000).toFixed(2)}M`);
        } else {
          // All reps at or above minimum, use standard selection
          bestRep = this.findMostCapacityRep(anyReps);
          console.log(`✅ P4: ${account.account_name} assigned to ${bestRep.name} (Best Available) - Rep ARR: ${(this.workloadMap.get(bestRep.rep_id)!.arr/1000000).toFixed(2)}M`);
        }
      }
      
      const accountWarnings: AssignmentWarning[] = [];

      accountWarnings.push({
        severity: 'low',
        type: 'cross_region',
        accountOrRep: account.account_name,
        reason: `Account territory ${account.sales_territory || 'unknown'} assigned to ${bestRep.region || 'unknown'} rep`,
        details: `No capacity in account's home region; Changed from ${currentOwner?.name || 'unknown'} to ${bestRep.name}: Current owner at capacity`
      });

      if (currentOwner && currentOwner.rep_id !== bestRep.rep_id) {
        accountWarnings.push({
          severity: 'medium',
          type: 'continuity_broken',
          accountOrRep: account.account_name,
          reason: `Changed from ${currentOwner.name} to ${bestRep.name}`,
          details: `Current owner at capacity`
        });
      }

      const isUnderMin = this.assignmentType === 'customer' && anyReps.some(r => {
        const workload = this.workloadMap.get(r.rep_id)!;
        return workload.arr < this.getMinimumThreshold();
      });

      return {
        account,
        proposedRep: bestRep,
        currentOwner,
        rationale: isUnderMin ? 'Best Available + Balancing' : 'Best Available',
        warnings: accountWarnings,
        ruleApplied: 'Priority 4: Best Available',
        arr: accountARR
      };
    }

    // Priority 5: FORCE ASSIGNMENT - Assign to least loaded rep when all are at capacity
    // This ensures 100% of accounts get assigned, even if it means exceeding thresholds
    console.warn(`⚠️ P5: All reps at capacity for ${account.account_name} - forcing assignment to least loaded rep`);

    // Get all eligible reps (active, assignable, non-strategic)
    const allEligibleReps = allReps.filter(rep => 
      rep.is_active && 
      rep.include_in_assignments &&
      !rep.is_strategic_rep
    );

    if (allEligibleReps.length === 0) {
      throw new Error('No active reps available for assignment');
    }

    // For prospects, find the rep with the LOWEST account count
    let leastLoadedRep: SalesRep;
    if (this.assignmentType === 'prospect') {
      // Sort by account count ascending (lowest first)
      leastLoadedRep = allEligibleReps.sort((a, b) => {
        const workloadA = this.workloadMap.get(a.rep_id)!;
        const workloadB = this.workloadMap.get(b.rep_id)!;
        return workloadA.accounts - workloadB.accounts;
      })[0];
      
      const currentCount = this.workloadMap.get(leastLoadedRep.rep_id)!.accounts;
      console.log(`✅ P5: ${account.account_name} FORCE-assigned to ${leastLoadedRep.name} (Lowest Count: ${currentCount} accounts)`);
    } else {
      // For customers, use ARR-based selection
      leastLoadedRep = this.findMostCapacityRep(allEligibleReps);
      console.log(`✅ P5: ${account.account_name} FORCE-assigned to ${leastLoadedRep.name} (Lowest ARR)`);
    }

    const fallbackWarnings: AssignmentWarning[] = [{
      severity: 'high',
      type: 'capacity_exceeded',
      accountOrRep: leastLoadedRep.name,
      reason: `All reps at capacity - forced assignment`,
      details: `Rep may exceed target thresholds (Target: ${Math.ceil(this.totalProspectCount / allEligibleReps.length)}, Max: ${Math.round(Math.ceil(this.totalProspectCount / allEligibleReps.length) * 1.5)})`
    }];

    if (currentOwner && currentOwner.rep_id !== leastLoadedRep.rep_id) {
      fallbackWarnings.push({
        severity: 'medium',
        type: 'continuity_broken',
        accountOrRep: account.account_name,
        reason: `Changed from ${currentOwner.name} to ${leastLoadedRep.name}`,
        details: `Forced reassignment due to capacity constraints`
      });
    }

    return {
      account,
      proposedRep: leastLoadedRep,
      currentOwner,
      rationale: 'Force Assignment - All Reps At Capacity',
      warnings: fallbackWarnings,
      ruleApplied: 'Priority 5: Forced Assignment',
      arr: accountARR
    };
  }

  private isStrategicAccount(account: Account): boolean {
    // Strategic accounts are those currently owned by strategic reps
    const currentOwner = account.owner_id ? this.repMap.get(account.owner_id) : null;
    return currentOwner?.is_strategic_rep || false;
  }

  private matchesStrategicPool(accountIsStrategic: boolean, rep: SalesRep): boolean {
    // This method is no longer needed as strategic accounts are handled separately
    // Normal accounts should never go to strategic reps
    return !rep.is_strategic_rep;
  }

  private isSameGeography(account: Account, rep: SalesRep): boolean {
    const accountTerritory = (account.sales_territory || '').trim();
    const repRegion = (rep.region || '').trim();
    
    if (!accountTerritory || !repRegion) {
      // Log warning for reps without regions
      if (!repRegion && rep.is_active && rep.include_in_assignments) {
        console.warn(`⚠️ Rep "${rep.name}" (${rep.rep_id}) has no region - cannot match geography`);
      }
      return false;
    }
    
    // FIRST: Check configured territory mappings from config
    const mappings = this.config.territory_mappings as Record<string, string> | undefined;
    if (mappings && mappings[accountTerritory]) {
      const mappedRegion = mappings[accountTerritory];
      return mappedRegion.toLowerCase() === repRegion.toLowerCase();
    }
    
    // SECOND: Use auto-mapping utility (standardized territory to region mapping)
    const mappedRegion = autoMapTerritoryToRegion(accountTerritory);
    if (mappedRegion) {
      const isMatch = mappedRegion.toLowerCase() === repRegion.toLowerCase();
      if (isMatch) {
        console.log(`🗺️ Territory Mapping: "${accountTerritory}" → "${mappedRegion}" (matches ${rep.name})`);
      }
      return isMatch;
    }
    
    // FALLBACK: Direct string comparison (for unmapped territories)
    return accountTerritory.toLowerCase() === repRegion.toLowerCase();
  }

  private hasCapacity(repId: string, accountARR: number, accountCRE: number, account: Account, rep: SalesRep, ignoreCRE: boolean = false): boolean {
    const workload = this.workloadMap.get(repId)!;
    
    // STRATEGIC REPS: No capacity limits apply (bypass all threshold checks)
    if (rep.is_strategic_rep) {
      return true;
    }
    
    // PROSPECTS: Always return true (no hard capacity limits)
    // Distribution will be handled naturally through sorting by account count
    if (this.assignmentType === 'prospect') {
      return true;
    }
    
    const capacityLimit = this.getCapacityLimit();
    const targetARR = this.getTargetARR();
    const minThreshold = this.getMinimumThreshold();
    const preferredMax = targetARR * (1 + (this.config.capacity_variance_percent || 10) / 100);
    
    // STANDARD CAPACITY LOGIC (for customers)
    const currentLoad = workload.arr;
    const newLoad = currentLoad + accountARR;
    
    // Multi-dimensional minimum enforcement: If rep is below minimum on ANY metric
    const isBelowMinimumOnAnyMetric = this.isBelowMinimumThreshold(repId);
    if (isBelowMinimumOnAnyMetric) {
      // 1. Never exceed absolute hard cap
      if (newLoad > capacityLimit) {
        return false;
      }
      
      // 2. If this brings rep into target range (min to preferred max), excellent!
      if (newLoad >= minThreshold && newLoad <= preferredMax) {
        return true;
      }
      
      // 3. If rep is far below minimum (< 50% of min), allow up to 20% over preferred max
      if (currentLoad < (minThreshold * 0.5) && newLoad <= (preferredMax * 1.2)) {
        return true;
      }
      
      // 4. Otherwise, only accept if within 15% of preferred max
      return newLoad <= (preferredMax * 1.15);
    }
    
    // Rep is at/above minimum - check if they can stay within preferred max
    if (newLoad > preferredMax) {
      return false;
    }
    
    // Check CRE capacity (hard blocker) - can be skipped for continuity checks or prospects
    if (!ignoreCRE && accountCRE > 0 && workload.cre >= this.config.max_cre_per_rep) {
      return false;
    }
    
    return true;
  }

  private isBelowMinimumThreshold(repId: string): boolean {
    // Check if rep is below minimum threshold on ANY configured metric
    const workload = this.workloadMap.get(repId)!;
    
    // ARR minimum (use appropriate metric based on assignment type)
    const arrMin = this.getMinimumThreshold();
    const currentLoad = this.assignmentType === 'prospect' ? workload.netARR : workload.arr;
    if (currentLoad < arrMin) return true;
    
    // CRE minimum (if configured)
    const creMin = (this.config as any).cre_min;
    if (creMin && workload.cre < creMin) return true;
    
    // ATR minimum (if configured)
    const atrMin = (this.config as any).atr_min;
    if (atrMin && workload.atr < atrMin) return true;
    
    // Tier 1 minimum (if configured)
    const tier1Min = (this.config as any).tier1_min;
    if (tier1Min && workload.tier1 < tier1Min) return true;
    
    // Tier 2 minimum (if configured)
    const tier2Min = (this.config as any).tier2_min;
    if (tier2Min && workload.tier2 < tier2Min) return true;
    
    return false;
  }

  private isWellBelowTarget(repId: string): boolean {
    // Check if a rep is significantly below target (less than 50% of target ARR)
    const workload = this.workloadMap.get(repId)!;
    const targetARR = this.getTargetARR();
    return workload.arr < (targetARR * 0.5);
  }

  private shouldPrioritizeBalancing(repId: string, accountARR: number): boolean {
    // Prioritize balancing if rep is well below target and this account would help
    const workload = this.workloadMap.get(repId)!;
    const targetARR = this.getTargetARR();
    const minARR = targetARR * 0.9; // 90% of target minimum
    
    // If rep is below minimum and would still be below target after this assignment
    return workload.arr < minARR && (workload.arr + accountARR) <= targetARR;
  }

  private findMostCapacityRep(reps: SalesRep[]): SalesRep {
    // For prospects, sort by lowest account count
    if (this.assignmentType === 'prospect') {
      return reps.reduce((best, current) => {
        const bestWorkload = this.workloadMap.get(best.rep_id)!;
        const currentWorkload = this.workloadMap.get(current.rep_id)!;
        return currentWorkload.accounts < bestWorkload.accounts ? current : best;
      });
    }
    
    // For customers, use multi-dimensional selection
    const repsBelowMinimum = reps.filter(rep => this.isBelowMinimumThreshold(rep.rep_id));
    
    // If we have reps below minimum, select from them; otherwise use all reps
    const repsToConsider = repsBelowMinimum.length > 0 ? repsBelowMinimum : reps;
    
    // Find rep with LOWEST balance score (furthest below targets across all metrics)
    return repsToConsider.reduce((best, current) => {
      const bestWorkload = this.workloadMap.get(best.rep_id)!;
      const currentWorkload = this.workloadMap.get(current.rep_id)!;
      
      // Use comprehensive balance score across ALL configured metrics
      const bestBalanceScore = this.calculateBalanceScore(bestWorkload);
      const currentBalanceScore = this.calculateBalanceScore(currentWorkload);
      
      // Lower score = more under-loaded = better candidate
      if (Math.abs(bestBalanceScore - currentBalanceScore) > 0.05) {
        return currentBalanceScore < bestBalanceScore ? current : best;
      }
      
      // If balance scores are very close, use absolute ARR as tie-breaker
      return currentWorkload.arr < bestWorkload.arr ? current : best;
    });
  }

  private calculateBalanceScore(workload: WorkloadState): number {
    // Calculate comprehensive balance score across ALL configured metrics
    // Lower score = more under-loaded = better candidate for new assignments
    let totalScore = 0;
    let metricsConsidered = 0;
    
    // ARR scoring (ALWAYS included)
    const targetARR = this.getTargetARR();
    if (targetARR > 0) {
      totalScore += (workload.arr / targetARR);
      metricsConsidered++;
    }
    
    // CRE scoring (if configured)
    const creTarget = (this.config as any).cre_target;
    if (creTarget && creTarget > 0) {
      totalScore += (workload.cre / creTarget);
      metricsConsidered++;
    }
    
    // ATR scoring (if configured)
    const atrTarget = (this.config as any).atr_target;
    if (atrTarget && atrTarget > 0) {
      totalScore += (workload.atr / atrTarget);
      metricsConsidered++;
    }
    
    // Tier 1 scoring (if configured)
    const tier1Target = (this.config as any).tier1_target;
    if (tier1Target && tier1Target > 0) {
      totalScore += (workload.tier1 / tier1Target);
      metricsConsidered++;
    }
    
    // Tier 2 scoring (if configured)
    const tier2Target = (this.config as any).tier2_target;
    if (tier2Target && tier2Target > 0) {
      totalScore += (workload.tier2 / tier2Target);
      metricsConsidered++;
    }
    
    // Average the score across all considered metrics
    if (metricsConsidered === 0) {
      // Fallback if no targets configured at all
      if (targetARR > 0) {
        return workload.arr / targetARR;
      }
      return 1; // Neutral score if no targets at all
    }
    
    // Return average score across all metrics
    return totalScore / metricsConsidered;
  }

  private updateWorkload(repId: string, account: Account) {
    const workload = this.workloadMap.get(repId)!;
    const accountARR = account.calculated_arr || account.arr || 0;
    
    // For prospects, track Net ARR separately from account ARR
    if (this.assignmentType === 'prospect') {
      const accountNetARR = this.opportunitiesMap.get(account.sfdc_account_id) || 0;
      workload.netARR += accountNetARR;
      workload.arr += accountARR; // Still track account ARR for reference
    } else {
      workload.arr += accountARR;
    }
    
    workload.accounts += 1;
    
    // For prospects, don't track CRE
    if (this.assignmentType === 'prospect') {
      workload.cre += 0;
    } else {
      // For customers, track CRE normally
      workload.cre += account.cre_count || 0;
    }
    
    workload.atr += account.calculated_atr || 0;
    
    if (account.expansion_tier === 'Tier 1') {
      workload.tier1 += 1;
    } else if (account.expansion_tier === 'Tier 2') {
      workload.tier2 += 1;
    }
    
    // Track quarterly renewals
    const quarter = account.renewal_quarter?.toUpperCase();
    if (quarter === 'Q1') workload.q1_renewals += 1;
    if (quarter === 'Q2') workload.q2_renewals += 1;
    if (quarter === 'Q3') workload.q3_renewals += 1;
    if (quarter === 'Q4') workload.q4_renewals += 1;
  }

  private checkPostAssignmentWarnings(reps: SalesRep[]) {
    reps.forEach(rep => {
      const workload = this.workloadMap.get(rep.rep_id)!;
      
      // CRE concentration - skip for prospects
      if (this.assignmentType !== 'prospect' && workload.cre >= this.config.max_cre_per_rep) {
        this.warnings.push({
          severity: 'high',
          type: 'cre_risk',
          accountOrRep: rep.name,
          reason: `Rep has ${workload.cre} CRE accounts (threshold: ${this.config.max_cre_per_rep})`,
          details: `Consider redistributing CRE accounts`
        });
      }

      // Tier 1 concentration
      if (workload.tier1 > (this.config.max_tier1_per_rep || 5)) {
        this.warnings.push({
          severity: 'medium',
          type: 'tier_concentration',
          accountOrRep: rep.name,
          reason: `Rep has ${workload.tier1} Tier 1 accounts (threshold: ${this.config.max_tier1_per_rep})`,
          details: `May require additional support or capacity`
        });
      }

      // Tier 2 concentration
      if (workload.tier2 > (this.config.max_tier2_per_rep || 8)) {
        this.warnings.push({
          severity: 'low',
          type: 'tier_concentration',
          accountOrRep: rep.name,
          reason: `Rep has ${workload.tier2} Tier 2 accounts (threshold: ${this.config.max_tier2_per_rep})`,
          details: `Monitor for workload balance`
        });
      }
    });
  }
}

export async function generateSimplifiedAssignments(
  buildId: string,
  assignmentType: 'customer' | 'prospect',
  accounts: Account[],
  reps: SalesRep[],
  config: AssignmentConfiguration,
  opportunities?: Array<{sfdc_account_id: string, net_arr: number}>
): Promise<{ proposals: AssignmentProposal[], warnings: AssignmentWarning[] }> {
  const engine = new WaterfallAssignmentEngine(buildId, assignmentType, config, opportunities);
  return engine.generateAssignments(accounts, reps);
}
