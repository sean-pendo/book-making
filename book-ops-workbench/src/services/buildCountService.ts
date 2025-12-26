import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_LIMITS } from '@/_domain';

export interface BuildCounts {
  accounts: number;
  opportunities: number;
  salesReps: number;
  assignments: number;
  accountsWithOwners: number;
  opportunitiesWithAccounts: number;
  validAssignments: number;
}

class BuildCountService {
  private static instance: BuildCountService;
  private cache: Map<string, { data: BuildCounts; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 30 * 1000; // 30 seconds - shorter for more responsive UI

  static getInstance(): BuildCountService {
    if (!BuildCountService.instance) {
      BuildCountService.instance = new BuildCountService();
    }
    return BuildCountService.instance;
  }

  private isCacheValid(buildId: string): boolean {
    const cached = this.cache.get(buildId);
    if (!cached) return false;
    return (Date.now() - cached.timestamp) < this.CACHE_TTL;
  }

  async getBuildCounts(buildId: string, forceRefresh: boolean = false): Promise<BuildCounts> {
    // Skip cache if force refresh requested
    if (!forceRefresh && this.isCacheValid(buildId)) {
      console.log('📊 Using cached build counts for', buildId);
      return this.cache.get(buildId)!.data;
    }
    
    console.log('🔄 Fetching fresh build counts for', buildId, forceRefresh ? '(forced)' : '');

    try {
      // Get basic counts using efficient count queries
      const [
        accountsCount,
        opportunitiesCount,
        salesRepsCount,
        assignmentsCount,
        accountsWithOwnersCount
      ] = await Promise.all([
        supabase.from('accounts').select('id', { count: 'exact' }).eq('build_id', buildId),
        supabase.from('opportunities').select('id', { count: 'exact' }).eq('build_id', buildId),
        supabase.from('sales_reps').select('id', { count: 'exact' }).eq('build_id', buildId),
        supabase.from('assignments').select('id', { count: 'exact' }).eq('build_id', buildId),
        supabase.from('accounts')
          .select('id', { count: 'exact' })
          .eq('build_id', buildId)
          .not('owner_id', 'is', null)
          .neq('owner_id', '')
      ]);

      // For data quality metrics, we need some actual data
      // Uses SSOT pagination limit from @/_domain
      const [accountsWithAccountIds, opportunities, salesReps] = await Promise.all([
        supabase.from('accounts')
          .select('sfdc_account_id, owner_id')
          .eq('build_id', buildId)
          .limit(SUPABASE_LIMITS.FETCH_PAGE_SIZE),
        supabase.from('opportunities')
          .select('sfdc_account_id, owner_id')
          .eq('build_id', buildId)
          .limit(SUPABASE_LIMITS.FETCH_PAGE_SIZE),
        supabase.from('sales_reps')
          .select('rep_id')
          .eq('build_id', buildId)
          .limit(SUPABASE_LIMITS.FETCH_PAGE_SIZE)
      ]);

      const accounts = accountsWithAccountIds.data || [];
      const opps = opportunities.data || [];
      const reps = salesReps.data || [];

      // Calculate relationship metrics
      const accountIds = new Set(accounts.map(a => a.sfdc_account_id));
      const opportunitiesWithAccounts = opps.filter(o => 
        o.sfdc_account_id && accountIds.has(o.sfdc_account_id)
      ).length;

      const salesRepIds = new Set(reps.map(r => r.rep_id));
      const validAssignments = accounts.filter(a => 
        a.owner_id && a.owner_id.trim() !== '' && salesRepIds.has(a.owner_id)
      ).length;

      const counts: BuildCounts = {
        accounts: accountsCount.count || 0,
        opportunities: opportunitiesCount.count || 0,
        salesReps: salesRepsCount.count || 0,
        assignments: assignmentsCount.count || 0,
        accountsWithOwners: accountsWithOwnersCount.count || 0,
        opportunitiesWithAccounts,
        validAssignments
      };

      // Cache the results
      this.cache.set(buildId, { data: counts, timestamp: Date.now() });
      
      return counts;
    } catch (error) {
      console.error('Error fetching build counts:', error);
      throw error;
    }
  }

  // Clear cache for a specific build
  clearBuildCache(buildId: string): void {
    this.cache.delete(buildId);
  }

  // Clear all cache
  clearAllCache(): void {
    this.cache.clear();
  }
}

export const buildCountService = BuildCountService.getInstance();