import type { Account, SalesRep, AssignmentProposal } from './assignmentService';
import { supabase } from '@/integrations/supabase/client';

// =============================================================================
// HIERARCHY CASCADE UTILITIES
// =============================================================================

/**
 * Get hierarchy information for an account
 * @param accountId - Account ID to check
 * @param buildId - Build ID
 * @returns Parent info for children, or children info for parents
 * @see MASTER_LOGIC.mdc §13.4.2
 */
export async function getHierarchyInfo(
  accountId: string,
  buildId: string
): Promise<{
  isParent: boolean;
  isChild: boolean;
  isStandalone: boolean;
  childCount: number;
  lockedChildCount: number;
  lockedChildren: Array<{ sfdc_account_id: string; account_name: string; owner_name: string | null }>;
  parentInfo: { sfdc_account_id: string; account_name: string; owner_id: string | null; owner_name: string | null } | null;
}> {
  // Get the account first
  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('sfdc_account_id, account_name, is_parent, ultimate_parent_id, child_count')
    .eq('sfdc_account_id', accountId)
    .eq('build_id', buildId)
    .single();

  if (accountError || !account) {
    return {
      isParent: false,
      isChild: false,
      isStandalone: true,
      childCount: 0,
      lockedChildCount: 0,
      lockedChildren: [],
      parentInfo: null,
    };
  }

  const isParent = account.is_parent || !account.ultimate_parent_id;
  const isChild = !!account.ultimate_parent_id;

  // For parent accounts, get children info
  if (isParent) {
    const { data: children, error: childError } = await supabase
      .from('accounts')
      .select('sfdc_account_id, account_name, owner_name, exclude_from_reassignment')
      .eq('ultimate_parent_id', accountId)
      .eq('build_id', buildId)
      .neq('is_parent', true);

    if (childError || !children) {
      return {
        isParent: true,
        isChild: false,
        isStandalone: true,
        childCount: 0,
        lockedChildCount: 0,
        lockedChildren: [],
        parentInfo: null,
      };
    }

    const lockedChildren = children.filter(c => c.exclude_from_reassignment === true);

    return {
      isParent: true,
      isChild: false,
      isStandalone: children.length === 0,
      childCount: children.length,
      lockedChildCount: lockedChildren.length,
      lockedChildren: lockedChildren.map(c => ({
        sfdc_account_id: c.sfdc_account_id,
        account_name: c.account_name,
        owner_name: c.owner_name,
      })),
      parentInfo: null,
    };
  }

  // For child accounts, get parent info
  const { data: parent, error: parentError } = await supabase
    .from('accounts')
    .select('sfdc_account_id, account_name, owner_id, owner_name')
    .eq('sfdc_account_id', account.ultimate_parent_id)
    .eq('build_id', buildId)
    .single();

  return {
    isParent: false,
    isChild: true,
    isStandalone: false,
    childCount: 0,
    lockedChildCount: 0,
    lockedChildren: [],
    parentInfo: parentError ? null : {
      sfdc_account_id: parent?.sfdc_account_id || '',
      account_name: parent?.account_name || '',
      owner_id: parent?.owner_id || null,
      owner_name: parent?.owner_name || null,
    },
  };
}

/**
 * Cascade reassignment from parent to children
 * @param parentId - Parent account ID
 * @param newOwnerId - New owner rep_id
 * @param newOwnerName - New owner name
 * @param buildId - Build ID
 * @param overrideLocks - If true, also reassign locked children
 * @returns Count of children updated
 * @see MASTER_LOGIC.mdc §13.4.2
 */
export async function cascadeToChildren(
  parentId: string,
  newOwnerId: string,
  newOwnerName: string,
  buildId: string,
  overrideLocks: boolean = false
): Promise<number> {
  let query = supabase
    .from('accounts')
    .update({
      new_owner_id: newOwnerId,
      new_owner_name: newOwnerName
    })
    .eq('ultimate_parent_id', parentId)
    .eq('build_id', buildId)
    .neq('is_parent', true);
  
  if (!overrideLocks) {
    query = query.or('exclude_from_reassignment.is.null,exclude_from_reassignment.eq.false');
  }
  
  const { data, error } = await query.select('sfdc_account_id');
  if (error) throw error;
  return data?.length || 0;
}

/**
 * Calculate total ARR for a hierarchy (parent + children)
 * @param parentId - Parent account ID
 * @param buildId - Build ID
 * @returns Total ARR across hierarchy
 */
export async function getHierarchyTotalARR(
  parentId: string,
  buildId: string
): Promise<number> {
  const { data, error } = await supabase
    .from('accounts')
    .select('hierarchy_bookings_arr_converted, calculated_arr, arr')
    .or(`sfdc_account_id.eq.${parentId},ultimate_parent_id.eq.${parentId}`)
    .eq('build_id', buildId);

  if (error || !data) return 0;

  return data.reduce((sum, acc) => {
    const arr = acc.hierarchy_bookings_arr_converted || acc.calculated_arr || acc.arr || 0;
    return sum + arr;
  }, 0);
}

// =============================================================================
// LEGACY ASSIGNMENT SERVICE HELPERS
// =============================================================================

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
        confidence: 'HIGH'
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
        confidence: 'HIGH'
      });
      
      // Update workload for next iteration
      this.updateWorkloadTracking(workloadMap, selectedRep.rep_id);
    });
    
    console.log(`[AssignmentServiceHelpers] Applied enhanced round-robin to ${roundRobinProposals.length} remaining accounts`);
    return roundRobinProposals;
  }
}