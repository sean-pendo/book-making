import { supabase } from "@/integrations/supabase/client";

// Types
export interface Account {
  sfdc_account_id: string;
  account_name: string;
  owner_id?: string;
  owner_name?: string;
  sales_territory?: string;
  geo?: string;
  calculated_arr: number;
  is_customer?: boolean;
  is_parent?: boolean;
}

export interface SalesRep {
  rep_id: string;
  name: string;
  region?: string;
  team?: string;
  is_active?: boolean;
}

export interface AssignmentRule {
  id: string;
  name: string;
  rule_type: string;
  priority: number;
  conditions: any;
  enabled: boolean;
  account_scope: string;
}

export interface AssignmentProposal {
  accountId: string;
  accountName: string;
  currentOwnerId?: string;
  currentOwnerName?: string;
  proposedOwnerId: string;
  proposedOwnerName: string;
  proposedOwnerRegion?: string;
  assignmentReason: string;
  ruleApplied: string;
  conflictRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  arr?: number;
}

export interface RepWorkload {
  repId: string;
  repName: string;
  region: string;
  currentARR: number;
  currentAccounts: number;
  proposedARR: number;
  proposedAccounts: number;
  territories: Set<string>;
}

export interface BalanceConfig {
  minARRPerRep: number;
  minAccountsPerRep: number;
  maxVariancePercent: number;
  targetARRPerRep: number;
  respectTerritories: boolean;
}

export interface AssignmentResult {
  totalAccounts: number;
  assignedAccounts: number;
  unassignedAccounts: number;
  proposals: AssignmentProposal[];
  conflicts: AssignmentProposal[];
  statistics: {
    repWorkloads: RepWorkload[];
    balanceScore: number;
    varianceScore: number;
    totalConflicts: number;
    averageAssignmentsPerRep: number;
    leastLoadedRep: { name: string; assignments: number };
    mostLoadedRep: { name: string; assignments: number };
  };
}

export type ProgressCallback = (progress: {
  stage: string;
  progress: number;
  status: string;
  details?: any;
}) => void;

/**
 * Sophisticated Assignment Service with intelligent geo assignment, 
 * balance enforcement, and multi-pass processing
 */
export class SophisticatedAssignmentService {
  private static instance: SophisticatedAssignmentService;
  private progressCallback?: ProgressCallback;
  private cancelled = false;

  public static getInstance(): SophisticatedAssignmentService {
    if (!SophisticatedAssignmentService.instance) {
      SophisticatedAssignmentService.instance = new SophisticatedAssignmentService();
    }
    return SophisticatedAssignmentService.instance;
  }

  setProgressCallback(callback: ProgressCallback) {
    this.progressCallback = callback;
  }

  cancelGeneration() {
    this.cancelled = true;
  }

  /**
   * Main assignment generation method with multi-pass processing
   */
  async generateBalancedAssignments(
    buildId: string,
    tier?: string,
    accountType?: 'customers' | 'prospects'
  ): Promise<AssignmentResult> {
    this.cancelled = false;
    
    try {
      this.reportProgress({ stage: 'initializing', progress: 0, status: 'Loading data...' });

      // Load all required data
      const [rules, accounts, salesReps] = await Promise.all([
        this.getAssignmentRules(buildId),
        this.getParentAccounts(buildId, tier || 'Tier 1', accountType),
        this.getSalesReps(buildId)
      ]);

      this.reportProgress({ stage: 'analyzing', progress: 10, status: 'Analyzing workload distribution...' });

      // Initialize workload tracking
      const workloads = this.initializeWorkloads(salesReps, accounts);
      const balanceConfig = this.extractBalanceConfig(rules);
      
      // Calculate target distribution
      const totalARR = accounts.reduce((sum, acc) => sum + (acc.calculated_arr || 0), 0);
      const activeReps = salesReps.filter(rep => rep.is_active !== false);
      balanceConfig.targetARRPerRep = totalARR / activeReps.length;

      console.log(`[SOPHISTICATED] 🎯 Starting sophisticated assignment for ${accounts.length} accounts, ${activeReps.length} reps`);
      console.log(`[SOPHISTICATED] 💰 Total ARR: $${(totalARR/1000000).toFixed(1)}M, Target per rep: $${(balanceConfig.targetARRPerRep/1000000).toFixed(1)}M`);

      // Multi-pass processing
      const result = await this.processMultiPass(buildId, accounts, salesReps, rules, workloads, balanceConfig);

      this.reportProgress({ stage: 'complete', progress: 100, status: 'Assignment complete!' });
      
      return result;

    } catch (error) {
      console.error('[SOPHISTICATED] ❌ Assignment failed:', error);
      throw error;
    }
  }

  /**
   * Multi-pass processing: Geo -> Continuity -> Balance -> Optimization
   */
  private async processMultiPass(
    buildId: string,
    accounts: Account[],
    salesReps: SalesRep[],
    rules: AssignmentRule[],
    workloads: Map<string, RepWorkload>,
    balanceConfig: BalanceConfig
  ): Promise<AssignmentResult> {
    const allProposals: AssignmentProposal[] = [];
    const allConflicts: AssignmentProposal[] = [];
    let remainingAccounts = [...accounts];

    // PASS 1: Intelligent Geo Assignment with Continuity Preference
    this.reportProgress({ stage: 'geo_assignment', progress: 20, status: 'Pass 1: Intelligent geo assignment...' });
    const geoResult = await this.processGeoWithContinuity(remainingAccounts, salesReps, rules, workloads, balanceConfig);
    
    allProposals.push(...geoResult.proposals);
    allConflicts.push(...geoResult.conflicts);
    remainingAccounts = this.updateRemainingAccounts(remainingAccounts, geoResult.proposals);
    this.updateWorkloads(workloads, geoResult.proposals);

    console.log(`[PASS_1] ✅ Geo assignment: ${geoResult.proposals.length} accounts assigned`);

    // PASS 2: Balance Enforcement (Minimum Guarantees)
    this.reportProgress({ stage: 'balance_enforcement', progress: 50, status: 'Pass 2: Enforcing minimum guarantees...' });
    const balanceResult = await this.enforceMinimumGuarantees(remainingAccounts, salesReps, workloads, balanceConfig);
    
    allProposals.push(...balanceResult.proposals);
    allConflicts.push(...balanceResult.conflicts);
    remainingAccounts = this.updateRemainingAccounts(remainingAccounts, balanceResult.proposals);
    this.updateWorkloads(workloads, balanceResult.proposals);

    console.log(`[PASS_2] ✅ Balance enforcement: ${balanceResult.proposals.length} accounts assigned`);

    // PASS 3: Optimization Pass (Fine-tune Distribution)
    this.reportProgress({ stage: 'optimization', progress: 80, status: 'Pass 3: Optimizing distribution...' });
    const optimizationResult = await this.optimizeDistribution(remainingAccounts, salesReps, workloads, balanceConfig);
    
    allProposals.push(...optimizationResult.proposals);
    allConflicts.push(...optimizationResult.conflicts);
    this.updateWorkloads(workloads, optimizationResult.proposals);

    console.log(`[PASS_3] ✅ Optimization: ${optimizationResult.proposals.length} accounts assigned`);

    // Calculate final statistics
    const statistics = this.calculateFinalStatistics(accounts, allProposals, allConflicts, workloads);
    
    console.log(`[SOPHISTICATED] 🏁 Assignment complete: ${allProposals.length}/${accounts.length} accounts assigned`);
    console.log(`[SOPHISTICATED] 📊 Balance score: ${statistics.balanceScore.toFixed(2)}, Variance: ${statistics.varianceScore.toFixed(1)}%`);

    const totalAccounts = accounts.length;
    const assignedAccounts = allProposals.length;
    const unassignedAccounts = totalAccounts - assignedAccounts;

    return {
      totalAccounts,
      assignedAccounts,
      unassignedAccounts,
      proposals: allProposals,
      conflicts: allConflicts,
      statistics: {
        repWorkloads: statistics.repWorkloads,
        balanceScore: statistics.balanceScore,
        varianceScore: statistics.varianceScore,
        totalConflicts: statistics.totalConflicts,
        averageAssignmentsPerRep: statistics.averageAssignmentsPerRep,
        leastLoadedRep: statistics.leastLoadedRep,
        mostLoadedRep: statistics.mostLoadedRep
      }
    };
  }

  /**
   * Pass 1: Intelligent geo assignment with continuity preference
   */
  private async processGeoWithContinuity(
    accounts: Account[],
    salesReps: SalesRep[],
    rules: AssignmentRule[],
    workloads: Map<string, RepWorkload>,
    balanceConfig: BalanceConfig
  ): Promise<{ proposals: AssignmentProposal[], conflicts: AssignmentProposal[] }> {
    const proposals: AssignmentProposal[] = [];
    const conflicts: AssignmentProposal[] = [];

    // Get geo rules and territory mappings
    const geoRules = rules.filter(r => r.rule_type === 'GEO_FIRST' && r.enabled);
    const continuityRules = rules.filter(r => r.rule_type === 'CONTINUITY' && r.enabled);
    
    if (geoRules.length === 0) {
      console.log('[GEO] ⚠️ No geo rules found, skipping geo assignment');
      return { proposals, conflicts };
    }

    // Merge all territory mappings from geo rules
    const territoryMappings = this.mergeTerritoryMappings(geoRules);
    console.log(`[GEO] 🗺️ Merged territory mappings: ${Object.keys(territoryMappings).length} territories`);

    // Process each account
    for (const account of accounts) {
      const territory = account.sales_territory || account.geo;
      if (!territory) continue;

      const targetRegion = territoryMappings[territory];
      if (!targetRegion) continue;

      // Find reps in target region
      const regionReps = salesReps.filter(rep => rep.region === targetRegion && rep.is_active !== false);
      if (regionReps.length === 0) continue;

      // Prefer continuity if current owner is in correct region
      let selectedRep: SalesRep | null = null;
      
      if (account.owner_id && continuityRules.length > 0) {
        const currentOwner = regionReps.find(rep => rep.rep_id === account.owner_id);
        if (currentOwner && this.shouldRespectContinuity(account, currentOwner, workloads, balanceConfig)) {
          selectedRep = currentOwner;
        }
      }

      // If no continuity match, find best balanced rep in region
      if (!selectedRep) {
        selectedRep = this.findBestBalancedRep(regionReps, workloads, balanceConfig);
      }

      if (selectedRep) {
        proposals.push({
          accountId: account.sfdc_account_id,
          accountName: account.account_name,
          currentOwnerId: account.owner_id,
          currentOwnerName: account.owner_name,
          proposedOwnerId: selectedRep.rep_id,
          proposedOwnerName: selectedRep.name,
          proposedOwnerRegion: selectedRep.region,
          assignmentReason: account.owner_id === selectedRep.rep_id 
            ? `Geo + Continuity: ${territory} → ${targetRegion}` 
            : `Geo Assignment: ${territory} → ${targetRegion}`,
          ruleApplied: 'Intelligent Geo + Continuity',
          conflictRisk: 'LOW',
          arr: account.calculated_arr || 0
        });
      }
    }

    return { proposals, conflicts };
  }

  /**
   * Pass 2: Enforce minimum guarantees (every rep gets min ARR and accounts)
   */
  private async enforceMinimumGuarantees(
    accounts: Account[],
    salesReps: SalesRep[],
    workloads: Map<string, RepWorkload>,
    balanceConfig: BalanceConfig
  ): Promise<{ proposals: AssignmentProposal[], conflicts: AssignmentProposal[] }> {
    const proposals: AssignmentProposal[] = [];
    const conflicts: AssignmentProposal[] = [];

    const activeReps = salesReps.filter(rep => rep.is_active !== false);
    
    // Find reps below minimum thresholds
    const repsNeedingAccounts = activeReps.filter(rep => {
      const workload = workloads.get(rep.rep_id);
      return workload && (
        workload.proposedARR < balanceConfig.minARRPerRep ||
        workload.proposedAccounts < balanceConfig.minAccountsPerRep
      );
    });

    if (repsNeedingAccounts.length === 0) {
      console.log('[BALANCE] ✅ All reps meet minimum requirements');
      return { proposals, conflicts };
    }

    console.log(`[BALANCE] 🎯 ${repsNeedingAccounts.length} reps need minimum guarantee enforcement`);

    // Sort accounts by ARR (highest first) for efficient filling
    const sortedAccounts = [...accounts].sort((a, b) => (b.calculated_arr || 0) - (a.calculated_arr || 0));

    // Use "water-filling" algorithm - fill to minimum before giving excess
    for (const account of sortedAccounts) {
      if (repsNeedingAccounts.length === 0) break;

      // Find rep with highest need (furthest from minimum)
      const selectedRep = this.findRepWithHighestNeed(repsNeedingAccounts, workloads, balanceConfig);
      
      if (selectedRep) {
        proposals.push({
          accountId: account.sfdc_account_id,
          accountName: account.account_name,
          currentOwnerId: account.owner_id,
          currentOwnerName: account.owner_name,
          proposedOwnerId: selectedRep.rep_id,
          proposedOwnerName: selectedRep.name,
          proposedOwnerRegion: selectedRep.region,
          assignmentReason: `Minimum Guarantee: Ensuring $${(balanceConfig.minARRPerRep/1000000).toFixed(1)}M minimum ARR`,
          ruleApplied: 'Balance Enforcement',
          conflictRisk: 'LOW',
          arr: account.calculated_arr || 0
        });

        // Update workload and check if rep now meets minimums
        const workload = workloads.get(selectedRep.rep_id)!;
        workload.proposedARR += account.calculated_arr || 0;
        workload.proposedAccounts += 1;

        if (workload.proposedARR >= balanceConfig.minARRPerRep && 
            workload.proposedAccounts >= balanceConfig.minAccountsPerRep) {
          const index = repsNeedingAccounts.findIndex(r => r.rep_id === selectedRep.rep_id);
          if (index >= 0) repsNeedingAccounts.splice(index, 1);
        }
      }
    }

    return { proposals, conflicts };
  }

  /**
   * Pass 3: Optimize distribution to minimize variance while respecting constraints
   */
  private async optimizeDistribution(
    accounts: Account[],
    salesReps: SalesRep[],
    workloads: Map<string, RepWorkload>,
    balanceConfig: BalanceConfig
  ): Promise<{ proposals: AssignmentProposal[], conflicts: AssignmentProposal[] }> {
    const proposals: AssignmentProposal[] = [];
    const conflicts: AssignmentProposal[] = [];

    if (accounts.length === 0) {
      console.log('[OPTIMIZE] ✅ No remaining accounts to optimize');
      return { proposals, conflicts };
    }

    const activeReps = salesReps.filter(rep => rep.is_active !== false);
    
    // Sort accounts by ARR for intelligent distribution
    const sortedAccounts = [...accounts].sort((a, b) => (b.calculated_arr || 0) - (a.calculated_arr || 0));

    // Distribute remaining accounts to minimize variance
    for (const account of sortedAccounts) {
      const selectedRep = this.findOptimalRep(activeReps, workloads, balanceConfig);
      
      if (selectedRep) {
        proposals.push({
          accountId: account.sfdc_account_id,
          accountName: account.account_name,
          currentOwnerId: account.owner_id,
          currentOwnerName: account.owner_name,
          proposedOwnerId: selectedRep.rep_id,
          proposedOwnerName: selectedRep.name,
          proposedOwnerRegion: selectedRep.region,
          assignmentReason: 'Optimization: Minimizing workload variance',
          ruleApplied: 'Distribution Optimization',
          conflictRisk: 'LOW',
          arr: account.calculated_arr || 0
        });

        // Update workload
        const workload = workloads.get(selectedRep.rep_id)!;
        workload.proposedARR += account.calculated_arr || 0;
        workload.proposedAccounts += 1;
      }
    }

    return { proposals, conflicts };
  }

  // Helper Methods

  private initializeWorkloads(salesReps: SalesRep[], accounts: Account[]): Map<string, RepWorkload> {
    const workloads = new Map<string, RepWorkload>();
    
    for (const rep of salesReps) {
      if (rep.is_active === false) continue;
      
      workloads.set(rep.rep_id, {
        repId: rep.rep_id,
        repName: rep.name,
        region: rep.region || 'Unknown',
        currentARR: 0,
        currentAccounts: 0,
        proposedARR: 0,
        proposedAccounts: 0,
        territories: new Set()
      });
    }

    // Calculate current workloads
    for (const account of accounts) {
      if (account.owner_id && workloads.has(account.owner_id)) {
        const workload = workloads.get(account.owner_id)!;
        workload.currentARR += account.calculated_arr || 0;
        workload.currentAccounts += 1;
        workload.proposedARR += account.calculated_arr || 0;
        workload.proposedAccounts += 1;
        
        if (account.sales_territory) {
          workload.territories.add(account.sales_territory);
        }
      }
    }

    return workloads;
  }

  private extractBalanceConfig(rules: AssignmentRule[]): BalanceConfig {
    const balanceRules = rules.filter(r => 
      (r.rule_type === 'SMART_BALANCE' || r.rule_type === 'MIN_THRESHOLDS') && r.enabled
    );

    let config: BalanceConfig = {
      minARRPerRep: 1500000, // Default $1.5M
      minAccountsPerRep: 1,
      maxVariancePercent: 20,
      targetARRPerRep: 0, // Will be calculated
      respectTerritories: true
    };

    for (const rule of balanceRules) {
      const conditions = rule.conditions || {};
      
      if (conditions.minARRThreshold) {
        config.minARRPerRep = conditions.minARRThreshold * 1000000; // Convert to full amount
      }
      if (conditions.minCustomerARR) {
        config.minARRPerRep = conditions.minCustomerARR;
      }
      if (conditions.minAccountsThreshold) {
        config.minAccountsPerRep = conditions.minAccountsThreshold;
      }
      if (conditions.minParentAccounts) {
        config.minAccountsPerRep = conditions.minParentAccounts;
      }
      if (conditions.maxVariance || conditions.maxVariancePercent) {
        config.maxVariancePercent = conditions.maxVariance || conditions.maxVariancePercent;
      }
    }

    return config;
  }

  private mergeTerritoryMappings(geoRules: AssignmentRule[]): Record<string, string> {
    const merged: Record<string, string> = {};
    
    for (const rule of geoRules) {
      const mappings = rule.conditions?.territoryMappings || {};
      Object.assign(merged, mappings);
    }
    
    return merged;
  }

  private shouldRespectContinuity(
    account: Account,
    currentOwner: SalesRep,
    workloads: Map<string, RepWorkload>,
    balanceConfig: BalanceConfig
  ): boolean {
    const workload = workloads.get(currentOwner.rep_id);
    if (!workload) return false;

    // Don't respect continuity if it would create severe imbalance
    const wouldExceedVariance = (workload.proposedARR + (account.calculated_arr || 0)) > 
      (balanceConfig.targetARRPerRep * (1 + balanceConfig.maxVariancePercent / 100));

    return !wouldExceedVariance;
  }

  private findBestBalancedRep(
    regionReps: SalesRep[],
    workloads: Map<string, RepWorkload>,
    balanceConfig: BalanceConfig
  ): SalesRep | null {
    let bestRep: SalesRep | null = null;
    let lowestWorkload = Infinity;

    for (const rep of regionReps) {
      const workload = workloads.get(rep.rep_id);
      if (!workload) continue;

      // Calculate workload score (lower is better)
      const arrRatio = workload.proposedARR / Math.max(balanceConfig.targetARRPerRep, 1);
      const accountRatio = workload.proposedAccounts / Math.max(balanceConfig.minAccountsPerRep, 1);
      const workloadScore = (arrRatio + accountRatio) / 2;

      if (workloadScore < lowestWorkload) {
        lowestWorkload = workloadScore;
        bestRep = rep;
      }
    }

    return bestRep;
  }

  private findRepWithHighestNeed(
    repsNeedingAccounts: SalesRep[],
    workloads: Map<string, RepWorkload>,
    balanceConfig: BalanceConfig
  ): SalesRep | null {
    let repWithHighestNeed: SalesRep | null = null;
    let highestNeed = 0;

    for (const rep of repsNeedingAccounts) {
      const workload = workloads.get(rep.rep_id);
      if (!workload) continue;

      // Calculate need score (higher means more need)
      const arrNeed = Math.max(0, balanceConfig.minARRPerRep - workload.proposedARR);
      const accountNeed = Math.max(0, balanceConfig.minAccountsPerRep - workload.proposedAccounts);
      const totalNeed = arrNeed + (accountNeed * 100000); // Weight account need

      if (totalNeed > highestNeed) {
        highestNeed = totalNeed;
        repWithHighestNeed = rep;
      }
    }

    return repWithHighestNeed;
  }

  private findOptimalRep(
    activeReps: SalesRep[],
    workloads: Map<string, RepWorkload>,
    balanceConfig: BalanceConfig
  ): SalesRep | null {
    let optimalRep: SalesRep | null = null;
    let lowestWorkload = Infinity;

    for (const rep of activeReps) {
      const workload = workloads.get(rep.rep_id);
      if (!workload) continue;

      // Prefer reps with lower current workload
      const workloadScore = workload.proposedARR / Math.max(balanceConfig.targetARRPerRep, 1);

      if (workloadScore < lowestWorkload) {
        lowestWorkload = workloadScore;
        optimalRep = rep;
      }
    }

    return optimalRep;
  }

  private updateRemainingAccounts(
    remainingAccounts: Account[],
    proposals: AssignmentProposal[]
  ): Account[] {
    const assignedIds = new Set(proposals.map(p => p.accountId));
    return remainingAccounts.filter(acc => !assignedIds.has(acc.sfdc_account_id));
  }

  private updateWorkloads(workloads: Map<string, RepWorkload>, proposals: AssignmentProposal[]) {
    for (const proposal of proposals) {
      const workload = workloads.get(proposal.proposedOwnerId);
      if (workload) {
        workload.proposedARR += proposal.arr;
        workload.proposedAccounts += 1;
      }
    }
  }

  private calculateFinalStatistics(
    accounts: Account[],
    proposals: AssignmentProposal[],
    conflicts: AssignmentProposal[],
    workloads: Map<string, RepWorkload>
  ) {
    const totalAccounts = accounts.length;
    const assignedAccounts = proposals.length;
    const unassignedAccounts = totalAccounts - assignedAccounts;

    // Calculate balance score and variance
    const workloadArray = Array.from(workloads.values());
    const arrValues = workloadArray.map(w => w.proposedARR);
    const avgARR = arrValues.reduce((sum, arr) => sum + arr, 0) / arrValues.length;
    
    const variance = arrValues.reduce((sum, arr) => sum + Math.pow(arr - avgARR, 2), 0) / arrValues.length;
    const stdDev = Math.sqrt(variance);
    const varianceScore = (stdDev / avgARR) * 100;
    
    // Balance score (0-100, higher is better)
    const balanceScore = Math.max(0, 100 - varianceScore);

    // Calculate additional required statistics
    const assignmentCounts = workloadArray.map(w => w.proposedAccounts);
    const totalConflicts = conflicts.length;
    const averageAssignmentsPerRep = assignmentCounts.reduce((sum, count) => sum + count, 0) / assignmentCounts.length;
    
    const leastLoaded = workloadArray.reduce((min, w) => 
      w.proposedAccounts < min.proposedAccounts ? w : min
    );
    const mostLoaded = workloadArray.reduce((max, w) => 
      w.proposedAccounts > max.proposedAccounts ? w : max
    );

    return {
      totalAccounts,
      assignedAccounts,
      unassignedAccounts,
      repWorkloads: workloadArray,
      balanceScore,
      varianceScore,
      totalConflicts,
      averageAssignmentsPerRep,
      leastLoadedRep: { name: leastLoaded.repName, assignments: leastLoaded.proposedAccounts },
      mostLoadedRep: { name: mostLoaded.repName, assignments: mostLoaded.proposedAccounts }
    };
  }

  private reportProgress(progress: { stage: string; progress: number; status: string; details?: any }) {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }

  // Data fetching methods
  private async getAssignmentRules(buildId: string): Promise<AssignmentRule[]> {
    const { data, error } = await supabase
      .from('assignment_rules')
      .select('*')
      .eq('build_id', buildId)
      .eq('enabled', true)
      .order('priority');

    if (error) throw error;
    return data || [];
  }

  private async getParentAccounts(buildId: string, tier: string, accountType?: string): Promise<Account[]> {
    let query = supabase
      .from('accounts')
      .select('sfdc_account_id, account_name, owner_id, owner_name, sales_territory, geo, calculated_arr, is_customer, is_parent')
      .eq('build_id', buildId)
      .eq('is_parent', true);

    if (accountType === 'customers') {
      query = query.eq('is_customer', true);
    } else if (accountType === 'prospects') {
      query = query.eq('is_customer', false);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  private async getSalesReps(buildId: string): Promise<SalesRep[]> {
    const { data, error } = await supabase
      .from('sales_reps')
      .select('rep_id, name, region, team, is_active')
      .eq('build_id', buildId);

    if (error) throw error;
    return data || [];
  }
}