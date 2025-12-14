/**
 * Strategic Pool Handler
 * 
 * Pre-assigns strategic accounts to strategic reps before LP optimization.
 * Strategic accounts are distributed evenly by ARR using round-robin to least loaded rep.
 * 
 * Strategic accounts include:
 * - Accounts flagged as is_strategic = true
 * - Accounts currently owned by strategic reps
 */

import type { AggregatedAccount, EligibleRep, LPAssignmentProposal, AssignmentScores } from '../types';

export interface StrategicPoolResult {
  fixedAssignments: LPAssignmentProposal[];
  remainingAccounts: AggregatedAccount[];
  strategicAccountCount: number;
  strategicRepCount: number;
}

/**
 * Identify and pre-assign strategic accounts
 */
export function assignStrategicPool(
  accounts: AggregatedAccount[],
  strategicReps: EligibleRep[]
): StrategicPoolResult {
  // Identify strategic accounts
  const strategicRepIds = new Set(strategicReps.map(r => r.rep_id));
  
  const strategicAccounts = accounts.filter(a => 
    a.is_strategic || strategicRepIds.has(a.owner_id || '')
  );
  
  const regularAccounts = accounts.filter(a => 
    !a.is_strategic && !strategicRepIds.has(a.owner_id || '')
  );
  
  console.log(`[StrategicPool] Found ${strategicAccounts.length} strategic accounts, ${strategicReps.length} strategic reps`);
  
  // If no strategic reps, return accounts as-is (they'll enter normal optimization)
  if (strategicReps.length === 0) {
    if (strategicAccounts.length > 0) {
      console.warn(`[StrategicPool] ${strategicAccounts.length} strategic accounts but no strategic reps available`);
    }
    return {
      fixedAssignments: [],
      remainingAccounts: accounts,
      strategicAccountCount: strategicAccounts.length,
      strategicRepCount: 0
    };
  }
  
  // Sort accounts by ARR descending for fair distribution
  const sortedAccounts = [...strategicAccounts].sort(
    (a, b) => b.aggregated_arr - a.aggregated_arr
  );
  
  // Track rep loads
  const repLoads = new Map<string, number>();
  strategicReps.forEach(r => repLoads.set(r.rep_id, 0));
  
  // Round-robin assignment to least loaded rep
  const fixedAssignments: LPAssignmentProposal[] = [];
  
  for (const account of sortedAccounts) {
    // Find least loaded strategic rep
    let minRep = strategicReps[0];
    let minLoad = repLoads.get(minRep.rep_id) || 0;
    
    for (const rep of strategicReps) {
      const load = repLoads.get(rep.rep_id) || 0;
      if (load < minLoad) {
        minLoad = load;
        minRep = rep;
      }
    }
    
    // Check if staying with current owner (who must be strategic)
    const isStayingWithOwner = account.owner_id === minRep.rep_id;
    
    const scores: AssignmentScores = {
      continuity: isStayingWithOwner ? 1.0 : 0,
      geography: 1.0, // Strategic accounts don't have geo constraints
      teamAlignment: 1.0, // Strategic accounts don't have tier constraints
      tieBreaker: 0
    };
    
    fixedAssignments.push({
      accountId: account.sfdc_account_id,
      accountName: account.account_name,
      repId: minRep.rep_id,
      repName: minRep.name,
      repRegion: minRep.region,
      scores,
      totalScore: 1.0,
      lockResult: null,
      rationale: `P0: Strategic Account → ${minRep.name} (strategic rep, ARR-balanced distribution)`,
      isStrategicPreAssignment: true,
      childIds: account.child_ids
    });
    
    // Update rep load
    repLoads.set(minRep.rep_id, minLoad + account.aggregated_arr);
  }
  
  // Log distribution
  console.log(`[StrategicPool] Distribution:`, Object.fromEntries(
    Array.from(repLoads.entries()).map(([id, load]) => {
      const rep = strategicReps.find(r => r.rep_id === id);
      return [rep?.name || id, `$${(load / 1000000).toFixed(2)}M`];
    })
  ));
  
  return {
    fixedAssignments,
    remainingAccounts: regularAccounts,
    strategicAccountCount: strategicAccounts.length,
    strategicRepCount: strategicReps.length
  };
}

