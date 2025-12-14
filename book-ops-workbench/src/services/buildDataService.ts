import { supabase } from "@/integrations/supabase/client";
import { getFiscalQuarter, isCurrentFiscalYear } from '@/utils/fiscalYearCalculations';
import { calculateEnhancedRepMetrics, type EnhancedRepMetrics } from '@/utils/enhancedRepMetrics';
import type { 
  LPSuccessMetrics, 
  GeoAlignmentMetrics, 
  TierDistribution, 
  TierAlignmentBreakdown,
  ArrBucket, 
  RegionMetrics,
  OwnerCoverage,
  MetricsSnapshot, 
  MetricsComparison,
  BalanceMetricsDetail,
  RepLoadDistribution
} from '@/types/analytics';
import { ARR_BUCKETS, GEO_SCORE_WEIGHTS, TEAM_ALIGNMENT_WEIGHTS } from '@/types/analytics';

export interface BuildDataSummary {
  accounts: {
    total: number;
    withOwners: number;
    customers: number;        // Parent customers only
    prospects: number;        // Parent prospects only
    childCustomers: number;   // Child accounts under customers
    childProspects: number;   // Child accounts under prospects
    totalCustomers: number;   // Parent + child customers
    totalProspects: number;   // Parent + child prospects
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
  assignments: {
    total: number;
    applied: number;
    pending: number;
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
    
    // Re-enable cache for production performance
    if (this.isCacheValid(cacheKey)) {
      console.log(`[BuildDataService] ✅ Returning cached data for build ${buildId}`);
      return this.cache.get(cacheKey)!.data;
    }

    try {
      // OPTIMIZED: Parallel batch fetching for accounts
      console.log(`[BuildDataService] 📊 Starting PARALLEL batch fetch for accounts...`);
      const startTime = performance.now();
      
      // First, get the total count to know how many parallel requests we need
      const { count: totalCount, error: countError } = await supabase
        .from('accounts')
        .select('*', { count: 'exact', head: true })
        .eq('build_id', buildId);
      
      if (countError) {
        console.error(`[BuildDataService] ❌ Error getting account count:`, countError);
        throw countError;
      }
      
      // Supabase has a hard server-side limit of 1000 rows per request
      // Use 1000-row batches but run all in parallel for speed
      const pageSize = 1000;
      const totalPages = Math.ceil((totalCount || 0) / pageSize);
      console.log(`[BuildDataService] 📊 Total accounts: ${totalCount}, fetching in ${totalPages} parallel batches of ${pageSize}`);
      
      // Create all page fetch promises - all run in parallel
      const pagePromises = Array.from({ length: totalPages }, (_, pageIndex) => 
        supabase
          .from('accounts')
          .select('*')
          .eq('build_id', buildId)
          .order('account_name')
          .range(pageIndex * pageSize, (pageIndex + 1) * pageSize - 1)
      );
      
      // Execute all fetches in parallel
      const pageResults = await Promise.all(pagePromises);
      
      // Combine results
      const allAccounts: any[] = [];
      for (let i = 0; i < pageResults.length; i++) {
        const { data: pageData, error } = pageResults[i];
        if (error) {
          console.error(`[BuildDataService] ❌ Error loading accounts batch ${i + 1}:`, error);
          throw error;
        }
        if (pageData) {
          allAccounts.push(...pageData);
        }
      }
      
      const fetchTime = performance.now() - startTime;
      console.log(`[BuildDataService] ⚡ Loaded ${allAccounts.length} accounts in ${fetchTime.toFixed(0)}ms (${totalPages} parallel batches)`)

      // Fetch opportunities with pagination (Supabase has 1000 row limit)
      const { count: oppCount, error: oppCountError } = await supabase
        .from('opportunities')
        .select('*', { count: 'exact', head: true })
        .eq('build_id', buildId);
      
      if (oppCountError) {
        console.error(`[BuildDataService] ❌ Error getting opportunity count:`, oppCountError);
        throw oppCountError;
      }
      
      const oppPageSize = 1000;
      const oppTotalPages = Math.ceil((oppCount || 0) / oppPageSize);
      console.log(`[BuildDataService] 📊 Total opportunities: ${oppCount}, fetching in ${oppTotalPages} parallel batches of ${oppPageSize}`);
      
      const oppPagePromises = Array.from({ length: oppTotalPages }, (_, pageIndex) => 
        supabase
          .from('opportunities')
          .select('*')
          .eq('build_id', buildId)
          .range(pageIndex * oppPageSize, (pageIndex + 1) * oppPageSize - 1)
      );
      
      // Fetch sales reps and assignments (usually under 1000, but use pagination to be safe)
      const { count: repCount } = await supabase
        .from('sales_reps')
        .select('*', { count: 'exact', head: true })
        .eq('build_id', buildId);
      
      const repPageSize = 1000;
      const repTotalPages = Math.ceil((repCount || 0) / repPageSize);
      const repPagePromises = Array.from({ length: repTotalPages }, (_, pageIndex) => 
        supabase
          .from('sales_reps')
          .select('*')
          .eq('build_id', buildId)
          .range(pageIndex * repPageSize, (pageIndex + 1) * repPageSize - 1)
      );
      
      const { count: assignCount } = await supabase
        .from('assignments')
        .select('*', { count: 'exact', head: true })
        .eq('build_id', buildId);
      
      const assignPageSize = 1000;
      const assignTotalPages = Math.ceil((assignCount || 0) / assignPageSize);
      const assignPagePromises = Array.from({ length: assignTotalPages }, (_, pageIndex) => 
        supabase
          .from('assignments')
          .select('*')
          .eq('build_id', buildId)
          .range(pageIndex * assignPageSize, (pageIndex + 1) * assignPageSize - 1)
      );
      
      // Execute all fetches in parallel
      const [oppPageResults, repPageResults, assignPageResults] = await Promise.all([
        Promise.all(oppPagePromises),
        Promise.all(repPagePromises),
        Promise.all(assignPagePromises)
      ]);
      
      // Combine opportunity results
      const allOpportunities: any[] = [];
      for (let i = 0; i < oppPageResults.length; i++) {
        const { data: pageData, error } = oppPageResults[i];
        if (error) {
          console.error(`[BuildDataService] ❌ Error loading opportunities batch ${i + 1}:`, error);
          throw error;
        }
        if (pageData) {
          allOpportunities.push(...pageData);
        }
      }
      
      // Combine sales rep results
      const allSalesReps: any[] = [];
      for (let i = 0; i < repPageResults.length; i++) {
        const { data: pageData, error } = repPageResults[i];
        if (error) {
          console.error(`[BuildDataService] ❌ Error loading sales reps batch ${i + 1}:`, error);
          throw error;
        }
        if (pageData) {
          allSalesReps.push(...pageData);
        }
      }
      
      // Combine assignment results
      const allAssignments: any[] = [];
      for (let i = 0; i < assignPageResults.length; i++) {
        const { data: pageData, error } = assignPageResults[i];
        if (error) {
          console.error(`[BuildDataService] ❌ Error loading assignments batch ${i + 1}:`, error);
          throw error;
        }
        if (pageData) {
          allAssignments.push(...pageData);
        }
      }

      const accounts = allAccounts;
      const opportunities = allOpportunities;
      const salesReps = allSalesReps;
      const assignments = allAssignments;
      
      console.log(`[BuildDataService] ⚡ Loaded ${opportunities.length} opportunities, ${salesReps.length} sales reps, ${assignments.length} assignments`);

      console.log(`[BuildDataService] Raw data fetched for build ${buildId}:`);
      console.log(`- Total accounts: ${accounts.length}`);
      console.log(`- Total opportunities: ${opportunities.length}`);
      console.log(`- Total sales reps: ${salesReps.length}`);
      console.log(`- Total assignments: ${assignments.length}`);
      
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
      
      // Create parent ID lookup for customer/prospect determination
      const customerParentIds = new Set(customerAccounts.map(a => a.sfdc_account_id));
      const prospectParentIds = new Set(prospectAccounts.map(a => a.sfdc_account_id));
      
      // Calculate child account breakdowns
      const childAccounts = accounts.filter(a => !a.is_parent);
      const childCustomers = childAccounts.filter(a => 
        a.parent_id && customerParentIds.has(a.parent_id)
      ).length;
      const childProspects = childAccounts.filter(a => 
        a.parent_id && prospectParentIds.has(a.parent_id)
      ).length;
      
      const summary: BuildDataSummary = {
        accounts: {
          total: accounts.length,
          withOwners: accounts.filter(a => a.is_parent && a.owner_id).length,
          customers: customerAccounts.length, // Parent customers only
          prospects: prospectAccounts.length, // Parent prospects only
          childCustomers: childCustomers,     // Children under customer parents
          childProspects: childProspects,     // Children under prospect parents
          totalCustomers: customerAccounts.length + childCustomers, // All customer accounts
          totalProspects: prospectAccounts.length + childProspects, // All prospect accounts
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
        assignments: {
          total: assignments.length,
          applied: assignments.filter(a => a.is_approved).length,
          pending: assignments.filter(a => !a.is_approved).length,
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
      const startTime = performance.now();
      
      // First, get counts in parallel to determine batch requirements
      const [accountCount, oppCount] = await Promise.all([
        supabase.from('accounts').select('*', { count: 'exact', head: true }).eq('build_id', buildId),
        supabase.from('opportunities').select('*', { count: 'exact', head: true }).eq('build_id', buildId)
      ]);
      
      const totalAccounts = accountCount.count || 0;
      const totalOpps = oppCount.count || 0;
      const pageSize = 5000;
      
      console.log(`[Build Data Service] 📊 Total records: ${totalAccounts} accounts, ${totalOpps} opportunities`);
      
      // Create batch fetch promises for accounts
      const accountPages = Math.ceil(totalAccounts / pageSize);
      const accountPromises = Array.from({ length: accountPages }, (_, i) =>
        supabase.from('accounts').select('*').eq('build_id', buildId).order('account_name').range(i * pageSize, (i + 1) * pageSize - 1)
      );
      
      // Create batch fetch promises for opportunities
      const oppPages = Math.ceil(totalOpps / pageSize);
      const oppPromises = Array.from({ length: oppPages }, (_, i) =>
        supabase.from('opportunities').select('*').eq('build_id', buildId).range(i * pageSize, (i + 1) * pageSize - 1)
      );
      
      // Fetch sales reps (usually under 1000, single query is fine)
      const salesRepsPromise = supabase.from('sales_reps').select('*').eq('build_id', buildId).limit(5000);
      
      // Execute ALL fetches in parallel
      const [accountResults, oppResults, salesRepsRes] = await Promise.all([
        Promise.all(accountPromises),
        Promise.all(oppPromises),
        salesRepsPromise
      ]);
      
      // Combine account results
      const accounts: any[] = [];
      for (const result of accountResults) {
        if (result.error) throw result.error;
        if (result.data) accounts.push(...result.data);
      }
      
      // Combine opportunity results
      const opportunities: any[] = [];
      for (const result of oppResults) {
        if (result.error) throw result.error;
        if (result.data) opportunities.push(...result.data);
      }
      
      if (salesRepsRes.error) throw salesRepsRes.error;
      const salesReps = salesRepsRes.data || [];
      
      const fetchTime = performance.now() - startTime;
      console.log(`[Build Data Service] ⚡ Loaded all data in ${fetchTime.toFixed(0)}ms (${accountPages + oppPages + 1} parallel requests)`)

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

  // ============================================
  // LP SUCCESS METRICS CALCULATIONS
  // ============================================

  /**
   * Calculate detailed Balance Metrics with MSE-based scoring
   * Returns both the score and drill-down data for visualization
   */
  private calculateBalanceMetricsDetail(
    accounts: any[], 
    salesReps: any[], 
    useProposed: boolean,
    tolerancePct: number = 0.15
  ): BalanceMetricsDetail {
    const parentAccounts = accounts.filter(a => a.is_parent);
    const activeReps = salesReps.filter(r => r.is_active && r.include_in_assignments !== false);
    
    if (activeReps.length === 0) {
      return this.emptyBalanceMetrics(tolerancePct);
    }
    
    // Build rep lookup with multiple matching strategies
    const repsByRepId = new Map(activeReps.map(r => [r.rep_id, r]));
    const repsByEmail = new Map(activeReps.filter(r => r.email).map(r => [r.email?.toLowerCase(), r]));
    const repsByName = new Map(activeReps.map(r => [r.name?.toLowerCase(), r]));
    
    // Calculate rep loads with flexible matching
    const repLoads: { rep: any; arrLoad: number }[] = activeReps.map(rep => {
      const repAccounts = parentAccounts.filter(a => {
        const ownerId = useProposed ? (a.new_owner_id || a.owner_id) : a.owner_id;
        if (!ownerId) return false;
        
        // Try multiple matching strategies
        if (ownerId === rep.rep_id) return true;
        if (rep.email && ownerId.toLowerCase() === rep.email.toLowerCase()) return true;
        if (rep.name && ownerId.toLowerCase() === rep.name.toLowerCase()) return true;
        
        return false;
      });
      
      const arrLoad = repAccounts.reduce((sum, a) => 
        sum + (a.hierarchy_bookings_arr_converted || a.calculated_arr || 0), 0
      );
      
      return { rep, arrLoad };
    });
    
    const loads = repLoads.map(r => r.arrLoad);
    const totalARR = loads.reduce((a, b) => a + b, 0);
    const repCount = loads.length;
    
    // If no ARR at all, return neutral score
    if (totalARR === 0) {
      return this.emptyBalanceMetrics(tolerancePct, repCount);
    }
    
    // Calculate statistics
    const mean = totalARR / repCount;
    const variance = loads.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / repCount;
    const stdDev = Math.sqrt(variance);
    const coeffOfVariation = mean > 0 ? stdDev / mean : 0;
    
    // MSE from target (using mean as target)
    const targetLoad = mean;
    const mse = loads.reduce((sum, val) => sum + Math.pow(val - targetLoad, 2), 0) / repCount;
    const rmse = Math.sqrt(mse);
    
    // Tolerance bounds
    const minAcceptable = targetLoad * (1 - tolerancePct);
    const maxAcceptable = targetLoad * (1 + tolerancePct);
    
    // Distribution with z-scores
    const distribution: RepLoadDistribution[] = repLoads.map(({ rep, arrLoad }) => {
      const deviation = arrLoad - targetLoad;
      const zScore = stdDev > 0 ? deviation / stdDev : 0;
      const inRange = arrLoad >= minAcceptable && arrLoad <= maxAcceptable;
      
      return {
        repId: rep.rep_id,
        repName: rep.name,
        arrLoad,
        deviation,
        zScore,
        inRange
      };
    });
    
    // Count outliers
    const underloaded = distribution.filter(d => d.arrLoad < minAcceptable).length;
    const overloaded = distribution.filter(d => d.arrLoad > maxAcceptable).length;
    const inRange = distribution.filter(d => d.inRange).length;
    
    // Calculate MSE-based score:
    // Perfect balance (MSE = 0) = 1.0
    // Normalize by dividing by a "bad" MSE threshold (e.g., if all load on one rep)
    // worstMSE = if one rep has all ARR: (n-1 reps at 0, 1 rep at totalARR)
    // = ((n-1) * mean² + (totalARR - mean)²) / n = mean² * (n-1 + (n-1)²) / n ≈ mean² * n
    const worstMSE = mean * mean * repCount;
    const normalizedMSE = worstMSE > 0 ? mse / worstMSE : 0;
    
    // Score: 1 - normalized MSE, but also factor in % of reps in range
    const mseScore = Math.max(0, Math.min(1, 1 - normalizedMSE));
    const rangeScore = inRange / repCount;
    
    // Combined score: weight MSE more heavily (70/30)
    const score = mseScore * 0.7 + rangeScore * 0.3;
    
    return {
      score,
      mean,
      stdDev,
      variance,
      coeffOfVariation,
      mse,
      rmse,
      targetLoad,
      tolerancePct,
      minAcceptable,
      maxAcceptable,
      distribution: distribution.sort((a, b) => b.arrLoad - a.arrLoad),
      outliers: { underloaded, overloaded, inRange },
      repCount,
      totalARR
    };
  }
  
  /**
   * Empty balance metrics for edge cases
   */
  private emptyBalanceMetrics(tolerancePct: number, repCount: number = 0): BalanceMetricsDetail {
    return {
      score: 0,
      mean: 0,
      stdDev: 0,
      variance: 0,
      coeffOfVariation: 0,
      mse: 0,
      rmse: 0,
      targetLoad: 0,
      tolerancePct,
      minAcceptable: 0,
      maxAcceptable: 0,
      distribution: [],
      outliers: { underloaded: 0, overloaded: 0, inRange: 0 },
      repCount,
      totalARR: 0
    };
  }

  /**
   * Calculate Continuity Score - % of accounts staying with same owner
   * For "before" state, this is 100% (original owners)
   * For "after" state, it's the % where new_owner_id === owner_id
   */
  private calculateContinuityScore(accounts: any[], useProposed: boolean): number {
    const parentAccounts = accounts.filter(a => a.is_parent);
    if (parentAccounts.length === 0) return 0;
    
    if (!useProposed) {
      // Before state: all accounts are with original owner = 100%
      return 1;
    }
    
    // After state: count accounts where new_owner_id matches owner_id
    const retained = parentAccounts.filter(a => {
      if (!a.new_owner_id) return true; // No change = retained
      return a.new_owner_id === a.owner_id;
    }).length;
    
    return retained / parentAccounts.length;
  }

  /**
   * Calculate Geography Score - weighted geo alignment
   * Uses exact/sibling/parent/global weights from GEO_SCORE_WEIGHTS
   */
  private calculateGeographyScore(accounts: any[], salesReps: any[], useProposed: boolean): number {
    const repsByRepId = new Map(salesReps.map(r => [r.rep_id, r]));
    const parentAccounts = accounts.filter(a => a.is_parent);
    if (parentAccounts.length === 0) return 0;
    
    let totalScore = 0;
    let scoredCount = 0;
    
    parentAccounts.forEach(account => {
      const ownerId = useProposed ? (account.new_owner_id || account.owner_id) : account.owner_id;
      if (!ownerId) return;
      
      const rep = repsByRepId.get(ownerId);
      if (!rep) return;
      
      const accountGeo = account.geo || account.sales_territory;
      const repRegion = rep.region;
      
      if (!accountGeo || !repRegion) {
        totalScore += GEO_SCORE_WEIGHTS.global;
      } else if (accountGeo === repRegion) {
        totalScore += GEO_SCORE_WEIGHTS.exact;
      } else {
        // Simplified: if not exact match, use global fallback
        // Could be enhanced to check sibling/parent regions
        totalScore += GEO_SCORE_WEIGHTS.global;
      }
      scoredCount++;
    });
    
    return scoredCount > 0 ? totalScore / scoredCount : 0;
  }

  /**
   * Calculate Team Alignment Score - account tier matching rep tier
   * Uses employee count to classify accounts (not tier fields from database)
   */
  private calculateTeamAlignmentScore(accounts: any[], salesReps: any[], useProposed: boolean): number {
    const repsByRepId = new Map(salesReps.map(r => [r.rep_id, r]));
    const parentAccounts = accounts.filter(a => a.is_parent);
    if (parentAccounts.length === 0) return 0;
    
    let totalScore = 0;
    let scoredCount = 0;
    
    parentAccounts.forEach(account => {
      const ownerId = useProposed ? (account.new_owner_id || account.owner_id) : account.owner_id;
      if (!ownerId) return;
      
      const rep = repsByRepId.get(ownerId);
      if (!rep) return;
      
      // Classify account tier from employee count (official definition)
      const accountTier = this.classifyAccountTierByEmployees(account.employees);
      const repTier = rep.team_tier || 'Standard';
      
      // Normalize tier names
      const normAccountTier = this.normalizeTier(accountTier);
      const normRepTier = this.normalizeTier(repTier);
      
      const tierDiff = Math.abs(normAccountTier - normRepTier);
      
      if (tierDiff === 0) {
        totalScore += TEAM_ALIGNMENT_WEIGHTS.exact;
      } else if (tierDiff === 1) {
        totalScore += TEAM_ALIGNMENT_WEIGHTS.oneOff;
      } else {
        totalScore += TEAM_ALIGNMENT_WEIGHTS.twoOff;
      }
      scoredCount++;
    });
    
    return scoredCount > 0 ? totalScore / scoredCount : 0;
  }

  private normalizeTier(tier: string): number {
    const normalized = tier?.toUpperCase().trim() || '';
    // Map SMB, Growth, MM, ENT to numbers (0, 1, 2, 3)
    if (normalized === 'SMB' || normalized.includes('SMB')) return 0;
    if (normalized === 'GROWTH' || normalized.includes('GROWTH')) return 1;
    if (normalized === 'MM' || normalized === 'MID-MARKET' || normalized.includes('MID MARKET')) return 2;
    if (normalized === 'ENT' || normalized === 'ENTERPRISE' || normalized.includes('ENTERPRISE')) return 3;
    // Legacy support for tier 1/2/standard (map to Growth/MM/ENT)
    if (normalized.includes('1') || normalized.includes('TIER 1')) return 1; // Tier 1 -> Growth
    if (normalized.includes('2') || normalized.includes('TIER 2')) return 2; // Tier 2 -> MM
    return 3; // Standard/other -> ENT
  }

  /**
   * Calculate Capacity Utilization - avg load vs target
   * Returns null if no target is set
   */
  private calculateCapacityUtilization(repLoads: number[], target: number): number | null {
    if (repLoads.length === 0 || target === 0) return null;
    
    const avgLoad = repLoads.reduce((a, b) => a + b, 0) / repLoads.length;
    return avgLoad / target;
  }

  /**
   * Calculate Geo Alignment Metrics
   * 
   * Uses the territory_mappings from assignment_configuration to determine
   * if an account's territory maps to the assigned rep's region.
   * 
   * @param accounts - All accounts
   * @param salesReps - All sales reps
   * @param useProposed - Whether to use new_owner_id (proposed) or owner_id (original)
   * @param territoryMappings - Mapping from account territory values to rep region values
   */
  private calculateGeoAlignment(
    accounts: any[], 
    salesReps: any[], 
    useProposed: boolean,
    territoryMappings: Record<string, string> = {}
  ): GeoAlignmentMetrics {
    const repsByRepId = new Map(salesReps.map(r => [r.rep_id, r]));
    const parentAccounts = accounts.filter(a => a.is_parent);
    
    let aligned = 0;
    let misaligned = 0;
    let unassigned = 0;
    
    // Create a case-insensitive mapping lookup
    const mappingLookup = new Map<string, string>();
    for (const [accountTerritory, repRegion] of Object.entries(territoryMappings)) {
      mappingLookup.set(accountTerritory.toLowerCase().trim(), repRegion.toLowerCase().trim());
    }
    
    parentAccounts.forEach(account => {
      const ownerId = useProposed ? (account.new_owner_id || account.owner_id) : account.owner_id;
      
      if (!ownerId) {
        unassigned++;
        return;
      }
      
      const rep = repsByRepId.get(ownerId);
      if (!rep) {
        unassigned++;
        return;
      }
      
      // Get account territory - try geo first, then sales_territory
      const accountTerritoryRaw = (account.geo || account.sales_territory || '').toString().trim();
      // Get rep region - try region first, then team
      const repRegionRaw = (rep.region || rep.team || '').toString().trim();
      
      // If either is empty, count as unassigned (can't determine alignment)
      if (!accountTerritoryRaw || !repRegionRaw) {
        unassigned++;
        return;
      }
      
      // Normalize for comparison
      const accountTerritoryNorm = accountTerritoryRaw.toLowerCase();
      const repRegionNorm = repRegionRaw.toLowerCase();
      
      // Look up the mapped region for this account territory
      const mappedRegion = mappingLookup.get(accountTerritoryNorm);
      
      if (mappedRegion) {
        // We have a configured mapping - use it
        if (mappedRegion === repRegionNorm) {
          aligned++;
        } else {
          misaligned++;
        }
      } else {
        // No mapping configured - fall back to direct string comparison
        if (accountTerritoryNorm === repRegionNorm || 
            accountTerritoryNorm.includes(repRegionNorm) || 
            repRegionNorm.includes(accountTerritoryNorm)) {
          aligned++;
        } else {
          misaligned++;
        }
      }
    });
    
    const total = aligned + misaligned;
    const alignmentRate = total > 0 ? (aligned / total) * 100 : 0;
    
    console.log(`[GeoAlignment] Aligned: ${aligned}, Misaligned: ${misaligned}, Unassigned: ${unassigned}, Rate: ${alignmentRate.toFixed(1)}%`);
    
    return { aligned, misaligned, unassigned, alignmentRate };
  }

  /**
   * Calculate ARR Distribution Buckets
   */
  private calculateArrBuckets(accounts: any[]): ArrBucket[] {
    const parentAccounts = accounts.filter(a => a.is_parent);
    
    return ARR_BUCKETS.map(bucket => {
      const inBucket = parentAccounts.filter(a => {
        const arr = a.hierarchy_bookings_arr_converted || a.calculated_arr || a.arr || 0;
        return arr >= bucket.min && arr < bucket.max;
      });
      
      return {
        bucket: bucket.label,
        count: inBucket.length,
        totalARR: inBucket.reduce((sum, a) => sum + (a.hierarchy_bookings_arr_converted || a.calculated_arr || a.arr || 0), 0)
      };
    });
  }

  /**
   * Calculate Tier Distribution
   */
  private calculateTierDistribution(accounts: any[]): TierDistribution {
    const parentAccounts = accounts.filter(a => a.is_parent);
    
    return {
      tier1: parentAccounts.filter(a => {
        const tier = a.expansion_tier || a.initial_sale_tier || '';
        return tier.toLowerCase().includes('tier 1') || tier === '1';
      }).length,
      tier2: parentAccounts.filter(a => {
        const tier = a.expansion_tier || a.initial_sale_tier || '';
        return tier.toLowerCase().includes('tier 2') || tier === '2';
      }).length,
      standard: parentAccounts.filter(a => {
        const tier = a.expansion_tier || a.initial_sale_tier || '';
        return !tier || (!tier.toLowerCase().includes('tier 1') && !tier.toLowerCase().includes('tier 2') && tier !== '1' && tier !== '2');
      }).length
    };
  }

  /**
   * Classify account tier based on employee count (official definition)
   * SMB: < 100 employees
   * Growth: 100-499 employees
   * MM: 500-1499 employees
   * ENT: 1500+ employees
   */
  private classifyAccountTierByEmployees(employees: number | null | undefined): string {
    if (employees === null || employees === undefined) return 'Standard';
    if (employees < 100) return 'SMB';
    if (employees < 500) return 'Growth';
    if (employees < 1500) return 'MM';
    return 'ENT';
  }

  /**
   * Calculate Tier Alignment Breakdown - shows exact matches vs mismatches
   * Uses employee count to classify accounts (not tier fields from database)
   */
  private calculateTierAlignmentBreakdown(accounts: any[], salesReps: any[], useProposed: boolean): TierAlignmentBreakdown {
    const repsByRepId = new Map(salesReps.map(r => [r.rep_id, r]));
    const parentAccounts = accounts.filter(a => a.is_parent);
    
    let exactMatch = 0;
    let oneLevelMismatch = 0;
    let twoPlusLevelMismatch = 0;
    let unassigned = 0;
    
    parentAccounts.forEach(account => {
      const ownerId = useProposed ? (account.new_owner_id || account.owner_id) : account.owner_id;
      
      if (!ownerId) {
        unassigned++;
        return;
      }
      
      const rep = repsByRepId.get(ownerId);
      if (!rep) {
        unassigned++;
        return;
      }
      
      // Classify account tier from employee count (official definition)
      const accountTier = this.classifyAccountTierByEmployees(account.employees);
      const repTier = rep.team_tier || 'Standard';
      
      // Normalize tier names
      const normAccountTier = this.normalizeTier(accountTier);
      const normRepTier = this.normalizeTier(repTier);
      
      const tierDiff = Math.abs(normAccountTier - normRepTier);
      
      if (tierDiff === 0) {
        exactMatch++;
      } else if (tierDiff === 1) {
        oneLevelMismatch++;
      } else {
        twoPlusLevelMismatch++;
      }
    });
    
    return {
      exactMatch,
      oneLevelMismatch,
      twoPlusLevelMismatch,
      unassigned
    };
  }

  /**
   * Calculate Owner Coverage
   */
  private calculateOwnerCoverage(accounts: any[], salesReps: any[], useProposed: boolean): OwnerCoverage {
    const validRepIds = new Set(salesReps.map(r => r.rep_id));
    const parentAccounts = accounts.filter(a => a.is_parent);
    
    let withOwner = 0;
    let orphaned = 0;
    
    parentAccounts.forEach(account => {
      const ownerId = useProposed ? (account.new_owner_id || account.owner_id) : account.owner_id;
      
      if (ownerId && validRepIds.has(ownerId)) {
        withOwner++;
      } else {
        orphaned++;
      }
    });
    
    const total = withOwner + orphaned;
    const coverageRate = total > 0 ? (withOwner / total) * 100 : 0;
    
    return { withOwner, orphaned, coverageRate };
  }

  /**
   * Calculate Region Metrics
   */
  private calculateRegionMetrics(accounts: any[], salesReps: any[], opportunities: any[], useProposed: boolean): RegionMetrics[] {
    const regions = ['AMER', 'EMEA', 'APAC'];
    const repsByRepId = new Map(salesReps.map(r => [r.rep_id, r]));
    const parentAccounts = accounts.filter(a => a.is_parent);
    
    return regions.map(region => {
      // Count accounts by their geo field
      const regionAccounts = parentAccounts.filter(a => {
        const geo = a.geo || a.sales_territory;
        return geo === region;
      });
      
      const customers = regionAccounts.filter(a => (a.hierarchy_bookings_arr_converted || 0) > 0);
      const prospects = regionAccounts.filter(a => (a.hierarchy_bookings_arr_converted || 0) === 0);
      
      const arr = customers.reduce((sum, a) => sum + (a.hierarchy_bookings_arr_converted || a.calculated_arr || 0), 0);
      
      // ATR and Pipeline from opportunities linked to accounts in this region
      const regionAccountIds = new Set(regionAccounts.map(a => a.sfdc_account_id));
      const regionOpps = opportunities.filter(o => regionAccountIds.has(o.sfdc_account_id));
      
      // ATR: use account fields first, fall back to opportunities if empty/0
      let atr = regionAccounts.reduce((sum, a) => sum + (a.calculated_atr || a.atr || 0), 0);
      // If account ATR is 0 or empty, fall back to summing from renewal opportunities
      if (atr === 0) {
        atr = regionOpps
          .filter(o => o.opportunity_type && o.opportunity_type.toLowerCase().trim() === 'renewals')
          .reduce((sum, o) => sum + (o.available_to_renew || 0), 0);
      }
      
      // Pipeline: sum of net_arr from all opportunities
      const pipeline = regionOpps.reduce((sum, o) => sum + (o.net_arr || o.amount || 0), 0);
      
      const repCount = salesReps.filter(r => r.region === region && r.is_active).length;
      
      return {
        region,
        accounts: regionAccounts.length,
        customers: customers.length,
        prospects: prospects.length,
        arr,
        atr,
        pipeline,
        repCount
      };
    });
  }

  /**
   * Calculate complete LP Success Metrics
   */
  private calculateLPSuccessMetrics(accounts: any[], salesReps: any[], opportunities: any[], useProposed: boolean, target?: number): LPSuccessMetrics {
    // Get detailed balance metrics (includes rep load distribution)
    const balanceDetail = this.calculateBalanceMetricsDetail(accounts, salesReps, useProposed);
    
    // Use the balance detail for capacity utilization
    const avgTarget = target || balanceDetail.targetLoad;
    const loads = balanceDetail.distribution.map(d => d.arrLoad);
    
    return {
      balanceScore: balanceDetail.score,
      balanceDetail,
      continuityScore: this.calculateContinuityScore(accounts, useProposed),
      geographyScore: this.calculateGeographyScore(accounts, salesReps, useProposed),
      teamAlignmentScore: this.calculateTeamAlignmentScore(accounts, salesReps, useProposed),
      capacityUtilization: this.calculateCapacityUtilization(loads, avgTarget)
    };
  }

  /**
   * Calculate per-rep distribution data for charts
   */
  private calculateRepDistribution(
    accounts: any[],
    salesReps: any[],
    opportunities: any[],
    useProposed: boolean
  ): import('@/types/analytics').RepDistributionData[] {
    const parentAccounts = accounts.filter(a => a.is_parent);
    const childAccounts = accounts.filter(a => !a.is_parent);
    
    // Build opportunity maps by account (key by sfdc_account_id)
    // Pipeline: sum of net_arr from all opportunities
    const oppByAccount = new Map<string, number>();
    opportunities.forEach(opp => {
      const current = oppByAccount.get(opp.sfdc_account_id) || 0;
      oppByAccount.set(opp.sfdc_account_id, current + (opp.net_arr || opp.amount || 0));
    });
    
    // ATR: sum of available_to_renew from renewal opportunities only
    const atrByAccount = new Map<string, number>();
    opportunities.forEach(opp => {
      // Only include renewal opportunities with available_to_renew
      if (opp.opportunity_type && opp.opportunity_type.toLowerCase().trim() === 'renewals' && opp.available_to_renew) {
        const current = atrByAccount.get(opp.sfdc_account_id) || 0;
        atrByAccount.set(opp.sfdc_account_id, current + (opp.available_to_renew || 0));
      }
    });
    
    // Calculate per-rep metrics
    return salesReps
      .filter(rep => rep.is_active && rep.include_in_assignments !== false)
      .map(rep => {
        // Get parent accounts for this rep
        const repParentAccounts = parentAccounts.filter(a => {
          const ownerId = useProposed ? (a.new_owner_id || a.owner_id) : a.owner_id;
          return ownerId === rep.rep_id;
        });
        
        // Get child accounts for this rep
        const repChildAccounts = childAccounts.filter(a => {
          const ownerId = useProposed ? (a.new_owner_id || a.owner_id) : a.owner_id;
          return ownerId === rep.rep_id;
        });
        
        // Parent accounts by type
        const parentCustomerAccounts = repParentAccounts.filter(a => 
          (a.hierarchy_bookings_arr_converted || 0) > 0
        );
        const parentProspectAccounts = repParentAccounts.filter(a => 
          (a.hierarchy_bookings_arr_converted || 0) === 0
        );
        
        // Child accounts by type
        const childCustomerAccounts = repChildAccounts.filter(a => 
          (a.hierarchy_bookings_arr_converted || 0) > 0
        );
        const childProspectAccounts = repChildAccounts.filter(a => 
          (a.hierarchy_bookings_arr_converted || 0) === 0
        );
        
        // Calculate ARR from parent customer accounts
        const arr = parentCustomerAccounts.reduce((sum, a) => 
          sum + (a.hierarchy_bookings_arr_converted || a.calculated_arr || 0), 0
        );
        
        // Calculate ATR: use account fields first, fall back to opportunities if empty/0
        const atr = repParentAccounts.reduce((sum, a) => {
          const accountATR = a.calculated_atr || a.atr || 0;
          // If account has ATR value, use it; otherwise fall back to opportunities
          if (accountATR > 0) {
            return sum + accountATR;
          }
          return sum + (atrByAccount.get(a.sfdc_account_id) || 0);
        }, 0);
        
        // Calculate pipeline from opportunities linked to rep's accounts
        const pipeline = repParentAccounts.reduce((sum, a) => 
          sum + (oppByAccount.get(a.sfdc_account_id) || 0), 0
        );
        
        return {
          repId: rep.rep_id,
          repName: rep.name,
          region: rep.region || 'Unknown',
          arr,
          atr,
          pipeline,
          // Total counts (backward compatible - parent accounts only)
          customerAccounts: parentCustomerAccounts.length,
          prospectAccounts: parentProspectAccounts.length,
          totalAccounts: repParentAccounts.length,
          // Parent/child breakdown for tooltip
          parentCustomers: parentCustomerAccounts.length,
          childCustomers: childCustomerAccounts.length,
          parentProspects: parentProspectAccounts.length,
          childProspects: childProspectAccounts.length,
        };
      })
      .sort((a, b) => b.arr - a.arr); // Sort by ARR descending
  }

  /**
   * Helper to fetch raw build data with pagination (for large datasets)
   * Supabase has a 1000 row limit per query
   */
  private async fetchRawBuildData(buildId: string): Promise<{ accounts: any[]; opportunities: any[]; salesReps: any[] }> {
    const pageSize = 1000;
    
    // Get counts to determine pagination needs
    const [accountCount, oppCount] = await Promise.all([
      supabase.from('accounts').select('*', { count: 'exact', head: true }).eq('build_id', buildId),
      supabase.from('opportunities').select('*', { count: 'exact', head: true }).eq('build_id', buildId)
    ]);
    
    const totalAccounts = accountCount.count || 0;
    const totalOpps = oppCount.count || 0;
    
    // Create batch fetch promises
    const accountPages = Math.ceil(totalAccounts / pageSize);
    const accountPromises = accountPages > 0 
      ? Array.from({ length: accountPages }, (_, i) =>
          supabase.from('accounts').select('*').eq('build_id', buildId).range(i * pageSize, (i + 1) * pageSize - 1)
        )
      : [supabase.from('accounts').select('*').eq('build_id', buildId)];
    
    const oppPages = Math.ceil(totalOpps / pageSize);
    const oppPromises = oppPages > 0
      ? Array.from({ length: oppPages }, (_, i) =>
          supabase.from('opportunities').select('*').eq('build_id', buildId).range(i * pageSize, (i + 1) * pageSize - 1)
        )
      : [supabase.from('opportunities').select('*').eq('build_id', buildId)];
    
    // Execute all fetches in parallel
    const [accountResults, oppResults, salesRepsRes] = await Promise.all([
      Promise.all(accountPromises),
      Promise.all(oppPromises),
      supabase.from('sales_reps').select('*').eq('build_id', buildId).limit(1000)
    ]);
    
    // Combine results
    const accounts: any[] = [];
    for (const result of accountResults) {
      if (result.error) throw result.error;
      if (result.data) accounts.push(...result.data);
    }
    
    const opportunities: any[] = [];
    for (const result of oppResults) {
      if (result.error) throw result.error;
      if (result.data) opportunities.push(...result.data);
    }
    
    if (salesRepsRes.error) throw salesRepsRes.error;
    const salesReps = salesRepsRes.data || [];
    
    console.log(`[fetchRawBuildData] Fetched ${accounts.length} accounts, ${opportunities.length} opps, ${salesReps.length} reps`);
    
    return { accounts, opportunities, salesReps };
  }

  /**
   * Calculate complete Metrics Snapshot
   */
  private async calculateMetricsSnapshot(buildId: string, useProposed: boolean): Promise<MetricsSnapshot> {
    // Fetch raw data with proper pagination
    const { accounts, opportunities, salesReps } = await this.fetchRawBuildData(buildId);
    
    // Fetch territory mappings from configuration
    const { data: configData } = await supabase
      .from('assignment_configuration')
      .select('territory_mappings')
      .eq('build_id', buildId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    const territoryMappings: Record<string, string> = (configData?.territory_mappings as Record<string, string>) || {};
    
    console.log(`[MetricsSnapshot] Processing ${accounts.length} accounts, ${opportunities.length} opps, ${salesReps.length} reps`);
    console.log(`[MetricsSnapshot] Territory mappings loaded: ${Object.keys(territoryMappings).length} mappings`, territoryMappings);
    
    // Debug: Show unique account territories and rep regions for comparison
    const accountTerritories = new Set(accounts.filter(a => a.is_parent).map(a => a.geo || a.sales_territory).filter(Boolean));
    const repRegions = new Set(salesReps.map(r => r.region || r.team).filter(Boolean));
    console.log(`[MetricsSnapshot] Unique account territories (${accountTerritories.size}):`, Array.from(accountTerritories).slice(0, 10));
    console.log(`[MetricsSnapshot] Unique rep regions (${repRegions.size}):`, Array.from(repRegions));
    
    const parentAccounts = accounts.filter(a => a.is_parent);
    const customers = parentAccounts.filter(a => (a.hierarchy_bookings_arr_converted || 0) > 0);
    const prospects = parentAccounts.filter(a => (a.hierarchy_bookings_arr_converted || 0) === 0);
    
    return {
      lpMetrics: this.calculateLPSuccessMetrics(accounts, salesReps, opportunities, useProposed),
      byRegion: this.calculateRegionMetrics(accounts, salesReps, opportunities, useProposed),
      geoAlignment: this.calculateGeoAlignment(accounts, salesReps, useProposed, territoryMappings),
      arrBuckets: this.calculateArrBuckets(accounts),
      tierDistribution: this.calculateTierDistribution(accounts),
      tierAlignmentBreakdown: this.calculateTierAlignmentBreakdown(accounts, salesReps, useProposed),
      ownerCoverage: this.calculateOwnerCoverage(accounts, salesReps, useProposed),
      repDistribution: this.calculateRepDistribution(accounts, salesReps, opportunities, useProposed),
      totals: {
        accounts: parentAccounts.length,
        customers: customers.length,
        prospects: prospects.length,
        arr: customers.reduce((sum, a) => sum + (a.hierarchy_bookings_arr_converted || a.calculated_arr || 0), 0),
        // ATR: use account fields first, fall back to opportunities if empty/0
        atr: (() => {
          const accountATR = parentAccounts.reduce((sum, a) => sum + (a.calculated_atr || a.atr || 0), 0);
          // If account ATR is 0 or empty, fall back to summing from renewal opportunities
          if (accountATR > 0) {
            return accountATR;
          }
          return opportunities
            .filter(o => o.opportunity_type && o.opportunity_type.toLowerCase().trim() === 'renewals')
            .reduce((sum, o) => sum + (o.available_to_renew || 0), 0);
        })(),
        pipeline: opportunities.reduce((sum, o) => sum + (o.net_arr || o.amount || 0), 0)
      }
    };
  }

  /**
   * Get Analytics Metrics for Data Overview
   */
  async getAnalyticsMetrics(buildId: string): Promise<MetricsSnapshot> {
    const cacheKey = `analytics_${buildId}`;
    
    if (this.isCacheValid(cacheKey)) {
      return this.cache.get(cacheKey)!.data;
    }
    
    const snapshot = await this.calculateMetricsSnapshot(buildId, false); // Use original owner_id
    this.setCache(cacheKey, snapshot);
    return snapshot;
  }

  /**
   * Get Metrics Comparison for Before/After analysis
   */
  async getMetricsComparison(buildId: string): Promise<MetricsComparison> {
    const cacheKey = `comparison_${buildId}`;
    
    if (this.isCacheValid(cacheKey)) {
      return this.cache.get(cacheKey)!.data;
    }
    
    // Check if there are any proposed assignments
    const { data: accountsWithNewOwner } = await supabase
      .from('accounts')
      .select('new_owner_id')
      .eq('build_id', buildId)
      .not('new_owner_id', 'is', null)
      .limit(1);
    
    const hasProposedAssignments = (accountsWithNewOwner?.length || 0) > 0;
    
    const [original, proposed] = await Promise.all([
      this.calculateMetricsSnapshot(buildId, false),
      this.calculateMetricsSnapshot(buildId, true)
    ]);
    
    const deltas: LPSuccessMetrics = {
      balanceScore: proposed.lpMetrics.balanceScore - original.lpMetrics.balanceScore,
      continuityScore: proposed.lpMetrics.continuityScore - original.lpMetrics.continuityScore,
      geographyScore: proposed.lpMetrics.geographyScore - original.lpMetrics.geographyScore,
      teamAlignmentScore: proposed.lpMetrics.teamAlignmentScore - original.lpMetrics.teamAlignmentScore,
      capacityUtilization: proposed.lpMetrics.capacityUtilization !== null && original.lpMetrics.capacityUtilization !== null
        ? proposed.lpMetrics.capacityUtilization - original.lpMetrics.capacityUtilization
        : null
    };
    
    const comparison: MetricsComparison = {
      original,
      proposed,
      deltas,
      hasProposedAssignments
    };
    
    this.setCache(cacheKey, comparison);
    return comparison;
  }

  // Clear cache for a specific build (useful after data updates)
  clearBuildCache(buildId: string): void {
    console.log(`[BuildDataService] Clearing cache for build ${buildId}`);
    this.cache.delete(`summary_${buildId}`);
    this.cache.delete(`relationships_${buildId}`);
    this.cache.delete(`analytics_${buildId}`);
    this.cache.delete(`comparison_${buildId}`);
  }

  // Clear all cache
  clearAllCache(): void {
    this.cache.clear();
  }
}

export const buildDataService = BuildDataService.getInstance();