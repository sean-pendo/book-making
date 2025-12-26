import { supabase } from "@/integrations/supabase/client";
import { getAccountARR, getAccountATR, classifyTeamTier, isRenewalOpportunity, getOpportunityPipelineValue, isParentAccount, calculateGeoMatchScore, SALES_TOOLS_REP_ID, SALES_TOOLS_REP_NAME, GEO_MATCH_SCORES, getAccountExpansionTier, getCRERiskLevel, SUPABASE_LIMITS } from '@/_domain';
import { getFiscalQuarter, isCurrentFiscalYear } from '@/utils/fiscalYearCalculations';
import { calculateEnhancedRepMetrics, type EnhancedRepMetrics } from '@/utils/enhancedRepMetrics';
import type {
  LPSuccessMetrics,
  GeoAlignmentMetrics,
  TierDistribution,
  TierAlignmentBreakdown,
  StabilityLockBreakdown,
  ArrBucket,
  RegionMetrics,
  MetricsSnapshot,
  MetricsComparison,
  BalanceMetricsDetail,
  RepLoadDistribution,
  ContinuityMetrics
} from '@/types/analytics';
import { identifyLockedAccounts } from '@/services/optimization/constraints/stabilityLocks';
import { DEFAULT_LP_STABILITY_CONFIG } from '@/services/optimization/types';
import type { LPStabilityConfig, AggregatedAccount, EligibleRep } from '@/services/optimization/types';
import { ARR_BUCKETS, GEO_SCORE_WEIGHTS, TEAM_ALIGNMENT_WEIGHTS } from '@/types/analytics';

// Progress tracking for large data loads
export type LoadProgress = { current: number; total: number; stage: string };
type ProgressCallback = (progress: LoadProgress) => void;
let progressCallbacks: ProgressCallback[] = [];

export const subscribeToLoadProgress = (callback: ProgressCallback) => {
  progressCallbacks.push(callback);
  return () => {
    progressCallbacks = progressCallbacks.filter(cb => cb !== callback);
  };
};

const emitProgress = (progress: LoadProgress) => {
  progressCallbacks.forEach(cb => cb(progress));
};

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
    byRegion: Record<string, number>;
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
    byRegion: Record<string, number>;
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
      
      // Use SSOT constants from @/_domain for pagination
      // Supabase max_rows must be configured to 10,000 in project settings
      const pageSize = SUPABASE_LIMITS.FETCH_PAGE_SIZE;
      const totalPages = Math.ceil((totalCount || 0) / pageSize);
      const maxConcurrent = SUPABASE_LIMITS.MAX_CONCURRENT_REQUESTS;
      console.log(`[BuildDataService] 📊 Total accounts: ${totalCount}, fetching in ${totalPages} batches (max ${maxConcurrent} concurrent)`);

      const allAccounts: any[] = [];

      // Emit initial progress
      emitProgress({ current: 0, total: totalCount || 0, stage: 'Loading accounts' });

      // Helper function to fetch a single batch with retry
      const fetchBatchWithRetry = async (pageIndex: number, retries = 3): Promise<any[]> => {
        for (let attempt = 1; attempt <= retries; attempt++) {
          const { data: pageData, error } = await supabase
            .from('accounts')
            .select('*')
            .eq('build_id', buildId)
            .order('account_name')
            .range(pageIndex * pageSize, (pageIndex + 1) * pageSize - 1);
          
          if (!error && pageData) {
            return pageData;
          }
          
          if (attempt < retries) {
            console.warn(`[BuildDataService] ⚠️ Batch ${pageIndex + 1} failed (attempt ${attempt}/${retries}), retrying in ${attempt * 500}ms...`);
            await new Promise(resolve => setTimeout(resolve, attempt * 500));
          } else {
            console.error(`[BuildDataService] ❌ Batch ${pageIndex + 1} failed after ${retries} attempts:`, error);
            throw error;
          }
        }
        return [];
      };

      // Process in chunks of maxConcurrent
      for (let chunkStart = 0; chunkStart < totalPages; chunkStart += maxConcurrent) {
        const chunkEnd = Math.min(chunkStart + maxConcurrent, totalPages);
        const chunkPromises = [];

        for (let pageIndex = chunkStart; pageIndex < chunkEnd; pageIndex++) {
          chunkPromises.push(fetchBatchWithRetry(pageIndex));
        }

        const chunkResults = await Promise.all(chunkPromises);

        for (const pageData of chunkResults) {
          if (pageData) {
            allAccounts.push(...pageData);
          }
        }

        // Emit progress update
        emitProgress({ current: allAccounts.length, total: totalCount || 0, stage: 'Loading accounts' });

        if (chunkEnd < totalPages) {
          console.log(`[BuildDataService] 📦 Loaded ${allAccounts.length}/${totalCount} accounts...`);
        }
      }

      const fetchTime = performance.now() - startTime;
      console.log(`[BuildDataService] ⚡ Loaded ${allAccounts.length} accounts in ${fetchTime.toFixed(0)}ms`)

      // Fetch opportunities with pagination (Supabase has 1000 row limit)
      const { count: oppCount, error: oppCountError } = await supabase
        .from('opportunities')
        .select('*', { count: 'exact', head: true })
        .eq('build_id', buildId);
      
      if (oppCountError) {
        console.error(`[BuildDataService] ❌ Error getting opportunity count:`, oppCountError);
        throw oppCountError;
      }
      
      // Fetch opportunities with limited concurrency
      const oppPageSize = 1000;
      const oppTotalPages = Math.ceil((oppCount || 0) / oppPageSize);
      const oppMaxConcurrent = 10;
      console.log(`[BuildDataService] 📊 Total opportunities: ${oppCount}, fetching in ${oppTotalPages} batches`);

      // Emit progress for opportunities stage
      emitProgress({ current: 0, total: oppCount || 0, stage: 'Loading opportunities' });

      const allOpportunities: any[] = [];
      for (let chunkStart = 0; chunkStart < oppTotalPages; chunkStart += oppMaxConcurrent) {
        const chunkEnd = Math.min(chunkStart + oppMaxConcurrent, oppTotalPages);
        const chunkPromises = [];
        for (let pageIndex = chunkStart; pageIndex < chunkEnd; pageIndex++) {
          chunkPromises.push(
            supabase
              .from('opportunities')
              .select('*')
              .eq('build_id', buildId)
              .range(pageIndex * oppPageSize, (pageIndex + 1) * oppPageSize - 1)
          );
        }
        const chunkResults = await Promise.all(chunkPromises);
        for (const { data, error } of chunkResults) {
          if (error) throw error;
          if (data) allOpportunities.push(...data);
        }

        // Emit progress update for opportunities
        emitProgress({ current: allOpportunities.length, total: oppCount || 0, stage: 'Loading opportunities' });
      }

      // Fetch sales reps (usually small, but use same pattern)
      const { count: repCount } = await supabase
        .from('sales_reps')
        .select('*', { count: 'exact', head: true })
        .eq('build_id', buildId);

      const repPageSize = 1000;
      const repTotalPages = Math.ceil((repCount || 0) / repPageSize);
      console.log(`[BuildDataService] 📊 Total sales reps: ${repCount}`);

      // Emit progress for sales reps stage
      emitProgress({ current: 0, total: repCount || 0, stage: 'Loading sales reps' });

      const allSalesReps: any[] = [];
      for (let chunkStart = 0; chunkStart < repTotalPages; chunkStart += 10) {
        const chunkEnd = Math.min(chunkStart + 10, repTotalPages);
        const chunkPromises = [];
        for (let pageIndex = chunkStart; pageIndex < chunkEnd; pageIndex++) {
          chunkPromises.push(
            supabase
              .from('sales_reps')
              .select('*')
              .eq('build_id', buildId)
              .range(pageIndex * repPageSize, (pageIndex + 1) * repPageSize - 1)
          );
        }
        const chunkResults = await Promise.all(chunkPromises);
        for (const { data, error } of chunkResults) {
          if (error) throw error;
          if (data) allSalesReps.push(...data);
        }

        // Emit progress update for sales reps
        emitProgress({ current: allSalesReps.length, total: repCount || 0, stage: 'Loading sales reps' });
      }

      // Fetch assignments with limited concurrency
      const { count: assignCount } = await supabase
        .from('assignments')
        .select('*', { count: 'exact', head: true })
        .eq('build_id', buildId);

      const assignPageSize = 1000;
      const assignTotalPages = Math.ceil((assignCount || 0) / assignPageSize);
      console.log(`[BuildDataService] 📊 Total assignments: ${assignCount}`);

      // Emit progress for assignments stage
      emitProgress({ current: 0, total: assignCount || 0, stage: 'Loading assignments' });

      const allAssignments: any[] = [];
      for (let chunkStart = 0; chunkStart < assignTotalPages; chunkStart += 10) {
        const chunkEnd = Math.min(chunkStart + 10, assignTotalPages);
        const chunkPromises = [];
        for (let pageIndex = chunkStart; pageIndex < chunkEnd; pageIndex++) {
          chunkPromises.push(
            supabase
              .from('assignments')
              .select('*')
              .eq('build_id', buildId)
              .range(pageIndex * assignPageSize, (pageIndex + 1) * assignPageSize - 1)
          );
        }
        const chunkResults = await Promise.all(chunkPromises);
        for (const { data, error } of chunkResults) {
          if (error) throw error;
          if (data) allAssignments.push(...data);
        }

        // Emit progress update for assignments
        emitProgress({ current: allAssignments.length, total: assignCount || 0, stage: 'Loading assignments' });
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
      
      // Debug account classification (use SSOT getAccountARR() logic)
      // @see MASTER_LOGIC.mdc §3.1 - Customer = getAccountARR() > 0
      const parentAccounts = accounts.filter(isParentAccount);
      const customerAccounts = parentAccounts.filter(a => getAccountARR(a) > 0);
      const prospectAccounts = parentAccounts.filter(a => getAccountARR(a) === 0);
      
      console.log(`[BuildDataService] Account filtering results (using SSOT getAccountARR logic):`);
      console.log(`- Total accounts: ${accounts.length}`);
      console.log(`- Parent accounts: ${parentAccounts.length}`);
      console.log(`- Customer accounts (getAccountARR > 0): ${customerAccounts.length}`);
      console.log(`- Prospect accounts (getAccountARR === 0): ${prospectAccounts.length}`);

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

        // Calculate regional breakdown for team capacity - DYNAMIC based on actual data
        const repsByRegion: Record<string, number> = {};
        salesReps.forEach(rep => {
          const region = rep.region || 'Unassigned';
          repsByRegion[region] = (repsByRegion[region] || 0) + 1;
        });

      // Create sales rep lookup for validation
      const validRepIds = new Set(salesReps.map(rep => rep.rep_id));
      
      // Create parent ID lookup for customer/prospect determination
      const customerParentIds = new Set(customerAccounts.map(a => a.sfdc_account_id));
      const prospectParentIds = new Set(prospectAccounts.map(a => a.sfdc_account_id));
      
      // Calculate child account breakdowns
      // Child accounts have ultimate_parent_id pointing to their parent's sfdc_account_id
      const childAccounts = accounts.filter(a => !a.is_parent);
      const childCustomers = childAccounts.filter(a => 
        a.ultimate_parent_id && customerParentIds.has(a.ultimate_parent_id)
      ).length;
      const childProspects = childAccounts.filter(a => 
        a.ultimate_parent_id && prospectParentIds.has(a.ultimate_parent_id)
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
          byRegion: (() => {
            // DYNAMIC: count accounts by actual geo/territory values
            const byRegion: Record<string, number> = {};
            accounts.filter(a => a.is_parent).forEach(a => {
              const region = a.geo || a.sales_territory || 'Unassigned';
              byRegion[region] = (byRegion[region] || 0) + 1;
            });
            return byRegion;
          })()
        },
        opportunities: {
          total: opportunities.length,
          withOwners: opportunities.filter(o => o.owner_id).length,
          totalAmount: accounts.reduce((sum, a) => sum + getAccountATR(a), 0),
          // Total ARR: Only sum parent customer accounts using single source of truth
          totalARR: customerAccounts.reduce((sum, a) => sum + getAccountARR(a), 0),
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
      const pageSize = SUPABASE_LIMITS.FETCH_PAGE_SIZE;
      
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
      const salesRepsPromise = supabase.from('sales_reps').select('*').eq('build_id', buildId).limit(SUPABASE_LIMITS.FETCH_PAGE_SIZE);
      
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

        // Use single source of truth for ARR calculation
        const totalARR = repAccounts.reduce((sum, acc) => sum + getAccountARR(acc), 0);
        const totalATR = repOpportunities.reduce((sum, opp) => sum + (opp.available_to_renew || 0), 0);
        
        // Separate parent and child accounts for accurate workload calculation
        const parentAccounts = repAccounts.filter(isParentAccount);
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

      // Calculate enhanced metrics for book balancing
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
      
      const arrLoad = repAccounts.reduce((sum, a) => sum + getAccountARR(a), 0);
      
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
   * Calculate Continuity Metrics - full breakdown with counts for UI display
   * 
   * Simplified formula: parent accounts with same owner / total parent accounts
   * 
   * For "before" state, this is 100% (all parent accounts with original owner)
   * For "after" state, it's the % where new_owner_id === owner_id
   * 
   * @see MASTER_LOGIC.mdc §13.7.1 - Continuity Metrics Structure
   */
  private calculateContinuityMetrics(accounts: any[], _salesReps: any[], useProposed: boolean): ContinuityMetrics {
    // Keep parent-only filter
    const parentAccounts = accounts.filter(a => a.is_parent);
    
    if (parentAccounts.length === 0) {
      return { score: 0, retainedCount: 0, changedCount: 0, totalCount: 0 };
    }
    
    if (!useProposed) {
      // Before state: all parent accounts with original owner = 100%
      return {
        score: 1,
        retainedCount: parentAccounts.length,
        changedCount: 0,
        totalCount: parentAccounts.length
      };
    }
    
    // After state: count parent accounts where new_owner_id matches owner_id
    const retainedCount = parentAccounts.filter(a => {
      if (!a.new_owner_id) return true; // No change = retained
      return a.new_owner_id === a.owner_id;
    }).length;
    
    return {
      score: retainedCount / parentAccounts.length,
      retainedCount,
      changedCount: parentAccounts.length - retainedCount,
      totalCount: parentAccounts.length
    };
  }

  /**
   * Calculate Continuity Score - backward compatible wrapper
   * @see calculateContinuityMetrics for full implementation
   */
  private calculateContinuityScore(accounts: any[], salesReps: any[], useProposed: boolean): number {
    return this.calculateContinuityMetrics(accounts, salesReps, useProposed).score;
  }

  /**
   * Calculate Geography Score - weighted geo alignment
   *
   * Uses territory mappings from user configuration to translate account
   * territories to rep regions before scoring. Falls back to hierarchy-based
   * scoring from @/_domain/geography.ts when no explicit mapping exists.
   *
   * SCORING (from MASTER_LOGIC.mdc §4.3):
   * - Exact match (1.0): Account territory maps to rep's region
   * - Same sub-region (0.85): Account maps to rep's sub-region
   * - Same parent (0.65): Both in same parent region
   * - Global fallback (0.40): Rep is "Global"
   * - Cross-region (0.20): Different parent regions
   */
  private calculateGeographyScore(
    accounts: any[],
    salesReps: any[],
    useProposed: boolean,
    territoryMappings: Record<string, string> = {}
  ): number {
    const repsByRepId = new Map(salesReps.map(r => [r.rep_id, r]));
    const parentAccounts = accounts.filter(a => a.is_parent);
    if (parentAccounts.length === 0) return 0;

    // Create a case-insensitive mapping lookup
    const mappingLookup = new Map<string, string>();
    for (const [accountTerritory, targetRegion] of Object.entries(territoryMappings)) {
      mappingLookup.set(accountTerritory.toLowerCase().trim(), targetRegion.trim());
    }

    let totalScore = 0;
    let scoredCount = 0;

    parentAccounts.forEach(account => {
      const ownerId = useProposed ? (account.new_owner_id || account.owner_id) : account.owner_id;
      if (!ownerId) return;

      const rep = repsByRepId.get(ownerId);
      if (!rep) return;

      const rawAccountGeo = account.geo || account.sales_territory;
      const repRegion = rep.region;

      if (!rawAccountGeo || !repRegion) {
        totalScore += GEO_SCORE_WEIGHTS.global;
        scoredCount++;
        return;
      }

      // Apply territory mapping if configured, otherwise use raw value
      const mappedGeo = mappingLookup.get(rawAccountGeo.toLowerCase().trim()) || rawAccountGeo;

      // Use the hierarchy-aware scoring from @/_domain
      const score = calculateGeoMatchScore(mappedGeo, repRegion);
      totalScore += score;
      scoredCount++;
    });

    return scoredCount > 0 ? totalScore / scoredCount : 0;
  }

  /**
   * Calculate Team Alignment Score - account tier matching rep tier
   * Uses employee count to classify accounts (not tier fields from database)
   * Returns null if no accounts have valid tier data (N/A)
   *
   * @see MASTER_LOGIC.mdc §5.1.1 - Team Alignment Scoring with Missing Data
   */
  private calculateTeamAlignmentScore(accounts: any[], salesReps: any[], useProposed: boolean): number | null {
    const repsByRepId = new Map(salesReps.map(r => [r.rep_id, r]));
    const parentAccounts = accounts.filter(a => a.is_parent);
    if (parentAccounts.length === 0) return null;

    let totalScore = 0;
    let scoredCount = 0;

    parentAccounts.forEach(account => {
      const ownerId = useProposed ? (account.new_owner_id || account.owner_id) : account.owner_id;
      if (!ownerId) return;

      const rep = repsByRepId.get(ownerId);
      if (!rep) return;

      // Classify account tier from employee count (from @/_domain)
      // Returns null if employee count is missing
      const accountTier = classifyTeamTier(account.employees);
      const repTier = rep.team_tier;

      // N/A case: missing tier data - skip, don't count as mismatch
      // Per MASTER_LOGIC.mdc §5.1.1 - missing data should NOT penalize
      if (!accountTier || !repTier) {
        return;
      }

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

    // Return null (N/A) if no accounts had valid tier data
    return scoredCount > 0 ? totalScore / scoredCount : null;
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
   * Uses hierarchy-based scoring from @/_domain/geography.ts to determine
   * if an account's territory aligns with the assigned rep's region.
   *
   * ALIGNMENT SCORING (from MASTER_LOGIC.mdc §4.3):
   * - Exact match (1.0): Account and rep have same region
   * - Same sub-region (0.85): Account maps to rep's sub-region
   * - Same parent (0.65): Both in same parent region (e.g., both AMER)
   * - Global fallback (0.40): Rep is "Global" - can take anything
   * - Cross-region (0.20): Different parent regions
   *
   * For dashboard purposes:
   * - Score >= GEO_MATCH_SCORES.GLOBAL_FALLBACK (0.40) = Aligned
   * - Score < GEO_MATCH_SCORES.GLOBAL_FALLBACK = Misaligned
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

    // Track by rep region for breakdown
    const byRegionMap: Map<string, { aligned: number; misaligned: number; unassigned: number }> = new Map();

    // Create a case-insensitive mapping lookup (account territory → target region)
    const mappingLookup = new Map<string, string>();
    for (const [accountTerritory, targetRegion] of Object.entries(territoryMappings)) {
      mappingLookup.set(accountTerritory.toLowerCase().trim(), targetRegion.trim());
    }

    parentAccounts.forEach(account => {
      const ownerId = useProposed ? (account.new_owner_id || account.owner_id) : account.owner_id;

      if (!ownerId) {
        unassigned++;
        // Add to "Unassigned" region bucket
        const regionData = byRegionMap.get('Unassigned') || { aligned: 0, misaligned: 0, unassigned: 0 };
        regionData.unassigned++;
        byRegionMap.set('Unassigned', regionData);
        return;
      }

      const rep = repsByRepId.get(ownerId);
      if (!rep) {
        unassigned++;
        // Add to "Unassigned" region bucket
        const regionData = byRegionMap.get('Unassigned') || { aligned: 0, misaligned: 0, unassigned: 0 };
        regionData.unassigned++;
        byRegionMap.set('Unassigned', regionData);
        return;
      }

      // Get account territory - try sales_territory first (more specific), then geo
      const accountTerritoryRaw = (account.sales_territory || account.geo || '').toString().trim();
      // Get rep region
      const repRegionRaw = (rep.region || '').toString().trim();
      const regionKey = repRegionRaw || 'Unknown';

      // Ensure region is in the map
      if (!byRegionMap.has(regionKey)) {
        byRegionMap.set(regionKey, { aligned: 0, misaligned: 0, unassigned: 0 });
      }
      const regionData = byRegionMap.get(regionKey)!;

      // If either is empty, count as misaligned (missing geo data = not aligned)
      if (!accountTerritoryRaw || !repRegionRaw) {
        misaligned++;
        regionData.misaligned++;
        return;
      }

      // Step 1: Apply territory mapping if configured
      // This converts account territory (e.g., "NOR CAL") to target region (e.g., "California")
      const mappedAccountRegion = mappingLookup.get(accountTerritoryRaw.toLowerCase()) || accountTerritoryRaw;

      // Step 2: Use hierarchy-based geo scoring from @/_domain/geography.ts
      // This handles: exact match, same sub-region, same parent, Global fallback, cross-region
      const geoScore = calculateGeoMatchScore(mappedAccountRegion, repRegionRaw);

      // Step 3: Determine alignment based on score
      // Score >= GLOBAL_FALLBACK means at least Global fallback level (acceptable)
      // Score < GLOBAL_FALLBACK means cross-region mismatch (not acceptable)
      if (geoScore >= GEO_MATCH_SCORES.GLOBAL_FALLBACK) {
        aligned++;
        regionData.aligned++;
      } else {
        misaligned++;
        regionData.misaligned++;
      }
    });

    // Include unassigned in total so 100% alignment requires ALL accounts to be assigned & aligned
    const total = aligned + misaligned + unassigned;
    const alignmentRate = total > 0 ? (aligned / total) * 100 : 0;

    // Convert byRegion map to array, sorted by total count descending
    const byRegion = Array.from(byRegionMap.entries())
      .map(([region, data]) => ({
        region,
        aligned: data.aligned,
        misaligned: data.misaligned,
        unassigned: data.unassigned,
        total: data.aligned + data.misaligned + data.unassigned,
      }))
      .sort((a, b) => b.total - a.total);

    console.log(`[GeoAlignment] Aligned: ${aligned}, Misaligned: ${misaligned}, Unassigned: ${unassigned}, Total: ${total}, Rate: ${alignmentRate.toFixed(1)}%`);

    return { aligned, misaligned, unassigned, alignmentRate, byRegion };
  }

  /**
   * Calculate ARR Distribution Buckets
   */
  private calculateArrBuckets(accounts: any[]): ArrBucket[] {
    const parentAccounts = accounts.filter(a => a.is_parent);
    
    return ARR_BUCKETS.map(bucket => {
      const inBucket = parentAccounts.filter(a => {
        const arr = getAccountARR(a);
        return arr >= bucket.min && arr < bucket.max;
      });
      
      return {
        bucket: bucket.label,
        count: inBucket.length,
        totalARR: inBucket.reduce((sum, a) => sum + getAccountARR(a), 0)
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

  // Tier classification: uses classifyTeamTier from @/_domain (single source of truth)

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
    let unknown = 0;

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

      // Classify account tier from employee count (from @/_domain)
      // Returns null if employee count is missing
      const accountTier = classifyTeamTier(account.employees);
      const repTier = rep.team_tier;

      // N/A case: missing tier data for either account or rep
      // Per MASTER_LOGIC.mdc §5.1.1 - missing data is NOT a mismatch
      if (!accountTier || !repTier) {
        unknown++;
        return;
      }

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
      unassigned,
      unknown
    };
  }

  /**
   * Calculate stability lock breakdown for pie chart
   * Uses the same logic as the assignment engine for consistency
   * 
   * @see MASTER_LOGIC.mdc §11.5 - Account Locking Priorities
   */
  private calculateStabilityLockBreakdown(
    accounts: any[],
    salesReps: any[],
    stabilityConfig: LPStabilityConfig
  ): StabilityLockBreakdown {
    const parentAccounts = accounts.filter(a => a.is_parent);
    
    // Convert raw DB types to optimization types (only fields needed for stability check)
    const aggregatedAccounts: AggregatedAccount[] = parentAccounts.map(a => ({
      sfdc_account_id: a.sfdc_account_id,
      account_name: a.account_name || '',
      aggregated_arr: getAccountARR(a),
      aggregated_atr: getAccountATR(a),
      pipeline_value: 0,
      child_ids: [],
      is_parent: true,
      owner_id: a.owner_id,
      owner_name: a.owner_name,
      owner_change_date: a.owner_change_date,
      owners_lifetime_count: a.owners_lifetime_count,
      is_customer: getAccountARR(a) > 0,
      is_strategic: a.is_strategic || false,
      sales_territory: a.sales_territory,
      geo: a.geo,
      employees: a.employees,
      enterprise_vs_commercial: a.enterprise_vs_commercial,
      tier: null,
      expansion_tier: a.expansion_tier,
      initial_sale_tier: a.initial_sale_tier,
      cre_risk: a.cre_risk,
      renewal_date: a.renewal_date,
      pe_firm: a.pe_firm,
      exclude_from_reassignment: a.exclude_from_reassignment,
    }));
    
    const eligibleReps: EligibleRep[] = salesReps.map(r => ({
      rep_id: r.rep_id,
      name: r.name,
      region: r.region,
      team_tier: r.team_tier,
      pe_firms: r.pe_firms,
      is_active: r.is_active ?? true,
      include_in_assignments: r.include_in_assignments ?? true,
      is_strategic_rep: r.is_strategic_rep || false,
      is_backfill_source: r.is_backfill_source,
      is_backfill_target: r.is_backfill_target,
      backfill_target_rep_id: r.backfill_target_rep_id,
      current_arr: 0,
    }));
    
    // Use existing function - it already computes lockStats!
    const { lockStats } = identifyLockedAccounts(
      aggregatedAccounts,
      eligibleReps,
      stabilityConfig
    );
    
    const total = Object.values(lockStats).reduce((sum, count) => sum + count, 0);
    
    return {
      manualLock: lockStats.manual_lock || 0,
      backfillMigration: lockStats.backfill_migration || 0,
      creRisk: lockStats.cre_risk || 0,
      renewalSoon: lockStats.renewal_soon || 0,
      peFirm: lockStats.pe_firm || 0,
      recentChange: lockStats.recent_change || 0,
      total,
    };
  }

  /**
   * Calculate Region Metrics
   *
   * DYNAMIC: Discovers regions from actual rep data instead of hardcoded list.
   * This respects whatever region values users have configured for their reps.
   */
  private calculateRegionMetrics(accounts: any[], salesReps: any[], opportunities: any[], useProposed: boolean): RegionMetrics[] {
    // DYNAMIC: Get unique regions from actual rep data
    const uniqueRegions = new Set<string>();
    salesReps.forEach(r => {
      if (r.region) uniqueRegions.add(r.region);
    });
    // Also include account geo values that might not have matching reps
    accounts.filter(a => a.is_parent).forEach(a => {
      const geo = a.geo || a.sales_territory;
      if (geo) uniqueRegions.add(geo);
    });

    const regions = Array.from(uniqueRegions).sort();
    const parentAccounts = accounts.filter(a => a.is_parent);

    return regions.map(region => {
      // Count accounts by their geo field
      const regionAccounts = parentAccounts.filter(a => {
        const geo = a.geo || a.sales_territory;
        return geo === region;
      });

      const customers = regionAccounts.filter(a => (a.hierarchy_bookings_arr_converted || 0) > 0);
      const prospects = regionAccounts.filter(a => (a.hierarchy_bookings_arr_converted || 0) === 0);

      const arr = customers.reduce((sum, a) => sum + getAccountARR(a), 0);

      // ATR and Pipeline from opportunities linked to accounts in this region
      const regionAccountIds = new Set(regionAccounts.map(a => a.sfdc_account_id));
      const regionOpps = opportunities.filter(o => regionAccountIds.has(o.sfdc_account_id));

      // ATR: use account fields first, fall back to opportunities if empty/0
      let atr = regionAccounts.reduce((sum, a) => sum + getAccountATR(a), 0);
      // If account ATR is 0 or empty, fall back to summing from renewal opportunities
      if (atr === 0) {
        atr = regionOpps
          .filter(isRenewalOpportunity)
          .reduce((sum, o) => sum + (o.available_to_renew || 0), 0);
      }

      // Pipeline: sum of net_arr from all opportunities
      const pipeline = regionOpps.reduce((sum, o) => sum + getOpportunityPipelineValue(o), 0);

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
  private calculateLPSuccessMetrics(
    accounts: any[],
    salesReps: any[],
    opportunities: any[],
    useProposed: boolean,
    target?: number,
    territoryMappings: Record<string, string> = {}
  ): LPSuccessMetrics {
    // Get detailed balance metrics (includes rep load distribution)
    const balanceDetail = this.calculateBalanceMetricsDetail(accounts, salesReps, useProposed);

    // Use the balance detail for capacity utilization
    const avgTarget = target || balanceDetail.targetLoad;
    const loads = balanceDetail.distribution.map(d => d.arrLoad);

    // Get full continuity metrics with counts
    const continuityMetrics = this.calculateContinuityMetrics(accounts, salesReps, useProposed);

    return {
      balanceScore: balanceDetail.score,
      balanceDetail,
      continuityScore: continuityMetrics.score,
      continuityMetrics,
      geographyScore: this.calculateGeographyScore(accounts, salesReps, useProposed, territoryMappings),
      teamAlignmentScore: this.calculateTeamAlignmentScore(accounts, salesReps, useProposed),
      capacityUtilization: this.calculateCapacityUtilization(loads, avgTarget)
    };
  }

  /**
   * Calculate per-rep distribution data for charts
   *
   * IMPORTANT: Includes Sales Tools as a pseudo-rep when useProposed=true
   * Sales Tools accounts are identified by:
   * - new_owner_name = 'Sales Tools' AND new_owner_id is null
   *
   * Sales Tools appears as a distinct entry with:
   * - repId: SALES_TOOLS_REP_ID ('__SALES_TOOLS__')
   * - repName: 'Sales Tools'
   * - region: 'Sales Tools' (no FLM/SLM hierarchy)
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
      oppByAccount.set(opp.sfdc_account_id, current + getOpportunityPipelineValue(opp));
    });

    // ATR: sum of available_to_renew from renewal opportunities only
    const atrByAccount = new Map<string, number>();
    opportunities.forEach(opp => {
      // Only include renewal opportunities with available_to_renew
      if (isRenewalOpportunity(opp) && opp.available_to_renew) {
        const current = atrByAccount.get(opp.sfdc_account_id) || 0;
        atrByAccount.set(opp.sfdc_account_id, current + (opp.available_to_renew || 0));
      }
    });

    // Helper to check if account is assigned to Sales Tools
    // Note: Sales Tools accounts have new_owner_name='Sales Tools' regardless of useProposed flag
    // This allows Sales Tools to appear in analytics even in "original" view
    const isSalesToolsAccount = (account: any): boolean => {
      // Sales Tools: new_owner_name = 'Sales Tools' and new_owner_id is null/empty
      return account.new_owner_name === SALES_TOOLS_REP_NAME &&
             (!account.new_owner_id || account.new_owner_id === '');
    };

    // Helper to calculate metrics for a set of accounts
    // @see MASTER_LOGIC.mdc §3.1 - Customer = getAccountARR() > 0
    const calculateAccountMetrics = (repParentAccounts: any[], repChildAccounts: any[]) => {
      const parentCustomerAccounts = repParentAccounts.filter(a => getAccountARR(a) > 0);
      const parentProspectAccounts = repParentAccounts.filter(a => getAccountARR(a) === 0);
      const childCustomerAccounts = repChildAccounts.filter(a => getAccountARR(a) > 0);
      const childProspectAccounts = repChildAccounts.filter(a => getAccountARR(a) === 0);

      const arr = parentCustomerAccounts.reduce((sum, a) => sum + getAccountARR(a), 0);
      const atr = repParentAccounts.reduce((sum, a) => {
        const accountATR = getAccountATR(a);
        if (accountATR > 0) return sum + accountATR;
        return sum + (atrByAccount.get(a.sfdc_account_id) || 0);
      }, 0);
      const pipeline = repParentAccounts.reduce((sum, a) =>
        sum + (oppByAccount.get(a.sfdc_account_id) || 0), 0
      );

      // Tier breakdown (parent accounts only - children inherit parent tier)
      let tier1 = 0, tier2 = 0, tier3 = 0, tier4 = 0, tierNA = 0;
      repParentAccounts.forEach(a => {
        const tier = getAccountExpansionTier(a);
        if (tier === 'Tier 1') tier1++;
        else if (tier === 'Tier 2') tier2++;
        else if (tier === 'Tier 3') tier3++;
        else if (tier === 'Tier 4') tier4++;
        else tierNA++;
      });

      // CRE Risk breakdown (parent accounts only)
      let creNone = 0, creLow = 0, creMedium = 0, creHigh = 0;
      repParentAccounts.forEach(a => {
        const level = getCRERiskLevel(a.cre_count || 0);
        if (level === 'none') creNone++;
        else if (level === 'low') creLow++;
        else if (level === 'medium') creMedium++;
        else creHigh++;
      });

      return {
        arr,
        atr,
        pipeline,
        customerAccounts: parentCustomerAccounts.length,
        prospectAccounts: parentProspectAccounts.length,
        totalAccounts: repParentAccounts.length,
        parentCustomers: parentCustomerAccounts.length,
        childCustomers: childCustomerAccounts.length,
        parentProspects: parentProspectAccounts.length,
        childProspects: childProspectAccounts.length,
        // Tier breakdown
        tier1Accounts: tier1,
        tier2Accounts: tier2,
        tier3Accounts: tier3,
        tier4Accounts: tier4,
        tierNAAccounts: tierNA,
        // CRE Risk breakdown
        creNoneAccounts: creNone,
        creLowAccounts: creLow,
        creMediumAccounts: creMedium,
        creHighAccounts: creHigh,
      };
    };

    // Calculate per-rep metrics for actual reps
    const repDistribution = salesReps
      .filter(rep => rep.is_active && rep.include_in_assignments !== false)
      .map(rep => {
        // Get parent accounts for this rep (exclude Sales Tools accounts)
        const repParentAccounts = parentAccounts.filter(a => {
          if (isSalesToolsAccount(a)) return false; // Exclude Sales Tools accounts
          const ownerId = useProposed ? (a.new_owner_id || a.owner_id) : a.owner_id;
          return ownerId === rep.rep_id;
        });

        // Get child accounts for this rep
        const repChildAccounts = childAccounts.filter(a => {
          if (isSalesToolsAccount(a)) return false;
          const ownerId = useProposed ? (a.new_owner_id || a.owner_id) : a.owner_id;
          return ownerId === rep.rep_id;
        });

        const metrics = calculateAccountMetrics(repParentAccounts, repChildAccounts);

        return {
          repId: rep.rep_id,
          repName: rep.name,
          region: rep.region || 'Unknown',
          ...metrics,
          isStrategicRep: rep.is_strategic_rep ?? false,
        };
      });

    // Add Sales Tools pseudo-rep ONLY when showing proposed assignments
    // Sales Tools is a balancing concept that routes low-ARR accounts (<$25K) during assignment
    // Data Overview (useProposed=false) should show original imported data without Sales Tools
    // Balancing Dashboard (useProposed=true) should show Sales Tools bucket
    if (useProposed) {
      const salesToolsParentAccounts = parentAccounts.filter(isSalesToolsAccount);
      const salesToolsChildAccounts = childAccounts.filter(isSalesToolsAccount);

      if (salesToolsParentAccounts.length > 0) {
        const salesToolsMetrics = calculateAccountMetrics(salesToolsParentAccounts, salesToolsChildAccounts);

        console.log(`[RepDistribution] 📦 Sales Tools pseudo-rep: ${salesToolsParentAccounts.length} accounts, $${salesToolsMetrics.arr.toLocaleString()} ARR`);

        repDistribution.push({
          repId: SALES_TOOLS_REP_ID,
          repName: SALES_TOOLS_REP_NAME,
          region: 'Sales Tools', // Distinct region - no FLM/SLM hierarchy
          ...salesToolsMetrics,
        });
      }
    }

    return repDistribution.sort((a, b) => b.arr - a.arr); // Sort by ARR descending
  }

  /**
   * Helper to fetch raw build data with pagination (for large datasets)
   * Uses SSOT constants from @/_domain for pagination
   */
  private async fetchRawBuildData(buildId: string): Promise<{ accounts: any[]; opportunities: any[]; salesReps: any[] }> {
    const pageSize = SUPABASE_LIMITS.FETCH_PAGE_SIZE;
    
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
      supabase.from('sales_reps').select('*').eq('build_id', buildId).limit(SUPABASE_LIMITS.FETCH_PAGE_SIZE)
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
    
    // Fetch territory mappings and stability config from configuration (use maybeSingle to handle no rows gracefully)
    const { data: configData } = await supabase
      .from('assignment_configuration')
      .select('territory_mappings, lp_stability_config')
      .eq('build_id', buildId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    const territoryMappings: Record<string, string> = (configData?.territory_mappings as Record<string, string>) || {};
    
    // Merge stability config with defaults
    const stabilityConfig: LPStabilityConfig = {
      ...DEFAULT_LP_STABILITY_CONFIG,
      ...(configData?.lp_stability_config as Partial<LPStabilityConfig> || {})
    };
    
    console.log(`[MetricsSnapshot] Processing ${accounts.length} accounts, ${opportunities.length} opps, ${salesReps.length} reps`);
    console.log(`[MetricsSnapshot] Territory mappings loaded: ${Object.keys(territoryMappings).length} mappings`, territoryMappings);
    
    // Debug: Show unique account territories and rep regions for comparison
    const accountTerritories = new Set(accounts.filter(a => a.is_parent).map(a => a.geo || a.sales_territory).filter(Boolean));
    const repRegions = new Set(salesReps.map(r => r.region).filter(Boolean));
    console.log(`[MetricsSnapshot] Unique account territories (${accountTerritories.size}):`, Array.from(accountTerritories).slice(0, 10));
    console.log(`[MetricsSnapshot] Unique rep regions (${repRegions.size}):`, Array.from(repRegions));
    
    const parentAccounts = accounts.filter(a => a.is_parent);
    const customers = parentAccounts.filter(a => (a.hierarchy_bookings_arr_converted || 0) > 0);
    const prospects = parentAccounts.filter(a => (a.hierarchy_bookings_arr_converted || 0) === 0);
    
    return {
      lpMetrics: this.calculateLPSuccessMetrics(accounts, salesReps, opportunities, useProposed, undefined, territoryMappings),
      byRegion: this.calculateRegionMetrics(accounts, salesReps, opportunities, useProposed),
      geoAlignment: this.calculateGeoAlignment(accounts, salesReps, useProposed, territoryMappings),
      arrBuckets: this.calculateArrBuckets(accounts),
      tierDistribution: this.calculateTierDistribution(accounts),
      tierAlignmentBreakdown: this.calculateTierAlignmentBreakdown(accounts, salesReps, useProposed),
      stabilityLockBreakdown: this.calculateStabilityLockBreakdown(accounts, salesReps, stabilityConfig),
      repDistribution: this.calculateRepDistribution(accounts, salesReps, opportunities, useProposed),
      totals: {
        accounts: parentAccounts.length,
        customers: customers.length,
        prospects: prospects.length,
        arr: customers.reduce((sum, a) => sum + getAccountARR(a), 0),
        // ATR: use account fields first, fall back to opportunities if empty/0
        atr: (() => {
          const accountATR = parentAccounts.reduce((sum, a) => sum + getAccountATR(a), 0);
          // If account ATR is 0 or empty, fall back to summing from renewal opportunities
          if (accountATR > 0) {
            return accountATR;
          }
          return opportunities
            .filter(isRenewalOpportunity)
            .reduce((sum, o) => sum + (o.available_to_renew || 0), 0);
        })(),
        pipeline: opportunities.reduce((sum, o) => sum + getOpportunityPipelineValue(o), 0)
      }
    };
  }

  /**
   * Get Analytics Metrics for Data Overview
   * @param buildId - Build ID
   * @param useProposed - Whether to use proposed assignments (new_owner_id) or original (owner_id). Defaults to true.
   */
  async getAnalyticsMetrics(buildId: string, useProposed = true): Promise<MetricsSnapshot> {
    const cacheKey = `analytics_${buildId}_${useProposed ? 'proposed' : 'original'}`;
    
    if (this.isCacheValid(cacheKey)) {
      return this.cache.get(cacheKey)!.data;
    }
    
    const snapshot = await this.calculateMetricsSnapshot(buildId, useProposed);
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
      teamAlignmentScore: proposed.lpMetrics.teamAlignmentScore !== null && original.lpMetrics.teamAlignmentScore !== null
        ? proposed.lpMetrics.teamAlignmentScore - original.lpMetrics.teamAlignmentScore
        : null,
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