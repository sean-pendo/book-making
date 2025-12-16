/**
 * Parent-Child Aggregator
 * 
 * Handles the parent-child relationship for LP optimization:
 * 
 * PRE-SOLVE: Children are aggregated into parent accounts
 * - ARR is already aggregated via hierarchy_bookings_arr_converted
 * - ATR needs to be summed from children
 * - Child IDs are tracked for post-solve cascade
 * 
 * POST-SOLVE: Assignments cascade from parent to children
 * - Children inherit the parent's assigned rep
 */

import type { AggregatedAccount, LPAssignmentProposal } from '../types';
import type { PriorityConfig } from '@/config/priorityRegistry';
import { getPositionLabel } from '../postprocessing/rationaleGenerator';

/**
 * Already done in dataLoader.ts during load
 * This function is for explicit re-aggregation if needed
 */
export function aggregateChildrenIntoParents(
  allAccounts: AggregatedAccount[]
): AggregatedAccount[] {
  const parents = allAccounts.filter(a => a.is_parent);
  // Child aggregation already happens in dataLoader
  return parents;
}

/**
 * Cascade parent assignments to children
 * Each child gets the same assignment as its parent
 */
export function cascadeToChildren(
  parentProposals: LPAssignmentProposal[],
  allAccounts: AggregatedAccount[],
  priorityConfig?: PriorityConfig[]
): LPAssignmentProposal[] {
  const result: LPAssignmentProposal[] = [...parentProposals];
  
  // Build parent lookup
  const parentProposalMap = new Map<string, LPAssignmentProposal>();
  for (const proposal of parentProposals) {
    parentProposalMap.set(proposal.accountId, proposal);
  }
  
  // Build account lookup for child details
  const accountMap = new Map<string, AggregatedAccount>();
  for (const account of allAccounts) {
    accountMap.set(account.sfdc_account_id, account);
  }
  
  // Cascade to children
  for (const proposal of parentProposals) {
    for (const childId of proposal.childIds) {
      const childAccount = accountMap.get(childId);
      
      result.push({
        accountId: childId,
        accountName: childAccount?.account_name || `Child of ${proposal.accountName}`,
        repId: proposal.repId,
        repName: proposal.repName,
        repRegion: proposal.repRegion,
        scores: proposal.scores, // Inherit parent's scores
        totalScore: proposal.totalScore,
        lockResult: null,
        rationale: `${getPositionLabel('manual_holdover', priorityConfig)}: Child follows parent → ${proposal.repName} (inherited from ${proposal.accountName})`,
        isStrategicPreAssignment: proposal.isStrategicPreAssignment,
        childIds: [] // Children don't have children
      });
    }
  }
  
  return result;
}

/**
 * Get total ARR for an account including children
 * (Should already be in hierarchy_bookings_arr_converted, but this is a fallback)
 */
export function getTotalHierarchyARR(
  parent: AggregatedAccount,
  allAccounts: AggregatedAccount[]
): number {
  let total = parent.aggregated_arr;
  
  // If child IDs exist, they're already included in aggregated_arr
  // This is just for verification/debugging
  if (parent.child_ids.length > 0) {
    console.log(`[Aggregator] Parent ${parent.account_name} has ${parent.child_ids.length} children, aggregated ARR: $${(total / 1000000).toFixed(2)}M`);
  }
  
  return total;
}

/**
 * Get total ATR for an account including children
 */
export function getTotalHierarchyATR(
  parent: AggregatedAccount,
  allAccounts: AggregatedAccount[]
): number {
  // aggregated_atr already includes children (done in dataLoader)
  return parent.aggregated_atr;
}

