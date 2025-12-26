import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { calculateEnhancedRepMetrics } from '@/utils/enhancedRepMetrics';
import { autoMapTerritoryToRegion, getAccountARR, isRenewalOpportunity, getAccountExpansionTier, getCRERiskLevel, SUPABASE_LIMITS } from '@/_domain';

export interface AccountDetail {
  sfdc_account_id: string;
  account_name: string;
  arr: number;
  atr: number;
  renewals: number;
  renewal_date?: string;
  is_customer: boolean;
  cre_risk_count?: number;
  owner_id?: string;
  owner_name?: string;
  new_owner_id?: string;
  new_owner_name?: string;
  hq_country?: string;
  sales_territory?: string;
  ultimate_parent_id?: string;
  ultimate_parent_name?: string;
  calculated_arr?: number;
  is_parent?: boolean;
  has_split_ownership?: boolean;
}

export interface RepMetrics {
  rep_id: string;
  name: string;
  team?: string;
  region?: string;
  customerAccounts: number;
  customerARR: number;
  customerATR: number;
  prospectAccounts: number;
  /** Sum of net_arr from opportunities on prospect accounts - used for pipeline distribution */
  prospectNetARR: number;
  totalAccounts: number;
  totalRenewals: number;
  totalATR: number;
  status: 'Balanced' | 'Overloaded' | 'Light';
  retentionRate: number;
  regionalAlignment: number;
  renewalsQ1: number;
  renewalsQ2: number;
  renewalsQ3: number;
  renewalsQ4: number;
  creCount: number;
  /** Strategic rep flag - balanced separately from normal reps */
  is_strategic_rep?: boolean;
  
  // Tier breakdown (Tier 1-4 from expansion_tier or initial_sale_tier)
  tier1Accounts: number;
  tier2Accounts: number;
  tier3Accounts: number;
  tier4Accounts: number;
  tierNAAccounts: number;
  
  // CRE Risk breakdown (based on cre_count thresholds)
  creNoneAccounts: number;
  creLowAccounts: number;
  creMediumAccounts: number;
  creHighAccounts: number;
}

interface EnhancedBalancingData {
  customerMetrics: {
    totalARR: number;
    totalAccounts: number;
    avgARRPerRep: number;
    balance: 'Balanced' | 'Unbalanced';
    maxVariance: number;
  };
  prospectMetrics: {
    totalAccounts: number;
    avgAccountsPerRep: number;
    balance: 'Balanced' | 'Unbalanced';
    maxVariance: number;
  };
  retentionMetrics: {
    ownerRetentionRate: number;
    avgRegionalAlignment: number;
    prospectRetentionRate: number;
    prospectRegionalAlignment: number;
  };
  repMetrics: RepMetrics[];
  repAccountDetails: Record<string, AccountDetail[]>;
  assignedAccountsCount: number; // Total accounts with new_owner_id set
  beforeMetrics?: {
    totalCustomerARR: number;
    totalCustomerAccounts: number;
    totalProspectAccounts: number;
    avgCustomerARRPerRep: number;
    avgCustomerAccountsPerRep: number;
    avgProspectAccountsPerRep: number;
    maxArrVariance: number;
    // Per-rep before metrics (based on owner_id, not new_owner_id)
    repMetrics: Array<{
      rep_id: string;
      customerARR: number;
      customerATR: number;
      customerAccounts: number;
      prospectAccounts: number;
    }>;
  };
}

export const useEnhancedBalancing = (buildId?: string) => {

  // Main data fetching function - returns data instead of setting state
  const fetchBalancingData = async (buildId: string): Promise<EnhancedBalancingData> => {
    try {
      console.log('[useEnhancedBalancing] Fetching enhanced balancing data for build:', buildId);

      // Phase 3: Fetch territory mappings from assignment_configuration
      const { data: config } = await supabase
        .from('assignment_configuration')
        .select('territory_mappings')
        .eq('build_id', buildId)
        .eq('account_scope', 'all')
        .maybeSingle();
      
      const territoryMappings = (config?.territory_mappings as Record<string, string>) || {};
      console.log('[useEnhancedBalancing] Territory mappings loaded:', Object.keys(territoryMappings).length, 'territories');

      // Fetch assignment configuration for threshold-based status calculation
      const { data: configData } = await supabase
        .from('assignment_configuration')
        .select('customer_target_arr, customer_max_arr, capacity_variance_percent')
        .eq('build_id', buildId)
        .eq('account_scope', 'all')
        .maybeSingle();
      
      const targetARR = configData?.customer_target_arr || 0;
      const maxARR = configData?.customer_max_arr || 0;
      const variance = (configData?.capacity_variance_percent || 10) / 100;
      const minARR = targetARR * (1 - variance);
      
      console.log(`[useEnhancedBalancing] ARR Thresholds: Min=${(minARR/1000000).toFixed(2)}M, Target=${(targetARR/1000000).toFixed(2)}M, Max=${(maxARR/1000000).toFixed(2)}M`);

      // Fetch accounts with assignments - use LEFT JOIN to handle missing assignment records
      // Uses SSOT pagination from @/_domain
      const fetchAssignedAccounts = async () => {
        let allAccounts: any[] = [];
        let from = 0;
        const batchSize = SUPABASE_LIMITS.FETCH_PAGE_SIZE;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from('accounts')
            .select(`
              sfdc_account_id,
              account_name,
              is_customer,
              arr,
              calculated_arr,
              hierarchy_bookings_arr_converted,
              owner_id,
              owner_name,
              new_owner_id,
              new_owner_name,
              expansion_tier,
              initial_sale_tier,
              sales_territory,
              hq_country,
              geo,
              ultimate_parent_id,
              is_parent,
              renewal_date,
              has_split_ownership
            `)
            .eq('build_id', buildId)
            .eq('is_parent', true)
            .range(from, from + batchSize - 1);

          if (error) throw error;
          
          if (data) {
            allAccounts = [...allAccounts, ...data];
            hasMore = data.length === batchSize;
            from += batchSize;
          } else {
            hasMore = false;
          }
        }

        return allAccounts;
      };

      const [accounts, opportunities, repsResult] = await Promise.all([
        fetchAssignedAccounts(),
        
        supabase
          .from('opportunities')
          .select(`
            sfdc_opportunity_id,
            sfdc_account_id,
            owner_id,
            new_owner_id,
            renewal_event_date,
            available_to_renew,
            cre_status,
            opportunity_type,
            net_arr,
            amount
          `)
          .eq('build_id', buildId),
        
        supabase
          .from('sales_reps')
          .select('*')
          .eq('build_id', buildId)
          .eq('is_active', true)
          .eq('is_manager', false)
      ]);

      if (repsResult.error) throw repsResult.error;
      if (opportunities.error) throw opportunities.error;

      const reps = repsResult.data || [];
      const allOpportunities = opportunities.data || [];

      console.log('[useEnhancedBalancing] Data fetched:', accounts.length, 'accounts,', allOpportunities.length, 'opportunities,', reps.length, 'reps');

      // Separate customers and prospects
      const customers = accounts.filter(acc => acc.is_customer);
      const prospects = accounts.filter(acc => !acc.is_customer);

      console.log('[useEnhancedBalancing] Split:', customers.length, 'customers,', prospects.length, 'prospects');

      // Calculate customer metrics
      const totalCustomerARR = customers.reduce((sum, acc) => sum + getAccountARR(acc), 0);
      console.log(`[useEnhancedBalancing] ✅ v1.0.5-FIXED Total Customer ARR: $${(totalCustomerARR / 1000000).toFixed(2)}M from ${customers.length} customers`);
      const avgCustomerARRPerRep = totalCustomerARR / reps.length;

      // Calculate prospect metrics
      const totalProspectAccounts = prospects.length;
      const avgProspectAccountsPerRep = totalProspectAccounts / reps.length;

      // Calculate enhanced metrics for each rep
      const repMetricsData: RepMetrics[] = [];
      const repAccountDetails: Record<string, AccountDetail[]> = {};

      reps.forEach(rep => {
        const enhancedMetrics = calculateEnhancedRepMetrics(rep, accounts, allOpportunities);
        
        // Get customer accounts only for retention and regional alignment
        const customerAccounts = accounts.filter(a => 
          ((a.new_owner_id || a.owner_id) === rep.rep_id) && a.is_customer
        );
        
        // Get prospect accounts
        const prospectAccounts = accounts.filter(a => 
          ((a.new_owner_id || a.owner_id) === rep.rep_id) && !a.is_customer
        );
        
        // Get all rep accounts (parent accounts for tier/CRE distribution)
        const allRepAccounts = accounts.filter(a => 
          ((a.new_owner_id || a.owner_id) === rep.rep_id) && a.is_parent
        );
        
        // Calculate tier breakdown
        let tier1Count = 0, tier2Count = 0, tier3Count = 0, tier4Count = 0, tierNACount = 0;
        allRepAccounts.forEach(a => {
          const tier = getAccountExpansionTier(a);
          if (tier === 'Tier 1') tier1Count++;
          else if (tier === 'Tier 2') tier2Count++;
          else if (tier === 'Tier 3') tier3Count++;
          else if (tier === 'Tier 4') tier4Count++;
          else tierNACount++;
        });
        
        // Calculate CRE risk breakdown
        let creNoneCount = 0, creLowCount = 0, creMediumCount = 0, creHighCount = 0;
        allRepAccounts.forEach(a => {
          const level = getCRERiskLevel((a as any).cre_count || 0);
          if (level === 'none') creNoneCount++;
          else if (level === 'low') creLowCount++;
          else if (level === 'medium') creMediumCount++;
          else creHighCount++;
        });

        // Calculate customer-only retention rate (only count assigned accounts that stayed with same owner)
        const assignedCustomerAccounts = customerAccounts.filter(acc => acc.new_owner_id);
        const customerRetentionCount = assignedCustomerAccounts.filter(acc =>
          acc.new_owner_id && acc.owner_id === acc.new_owner_id
        ).length;
        const customerRetentionRate = assignedCustomerAccounts.length > 0 ?
          (customerRetentionCount / assignedCustomerAccounts.length) * 100 : 0;

        // Phase 3: Calculate customer-only regional alignment
        // Uses same logic as assignment engine: territory mappings first, then direct geo match
        let alignedCustomerCount = 0;
        const hasCustomMappings = Object.keys(territoryMappings).length > 0;
        
        if (customerAccounts.length > 0) {
          customerAccounts.forEach(acc => {
            const actualRegion = rep.region;
            let isAligned = false;
            
            if (hasCustomMappings) {
              // Use territory mappings if configured
              const accountTerritory = acc.sales_territory;
              const expectedRegion = territoryMappings[accountTerritory || ''];
              if (expectedRegion && actualRegion && expectedRegion === actualRegion) {
                isAligned = true;
              }
              // Fallback: check geo field against territory mappings
              if (!isAligned && acc.geo) {
                const geoRegion = territoryMappings[acc.geo];
                if (geoRegion && actualRegion && geoRegion === actualRegion) {
                  isAligned = true;
                }
              }
            } else {
              // Direct matching when no custom mappings exist (same as assignment engine)
              // Compare account.geo directly to rep.region
              if (acc.geo && actualRegion && acc.geo === actualRegion) {
                isAligned = true;
              }
              // Also check sales_territory as direct region match
              if (!isAligned && acc.sales_territory && actualRegion && acc.sales_territory === actualRegion) {
                isAligned = true;
              }
            }
            
            if (isAligned) {
              alignedCustomerCount++;
            }
          });
        }

        const customerRegionalAlignment = customerAccounts.length > 0 ? 
          (alignedCustomerCount / customerAccounts.length) * 100 : 0;

        // Status determination based on ARR vs configured thresholds
        let status: 'Balanced' | 'Overloaded' | 'Light' = 'Balanced';
        const customerARR = enhancedMetrics.arr;
        
        if (targetARR > 0 && maxARR > 0) {
          // Use configured ARR thresholds
          if (customerARR > maxARR) {
            status = 'Overloaded';
          } else if (customerARR < minARR) {
            status = 'Light';
          } else {
            status = 'Balanced';
          }
        } else {
          // Fallback to account count if no config found (should not happen after regeneration)
          const totalAccounts = enhancedMetrics.accounts.total;
          const avgAccountsPerRep = totalAccounts > 0 ? totalAccounts / reps.length : 0;
          
          if (totalAccounts > avgAccountsPerRep * 1.3) status = 'Overloaded';
          else if (totalAccounts < avgAccountsPerRep * 0.7) status = 'Light';
        }

        // Create account details for this rep
        // Include parent accounts OR child accounts with split ownership
        const repAccounts = accounts.filter(a => {
          const effectiveOwner = a.new_owner_id || a.owner_id;
          const isOwnedByRep = effectiveOwner === rep.rep_id;
          
          // Include parent accounts OR child accounts with split ownership
          return isOwnedByRep && (a.is_parent || a.has_split_ownership);
        });

        // Calculate customer-specific ATR
        const customerATR = repAccounts
          .filter(acc => acc.is_customer)
          .reduce((sum, acc) => {
            const accOpportunities = allOpportunities.filter(o => o.sfdc_account_id === acc.sfdc_account_id);
            const atrAmount = accOpportunities
              .filter(isRenewalOpportunity)
              .reduce((sum, o) => sum + (o.available_to_renew || 0), 0);
            return sum + atrAmount;
          }, 0);

        // Calculate CRE count for this rep
        const repOpportunities = allOpportunities.filter(o => 
          (o.new_owner_id || o.owner_id) === rep.rep_id
        );
        const creCount = repOpportunities.filter(o => o.cre_status && o.cre_status.trim() !== '').length;

        const accountDetails: AccountDetail[] = repAccounts.map(acc => {
          // Get opportunities for this account to calculate renewals and ATR
          const accOpportunities = allOpportunities.filter(o => o.sfdc_account_id === acc.sfdc_account_id);
          const renewalCount = accOpportunities.filter(o => o.renewal_event_date).length;
          const atrAmount = accOpportunities
            .filter(isRenewalOpportunity)
            .reduce((sum, o) => sum + (o.available_to_renew || 0), 0);
          const creRiskCount = accOpportunities.filter(o => o.cre_status && o.cre_status.trim() !== '').length;
          
          return {
            sfdc_account_id: acc.sfdc_account_id,
            account_name: acc.account_name,
            arr: getAccountARR(acc),
            atr: atrAmount,
            renewals: renewalCount,
            renewal_date: acc.renewal_date,
            is_customer: acc.is_customer || false,
            cre_risk_count: creRiskCount,
            owner_id: acc.owner_id,
            owner_name: acc.owner_name,
            new_owner_id: acc.new_owner_id,
            new_owner_name: acc.new_owner_name,
            hq_country: acc.hq_country,
            sales_territory: acc.sales_territory,
            has_split_ownership: acc.has_split_ownership
          };
        });

        repAccountDetails[rep.rep_id] = accountDetails;

        repMetricsData.push({
          rep_id: rep.rep_id,
          name: rep.name,
          team: rep.team,
          region: rep.region,
          customerAccounts: customerAccounts.length,
          customerARR: enhancedMetrics.arr,
          customerATR: customerATR,
          prospectAccounts: prospectAccounts.length,
          prospectNetARR: enhancedMetrics.prospectNetARR, // Pipeline value from prospect opportunities
          totalAccounts: enhancedMetrics.accounts.total,
          totalRenewals: enhancedMetrics.renewals.total,
          totalATR: enhancedMetrics.atr,
          status,
          retentionRate: customerRetentionRate,
          regionalAlignment: customerRegionalAlignment,
          renewalsQ1: enhancedMetrics.renewals.Q1,
          renewalsQ2: enhancedMetrics.renewals.Q2,
          renewalsQ3: enhancedMetrics.renewals.Q3,
          renewalsQ4: enhancedMetrics.renewals.Q4,
          creCount,
          is_strategic_rep: rep.is_strategic_rep ?? false,
          // Tier breakdown
          tier1Accounts: tier1Count,
          tier2Accounts: tier2Count,
          tier3Accounts: tier3Count,
          tier4Accounts: tier4Count,
          tierNAAccounts: tierNACount,
          // CRE Risk breakdown
          creNoneAccounts: creNoneCount,
          creLowAccounts: creLowCount,
          creMediumAccounts: creMediumCount,
          creHighAccounts: creHighCount,
        });
      });

      // Calculate overall retention metrics for CUSTOMERS ONLY (only count assigned accounts)
      const assignedCustomers = accounts.filter(a => a.is_customer && a.new_owner_id);
      const retainedCustomerAccounts = assignedCustomers.filter(acc =>
        acc.new_owner_id && acc.owner_id === acc.new_owner_id
      ).length;
      const ownerRetentionRate = assignedCustomers.length > 0 ? (retainedCustomerAccounts / assignedCustomers.length) * 100 : 0;

      // Calculate average regional alignment for CUSTOMERS ONLY
      const avgRegionalAlignment = repMetricsData.length > 0 ? 
        repMetricsData.reduce((sum, rep) => sum + rep.regionalAlignment, 0) / repMetricsData.length : 0;

      // Calculate prospect retention rate (only count assigned prospects)
      const assignedProspects = prospects.filter(acc => acc.new_owner_id);
      const prospectsWithSameOwner = assignedProspects.filter(acc =>
        acc.new_owner_id && acc.owner_id === acc.new_owner_id
      ).length;
      const prospectRetentionRate = assignedProspects.length > 0
        ? (prospectsWithSameOwner / assignedProspects.length) * 100
        : 0;

      console.log(`[useEnhancedBalancing] Prospect Retention: ${prospectsWithSameOwner}/${assignedProspects.length} assigned (${prospectRetentionRate.toFixed(1)}%)`);

      // Calculate prospect regional alignment using territory mapping
      const salesReps = reps;
      const prospectsWithRegionalAlignment = prospects.filter(acc => {
        if (!acc.new_owner_id || !acc.sales_territory) return false;
        
        const ownerRep = salesReps.find(r => r.rep_id === acc.new_owner_id);
        if (!ownerRep?.region) return false;
        
        // Map account's sales_territory to a US region
        const accountMappedRegion = autoMapTerritoryToRegion(acc.sales_territory);
        if (!accountMappedRegion) return false;
        
        // Normalize for comparison
        const accountRegion = accountMappedRegion.trim().toUpperCase();
        const repRegion = (ownerRep.region || '').trim().toUpperCase();
        
        // Match regions (North East, South East, Central, West, Other)
        return accountRegion === repRegion;
      }).length;

      const prospectRegionalAlignment = assignedProspects.length > 0
        ? (prospectsWithRegionalAlignment / assignedProspects.length) * 100
        : 0;

      console.log(`[useEnhancedBalancing] Prospect Regional Alignment: ${prospectsWithRegionalAlignment}/${assignedProspects.length} assigned (${prospectRegionalAlignment.toFixed(1)}%)`);

      // Calculate overall balance status based on account distribution
      const accountCounts = repMetricsData.map(r => r.totalAccounts);
      const avgAccounts = accountCounts.reduce((sum, count) => sum + count, 0) / accountCounts.length;
      const maxVariance = Math.max(...accountCounts.map(count => Math.abs((count - avgAccounts) / avgAccounts * 100)));

      const customerBalance: 'Balanced' | 'Unbalanced' = maxVariance <= 20 ? 'Balanced' : 'Unbalanced';
      const prospectBalance: 'Balanced' | 'Unbalanced' = maxVariance <= 25 ? 'Balanced' : 'Unbalanced';

      // Calculate total assigned accounts (those with new_owner_id set)
      const totalAssignedAccounts = assignedCustomers.length + assignedProspects.length;

      // Calculate before metrics (based on owner_id)
      const beforeCustomerAccounts = accounts.filter(acc => acc.is_customer && acc.owner_id);
      const beforeProspectAccounts = accounts.filter(acc => !acc.is_customer && acc.owner_id);
      const beforeCustomerARR = beforeCustomerAccounts.reduce((sum, acc) => sum + getAccountARR(acc), 0);
      const beforeAvgCustomerARRPerRep = reps.length > 0 ? beforeCustomerARR / reps.length : 0;
      const beforeAvgCustomerAccountsPerRep = reps.length > 0 ? beforeCustomerAccounts.length / reps.length : 0;
      const beforeAvgProspectAccountsPerRep = reps.length > 0 ? beforeProspectAccounts.length / reps.length : 0;

      // Calculate per-rep before metrics (based on owner_id, not new_owner_id)
      const beforeRepMetrics = reps.map(rep => {
        const repCustomerAccounts = beforeCustomerAccounts.filter(acc => acc.owner_id === rep.rep_id);
        const repProspectAccounts = beforeProspectAccounts.filter(acc => acc.owner_id === rep.rep_id);
        const repCustomerARR = repCustomerAccounts.reduce((sum, acc) => sum + getAccountARR(acc), 0);
        
        // Calculate ATR for before state (from original owner)
        const repOpportunities = allOpportunities.filter(o => o.owner_id === rep.rep_id);
        const repCustomerATR = repOpportunities
          .filter(o => isRenewalOpportunity(o) && repCustomerAccounts.some(acc => acc.sfdc_account_id === o.sfdc_account_id))
          .reduce((sum, o) => sum + (o.available_to_renew || 0), 0);
        
        return {
          rep_id: rep.rep_id,
          customerARR: repCustomerARR,
          customerATR: repCustomerATR,
          customerAccounts: repCustomerAccounts.length,
          prospectAccounts: repProspectAccounts.length,
        };
      });

      // Calculate before variance
      const beforeRepCustomerCounts = beforeRepMetrics.map(r => r.customerAccounts);
      const beforeAvgAccounts = beforeRepCustomerCounts.length > 0 && beforeRepCustomerCounts.reduce((sum, count) => sum + count, 0) > 0
        ? beforeRepCustomerCounts.reduce((sum, count) => sum + count, 0) / beforeRepCustomerCounts.length
        : 0;
      const beforeMaxVariance = beforeAvgAccounts > 0
        ? Math.max(...beforeRepCustomerCounts.map(count => Math.abs((count - beforeAvgAccounts) / beforeAvgAccounts * 100)))
        : 0;

      return {
        customerMetrics: {
          totalARR: totalCustomerARR,
          totalAccounts: customers.length,
          avgARRPerRep: avgCustomerARRPerRep,
          balance: customerBalance,
          maxVariance: maxVariance
        },
        prospectMetrics: {
          totalAccounts: totalProspectAccounts,
          avgAccountsPerRep: avgProspectAccountsPerRep,
          balance: prospectBalance,
          maxVariance: maxVariance
        },
        retentionMetrics: {
          ownerRetentionRate,
          avgRegionalAlignment,
          prospectRetentionRate,
          prospectRegionalAlignment
        },
        repMetrics: repMetricsData.sort((a, b) => b.customerARR - a.customerARR),
        repAccountDetails,
        assignedAccountsCount: totalAssignedAccounts,
        beforeMetrics: {
          totalCustomerARR: beforeCustomerARR,
          totalCustomerAccounts: beforeCustomerAccounts.length,
          totalProspectAccounts: beforeProspectAccounts.length,
          avgCustomerARRPerRep: beforeAvgCustomerARRPerRep,
          avgCustomerAccountsPerRep: beforeAvgCustomerAccountsPerRep,
          avgProspectAccountsPerRep: beforeAvgProspectAccountsPerRep,
          maxArrVariance: beforeMaxVariance,
          repMetrics: beforeRepMetrics
        }
      };
    } catch (err) {
      console.error('[useEnhancedBalancing] Error fetching data:', err);
      throw err;
    }
  };

  // Use React Query for data fetching - responds to cache invalidation
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['enhanced-balancing', buildId],
    queryFn: () => fetchBalancingData(buildId!),
    enabled: !!buildId,
    staleTime: 30000, // Consider data fresh for 30 seconds
  });

  return {
    data: data ?? null,
    isLoading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    refetch
  };
};