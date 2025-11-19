import { supabase } from '@/integrations/supabase/client';

export interface Account {
  sfdc_account_id: string;
  account_name: string;
  is_customer: boolean;
  calculated_arr: number;
  calculated_atr: number;
  cre_count: number;
  sales_territory: string;
  geo: string;
  owner_id: string | null;
  owner_name: string | null;
  created_at: string;
}

export interface SalesRep {
  rep_id: string;
  name: string;
  region: string;
  team: string;
  is_active: boolean;
  include_in_assignments: boolean;
  is_strategic_rep: boolean;
}

export interface AssignmentConfiguration {
  description: string;
  customer_min_arr: number;
  customer_target_arr: number;
  customer_max_arr: number;
  max_cre_per_rep: number;
  assign_prospects: boolean;
  prospect_min_arr: number;
  prospect_target_arr: number;
  prospect_max_arr: number;
  prefer_geographic_match: boolean;
  prefer_continuity: boolean;
  continuity_days_threshold: number;
  use_ai_optimization?: boolean;
  territory_mappings: Record<string, string>;
}

export interface AssignmentProposal {
  sfdc_account_id: string;
  proposed_owner_id: string;
  proposed_owner_name: string;
  assignment_type: 'customer' | 'prospect';
  rationale: string;
  score?: number;
}

interface RepWorkload {
  rep_id: string;
  name: string;
  region: string;
  total_arr: number;
  account_count: number;
  cre_count: number;
  accounts: string[];
}

/**
 * Algorithmic Assignment Service
 * 
 * Multi-pass assignment engine that handles large datasets efficiently:
 * 1. Geographic Distribution - Assign accounts to reps in their region
 * 2. ARR Balancing - Redistribute to meet min/target/max thresholds
 * 3. CRE Risk Distribution - Ensure no rep exceeds max CRE limit
 * 4. Continuity Check - Maintain relationships for long-standing accounts
 */
export class AlgorithmicAssignmentService {
  private buildId: string;
  private config: AssignmentConfiguration;
  private accounts: Account[];
  private reps: SalesRep[];
  private repWorkloads: Map<string, RepWorkload>;

  constructor(
    buildId: string,
    config: AssignmentConfiguration,
    accounts: Account[],
    reps: SalesRep[]
  ) {
    this.buildId = buildId;
    this.config = config;
    this.accounts = accounts;
    this.reps = reps.filter(r => r.is_active && r.include_in_assignments);
    this.repWorkloads = new Map();

    // Initialize workloads
    this.reps.forEach(rep => {
      this.repWorkloads.set(rep.rep_id, {
        rep_id: rep.rep_id,
        name: rep.name,
        region: rep.region,
        total_arr: 0,
        account_count: 0,
        cre_count: 0,
        accounts: []
      });
    });
  }

  /**
   * Main assignment generation flow
   */
  async generateAssignments(): Promise<AssignmentProposal[]> {
    console.log(`[ALGORITHMIC] Starting assignment for ${this.accounts.length} accounts`);
    console.log(`[ALGORITHMIC] Available reps: ${this.reps.length}`);
    
    const proposals: AssignmentProposal[] = [];

    // PASS 1: Geographic Distribution
    console.log('[ALGORITHMIC] PASS 1: Geographic Distribution');
    const geoAssignments = this.assignByGeography();
    proposals.push(...geoAssignments);

    // PASS 2: ARR Balancing
    console.log('[ALGORITHMIC] PASS 2: ARR Balancing');
    const balancedAssignments = this.balanceByARR(proposals);
    
    // PASS 3: CRE Risk Distribution
    console.log('[ALGORITHMIC] PASS 3: CRE Risk Distribution');
    const finalAssignments = this.distributeCRERisk(balancedAssignments);

    // PASS 4: Continuity Check
    if (this.config.prefer_continuity) {
      console.log('[ALGORITHMIC] PASS 4: Continuity Check');
      this.applyContinuityCheck(finalAssignments);
    }

    // Generate statistics
    this.logStatistics(finalAssignments);

    return finalAssignments;
  }

  /**
   * PASS 1: Assign accounts to reps in their geographic region
   */
  private assignByGeography(): AssignmentProposal[] {
    const proposals: AssignmentProposal[] = [];
    let geographicMatches = 0;
    let fallbackAssignments = 0;

    for (const account of this.accounts) {
      // Get target region from territory mapping
      const targetRegion = this.config.territory_mappings[account.sales_territory] || account.geo;
      
      // Find eligible reps in this region
      let eligibleReps = this.reps.filter(r => r.region === targetRegion);
      
      // Strategic rep constraint (bidirectional):
      // - Strategic accounts → only strategic reps
      // - Regular accounts → only regular (non-strategic) reps
      if (account.owner_id) {
        const currentOwner = this.reps.find(r => r.rep_id === account.owner_id);
        if (currentOwner?.is_strategic_rep) {
          // Strategic account → only strategic reps
          eligibleReps = eligibleReps.filter(r => r.is_strategic_rep);
        } else {
          // Regular account → only regular reps
          eligibleReps = eligibleReps.filter(r => !r.is_strategic_rep);
        }
      }
      
      let assignedRep: SalesRep | null = null;

      if (eligibleReps.length > 0 && this.config.prefer_geographic_match) {
        // Assign to rep with lowest ARR in this region
        assignedRep = this.findRepWithLowestARR(eligibleReps);
        geographicMatches++;
      } else {
        // Fallback: Assign to any rep with lowest ARR (still respecting strategic constraint)
        let fallbackReps = this.reps;
        if (account.owner_id) {
          const currentOwner = this.reps.find(r => r.rep_id === account.owner_id);
          if (currentOwner?.is_strategic_rep) {
            // Strategic account → only strategic reps
            fallbackReps = this.reps.filter(r => r.is_strategic_rep);
          } else {
            // Regular account → only regular reps
            fallbackReps = this.reps.filter(r => !r.is_strategic_rep);
          }
        }
        assignedRep = this.findRepWithLowestARR(fallbackReps);
        fallbackAssignments++;
      }

      if (assignedRep) {
        const proposal = this.createProposal(
          account,
          assignedRep,
          `Geographic match: ${targetRegion}${eligibleReps.length === 0 ? ' (fallback)' : ''}`
        );
        proposals.push(proposal);
        this.updateWorkload(assignedRep.rep_id, account);
      }
    }

    console.log(`[ALGORITHMIC] Geographic matches: ${geographicMatches}, Fallback: ${fallbackAssignments}`);
    return proposals;
  }

  /**
   * PASS 2: Redistribute accounts to meet ARR thresholds
   */
  private balanceByARR(proposals: AssignmentProposal[]): AssignmentProposal[] {
    const isCustomer = this.accounts[0]?.is_customer ?? true;
    const minARR = isCustomer ? this.config.customer_min_arr : this.config.prospect_min_arr;
    const targetARR = isCustomer ? this.config.customer_target_arr : this.config.prospect_target_arr;
    const maxARR = isCustomer ? this.config.customer_max_arr : this.config.prospect_max_arr;

    let iterations = 0;
    const maxIterations = 10;
    let moved = 0;

    while (iterations < maxIterations) {
      iterations++;
      
      // Find overloaded reps (above maxARR)
      const overloaded = Array.from(this.repWorkloads.values())
        .filter(w => w.total_arr > maxARR)
        .sort((a, b) => b.total_arr - a.total_arr);

      // Find underloaded reps (below minARR)
      const underloaded = Array.from(this.repWorkloads.values())
        .filter(w => w.total_arr < minARR)
        .sort((a, b) => a.total_arr - b.total_arr);

      if (overloaded.length === 0 || underloaded.length === 0) {
        break;
      }

      // Move accounts from overloaded to underloaded
      for (const overloadedRep of overloaded) {
        const excessARR = overloadedRep.total_arr - targetARR;
        if (excessARR <= 0) continue;

        // Find accounts to move (smallest first to fine-tune balance)
        const accountsToMove = this.selectAccountsToMove(
          overloadedRep.accounts,
          excessARR
        );

        for (const accountId of accountsToMove) {
          const account = this.accounts.find(a => a.sfdc_account_id === accountId);
          if (!account) continue;

          // Find best target rep
          const targetRep = underloaded[0];
          if (!targetRep) break;

          // Move the account
          const proposalIndex = proposals.findIndex(p => p.sfdc_account_id === accountId);
          if (proposalIndex !== -1) {
            const rep = this.reps.find(r => r.rep_id === targetRep.rep_id);
            if (rep) {
              proposals[proposalIndex] = this.createProposal(
                account,
                rep,
                `ARR balancing: Moved from ${overloadedRep.name} (was $${Math.round(overloadedRep.total_arr / 1000)}K) to balance workload`
              );

              // Update workloads
              this.removeFromWorkload(overloadedRep.rep_id, account);
              this.updateWorkload(targetRep.rep_id, account);
              moved++;
            }
          }

          // Recalculate underloaded list
          if (targetRep.total_arr >= minARR) {
            underloaded.shift();
          }

          if (underloaded.length === 0) break;
        }
      }

      if (moved === 0) break;
      moved = 0;
    }

    console.log(`[ALGORITHMIC] ARR balancing completed in ${iterations} iterations`);
    return proposals;
  }

  /**
   * PASS 3: Ensure no rep exceeds max CRE limit
   */
  private distributeCRERisk(proposals: AssignmentProposal[]): AssignmentProposal[] {
    let moved = 0;

    for (const [repId, workload] of this.repWorkloads.entries()) {
      if (workload.cre_count <= this.config.max_cre_per_rep) continue;

      // Find accounts with CRE risk
      const creAccounts = workload.accounts
        .map(accountId => this.accounts.find(a => a.sfdc_account_id === accountId))
        .filter(a => a && a.cre_count > 0)
        .sort((a, b) => (a!.calculated_arr || 0) - (b!.calculated_arr || 0)); // Move smallest first

      const excessCRE = workload.cre_count - this.config.max_cre_per_rep;

      // Move excess CRE accounts
      for (let i = 0; i < excessCRE && i < creAccounts.length; i++) {
        const account = creAccounts[i];
        if (!account) continue;

        // Find rep with lowest CRE count
        const targetRep = this.findRepWithLowestCRE();
        if (!targetRep) continue;

        // Move the account
        const proposalIndex = proposals.findIndex(p => p.sfdc_account_id === account.sfdc_account_id);
        if (proposalIndex !== -1) {
          proposals[proposalIndex] = this.createProposal(
            account,
            targetRep,
            `CRE risk distribution: Moved from ${workload.name} to limit high-risk accounts (max ${this.config.max_cre_per_rep} per rep)`
          );

          // Update workloads
          this.removeFromWorkload(repId, account);
          this.updateWorkload(targetRep.rep_id, account);
          moved++;
        }
      }
    }

    console.log(`[ALGORITHMIC] CRE risk distribution: ${moved} accounts moved`);
    return proposals;
  }

  /**
   * PASS 4: Apply continuity check - don't move long-standing accounts
   */
  private applyContinuityCheck(proposals: AssignmentProposal[]): void {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - this.config.continuity_days_threshold);

    let maintained = 0;

    for (const proposal of proposals) {
      const account = this.accounts.find(a => a.sfdc_account_id === proposal.sfdc_account_id);
      if (!account || !account.owner_id) continue;

      // Check if account has been owned for > threshold days
      const accountCreated = new Date(account.created_at);
      if (accountCreated < thresholdDate) {
        // Keep current owner
        const currentRep = this.reps.find(r => r.rep_id === account.owner_id);
        if (currentRep) {
          proposal.proposed_owner_id = currentRep.rep_id;
          proposal.proposed_owner_name = currentRep.name;
          proposal.rationale = `Continuity maintained: Account owned by ${currentRep.name} for ${Math.round((Date.now() - accountCreated.getTime()) / (1000 * 60 * 60 * 24))} days`;
          maintained++;
        }
      }
    }

    console.log(`[ALGORITHMIC] Continuity check: ${maintained} accounts maintained with current owner`);
  }

  /**
   * Helper: Find rep with lowest ARR
   */
  private findRepWithLowestARR(reps: SalesRep[]): SalesRep {
    return reps.reduce((lowest, rep) => {
      const workload = this.repWorkloads.get(rep.rep_id);
      const lowestWorkload = this.repWorkloads.get(lowest.rep_id);
      
      if (!workload) return lowest;
      if (!lowestWorkload) return rep;
      
      return workload.total_arr < lowestWorkload.total_arr ? rep : lowest;
    });
  }

  /**
   * Helper: Find rep with lowest CRE count
   */
  private findRepWithLowestCRE(): SalesRep | null {
    let lowestRep: SalesRep | null = null;
    let lowestCount = Infinity;

    for (const rep of this.reps) {
      const workload = this.repWorkloads.get(rep.rep_id);
      if (workload && workload.cre_count < lowestCount) {
        lowestCount = workload.cre_count;
        lowestRep = rep;
      }
    }

    return lowestRep;
  }

  /**
   * Helper: Select accounts to move to reduce excess ARR
   */
  private selectAccountsToMove(accountIds: string[], targetAmount: number): string[] {
    const accounts = accountIds
      .map(id => this.accounts.find(a => a.sfdc_account_id === id))
      .filter(a => a !== undefined)
      .sort((a, b) => (a!.calculated_arr || 0) - (b!.calculated_arr || 0)); // Move smallest first

    const toMove: string[] = [];
    let totalMoved = 0;

    for (const account of accounts) {
      if (!account) continue;
      if (totalMoved >= targetAmount) break;

      toMove.push(account.sfdc_account_id);
      totalMoved += account.calculated_arr || 0;
    }

    return toMove;
  }

  /**
   * Helper: Create assignment proposal
   */
  private createProposal(
    account: Account,
    rep: SalesRep,
    rationale: string
  ): AssignmentProposal {
    return {
      sfdc_account_id: account.sfdc_account_id,
      proposed_owner_id: rep.rep_id,
      proposed_owner_name: rep.name,
      assignment_type: account.is_customer ? 'customer' : 'prospect',
      rationale
    };
  }

  /**
   * Helper: Update rep workload
   */
  private updateWorkload(repId: string, account: Account): void {
    const workload = this.repWorkloads.get(repId);
    if (!workload) return;

    workload.accounts.push(account.sfdc_account_id);
    workload.total_arr += account.calculated_arr || 0;
    workload.account_count++;
    if (account.cre_count > 0) {
      workload.cre_count += account.cre_count;
    }
  }

  /**
   * Helper: Remove account from rep workload
   */
  private removeFromWorkload(repId: string, account: Account): void {
    const workload = this.repWorkloads.get(repId);
    if (!workload) return;

    const index = workload.accounts.indexOf(account.sfdc_account_id);
    if (index > -1) {
      workload.accounts.splice(index, 1);
      workload.total_arr -= account.calculated_arr || 0;
      workload.account_count--;
      if (account.cre_count > 0) {
        workload.cre_count -= account.cre_count;
      }
    }
  }

  /**
   * Log final statistics
   */
  private logStatistics(proposals: AssignmentProposal[]): void {
    const stats = {
      totalAssigned: proposals.length,
      avgARR: 0,
      minARR: Infinity,
      maxARR: 0,
      avgCRE: 0,
      maxCRE: 0,
      byRegion: {} as Record<string, number>
    };

    const workloads = Array.from(this.repWorkloads.values());
    
    workloads.forEach(w => {
      stats.avgARR += w.total_arr;
      stats.minARR = Math.min(stats.minARR, w.total_arr);
      stats.maxARR = Math.max(stats.maxARR, w.total_arr);
      stats.avgCRE += w.cre_count;
      stats.maxCRE = Math.max(stats.maxCRE, w.cre_count);
      stats.byRegion[w.region] = (stats.byRegion[w.region] || 0) + w.account_count;
    });

    stats.avgARR = stats.avgARR / workloads.length;
    stats.avgCRE = stats.avgCRE / workloads.length;

    console.log('[ALGORITHMIC] ═══════════════════════════════════════');
    console.log('[ALGORITHMIC] FINAL STATISTICS');
    console.log('[ALGORITHMIC] ═══════════════════════════════════════');
    console.log(`[ALGORITHMIC] Total Assigned: ${stats.totalAssigned}`);
    console.log(`[ALGORITHMIC] ARR - Avg: $${Math.round(stats.avgARR / 1000)}K | Min: $${Math.round(stats.minARR / 1000)}K | Max: $${Math.round(stats.maxARR / 1000)}K`);
    console.log(`[ALGORITHMIC] CRE - Avg: ${stats.avgCRE.toFixed(1)} | Max: ${stats.maxCRE}`);
    console.log(`[ALGORITHMIC] By Region:`, stats.byRegion);
    console.log('[ALGORITHMIC] ═══════════════════════════════════════');
  }
}
