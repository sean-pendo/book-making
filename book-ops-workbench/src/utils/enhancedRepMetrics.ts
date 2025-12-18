// Enhanced Sales Rep metrics calculations for Book Balancing
import { getFiscalQuarter, isCurrentFiscalYear, getFiscalYear, getCurrentFiscalYear } from './fiscalYearCalculations';
import { getAccountARR, isRenewalOpportunity, isParentAccount, isPipelineOpportunity, getOpportunityPipelineValue } from '@/_domain';

interface Account {
  sfdc_account_id: string;
  account_name: string;
  ultimate_parent_id: string | null;
  owner_id: string;
  new_owner_id?: string;
  arr: number | null;
  calculated_arr: number | null;
  hierarchy_bookings_arr_converted: number | null;
  atr: number | null;
  calculated_atr: number | null;
  expansion_tier: string | null;
  initial_sale_tier: string | null;
  sales_territory: string | null;
  geo: string | null;
  renewal_date: string | null;
  is_parent?: boolean;
}

interface Opportunity {
  sfdc_opportunity_id: string;
  sfdc_account_id: string;
  owner_id: string;
  new_owner_id?: string;
  renewal_event_date: string | null;
  available_to_renew: number | null;
  cre_status: string | null;
  opportunity_type: string | null;
  net_arr?: number | null; // Optional for backward compatibility
}

interface SalesRep {
  rep_id: string;
  name: string;
  flm: string | null;
  slm: string | null;
  region: string | null;
  team: string | null;
}

export interface EnhancedRepMetrics {
  rep_id: string;
  name: string;
  flm: string | null;
  slm: string | null;
  region: string | null;
  team: string | null;
  arr: number;
  atr: number;
  prospectNetARR: number; // Total Net ARR from prospect opportunities
  renewals: {
    Q1: number;
    Q2: number;
    Q3: number;
    Q4: number;
    total: number;
  };
  accounts: {
    total: number;
    parents: number;
    children: number;
  };
  tierPercentages: {
    tier1: number;
    tier2: number;
    tier3: number;
    tier4: number;
  };
  accountContinuity: number; // Percentage staying with same rep
  regionalAlignment: number; // Percentage in correct region
}

export function calculateEnhancedRepMetrics(
  rep: SalesRep,
  accounts: Account[],
  opportunities: Opportunity[] = []
): EnhancedRepMetrics {
  try {
    // Get accounts for this rep (prioritize new_owner_id for assignments)
    const repAccounts = accounts.filter(a => 
      (a.new_owner_id || a.owner_id) === rep.rep_id
    );

    // Get opportunities for this rep (prioritize new_owner_id for assignments)  
    const repOpportunities = opportunities.filter(o =>
      (o.new_owner_id || o.owner_id) === rep.rep_id
    );

    // Parent vs Child accounts - use isParentAccount from _domain
    const parentAccounts = repAccounts.filter(isParentAccount);
    const childAccounts = repAccounts.filter(a => !isParentAccount(a));

    // Account filtering for metrics calculation (debug logs removed for performance)

    // ARR calculation with split ownership logic (matching salesRepCalculations.ts)
    // Step 1: Build parent owner map for split ownership detection
    const parentOwnerMap = new Map<string, string>();
    parentAccounts.forEach(parent => {
      const parentId = parent.sfdc_account_id;
      const ownerId = parent.new_owner_id || parent.owner_id;
      if (parentId && ownerId) {
        parentOwnerMap.set(parentId, ownerId);
      }
    });

    // Step 2: Calculate total ARR from parent accounts using centralized logic
    const totalARR = parentAccounts.reduce((sum, acc) => {
      return sum + getAccountARR(acc);
    }, 0);

    // Step 3: Add ARR from child accounts with split ownership
    const splitOwnershipChildrenARR = repAccounts
      .filter(acc => {
        if (isParentAccount(acc)) return false; // Already counted as parent

        const childOwnerId = acc.new_owner_id || acc.owner_id;
        const parentOwnerId = parentOwnerMap.get(acc.ultimate_parent_id!);

        // Only count if child has different owner than parent (split ownership)
        return childOwnerId !== parentOwnerId;
      })
      .reduce((sum, acc) => sum + getAccountARR(acc), 0);

    // Step 4: Combine parent ARR + split ownership children ARR
    const finalTotalARR = totalARR + splitOwnershipChildrenARR;

    // ATR calculation from opportunities - only include 'Renewals' opportunity type
    const totalATR = repOpportunities
      .filter(isRenewalOpportunity)
      .reduce((sum, opp) => {
        const atrValue = opp.available_to_renew || 0;
        return sum + (typeof atrValue === 'number' ? atrValue : 0);
      }, 0);

    // Renewals calculation - count all renewal opportunities regardless of fiscal year
    const renewals = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, total: 0 };
    const currentFiscalYear = getCurrentFiscalYear();
    
    repOpportunities.forEach(opp => {
      if (opp.renewal_event_date) {
        const renewalFiscalYear = getFiscalYear(opp.renewal_event_date);
        // Look at both current and next fiscal year for renewals
        if (renewalFiscalYear === currentFiscalYear || renewalFiscalYear === currentFiscalYear + 1) {
          const quarter = getFiscalQuarter(opp.renewal_event_date);
          if (quarter) {
            renewals[quarter]++;
            renewals.total++;
          }
        }
      }
    });
    
    // If no renewals found with fiscal year logic, count all opportunities with renewal dates
    if (renewals.total === 0) {
      repOpportunities.forEach(opp => {
        if (opp.renewal_event_date) {
          // Assign to quarters based on calendar months for simplicity
          const renewalDate = new Date(opp.renewal_event_date);
          const month = renewalDate.getMonth() + 1; // 1-12
          
          if (month >= 2 && month <= 4) renewals.Q1++;
          else if (month >= 5 && month <= 7) renewals.Q2++;
          else if (month >= 8 && month <= 10) renewals.Q3++;
          else renewals.Q4++; // Nov, Dec, Jan
          
          renewals.total++;
        }
      });
    }

    // Tier percentages (based on parent accounts only) - handle all tier types
    let tier1Count = 0;
    let tier2Count = 0;
    let tier3Count = 0;
    let tier4Count = 0;
    
    parentAccounts.forEach((acc) => {
      const expansionTier = acc.expansion_tier?.toLowerCase()?.trim();
      const initialTier = acc.initial_sale_tier?.toLowerCase()?.trim();
      
      // Check both expansion and initial tiers for any tier designation
      const tierValue = expansionTier || initialTier;
      
      if (tierValue?.includes('tier 1') || tierValue === 'tier1') {
        tier1Count++;
      } else if (tierValue?.includes('tier 2') || tierValue === 'tier2') {
        tier2Count++;
      } else if (tierValue?.includes('tier 3') || tierValue === 'tier3') {
        tier3Count++;
      } else if (tierValue?.includes('tier 4') || tierValue === 'tier4') {
        tier4Count++;
      }
    });

    const tier1Percentage = parentAccounts.length > 0 ? (tier1Count / parentAccounts.length) * 100 : 0;
    const tier2Percentage = parentAccounts.length > 0 ? (tier2Count / parentAccounts.length) * 100 : 0;

    // Account continuity (percentage where owner_id equals new_owner_id)
    const continuityCount = repAccounts.filter(acc => 
      acc.owner_id === (acc.new_owner_id || acc.owner_id)
    ).length;
    const accountContinuity = repAccounts.length > 0 ? 
      (continuityCount / repAccounts.length) * 100 : 0;

    // Regional alignment (based on assignment rules and territory mappings)
    const repRegion = rep.region?.toLowerCase().trim();
    let alignedCount = 0;
    
    if (repRegion && repAccounts.length > 0) {
      repAccounts.forEach((acc) => {
        const accountTerritory = acc.sales_territory?.toLowerCase().trim();
        const accountGeo = acc.geo?.toLowerCase().trim();
        
        // Enhanced regional alignment logic - based on assignment rules
        // Since user said every HQ territory is mapped by rep region already
        let isAligned = false;
        
        if (accountTerritory && repRegion) {
          // Direct region matching
          if (accountTerritory === repRegion) {
            isAligned = true;
          }
          // West region mapping (covers various western territories)
          else if (repRegion.includes('west') && (
            accountTerritory.includes('west') || 
            accountTerritory.includes('california') ||
            accountTerritory.includes('seattle') ||
            accountTerritory.includes('portland') ||
            accountTerritory.includes('denver') ||
            accountTerritory.includes('phoenix') ||
            accountTerritory.includes('las vegas') ||
            accountTerritory.includes('austin') ||
            accountTerritory.includes('houston')
          )) {
            isAligned = true;
          }
          // Northeast region mapping
          else if (repRegion.includes('northeast') && (
            accountTerritory.includes('northeast') || 
            accountTerritory.includes('north east') ||
            accountTerritory.includes('boston') ||
            accountTerritory.includes('new york') ||
            accountTerritory.includes('philadelphia')
          )) {
            isAligned = true;
          }
          // Southeast region mapping  
          else if (repRegion.includes('southeast') && (
            accountTerritory.includes('southeast') || 
            accountTerritory.includes('south east') ||
            accountTerritory.includes('atlanta') ||
            accountTerritory.includes('florida') ||
            accountTerritory.includes('north carolina')
          )) {
            isAligned = true;
          }
          // Central region mapping
          else if (repRegion.includes('central') && (
            accountTerritory.includes('central') ||
            accountTerritory.includes('chicago') ||
            accountTerritory.includes('midwest') ||
            accountTerritory.includes('dallas')
          )) {
            isAligned = true;
          }
        }
        
        // Also check geo field as backup
        if (!isAligned && accountGeo && repRegion) {
          isAligned = accountGeo === repRegion;
        }
        
        if (isAligned) {
          alignedCount++;
        }
      });
    }

    const regionalAlignment = repAccounts.length > 0 ? 
      (alignedCount / repAccounts.length) * 100 : 0;

    // Calculate Pipeline per MASTER_LOGIC.mdc §2.3:
    // Pipeline = ALL prospect opps + (Expansion + New Subscription) from customer accounts
    const prospectAccountIds = new Set(
      repAccounts
        .filter(acc => !acc.hierarchy_bookings_arr_converted || acc.hierarchy_bookings_arr_converted <= 0)
        .map(acc => acc.sfdc_account_id)
    );
    const customerAccountIds = new Set(
      repAccounts
        .filter(acc => acc.hierarchy_bookings_arr_converted && acc.hierarchy_bookings_arr_converted > 0)
        .map(acc => acc.sfdc_account_id)
    );
    
    // All opportunities from prospect accounts (uses SSOT getOpportunityPipelineValue)
    const prospectOpps = repOpportunities.filter(opp => prospectAccountIds.has(opp.sfdc_account_id));
    const prospectPipeline = prospectOpps.reduce((sum, opp) => sum + getOpportunityPipelineValue(opp), 0);
    
    // Expansion + New Subscription opportunities from customer accounts (uses SSOT isPipelineOpportunity)
    // Excludes Renewals (those go to ATR) and Blanks
    const customerPipelineOpps = repOpportunities.filter(opp => 
      customerAccountIds.has(opp.sfdc_account_id) && isPipelineOpportunity(opp)
    );
    const customerPipeline = customerPipelineOpps.reduce((sum, opp) => sum + getOpportunityPipelineValue(opp), 0);
    
    // Total pipeline = prospect + customer pipeline (per §2.3)
    const prospectNetARR = prospectPipeline + customerPipeline;

    // Enhanced metrics calculation completed for rep (debug logs removed for performance)

    return {
      rep_id: rep.rep_id,
      name: rep.name,
      flm: rep.flm,
      slm: rep.slm,
      region: rep.region,
      team: rep.team,
      arr: finalTotalARR,
      atr: totalATR,
      prospectNetARR,
      renewals,
      accounts: {
        total: repAccounts.length,
        parents: parentAccounts.length,
        children: childAccounts.length,
      },
      tierPercentages: {
        tier1: tier1Percentage,
        tier2: tier2Percentage,
        tier3: parentAccounts.length > 0 ? (tier3Count / parentAccounts.length) * 100 : 0,
        tier4: parentAccounts.length > 0 ? (tier4Count / parentAccounts.length) * 100 : 0,
      },
      accountContinuity,
      regionalAlignment,
    };
  } catch (error) {
    console.error(`Error calculating enhanced metrics for rep ${rep.rep_id}:`, error);
    // Return default values on error
    return {
      rep_id: rep.rep_id,
      name: rep.name,
      flm: rep.flm,
      slm: rep.slm,
      region: rep.region,
      team: rep.team,
      arr: 0,
      atr: 0,
      prospectNetARR: 0,
      renewals: { Q1: 0, Q2: 0, Q3: 0, Q4: 0, total: 0 },
      accounts: { total: 0, parents: 0, children: 0 },
      tierPercentages: { tier1: 0, tier2: 0, tier3: 0, tier4: 0 },
      accountContinuity: 0,
      regionalAlignment: 0,
    };
  }
}