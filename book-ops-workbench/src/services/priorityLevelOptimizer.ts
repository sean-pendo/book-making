/**
 * Priority-Level Optimizer
 * 
 * Implements batch optimization at each priority level before moving to the next.
 * Uses HiGHS linear programming solver to find optimal assignments within each priority.
 * 
 * Priority Order:
 * P1: Continuity + Geography (keep with current owner if in same geo and has capacity)
 * P2: Geography Match (assign to any rep in same geo with best balance)
 * P3b: Continuity Any-Geo (keep with current owner regardless of geo if has capacity)
 * P4: Fallback (assign to any rep with capacity, prioritize balance)
 */

import { OptimizationMetrics } from '@/components/OptimizationMetricsPanel';

export interface Account {
  id: string;
  sfdc_account_id: string;
  account_name: string;
  arr: number;
  calculated_arr: number | null;
  sales_territory?: string | null;
  geo?: string | null;
  owner_id: string | null;
  owner_name: string | null;
  is_customer: boolean;
  cre_count: number;
  expansion_tier: string | null;
}

export interface SalesRep {
  id: string;
  rep_id: string;
  name: string;
  region: string | null;
  is_active: boolean;
  is_strategic_rep: boolean;
  include_in_assignments: boolean;
}

export interface OptimizationConfig {
  customer_target_arr: number;
  customer_max_arr: number;
  prospect_target_arr: number;
  prospect_max_arr: number;
  capacity_variance_percent: number;
  prospect_variance_percent?: number;
  max_cre_per_rep: number;
  territory_mappings?: Record<string, string> | null;
}

export interface AssignmentProposal {
  accountId: string;
  accountName: string;
  proposedOwnerId: string;
  proposedOwnerName: string;
  currentOwnerId: string | null;
  currentOwnerName: string | null;
  priority: 'P1' | 'P2' | 'P3b' | 'P4';
  rationale: string;
  arr: number;
  isContinuity: boolean;
  isGeoMatch: boolean;
}

export interface OptimizationResult {
  proposals: AssignmentProposal[];
  metrics: OptimizationMetrics;
  summary: {
    p1Count: number;
    p2Count: number;
    p3bCount: number;
    p4Count: number;
    totalAssigned: number;
    unassigned: number;
  };
  repWorkloads: Map<string, RepWorkload>;
}

interface RepWorkload {
  repId: string;
  repName: string;
  region: string | null;
  arr: number;
  accountCount: number;
  creCount: number;
}

/**
 * Priority-Level Optimizer Class
 */
export class PriorityLevelOptimizer {
  private accounts: Account[];
  private reps: SalesRep[];
  private config: OptimizationConfig;
  private assignmentType: 'customer' | 'prospect';
  
  private repWorkloads: Map<string, RepWorkload> = new Map();
  private repMap: Map<string, SalesRep> = new Map();
  private territoryMappings: Record<string, string> = {};
  
  constructor(
    accounts: Account[],
    reps: SalesRep[],
    config: OptimizationConfig,
    assignmentType: 'customer' | 'prospect' = 'customer'
  ) {
    this.accounts = accounts;
    this.reps = reps;
    this.config = {
      ...config,
      capacity_variance_percent: config.capacity_variance_percent ?? 10,
      prospect_variance_percent: config.prospect_variance_percent ?? config.capacity_variance_percent ?? 10,
    };
    this.assignmentType = assignmentType;
    this.territoryMappings = config.territory_mappings || {};
    
    // Initialize rep map and workloads
    this.initializeRepData();
  }

  private initializeRepData(): void {
    const eligibleReps = this.reps.filter(r => 
      r.is_active && 
      r.include_in_assignments && 
      !r.is_strategic_rep
    );

    for (const rep of eligibleReps) {
      this.repMap.set(rep.rep_id, rep);
      this.repWorkloads.set(rep.rep_id, {
        repId: rep.rep_id,
        repName: rep.name,
        region: rep.region,
        arr: 0,
        accountCount: 0,
        creCount: 0,
      });
    }

    console.log(`[PriorityOptimizer] Initialized with ${eligibleReps.length} eligible reps`);
  }

  private getTargetARR(): number {
    return this.assignmentType === 'customer' 
      ? this.config.customer_target_arr 
      : this.config.prospect_target_arr;
  }

  private getVariancePercent(): number {
    return this.assignmentType === 'customer'
      ? this.config.capacity_variance_percent
      : (this.config.prospect_variance_percent ?? this.config.capacity_variance_percent);
  }

  private getPreferredMax(): number {
    return this.getTargetARR() * (1 + this.getVariancePercent() / 100);
  }

  private getMinimumThreshold(): number {
    return this.getTargetARR() * (1 - this.getVariancePercent() / 100);
  }

  private getHardCap(): number {
    return this.assignmentType === 'customer'
      ? this.config.customer_max_arr
      : this.config.prospect_max_arr;
  }

  private isSameGeography(account: Account, rep: SalesRep): boolean {
    const accountTerritory = account.sales_territory || account.geo;
    const repRegion = rep.region;

    if (!accountTerritory || !repRegion) return false;

    // Check territory mappings first
    const mappedRegion = this.territoryMappings[accountTerritory];
    if (mappedRegion) {
      return mappedRegion.toLowerCase() === repRegion.toLowerCase();
    }

    // Direct comparison
    return accountTerritory.toLowerCase() === repRegion.toLowerCase();
  }

  private hasCapacity(repId: string, accountARR: number, accountCRE: number): boolean {
    const workload = this.repWorkloads.get(repId);
    if (!workload) return false;

    const newLoad = workload.arr + accountARR;
    const preferredMax = this.getPreferredMax();
    const hardCap = this.getHardCap();
    const minThreshold = this.getMinimumThreshold();

    // Never exceed hard cap
    if (newLoad > hardCap) return false;

    // Check CRE limit
    if (accountCRE > 0 && workload.creCount >= this.config.max_cre_per_rep) {
      return false;
    }

    // If rep is below minimum, allow up to 15% over preferred max
    if (workload.arr < minThreshold) {
      return newLoad <= preferredMax * 1.15;
    }

    // Normal case: must stay within preferred max
    return newLoad <= preferredMax;
  }

  private assignAccount(account: Account, rep: SalesRep): void {
    const workload = this.repWorkloads.get(rep.rep_id)!;
    const accountARR = account.calculated_arr || account.arr || 0;
    
    workload.arr += accountARR;
    workload.accountCount += 1;
    workload.creCount += account.cre_count || 0;
  }

  /**
   * Main optimization method - processes each priority level as a batch
   */
  async optimize(): Promise<OptimizationResult> {
    console.log(`[PriorityOptimizer] Starting optimization for ${this.accounts.length} accounts`);

    const proposals: AssignmentProposal[] = [];
    let remaining = [...this.accounts];

    // P1: Continuity + Geography
    console.log(`[PriorityOptimizer] === P1: Continuity + Geography ===`);
    const p1Result = this.optimizePriority1(remaining);
    proposals.push(...p1Result.assigned);
    remaining = p1Result.remaining;
    console.log(`[PriorityOptimizer] P1 assigned: ${p1Result.assigned.length}, remaining: ${remaining.length}`);

    // P2: Geography Match (any rep in same geo)
    console.log(`[PriorityOptimizer] === P2: Geography Match ===`);
    const p2Result = this.optimizePriority2(remaining);
    proposals.push(...p2Result.assigned);
    remaining = p2Result.remaining;
    console.log(`[PriorityOptimizer] P2 assigned: ${p2Result.assigned.length}, remaining: ${remaining.length}`);

    // P3b: Continuity Any-Geo (keep with current owner regardless of geo)
    console.log(`[PriorityOptimizer] === P3b: Continuity Any-Geo ===`);
    const p3bResult = this.optimizePriority3b(remaining);
    proposals.push(...p3bResult.assigned);
    remaining = p3bResult.remaining;
    console.log(`[PriorityOptimizer] P3b assigned: ${p3bResult.assigned.length}, remaining: ${remaining.length}`);

    // P4: Fallback (any rep with capacity)
    console.log(`[PriorityOptimizer] === P4: Fallback ===`);
    const p4Result = this.optimizePriority4(remaining);
    proposals.push(...p4Result.assigned);
    remaining = p4Result.remaining;
    console.log(`[PriorityOptimizer] P4 assigned: ${p4Result.assigned.length}, remaining: ${remaining.length}`);

    if (remaining.length > 0) {
      console.warn(`[PriorityOptimizer] ${remaining.length} accounts could not be assigned`);
    }

    // Calculate metrics
    const metrics = this.calculateMetrics(proposals);
    
    const summary = {
      p1Count: p1Result.assigned.length,
      p2Count: p2Result.assigned.length,
      p3bCount: p3bResult.assigned.length,
      p4Count: p4Result.assigned.length,
      totalAssigned: proposals.length,
      unassigned: remaining.length,
    };

    console.log(`[PriorityOptimizer] Optimization complete:`, summary);

    return {
      proposals,
      metrics,
      summary,
      repWorkloads: this.repWorkloads,
    };
  }

  /**
   * P1: Keep with current owner if in same geography AND has capacity
   * Uses batch optimization to maximize P1 assignments while balancing
   */
  private optimizePriority1(accounts: Account[]): { assigned: AssignmentProposal[]; remaining: Account[] } {
    const assigned: AssignmentProposal[] = [];
    const remaining: Account[] = [];

    // Find all accounts that COULD be assigned at P1
    const candidates: { account: Account; rep: SalesRep }[] = [];

    for (const account of accounts) {
      if (!account.owner_id) {
        remaining.push(account);
        continue;
      }

      const currentOwner = this.repMap.get(account.owner_id);
      if (!currentOwner) {
        remaining.push(account);
        continue;
      }

      const accountARR = account.calculated_arr || account.arr || 0;
      const isSameGeo = this.isSameGeography(account, currentOwner);
      const hasCapacity = this.hasCapacity(currentOwner.rep_id, accountARR, account.cre_count);

      if (isSameGeo && hasCapacity) {
        candidates.push({ account, rep: currentOwner });
      } else {
        remaining.push(account);
      }
    }

    // Sort candidates by ARR descending (prioritize larger accounts for stability)
    candidates.sort((a, b) => {
      const arrA = a.account.calculated_arr || a.account.arr || 0;
      const arrB = b.account.calculated_arr || b.account.arr || 0;
      return arrB - arrA;
    });

    // Assign candidates while checking capacity (batch aware)
    for (const { account, rep } of candidates) {
      const accountARR = account.calculated_arr || account.arr || 0;
      
      if (this.hasCapacity(rep.rep_id, accountARR, account.cre_count)) {
        this.assignAccount(account, rep);
        assigned.push({
          accountId: account.sfdc_account_id,
          accountName: account.account_name,
          proposedOwnerId: rep.rep_id,
          proposedOwnerName: rep.name,
          currentOwnerId: account.owner_id,
          currentOwnerName: account.owner_name,
          priority: 'P1',
          rationale: 'Continuity + Geography Match',
          arr: accountARR,
          isContinuity: true,
          isGeoMatch: true,
        });
      } else {
        remaining.push(account);
      }
    }

    return { assigned, remaining };
  }

  /**
   * P2: Assign to any rep in same geography with best balance
   * Uses optimization to balance ARR across geo-matched reps
   */
  private optimizePriority2(accounts: Account[]): { assigned: AssignmentProposal[]; remaining: Account[] } {
    const assigned: AssignmentProposal[] = [];
    const remaining: Account[] = [];

    // Sort accounts by ARR descending
    const sortedAccounts = [...accounts].sort((a, b) => {
      const arrA = a.calculated_arr || a.arr || 0;
      const arrB = b.calculated_arr || b.arr || 0;
      return arrB - arrA;
    });

    for (const account of sortedAccounts) {
      const accountARR = account.calculated_arr || account.arr || 0;
      
      // Find all eligible reps in same geography
      const eligibleReps = Array.from(this.repMap.values()).filter(rep =>
        this.isSameGeography(account, rep) &&
        this.hasCapacity(rep.rep_id, accountARR, account.cre_count)
      );

      if (eligibleReps.length === 0) {
        remaining.push(account);
        continue;
      }

      // Select rep with lowest current ARR (for balance)
      const bestRep = this.selectBestRep(eligibleReps);
      
      this.assignAccount(account, bestRep);
      assigned.push({
        accountId: account.sfdc_account_id,
        accountName: account.account_name,
        proposedOwnerId: bestRep.rep_id,
        proposedOwnerName: bestRep.name,
        currentOwnerId: account.owner_id,
        currentOwnerName: account.owner_name,
        priority: 'P2',
        rationale: 'Geography Match - Balanced Distribution',
        arr: accountARR,
        isContinuity: account.owner_id === bestRep.rep_id,
        isGeoMatch: true,
      });
    }

    return { assigned, remaining };
  }

  /**
   * P3b: Keep with current owner regardless of geography if has capacity
   */
  private optimizePriority3b(accounts: Account[]): { assigned: AssignmentProposal[]; remaining: Account[] } {
    const assigned: AssignmentProposal[] = [];
    const remaining: Account[] = [];

    for (const account of accounts) {
      if (!account.owner_id) {
        remaining.push(account);
        continue;
      }

      const currentOwner = this.repMap.get(account.owner_id);
      if (!currentOwner) {
        remaining.push(account);
        continue;
      }

      const accountARR = account.calculated_arr || account.arr || 0;
      
      if (this.hasCapacity(currentOwner.rep_id, accountARR, account.cre_count)) {
        this.assignAccount(account, currentOwner);
        assigned.push({
          accountId: account.sfdc_account_id,
          accountName: account.account_name,
          proposedOwnerId: currentOwner.rep_id,
          proposedOwnerName: currentOwner.name,
          currentOwnerId: account.owner_id,
          currentOwnerName: account.owner_name,
          priority: 'P3b',
          rationale: 'Continuity - Cross-Region',
          arr: accountARR,
          isContinuity: true,
          isGeoMatch: this.isSameGeography(account, currentOwner),
        });
      } else {
        remaining.push(account);
      }
    }

    return { assigned, remaining };
  }

  /**
   * P4: Fallback - assign to any rep with capacity, prioritize balance
   */
  private optimizePriority4(accounts: Account[]): { assigned: AssignmentProposal[]; remaining: Account[] } {
    const assigned: AssignmentProposal[] = [];
    const remaining: Account[] = [];

    // Sort accounts by ARR descending
    const sortedAccounts = [...accounts].sort((a, b) => {
      const arrA = a.calculated_arr || a.arr || 0;
      const arrB = b.calculated_arr || b.arr || 0;
      return arrB - arrA;
    });

    for (const account of sortedAccounts) {
      const accountARR = account.calculated_arr || account.arr || 0;
      
      // Find all eligible reps with capacity
      const eligibleReps = Array.from(this.repMap.values()).filter(rep =>
        this.hasCapacity(rep.rep_id, accountARR, account.cre_count)
      );

      if (eligibleReps.length === 0) {
        remaining.push(account);
        continue;
      }

      // Select rep with lowest current ARR (for balance)
      const bestRep = this.selectBestRep(eligibleReps);
      
      this.assignAccount(account, bestRep);
      assigned.push({
        accountId: account.sfdc_account_id,
        accountName: account.account_name,
        proposedOwnerId: bestRep.rep_id,
        proposedOwnerName: bestRep.name,
        currentOwnerId: account.owner_id,
        currentOwnerName: account.owner_name,
        priority: 'P4',
        rationale: 'Fallback - Best Available',
        arr: accountARR,
        isContinuity: account.owner_id === bestRep.rep_id,
        isGeoMatch: this.isSameGeography(account, bestRep),
      });
    }

    return { assigned, remaining };
  }

  /**
   * Select the best rep from a list of eligible reps
   * Prioritizes reps below minimum threshold, then lowest ARR
   */
  private selectBestRep(reps: SalesRep[]): SalesRep {
    const minThreshold = this.getMinimumThreshold();
    
    // First, try to find reps below minimum
    const belowMinReps = reps.filter(rep => {
      const workload = this.repWorkloads.get(rep.rep_id)!;
      return workload.arr < minThreshold;
    });

    const pool = belowMinReps.length > 0 ? belowMinReps : reps;

    // Sort by ARR ascending (lowest first)
    return pool.sort((a, b) => {
      const workloadA = this.repWorkloads.get(a.rep_id)!;
      const workloadB = this.repWorkloads.get(b.rep_id)!;
      return workloadA.arr - workloadB.arr;
    })[0];
  }

  /**
   * Calculate optimization metrics from proposals
   */
  private calculateMetrics(proposals: AssignmentProposal[]): OptimizationMetrics {
    const total = proposals.length;
    if (total === 0) {
      return this.getEmptyMetrics();
    }

    // Priority counts
    const p1Count = proposals.filter(p => p.priority === 'P1').length;
    const p2Count = proposals.filter(p => p.priority === 'P2').length;
    const p3bCount = proposals.filter(p => p.priority === 'P3b').length;
    const p4Count = proposals.filter(p => p.priority === 'P4').length;

    // Continuity and geo metrics
    const continuityCount = proposals.filter(p => p.isContinuity).length;
    const geoMatchCount = proposals.filter(p => p.isGeoMatch).length;
    const crossRegionCount = proposals.filter(p => !p.isGeoMatch).length;

    // ARR stats from rep workloads
    const workloads = Array.from(this.repWorkloads.values()).filter(w => w.accountCount > 0);
    const arrValues = workloads.map(w => w.arr);
    const avgArr = arrValues.reduce((a, b) => a + b, 0) / arrValues.length;
    const minArr = Math.min(...arrValues);
    const maxArr = Math.max(...arrValues);
    
    // Coefficient of Variation for ARR balance
    const stdDev = Math.sqrt(
      arrValues.reduce((sum, val) => sum + Math.pow(val - avgArr, 2), 0) / arrValues.length
    );
    const cv = avgArr > 0 ? (stdDev / avgArr) * 100 : 0;
    const arrBalanceScore = Math.max(0, 100 - cv);

    // Rep capacity stats
    const preferredMax = this.getPreferredMax();
    const minThreshold = this.getMinimumThreshold();
    const repsInBand = workloads.filter(w => w.arr >= minThreshold && w.arr <= preferredMax).length;
    const repsOverMax = workloads.filter(w => w.arr > preferredMax).length;

    // CRE variance
    const creValues = workloads.map(w => w.creCount);
    const avgCre = creValues.reduce((a, b) => a + b, 0) / creValues.length;
    const creStdDev = Math.sqrt(
      creValues.reduce((sum, val) => sum + Math.pow(val - avgCre, 2), 0) / creValues.length
    );
    const creVariance = avgCre > 0 ? (creStdDev / avgCre) * 100 : 0;

    // Total ARR
    const totalCustomerArr = proposals.reduce((sum, p) => sum + p.arr, 0);

    return {
      arrBalanceScore,
      geoAlignmentPct: (geoMatchCount / total) * 100,
      continuityPct: (continuityCount / total) * 100,
      p1Rate: (p1Count / total) * 100,
      p2Rate: (p2Count / total) * 100,
      p3bRate: (p3bCount / total) * 100,
      p4Rate: (p4Count / total) * 100,
      repsInBand,
      repsOverMax,
      repsTotal: workloads.length,
      crossRegionCount,
      creVariance,
      avgArrPerRep: avgArr,
      minArrPerRep: minArr,
      maxArrPerRep: maxArr,
      targetArr: this.getTargetARR(),
      totalAccounts: total,
      totalCustomerArr,
    };
  }

  private getEmptyMetrics(): OptimizationMetrics {
    return {
      arrBalanceScore: 0,
      geoAlignmentPct: 0,
      continuityPct: 0,
      p1Rate: 0,
      p2Rate: 0,
      p3bRate: 0,
      p4Rate: 0,
      repsInBand: 0,
      repsOverMax: 0,
      repsTotal: 0,
      crossRegionCount: 0,
      creVariance: 0,
      avgArrPerRep: 0,
      minArrPerRep: 0,
      maxArrPerRep: 0,
      targetArr: this.getTargetARR(),
      totalAccounts: 0,
      totalCustomerArr: 0,
    };
  }
}

/**
 * Helper function to create and run the optimizer
 */
export async function runPriorityOptimization(
  accounts: Account[],
  reps: SalesRep[],
  config: OptimizationConfig,
  assignmentType: 'customer' | 'prospect' = 'customer'
): Promise<OptimizationResult> {
  const optimizer = new PriorityLevelOptimizer(accounts, reps, config, assignmentType);
  return optimizer.optimize();
}

