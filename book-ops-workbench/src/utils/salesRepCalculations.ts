// Shared calculation logic for Sales Rep metrics
// Used by both SalesRepsTable and SalesRepDetailDialog to ensure consistency

import { getAccountARR, isRenewalOpportunity, isParentAccount } from '@/_domain';

interface Account {
  sfdc_account_id: string;
  account_name: string;
  ultimate_parent_id: string | null;
  ultimate_parent_name: string | null;
  is_customer: boolean;
  is_parent: boolean;
  arr: number | null;
  atr: number | null;
  calculated_arr: number | null;
  calculated_atr: number | null;
  hierarchy_bookings_arr_converted: number | null;
  cre_count: number | null;
  industry: string | null;
  account_type: string | null;
  geo: string | null;
  sales_territory: string | null;
  expansion_tier: string | null;
  initial_sale_tier: string | null;
  cre_risk: boolean;
  risk_flag: boolean;
  owner_id: string;
  new_owner_id: string | null;
  new_owner_name: string | null;
}

interface Opportunity {
  owner_id: string;
  new_owner_id: string | null;
  new_owner_name: string | null;
  renewal_event_date: string | null;
  sfdc_account_id: string;
  available_to_renew: number | null;
  cre_status: string | null;
  opportunity_type: string | null;
}

export interface SalesRepMetrics {
  parent_accounts: number;
  child_accounts: number;
  customer_accounts: number;
  prospect_accounts: number;
  total_accounts: number;
  total_arr: number;
  total_atr: number;
  renewal_count: number;
  cre_risk_count: number;
}

/**
 * Calculate metrics for a sales rep based on their accounts and opportunities
 * Uses the exact same business rules as defined in the requirements
 */
export function calculateSalesRepMetrics(
  repId: string,
  accounts: Account[],
  opportunities: Opportunity[] = []
): SalesRepMetrics {
  try {
    // Filter accounts for this rep (using effective owner - new_owner_id if assigned, otherwise owner_id)
    const repAccounts = accounts.filter(a => (a.new_owner_id || a.owner_id) === repId);
    const repOpportunities = opportunities.filter(o => (o.new_owner_id || o.owner_id) === repId);

    console.log(`[DEBUG calculateSalesRepMetrics] Rep ${repId} - Accounts: ${repAccounts.length}, Opportunities: ${repOpportunities.length}`);

    // Handle case where rep has no accounts
    if (repAccounts.length === 0) {
      return {
        parent_accounts: 0,
        child_accounts: 0,
        customer_accounts: 0,
        prospect_accounts: 0,
        total_accounts: 0,
        total_arr: 0,
        total_atr: 0,
        renewal_count: 0,
        cre_risk_count: 0
      };
    }

    // Account Rules: Parent vs Child (Updated per user requirements)
    // Parent Account: ultimate_parent_id is blank/null/empty
    // Child Account: ultimate_parent_id is not blank/null/empty
    const parentAccounts = repAccounts.filter(isParentAccount);
    const childAccounts = repAccounts.filter(a => !isParentAccount(a));

    console.log(`[DEBUG] Parent/Child Classification for Rep ${repId}:`);
    console.log(`[DEBUG] - Parent accounts: ${parentAccounts.length}`, parentAccounts.map(a => ({ id: a.sfdc_account_id, name: a.account_name, parent_id: a.ultimate_parent_id })));
    console.log(`[DEBUG] - Child accounts: ${childAccounts.length}`, childAccounts.map(a => ({ id: a.sfdc_account_id, name: a.account_name, parent_id: a.ultimate_parent_id })));
    console.log(`[DEBUG] - Total accounts in calculation: ${repAccounts.length}`);

    // Customer & Prospect Classification: Based on parent accounts only
    // Updated logic per user requirements:
    // - For parent accounts: Check individual account ARR > 0
    // - For child accounts: Group by ultimate_parent_id and check hierarchy ARR > 0
    let customerParents = 0;
    let prospectParents = 0;
    
    // Count customers/prospects among parent accounts using hierarchy ARR
    parentAccounts.forEach(account => {
      const accountARR = getAccountARR(account);
      console.log(`[DEBUG] Parent Account ${account.account_name} (${account.sfdc_account_id}): ARR = ${accountARR}`);
      if (accountARR > 0) {
        customerParents++;
      } else {
        prospectParents++;
      }
    });

    // Group child accounts by their ultimate parent for hierarchy calculations (for ATR/ARR calculations)
    const childAccountsByParent = new Map<string, Account[]>();
    childAccounts.forEach(account => {
      const parentId = account.ultimate_parent_id!;
      if (!childAccountsByParent.has(parentId)) {
        childAccountsByParent.set(parentId, []);
      }
      childAccountsByParent.get(parentId)!.push(account);
    });

    // Note: Prospects and customers are only counted for parent accounts
    // Child accounts contribute to ARR/ATR totals but not to prospect/customer counts

    console.log(`[DEBUG] Final Customer/Prospect counts for Rep ${repId}:`);
    console.log(`[DEBUG] - Customer Parents: ${customerParents}`);
    console.log(`[DEBUG] - Prospect Parents: ${prospectParents}`);

    // ARR Calculation: Sum parent accounts + child accounts with split ownership
    // Parent accounts: already include child values via hierarchy_bookings_arr_converted
    // Child accounts with split ownership: only count if owner differs from parent's owner
    
    // First, create a map of parent account owners for quick lookup
    const parentOwnerMap = new Map<string, string>();
    parentAccounts.forEach(parent => {
      const parentId = parent.sfdc_account_id;
      const ownerId = parent.new_owner_id || parent.owner_id;
      if (parentId && ownerId) {
        parentOwnerMap.set(parentId, ownerId);
      }
    });

    // Calculate total ARR from parent accounts using centralized logic
    // Note: We sum ALL parent accounts because getAccountARR() returns 0 for prospects,
    // so filtering to customers first is unnecessary and gives identical results.
    // @see MASTER_LOGIC.mdc §2.1 - ARR priority chain: hierarchy_bookings → calculated_arr → arr → 0
    const totalARR = parentAccounts.reduce((sum, acc) => {
      const arrValue = getAccountARR(acc);
      console.log(`[DEBUG] Adding ARR for parent ${acc.account_name}: ${arrValue}`);
      return sum + arrValue;
    }, 0);

    // Add ARR from child accounts with split ownership
    // (where child owner differs from their parent's owner)
    const splitOwnershipChildrenARR = repAccounts
      .filter(acc => {
        // Check if this is a child account (has ultimate_parent_id)
        const parentId = acc.ultimate_parent_id;
        if (!parentId || parentId === '' || parentId.trim() === '') return false; // This is a parent account, already counted
        
        const childOwnerId = acc.new_owner_id || acc.owner_id;
        const parentOwnerId = parentOwnerMap.get(parentId);
        
        // Only count if child has different owner than parent (split ownership)
        return childOwnerId !== parentOwnerId;
      })
      .reduce((sum, acc) => {
        const arrValue = getAccountARR(acc);
        console.log(`[DEBUG] Adding ARR for split ownership child ${acc.account_name}: ${arrValue}`);
        return sum + arrValue;
      }, 0);

    const finalTotalARR = totalARR + splitOwnershipChildrenARR;
    console.log(`[DEBUG] Total ARR for Rep ${repId}: ${finalTotalARR} (${totalARR} from parents + ${splitOwnershipChildrenARR} from split ownership children)`);

    // ATR Calculation: Calculate from opportunities with opportunity_type = 'Renewals' ONLY
    // Sum available_to_renew from ONLY renewal opportunities for this rep's accounts
    const totalATR = repOpportunities.reduce((sum, opp) => {
      // Only include opportunities where opportunity_type is 'Renewals'
      if (isRenewalOpportunity(opp)) {
        const atrValue = opp.available_to_renew || 0;
        return sum + atrValue;
      }
      return sum;
    }, 0);
    
    console.log(`[DEBUG] Total ATR calculation for Rep ${repId}: ${totalATR} (from ${repOpportunities.filter(isRenewalOpportunity).length} renewal opportunities)`);

    // Risk Assessment: Count of CRE opportunities tied to parent and children
    const accountIds = repAccounts.map(a => a.sfdc_account_id);
    const hierarchyOpportunities = repOpportunities.filter(o => 
      accountIds.includes(o.sfdc_account_id)
    );
    
    const creOpportunityCount = hierarchyOpportunities.filter(o => 
      o.cre_status && typeof o.cre_status === 'string' && o.cre_status.trim() !== ''
    ).length;

    // Renewal count for tracking
    const renewalOpportunities = hierarchyOpportunities.filter(o => 
      o.renewal_event_date && o.renewal_event_date !== ''
    );

    const metrics = {
      parent_accounts: parentAccounts.length,
      child_accounts: childAccounts.length,
      customer_accounts: customerParents,
      prospect_accounts: prospectParents,
      total_accounts: repAccounts.length,
      total_arr: finalTotalARR,
      total_atr: totalATR,
      renewal_count: renewalOpportunities.length,
      cre_risk_count: creOpportunityCount
    };

    console.log(`[DEBUG calculateSalesRepMetrics] Rep ${repId} metrics:`, metrics);
    return metrics;

  } catch (error) {
    console.error(`[ERROR calculateSalesRepMetrics] Failed to calculate metrics for rep ${repId}:`, error);
    // Return zero metrics on error to prevent crashes
    return {
      parent_accounts: 0,
      child_accounts: 0,
      customer_accounts: 0,
      prospect_accounts: 0,
      total_accounts: 0,
      total_arr: 0,
      total_atr: 0,
      renewal_count: 0,
      cre_risk_count: 0
    };
  }
}

/**
 * Helper function to safely get ARR value from account
 */
export function getOldAccountARR(account: Account): number {
  try {
    return getAccountARR(account);
  } catch {
    return 0;
  }
}

/**
 * Helper function to determine if account is customer or prospect at hierarchy level
 */
export function getAccountCustomerStatus(
  account: Account, 
  accountsByParent: Map<string, Account[]>
): 'Customer' | 'Prospect' {
  try {
    const parentId = account.ultimate_parent_id || account.sfdc_account_id;
    const hierarchyAccounts = accountsByParent.get(parentId) || [account];
    
    const hierarchyARR = hierarchyAccounts.reduce((sum, acc) => {
      return sum + getAccountARR(acc);
    }, 0);
    
    return hierarchyARR > 0 ? 'Customer' : 'Prospect';
  } catch {
    return 'Prospect';
  }
}