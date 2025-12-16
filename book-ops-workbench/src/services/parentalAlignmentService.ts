/**
 * Parental Alignment Service
 * 
 * Resolves parent account ownership when children have conflicting owners.
 * This is an implicit rule that runs after holdovers but before strategic accounts.
 * 
 * Tiebreaker Logic:
 * 1. Locked children (exclude_from_reassignment = true) get priority
 * 2. Among candidates: higher child ARR wins
 * 3. If still tied: random selection
 * 
 * Split ownership only occurs when multiple children are locked to different owners.
 */

import { supabase } from '@/integrations/supabase/client';
import { getAccountARR } from '@/_domain';
import { Account, SalesRep } from './optimization/types';

// ============================================================================
// Types
// ============================================================================

interface ChildAccount {
  sfdc_account_id: string;
  account_name: string | null;
  ultimate_parent_id: string | null;
  owner_id: string | null;
  owner_name: string | null;
  calculated_arr: number | null;
  arr: number | null;
  exclude_from_reassignment: boolean | null;
}

export interface ParentChildResolution {
  parentAccountId: string;
  parentAccountName: string;
  resolvedOwnerId: string;
  resolvedOwnerName: string;
  reason: string;
  hasConflict: boolean;
  willCreateSplit: boolean;
  lockedChildrenInvolved: string[];
  winningChildId: string;
  winningChildName: string;
}

export interface ParentalAlignmentWarning {
  accountId: string;
  accountName: string;
  message: string;
  severity: 'info' | 'warning';
}

export interface ParentalAlignmentResult {
  resolutions: ParentChildResolution[];
  warnings: ParentalAlignmentWarning[];
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Resolve parent-child ownership conflicts for a build.
 * 
 * @param buildId - The build to process
 * @param parentAccounts - Parent accounts being assigned (already filtered by holdovers)
 * @param reps - All sales reps for this build
 * @returns Resolutions for parents with conflicting child owners, plus warnings
 */
export async function resolveParentChildConflicts(
  buildId: string,
  parentAccounts: Account[],
  reps: SalesRep[]
): Promise<ParentalAlignmentResult> {
  console.log(`[ParentalAlignment] Starting resolution for ${parentAccounts.length} parent accounts`);
  
  const resolutions: ParentChildResolution[] = [];
  const warnings: ParentalAlignmentWarning[] = [];
  
  // Build set of active rep IDs for filtering
  const activeRepIds = new Set(
    reps
      .filter(r => r.is_active && r.include_in_assignments)
      .map(r => r.rep_id)
  );
  
  // Fetch ALL children for this build (single DB query)
  const { data: allChildren, error: childError } = await supabase
    .from('accounts')
    .select('sfdc_account_id, account_name, ultimate_parent_id, owner_id, owner_name, calculated_arr, arr, exclude_from_reassignment')
    .eq('build_id', buildId)
    .eq('is_parent', false);
  
  if (childError) {
    console.error('[ParentalAlignment] Error fetching child accounts:', childError);
    return { resolutions: [], warnings: [] };
  }
  
  if (!allChildren || allChildren.length === 0) {
    console.log('[ParentalAlignment] No child accounts found, skipping');
    return { resolutions: [], warnings: [] };
  }
  
  console.log(`[ParentalAlignment] Found ${allChildren.length} child accounts`);
  
  // Build parent -> children map
  const childrenByParent = buildChildrenMap(allChildren as ChildAccount[]);
  
  // Process each parent account
  for (const parent of parentAccounts) {
    // Skip if parent is manually locked (already handled by holdover)
    if (parent.exclude_from_reassignment) {
      continue;
    }
    
    const children = childrenByParent.get(parent.sfdc_account_id);
    if (!children || children.length === 0) {
      continue; // No children to align
    }
    
    // Determine if there's a conflict and who should win
    const resolution = determineParentOwner(parent, children, activeRepIds);
    
    if (resolution) {
      resolutions.push(resolution);
      
      // Generate appropriate warning
      if (resolution.willCreateSplit) {
        warnings.push({
          accountId: resolution.parentAccountId,
          accountName: resolution.parentAccountName,
          message: `Split ownership: Parent → ${resolution.resolvedOwnerName}, some locked children retain different owners`,
          severity: 'warning'
        });
      } else if (resolution.hasConflict) {
        warnings.push({
          accountId: resolution.parentAccountId,
          accountName: resolution.parentAccountName,
          message: `Parent-Child Alignment: Assigned to ${resolution.resolvedOwnerName} (${resolution.reason})`,
          severity: 'info'
        });
      }
    }
  }
  
  console.log(`[ParentalAlignment] Resolved ${resolutions.length} parent-child conflicts, generated ${warnings.length} warnings`);
  
  return { resolutions, warnings };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build a map of parent_id -> child accounts
 */
function buildChildrenMap(children: ChildAccount[]): Map<string, ChildAccount[]> {
  const map = new Map<string, ChildAccount[]>();
  
  for (const child of children) {
    if (!child.ultimate_parent_id) continue;
    
    const existing = map.get(child.ultimate_parent_id) || [];
    existing.push(child);
    map.set(child.ultimate_parent_id, existing);
  }
  
  return map;
}

/**
 * Determine which owner should get the parent account based on children's owners.
 * 
 * Returns null if:
 * - No children with valid owners
 * - All children have the same owner (no conflict)
 */
function determineParentOwner(
  parent: Account,
  children: ChildAccount[],
  activeRepIds: Set<string>
): ParentChildResolution | null {
  // Filter to children with valid, active owners
  const validChildren = children.filter(c => 
    c.owner_id && activeRepIds.has(c.owner_id)
  );
  
  if (validChildren.length === 0) {
    return null; // No valid candidates
  }
  
  // Check if all have the same owner
  const uniqueOwners = new Set(validChildren.map(c => c.owner_id));
  if (uniqueOwners.size === 1) {
    return null; // No conflict - all children have same owner
  }
  
  // There's a conflict - determine winner
  
  // Prioritize locked children
  const lockedChildren = validChildren.filter(c => c.exclude_from_reassignment === true);
  const candidates = lockedChildren.length > 0 ? lockedChildren : validChildren;
  
  // Check for split scenario: multiple locked children with different owners
  const lockedOwners = new Set(lockedChildren.map(c => c.owner_id));
  const willCreateSplit = lockedOwners.size > 1;
  
  // Sort by ARR descending, then deterministic tiebreaker using account ID
  const sorted = [...candidates].sort((a, b) => {
    const arrA = getAccountARR(a);
    const arrB = getAccountARR(b);
    
    if (arrB !== arrA) {
      return arrB - arrA; // Higher ARR wins
    }
    
    // Deterministic tiebreaker - use account ID for consistency
    return a.sfdc_account_id.localeCompare(b.sfdc_account_id);
  });
  
  const winner = sorted[0];
  
  // Determine reason string
  let reason: string;
  if (lockedChildren.length > 0) {
    if (lockedChildren.length === 1) {
      reason = `Locked child: ${winner.account_name || winner.sfdc_account_id}`;
    } else {
      reason = `Highest ARR among locked children: ${winner.account_name || winner.sfdc_account_id}`;
    }
  } else {
    reason = `Highest ARR child: ${winner.account_name || winner.sfdc_account_id}`;
  }
  
  return {
    parentAccountId: parent.sfdc_account_id,
    parentAccountName: parent.account_name,
    resolvedOwnerId: winner.owner_id || '',
    resolvedOwnerName: winner.owner_name || 'Unknown',
    reason,
    hasConflict: true,
    willCreateSplit,
    lockedChildrenInvolved: lockedChildren.map(c => c.sfdc_account_id),
    winningChildId: winner.sfdc_account_id,
    winningChildName: winner.account_name || winner.sfdc_account_id
  };
}

