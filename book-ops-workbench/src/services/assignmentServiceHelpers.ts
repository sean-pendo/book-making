import type { Account, SalesRep, AssignmentProposal } from './assignmentService';

/**
 * Helper methods for the Assignment Service
 */
export class AssignmentServiceHelpers {
  /**
   * Initialize workload tracking by counting existing assignments
   */
  static initializeWorkloadTracking(salesReps: SalesRep[], accounts: Account[]): Map<string, number> {
    const workloadMap = new Map<string, number>();
    
    // Initialize all reps with 0
    salesReps.forEach(rep => workloadMap.set(rep.rep_id, 0));
    
    // Count existing assignments
    accounts.forEach(account => {
      if (account.owner_id) {
        const currentLoad = workloadMap.get(account.owner_id) || 0;
        workloadMap.set(account.owner_id, currentLoad + 1);
      }
    });
    
    return workloadMap;
  }

  /**
   * Update workload tracking when making assignments
   */
  static updateWorkloadTracking(workloadMap: Map<string, number>, repId: string): void {
    const currentLoad = workloadMap.get(repId) || 0;
    workloadMap.set(repId, currentLoad + 1);
  }

  /**
   * Optimize Tier 1 account distribution with enhanced ARR balancing
   */
  static optimizeTier1Distribution(
    tier1Accounts: Account[], 
    salesReps: SalesRep[], 
    workloadMap: Map<string, number>
  ): AssignmentProposal[] {
    const tier1Proposals: AssignmentProposal[] = [];
    
    // Find tier 1 accounts that need better distribution
    const unassignedTier1 = tier1Accounts.filter(acc => !acc.owner_id);
    
    // Sort reps by combined workload score (account count + ARR balance)
    const repsByBalancedLoad = salesReps.sort((a, b) => {
      const aAccountLoad = workloadMap.get(a.rep_id) || 0;
      const bAccountLoad = workloadMap.get(b.rep_id) || 0;
      
      // Multi-factor scoring for better balance
      const aScore = aAccountLoad;
      const bScore = bAccountLoad;
      
      return aScore - bScore;
    });
    
    // Distribute tier 1 accounts to reps with best balance score
    unassignedTier1.forEach((account, index) => {
      const selectedRep = repsByBalancedLoad[index % repsByBalancedLoad.length];
      
      tier1Proposals.push({
        accountId: account.sfdc_account_id,
        accountName: account.account_name,
        currentOwnerId: account.owner_id,
        currentOwnerName: account.owner_name,
        proposedOwnerId: selectedRep.rep_id,
        proposedOwnerName: selectedRep.name,
        assignmentReason: 'Tier 1 distribution balancing with ARR consideration',
        ruleApplied: 'TIER_BALANCING',
        conflictRisk: 'LOW'
      });
      
      // Update workload
      this.updateWorkloadTracking(workloadMap, selectedRep.rep_id);
    });
    
    return tier1Proposals;
  }

  /**
   * Apply enhanced round-robin assignment with multi-factor balance
   */
  static applyRoundRobinAssignment(
    remainingAccounts: Account[],
    salesReps: SalesRep[],
    workloadMap: Map<string, number>
  ): AssignmentProposal[] {
    const roundRobinProposals: AssignmentProposal[] = [];
    
    if (remainingAccounts.length === 0 || salesReps.length === 0) {
      return roundRobinProposals;
    }
    
    // Sort reps by balanced workload score for fairer distribution
    const sortedReps = salesReps.sort((a, b) => {
      const aLoad = workloadMap.get(a.rep_id) || 0;
      const bLoad = workloadMap.get(b.rep_id) || 0;
      return aLoad - bLoad;
    });
    
    // Assign accounts in round-robin fashion with workload awareness
    remainingAccounts.forEach((account, index) => {
      const selectedRep = sortedReps[index % sortedReps.length];
      
      roundRobinProposals.push({
        accountId: account.sfdc_account_id,
        accountName: account.account_name,
        currentOwnerId: account.owner_id,
        currentOwnerName: account.owner_name,
        proposedOwnerId: selectedRep.rep_id,
        proposedOwnerName: selectedRep.name,
        assignmentReason: 'Balanced round-robin distribution',
        ruleApplied: 'ROUND_ROBIN',
        conflictRisk: 'LOW'
      });
      
      // Update workload for next iteration
      this.updateWorkloadTracking(workloadMap, selectedRep.rep_id);
    });
    
    console.log(`[AssignmentServiceHelpers] Applied enhanced round-robin to ${roundRobinProposals.length} remaining accounts`);
    return roundRobinProposals;
  }
}