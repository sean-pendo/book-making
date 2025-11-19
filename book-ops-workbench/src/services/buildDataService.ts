import { supabase } from "@/integrations/supabase/client";
import { getFiscalQuarter, isCurrentFiscalYear } from '@/utils/fiscalYearCalculations';
import { calculateEnhancedRepMetrics, type EnhancedRepMetrics } from '@/utils/enhancedRepMetrics';

export interface BuildDataSummary {
  accounts: {
    total: number;
    withOwners: number;
    customers: number;
    prospects: number;
    enterprise: number;
    commercial: number;
    parents: number;
    children: number;
    creRisk: number;
    byRegion: {
      AMER: number;
      EMEA: number;
      APAC: number;
    };
  };
  opportunities: {
    total: number;
    withOwners: number;
    totalAmount: number;
    totalARR: number;
    withCRE: number;
    renewals: {
      Q1: number;
      Q2: number;
      Q3: number;
      Q4: number;
    };
  };
  salesReps: {
    total: number;
    withAccounts: number;
    withOpportunities: number;
    activeReps: number;
    inactiveReps: number;
    byRegion: {
      AMER: number;
      EMEA: number;
      APAC: number;
    };
  };
  dataQuality: {
    orphanedAccounts: number;
    orphanedOpportunities: number;
    missingOwners: number;
    inconsistentOwnerIds: number;
  };
}

export interface OwnerMetrics {
  rep_id: string;
  name: string;
  team?: string;
  region?: string;
  flm?: string;
  slm?: string;
  accounts: {
    total: number;
    parents: number; // Only parent accounts - used for workload balancing
    customers: number;
    prospects: number;
    enterprise: number;
    commercial: number;
    creRisk: number;
  };
  opportunities: {
    total: number;
    totalAmount: number;
    totalARR: number;
    renewals: {
      Q1: number;
      Q2: number;
      Q3: number;
      Q4: number;
    };
  };
  arr: number;
  atr: number;
  tierPercentages?: {
    tier1: number;
    tier2: number;
  };
  accountContinuity?: number;
  regionalAlignment?: number;
}

export interface BuildDataRelationships {
  accountsByOwner: Map<string, any[]>;
  opportunitiesByOwner: Map<string, any[]>;
  opportunitiesByAccount: Map<string, any[]>;
  salesRepsByRepId: Map<string, any>;
  ownerMetrics: OwnerMetrics[];
  enhancedMetrics: EnhancedRepMetrics[];
}

class BuildDataService {
  private static instance: BuildDataService;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  static getInstance(): BuildDataService {
    if (!BuildDataService.instance) {
      BuildDataService.instance = new BuildDataService();
    }
    return BuildDataService.instance;
  }

  private isCacheValid(cacheKey: string): boolean {
    const cached = this.cache.get(cacheKey);
    if (!cached) return false;
    return (Date.now() - cached.timestamp) < this.CACHE_TTL;
  }

  private setCache(cacheKey: string, data: any): void {
    this.cache.set(cacheKey, { data, timestamp: Date.now() });
  }

  async getBuildDataSummary(buildId: string): Promise<BuildDataSummary> {
    const cacheKey = `summary_${buildId}`;
    
    // Check authentication status
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.warn('[BuildDataService] User not authenticated - data access may be limited by RLS policies');
    }
    
    // TEMPORARILY DISABLE CACHE - Always fetch fresh data to fix dashboard issue
    console.log(`[BuildDataService] Force fetching fresh data for build ${buildId}`);
    // Skip cache check: if (this.isCacheValid(cacheKey)) { return this.cache.get(cacheKey)!.data; }

    try {
      // Fetch accounts using pagination like Assignment Engine
      console.log(`[BuildDataService] 📊 Starting paginated query for accounts...`);
      
      const allAccounts: any[] = [];
      const pageSize = 1000;
      let currentPage = 0;
      
      while (true) {
        const { data: pageData, error } = await supabase
          .from('accounts')
          .select('*')
          .eq('build_id', buildId)
          .order('account_name')
          .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);
        
        if (error) {
          console.error(`[BuildDataService] ❌ Error loading accounts page ${currentPage}:`, error);
          throw error;
        }
        
        if (!pageData || pageData.length === 0) {
          break; // No more data
        }
        
        allAccounts.push(...pageData);
        console.log(`[BuildDataService] 📄 Loaded accounts page ${currentPage + 1}: ${pageData.length} records (Total so far: ${allAccounts.length})`);
        
        // If we got less than pageSize records, we're done
        if (pageData.length < pageSize) {
          break;
        }
        
        currentPage++;
      }

      // Fetch opportunities and sales reps (can use single queries as they're likely under 1000)
      const [opportunitiesRes, salesRepsRes] = await Promise.all([
        supabase.from('opportunities').select('*').eq('build_id', buildId).limit(50000),
        supabase.from('sales_reps').select('*').eq('build_id', buildId).limit(50000)
      ]);

      if (opportunitiesRes.error) throw opportunitiesRes.error;
      if (salesRepsRes.error) throw salesRepsRes.error;

      const accounts = allAccounts;
      const opportunities = opportunitiesRes.data || [];
      const salesReps = salesRepsRes.data || [];

      console.log(`[BuildDataService] Raw data fetched for build ${buildId}:`);
      console.log(`- Total accounts: ${accounts.length}`);
      console.log(`- Total opportunities: ${opportunities.length}`);
      console.log(`- Total sales reps: ${salesReps.length}`);
      
      // Debug account classification (use hierarchy ARR logic like Assignment Engine)
      const parentAccounts = accounts.filter(a => a.is_parent);
      const customerAccounts = parentAccounts.filter(a => a.hierarchy_bookings_arr_converted && a.hierarchy_bookings_arr_converted > 0);
      const prospectAccounts = parentAccounts.filter(a => !a.hierarchy_bookings_arr_converted || a.hierarchy_bookings_arr_converted <= 0);
      
      console.log(`[BuildDataService] Account filtering results (using hierarchy ARR logic):`);
      console.log(`- Total accounts: ${accounts.length}`);
      console.log(`- Parent accounts (is_parent=true): ${parentAccounts.length}`);
      console.log(`- Customer accounts (hierarchy_bookings_arr_converted > 0): ${customerAccounts.length}`);
      console.log(`- Prospect accounts (hierarchy_bookings_arr_converted <= 0): ${prospectAccounts.length}`);

        // Calculate fiscal year quarterly renewals
        const renewals = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
        opportunities.forEach(opp => {
          if (opp.renewal_event_date && isCurrentFiscalYear(opp.renewal_event_date)) {
            const quarter = getFiscalQuarter(opp.renewal_event_date);
            if (quarter) renewals[quarter]++;
          }
        });

        // Calculate CRE opportunities count for more accurate data
    const opportunitiesWithCRE = opportunities.filter(opp => {
      return opp.cre_status && opp.cre_status.trim() !== '';
    }).length;

        // Calculate regional breakdown for team capacity
        const repsByRegion = {
          AMER: salesReps.filter(rep => rep.region === 'AMER').length,
          EMEA: salesReps.filter(rep => rep.region === 'EMEA').length,
          APAC: salesReps.filter(rep => rep.region === 'APAC').length,
        };

      // Create sales rep lookup for validation
      const validRepIds = new Set(salesReps.map(rep => rep.rep_id));
      
      const summary: BuildDataSummary = {
        accounts: {
          total: accounts.length,
          withOwners: accounts.filter(a => a.is_parent && a.owner_id).length,
          customers: customerAccounts.length, // Use hierarchy ARR logic like Assignment Engine
          prospects: prospectAccounts.length, // Use hierarchy ARR logic like Assignment Engine
          enterprise: accounts.filter(a => a.enterprise_vs_commercial === 'Enterprise').length,
          commercial: accounts.filter(a => a.enterprise_vs_commercial === 'Commercial').length,
          parents: accounts.filter(a => a.is_parent).length,
          children: accounts.filter(a => !a.is_parent).length,
          creRisk: accounts.filter(a => a.cre_risk).length,
          byRegion: {
            AMER: accounts.filter(a => a.is_parent && a.geo === 'AMER').length,
            EMEA: accounts.filter(a => a.is_parent && a.geo === 'EMEA').length,
            APAC: accounts.filter(a => a.is_parent && a.geo === 'APAC').length,
          }
        },
        opportunities: {
          total: opportunities.length,
          withOwners: opportunities.filter(o => o.owner_id).length,
          totalAmount: accounts.reduce((sum, a) => sum + (a.calculated_atr || a.atr || 0), 0),
          // Total ARR: Only sum parent customer accounts' hierarchy ARR (includes children rolled up)
          totalARR: customerAccounts.reduce((sum, a) => sum + (a.hierarchy_bookings_arr_converted || a.calculated_arr || 0), 0),
          withCRE: opportunitiesWithCRE,
          renewals
        },
        salesReps: {
          total: salesReps.length,
          withAccounts: salesReps.filter(rep => 
            accounts.some(acc => acc.owner_id === rep.rep_id)
          ).length,
          withOpportunities: salesReps.filter(rep => 
            opportunities.some(opp => opp.owner_id === rep.rep_id)
          ).length,
          activeReps: salesReps.filter(rep => rep.is_active).length,
          inactiveReps: salesReps.filter(rep => !rep.is_active).length,
          byRegion: repsByRegion,
        },
        dataQuality: {
          orphanedAccounts: accounts.filter(a => a.is_parent && !a.owner_id).length,
          orphanedOpportunities: opportunities.filter(o => !o.owner_id).length,
          missingOwners: accounts.filter(a => a.is_parent && !a.owner_id).length + opportunities.filter(o => !o.owner_id).length,
          inconsistentOwnerIds: accounts.filter(a => a.owner_id && !validRepIds.has(a.owner_id)).length + opportunities.filter(o => o.owner_id && !validRepIds.has(o.owner_id)).length
        }
      };

      // Data validation warnings
      console.log(`[BuildDataService] 📈 Final Summary Validation:`, {
        totalParentAccounts: summary.accounts.parents,
        customersViaHierarchyARR: summary.accounts.customers,
        prospectsViaHierarchyARR: summary.accounts.prospects,
        totalARR: summary.opportunities.totalARR,
        expectedMinimumAccounts: 6000, // User mentioned 6,380 accounts
        dataComplete: summary.accounts.parents >= 6000,
        hierarchyARRComplete: summary.opportunities.totalARR > 100000000 // Expected ~$107M
      });

      // Show warnings if data doesn't match expectations
      if (summary.accounts.parents < 6000) {
        console.warn(`[BuildDataService] ⚠️ Account count (${summary.accounts.parents}) is less than expected (6,000+)`);
      }
      
      if (summary.opportunities.totalARR < 100000000) {
        console.warn(`[BuildDataService] ⚠️ Total ARR ($${summary.opportunities.totalARR.toLocaleString()}) seems low (expected ~$107M)`);
      }

      this.setCache(cacheKey, summary);
      return summary;
    } catch (error) {
      console.error('Error fetching build data summary:', error);
      throw error;
    }
  }

  async getBuildDataRelationships(buildId: string): Promise<BuildDataRelationships> {
    const cacheKey = `relationships_${buildId}`;
  console.log(`[Build Data Service] Starting getBuildDataRelationships for build ${buildId}`);
  console.log(`[Build Data Service] Cache key: ${cacheKey}, valid: ${this.isCacheValid(cacheKey)}`);
  
  if (this.isCacheValid(cacheKey)) {
    console.log(`[Build Data Service] Returning cached data`);
    return this.cache.get(cacheKey)!.data;
  }

    try {
      // Fetch all data in parallel
      const [accountsRes, opportunitiesRes, salesRepsRes] = await Promise.all([
        supabase.from('accounts').select('*').eq('build_id', buildId).limit(50000),
        supabase.from('opportunities').select('*').eq('build_id', buildId).limit(50000),
        supabase.from('sales_reps').select('*').eq('build_id', buildId).limit(50000)
      ]);

      if (accountsRes.error) throw accountsRes.error;
      if (opportunitiesRes.error) throw opportunitiesRes.error;
      if (salesRepsRes.error) throw salesRepsRes.error;

      const accounts = accountsRes.data || [];
      const opportunities = opportunitiesRes.data || [];
      const salesReps = salesRepsRes.data || [];

      console.log(`[Build Data Service] Found ${accounts.length} accounts, ${opportunities.length} opportunities, ${salesReps.length} sales reps`);
      console.log(`[Build Data Service] Sample accounts:`, accounts.slice(0, 3).map(a => `${a.account_name} -> ${a.owner_name} (${a.owner_id})`));
      console.log(`[Build Data Service] Sample sales reps:`, salesReps.slice(0, 3).map(r => `${r.name} (${r.rep_id}) - ${r.region}`));

      // Create relationship maps
      const accountsByOwner = new Map<string, any[]>();
      const opportunitiesByOwner = new Map<string, any[]>();
      const opportunitiesByAccount = new Map<string, any[]>();
      const salesRepsByRepId = new Map<string, any>();

      // Index sales reps by rep_id
      salesReps.forEach(rep => {
        salesRepsByRepId.set(rep.rep_id, rep);
      });

      // Group accounts by owner (PRIORITIZE new_owner_id over owner_id for assignments)
      accounts.forEach(account => {
        const ownerId = (account as any).new_owner_id || account.owner_id;
        if (ownerId) {
          if (!accountsByOwner.has(ownerId)) {
            accountsByOwner.set(ownerId, []);
          }
          accountsByOwner.get(ownerId)!.push(account);
        }
      });

      // Group opportunities by owner and by account (PRIORITIZE new_owner_id over owner_id for assignments)
      opportunities.forEach(opp => {
        const ownerId = (opp as any).new_owner_id || opp.owner_id;
        if (ownerId) {
          if (!opportunitiesByOwner.has(ownerId)) {
            opportunitiesByOwner.set(ownerId, []);
          }
          opportunitiesByOwner.get(ownerId)!.push(opp);
        }

        if (opp.sfdc_account_id) {
          if (!opportunitiesByAccount.has(opp.sfdc_account_id)) {
            opportunitiesByAccount.set(opp.sfdc_account_id, []);
          }
          opportunitiesByAccount.get(opp.sfdc_account_id)!.push(opp);
        }
      });

      // Calculate owner metrics
      const ownerMetrics: OwnerMetrics[] = [];
      
      salesReps.forEach(rep => {
        const repAccounts = accountsByOwner.get(rep.rep_id) || [];
        const repOpportunities = opportunitiesByOwner.get(rep.rep_id) || [];

        // Calculate fiscal year quarterly renewals for this rep
        const renewals = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
        repOpportunities.forEach(opp => {
          if (opp.renewal_event_date && isCurrentFiscalYear(opp.renewal_event_date)) {
            const quarter = getFiscalQuarter(opp.renewal_event_date);
            if (quarter) renewals[quarter]++;
          }
        });

        // Use hierarchy_bookings_arr_converted for ARR and calculated_atr from opportunities for ATR
        const totalARR = repAccounts.reduce((sum, acc) => sum + (acc.hierarchy_bookings_arr_converted || acc.calculated_arr || 0), 0);
        const totalATR = repOpportunities.reduce((sum, opp) => sum + (opp.available_to_renew || 0), 0);
        
        // Separate parent and child accounts for accurate workload calculation
        const parentAccounts = repAccounts.filter(a => !a.ultimate_parent_id || a.ultimate_parent_id === '');
        const customerAccounts = parentAccounts.filter(a => (a.hierarchy_bookings_arr_converted || 0) > 0);
        const prospectAccounts = parentAccounts.filter(a => (a.hierarchy_bookings_arr_converted || 0) === 0);

        ownerMetrics.push({
          rep_id: rep.rep_id,
          name: rep.name,
          team: rep.team,
          region: rep.region,
          flm: rep.flm,
          slm: rep.slm,
          accounts: {
            total: repAccounts.length, // All accounts (parent + child)
            parents: parentAccounts.length, // Only parent accounts - for workload balancing
            customers: customerAccounts.length,
            prospects: prospectAccounts.length,
            enterprise: repAccounts.filter(a => a.enterprise_vs_commercial === 'Enterprise').length,
            commercial: repAccounts.filter(a => a.enterprise_vs_commercial === 'Commercial').length,
            creRisk: repAccounts.filter(a => a.cre_risk).length,
          },
          opportunities: {
            total: repOpportunities.length,
            totalAmount: repOpportunities.reduce((sum, o) => sum + (o.amount || 0), 0),
            totalARR: repOpportunities.reduce((sum, o) => sum + (o.net_arr || 0), 0),
            renewals
          },
          arr: totalARR,
          atr: totalATR
        });
      });

      // Calculate enhanced metrics for territory balancing
      const enhancedMetrics: EnhancedRepMetrics[] = salesReps.map(rep => 
        calculateEnhancedRepMetrics(rep, accounts, opportunities)
      );

      const relationships: BuildDataRelationships = {
        accountsByOwner,
        opportunitiesByOwner,
        opportunitiesByAccount,
        salesRepsByRepId,
        ownerMetrics,
        enhancedMetrics
      };

      this.setCache(cacheKey, relationships);
      return relationships;
    } catch (error) {
      console.error('Error fetching build data relationships:', error);
      throw error;
    }
  }

  // Clear cache for a specific build (useful after data updates)
  clearBuildCache(buildId: string): void {
    console.log(`[BuildDataService] Clearing cache for build ${buildId}`);
    this.cache.delete(`summary_${buildId}`);
    this.cache.delete(`relationships_${buildId}`);
  }

  // Clear all cache
  clearAllCache(): void {
    this.cache.clear();
  }
}

export const buildDataService = BuildDataService.getInstance();