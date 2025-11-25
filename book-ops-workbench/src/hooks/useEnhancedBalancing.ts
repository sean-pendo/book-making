import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { EnhancedAssignmentService } from '@/services/enhancedAssignmentService';
import { toast } from '@/hooks/use-toast';
import { calculateEnhancedRepMetrics } from '@/utils/enhancedRepMetrics';
import { autoMapTerritoryToRegion } from '@/utils/territoryAutoMapping';

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
}

export const useEnhancedBalancing = (buildId?: string) => {
  const [data, setData] = useState<EnhancedBalancingData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalancingData = async () => {
    if (!buildId) return;

    setIsLoading(true);
    setError(null);

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
      const fetchAssignedAccounts = async () => {
        let allAccounts: any[] = [];
        let from = 0;
        const batchSize = 1000;
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
            opportunity_type
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
      const totalCustomerARR = customers.reduce((sum, acc) => {
        const arrValue = parseFloat(acc.hierarchy_bookings_arr_converted) || parseFloat(acc.calculated_arr) || parseFloat(acc.arr) || 0;
        return sum + arrValue;
      }, 0);
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

        // Calculate customer-only retention rate (only count assigned accounts that stayed with same owner)
        const assignedCustomerAccounts = customerAccounts.filter(acc => acc.new_owner_id);
        const customerRetentionCount = assignedCustomerAccounts.filter(acc =>
          acc.new_owner_id && acc.owner_id === acc.new_owner_id
        ).length;
        const customerRetentionRate = assignedCustomerAccounts.length > 0 ?
          (customerRetentionCount / assignedCustomerAccounts.length) * 100 : 0;

        // Phase 3: Calculate customer-only regional alignment using dynamic territory mappings
        let alignedCustomerCount = 0;
        
        if (customerAccounts.length > 0) {
          customerAccounts.forEach(acc => {
            const accountTerritory = acc.sales_territory;
            const expectedRegion = territoryMappings[accountTerritory || ''];
            const actualRegion = rep.region;
            
            // Check if the rep's region matches the expected region from the GEO_FIRST rule
            if (expectedRegion && actualRegion && expectedRegion === actualRegion) {
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
              .filter(o => o.opportunity_type?.toLowerCase().trim() === 'renewals') // Only include 'Renewals' opportunity type
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
            .filter(o => o.opportunity_type?.toLowerCase().trim() === 'renewals') // Only include 'Renewals' opportunity type
            .reduce((sum, o) => sum + (o.available_to_renew || 0), 0);
          const creRiskCount = accOpportunities.filter(o => o.cre_status && o.cre_status.trim() !== '').length;
          
          return {
            sfdc_account_id: acc.sfdc_account_id,
            account_name: acc.account_name,
            arr: parseFloat(acc.hierarchy_bookings_arr_converted) || parseFloat(acc.calculated_arr) || parseFloat(acc.arr) || 0,
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
          creCount
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

      setData({
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
        assignedAccountsCount: totalAssignedAccounts
      });

    } catch (err) {
      console.error('[useEnhancedBalancing] Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch balancing data');
      toast({
        title: "Error",
        description: "Failed to load enhanced balancing data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateRebalancingPlan = async () => {
    if (!buildId) return;

    try {
      setIsLoading(true);
      console.log('[useEnhancedBalancing] Generating rebalancing plan...');

      // First sync any missing assignment records
      const syncResult = await supabase.functions.invoke('sync-assignments', {
        body: { buildId }
      });

      if (syncResult.error) {
        console.error('Error syncing assignments:', syncResult.error);
      } else {
        console.log('Sync result:', syncResult.data);
      }

      const enhancedService = EnhancedAssignmentService.getInstance();
      const result = await enhancedService.generateBalancedAssignments(buildId);

      console.log('[useEnhancedBalancing] Rebalancing plan generated:', result);

      toast({
        title: "Success",
        description: `Generated ${result.assignedAccounts} balanced assignments`,
      });

      // Refresh data after generating plan
      await fetchBalancingData();

    } catch (err) {
      console.error('[useEnhancedBalancing] Error generating rebalancing plan:', err);
      toast({
        title: "Error",
        description: "Failed to generate rebalancing plan",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (buildId) {
      fetchBalancingData();
    }
  }, [buildId]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchBalancingData,
    generateRebalancingPlan
  };
};