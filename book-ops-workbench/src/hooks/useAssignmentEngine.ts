import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { assignmentService } from '@/services/assignmentService';
import { generateSimplifiedAssignments, type WaterfallProgress } from '@/services/simplifiedAssignmentEngine';
import { buildDataService } from '@/services/buildDataService';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useInvalidateBuildData } from '@/hooks/useBuildData';
import type { AssignmentResult, AssignmentProgress } from '@/types/assignment';
import { createAssignmentStages } from '@/components/AssignmentProgressDialog';
import { runPureOptimization, type LPSolveResult, type LPProgress } from '@/services/optimization';
import { getAccountARR, calculateAssignmentConfidence, SUPABASE_LIMITS } from '@/_domain';

/**
 * Convert WaterfallProgress to AssignmentProgress for UI display
 * Maps the engine's internal progress to the dialog's expected format
 */
function waterfallToAssignmentProgress(
  wp: WaterfallProgress,
  baseOffset: number = 0,
  scale: number = 1
): AssignmentProgress {
  // Map waterfall stages to assignment stages
  const stageMap: Record<WaterfallProgress['stage'], AssignmentProgress['stage']> = {
    'initializing': 'initializing',
    'loading': 'loading',
    'priority': 'assigning',
    'solving': 'assigning',
    'finalizing': 'finalizing',
    'complete': 'finalizing'
  };
  
  return {
    stage: stageMap[wp.stage] || 'assigning',
    status: wp.status,
    progress: baseOffset + (wp.progress * scale),
    currentRule: wp.currentPriority,
    rulesCompleted: wp.priorityIndex || 0,
    totalRules: wp.totalPriorities || 0,
    accountsProcessed: wp.accountsProcessed || 0,
    totalAccounts: wp.totalAccounts || 0,
    assignmentsMade: wp.assignmentsMade || 0,
    conflicts: 0
  };
}

interface Account {
  sfdc_account_id: string;
  account_name: string;
  parent_id?: string;
  ultimate_parent_id?: string;
  enterprise_vs_commercial: string;
  expansion_tier?: string;
  initial_sale_tier?: string;
  arr: number;
  hierarchy_bookings_arr_converted?: number;
  calculated_arr?: number;
  owner_id?: string;
  owner_name?: string;
  new_owner_id?: string;
  new_owner_name?: string;
  geo: string;
  sales_territory?: string;
  is_customer: boolean;
  is_parent: boolean;
  risk_flag: boolean;
  cre_risk: boolean;
  cre_status?: string;
  cre_count?: number;
  child_count?: number;
  expansion_score?: number;
  account_type?: string;
  industry?: string;
  employees?: number;
  atr?: number;
  calculated_atr?: number;
  exclude_from_reassignment?: boolean;
}

interface AssignmentReason {
  accountId: string;
  reason: string;
}

/**
 * Extract priority code from LP rationale string
 * Rationales are formatted as "P0:", "P1:", ... "P7:", or "RO:" at the start
 * Priority positions are now dynamic based on user's priority_config
 *
 * @example extractPriorityCode("P6: Geography Match → Rep Name (details)") => "P6"
 * @example extractPriorityCode("RO: Balance Optimization → ...") => "RO"
 */
function extractPriorityCode(rationale: string): string {
  // Match P followed by any digits (P0, P1, ... P99) or RO at start of rationale
  const match = rationale.match(/^(P\d+|RO):/);
  if (match) {
    return match[1];
  }
  return 'LP Optimization';
}

interface Owner {
  rep_id: string;
  name: string;
  team?: string;
  region?: string;
  manager?: string;
  is_active?: boolean;
  include_in_assignments?: boolean;
  is_manager?: boolean;
  status_notes?: string;
}

export const useAssignmentEngine = (buildId?: string) => {
  const { toast } = useToast();
  const { user, session, profile } = useAuth();
  const queryClient = useQueryClient();
  const invalidateBuildData = useInvalidateBuildData();
  const [assignmentResult, setAssignmentResult] = useState<AssignmentResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [assignmentProgress, setAssignmentProgress] = useState<AssignmentProgress | null>(null);
  
  // Imbalance warning state - replaces browser confirm()
  const [imbalanceWarning, setImbalanceWarning] = useState<{
    show: boolean;
    repName: string;
    repARR: number;
    targetARR: number;
    overloadPercent: number;
  } | null>(null);

  // Debug authentication state when component mounts
  useEffect(() => {
    console.log(`[AssignmentEngine] 🔐 Authentication Debug:`, {
      user: user ? { id: user.id, email: user.email } : null,
      session: session ? { access_token: !!session.access_token, expires_at: session.expires_at } : null,
      profile: profile ? { role: profile.role, region: profile.region } : null,
      buildId
    });
    
    // NOTE: Removed aggressive cache clearing - it was causing duplicate fetches
    // Use refetchAccounts() explicitly when fresh data is needed
  }, [user, session, profile, buildId]);

  // Fetch parent accounts with comprehensive debugging
  const { data: accounts = [], isLoading: accountsLoading, refetch: refetchAccounts, error: accountsError } = useQuery({
    queryKey: ['build-parent-accounts-optimized', buildId],
    queryFn: async () => {
      if (!buildId) return [];
      
      // Debug authentication before query
      const currentSession = await supabase.auth.getSession();
      console.log(`[AssignmentEngine] 🔑 Pre-query auth check:`, {
        hasCurrentSession: !!currentSession.data.session,
        sessionUserId: currentSession.data.session?.user?.id,
        buildId,
        timestamp: new Date().toISOString()
      });
      
      const startTime = performance.now();
      console.log(`[AssignmentEngine] 📊 Starting BATCHED paginated query for build ${buildId}...`);
      
      // Get total count first (lightweight query)
      const { count } = await supabase
        .from('accounts')
        .select('sfdc_account_id', { count: 'exact', head: true })
        .eq('build_id', buildId)
        .eq('is_parent', true);
      
      console.log(`[AssignmentEngine] 📋 Total records available: ${count}`);
      
      // If no records, return early
      if (!count || count === 0) {
        console.warn('[AssignmentEngine] ⚠️ No accounts found in count query');
        return [];
      }
      
      // BATCHED FETCH: Process pages in batches to avoid overwhelming the database
      // Uses SSOT constants from @/_domain for pagination
      const pageSize = SUPABASE_LIMITS.FETCH_PAGE_SIZE;
      const concurrencyLimit = SUPABASE_LIMITS.MAX_CONCURRENT_REQUESTS;
      const totalPages = Math.ceil(count / pageSize);
      
      console.log(`[AssignmentEngine] 🚀 Fetching ${totalPages} pages in batches of ${concurrencyLimit}...`);
      
      // Helper to fetch a single page with retry logic
      const fetchPage = async (pageIndex: number, retryCount = 0): Promise<Account[]> => {
        const from = pageIndex * pageSize;
        const to = Math.min((pageIndex + 1) * pageSize - 1, count - 1);
        
        try {
          const { data: pageData, error } = await supabase
            .from('accounts')
            .select('*')
            .eq('build_id', buildId)
            .eq('is_parent', true)
            .range(from, to);
          
          if (error) {
            // Retry on timeout errors (57014 = statement timeout)
            if (error.code === '57014' && retryCount < 3) {
              console.warn(`[AssignmentEngine] ⏳ Page ${pageIndex + 1} timed out, retrying (${retryCount + 1}/3)...`);
              await new Promise(r => setTimeout(r, 1000 * (retryCount + 1))); // Backoff
              return fetchPage(pageIndex, retryCount + 1);
            }
            console.error(`[AssignmentEngine] ❌ Error loading page ${pageIndex + 1}:`, error);
            throw error;
          }
          
          return (pageData || []) as Account[];
        } catch (err: any) {
          if (retryCount < 3) {
            console.warn(`[AssignmentEngine] ⏳ Page ${pageIndex + 1} failed, retrying (${retryCount + 1}/3)...`);
            await new Promise(r => setTimeout(r, 1000 * (retryCount + 1)));
            return fetchPage(pageIndex, retryCount + 1);
          }
          throw err;
        }
      };
      
      // Process pages in batches
      let allData: Account[] = [];
      for (let batchStart = 0; batchStart < totalPages; batchStart += concurrencyLimit) {
        const batchEnd = Math.min(batchStart + concurrencyLimit, totalPages);
        const batchSize = batchEnd - batchStart;
        
        console.log(`[AssignmentEngine] 📦 Batch ${Math.floor(batchStart / concurrencyLimit) + 1}/${Math.ceil(totalPages / concurrencyLimit)}: pages ${batchStart + 1}-${batchEnd} of ${totalPages}`);
        
        // Create promises for this batch only
        const batchPromises = Array.from({ length: batchSize }, (_, i) => 
          fetchPage(batchStart + i)
        );
        
        // Wait for this batch to complete before starting next
        const batchResults = await Promise.all(batchPromises);
        
        for (const pageData of batchResults) {
          // Use concat to avoid stack overflow with large arrays
          allData = allData.concat(pageData);
        }
        
        console.log(`[AssignmentEngine] ✅ Batch complete: ${allData.length}/${count} records loaded`);
      }
      
      const fetchTime = performance.now() - startTime;
      console.log(`[AssignmentEngine] 📈 Batched Fetch Results:`, {
        totalPages,
        totalRecords: allData.length,
        expectedCount: count,
        fetchTimeMs: Math.round(fetchTime),
        buildId,
        sampleAccount: allData?.[0] ? { 
          id: allData[0].sfdc_account_id, 
          name: allData[0].account_name 
        } : null
      });
      
      const data = allData;

      if (data.length === 0) {
        console.warn('[AssignmentEngine] ⚠️ No accounts returned from paginated query');
        
        // Fallback: Try debug function (bypasses RLS)
        console.log(`[AssignmentEngine] 🔄 Attempting RLS bypass with debug function...`);
        try {
          const { data: debugData, error: debugError } = await supabase.rpc('debug_get_accounts', {
            p_build_id: buildId
          });
          
          console.log(`[AssignmentEngine] 🛠️ Debug Query Results:`, {
            debugDataLength: debugData?.length || 0,
            debugError: debugError ? { code: debugError.code, message: debugError.message } : null,
            sampleDebugAccount: debugData?.[0] ? { 
              id: debugData[0].sfdc_account_id, 
              name: debugData[0].account_name 
            } : null
          });
          
          if (debugError) {
            console.error('[AssignmentEngine] ❌ Debug function also failed:', debugError);
            throw new Error(`Failed to fetch accounts: ${debugError.message}`);
          }
          
          // Transform debug data to match interface
          const transformedData = debugData?.map(account => ({
            sfdc_account_id: account.sfdc_account_id,
            account_name: account.account_name,
            parent_id: null,
            ultimate_parent_id: null,
            enterprise_vs_commercial: 'Unknown',
            expansion_tier: null,
            initial_sale_tier: null,
            arr: account.arr || 0,
            hierarchy_bookings_arr_converted: null,
            calculated_arr: null,
            owner_id: account.owner_id,
            owner_name: account.owner_name,
            geo: 'Unknown',
            sales_territory: null,
            is_customer: account.arr && account.arr > 0,
            is_parent: account.is_parent || true,
            risk_flag: false,
            cre_risk: false,
            expansion_score: null,
            account_type: null,
            industry: null,
            employees: null,
            atr: null
          })) || [];
          
          console.log(`[AssignmentEngine] ✅ Using debug data: ${transformedData.length} accounts`);
          toast({
            title: "Debug Mode Active",
            description: `Loaded ${transformedData.length} accounts via debug function (RLS bypass)`,
            variant: "destructive"
          });
          
          return transformedData as Account[];
        } catch (debugErr) {
          console.error('[AssignmentEngine] ❌ Both queries failed:', debugErr);
          throw new Error(`Failed to fetch accounts: ${debugErr}`);
        }
      }
      
      console.log(`[AssignmentEngine] ✅ Pagination Success: ${data.length} accounts loaded`);
      return data as Account[];
    },
    enabled: !!buildId && !!user,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes (prevents duplicate fetches)
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false,
    retry: 1 // Only retry once
  });

  // Fetch sales reps for this build
  const { data: owners = [], isLoading: ownersLoading } = useQuery({
    queryKey: ['build-sales-reps', buildId],
    queryFn: async () => {
      if (!buildId) return [];
      const { data, error } = await supabase
        .from('sales_reps')
        .select('*')
        .eq('build_id', buildId);
      
      if (error) throw error;
      
      // Add defaults for new rep management fields for backward compatibility
      const repsWithDefaults = (data || []).map(rep => ({
        ...rep,
        is_active: rep.is_active ?? true,
        include_in_assignments: rep.include_in_assignments ?? true,
        is_manager: rep.is_manager ?? false
      }));
      
      return repsWithDefaults as Owner[];
    },
    enabled: !!buildId
  });

  // Fetch assignment reasons for this build
  const { data: assignmentReasons = [] } = useQuery({
    queryKey: ['build-assignment-reasons', buildId],
    queryFn: async () => {
      if (!buildId) return [];
      const { data, error } = await supabase
        .from('assignments')
        .select('sfdc_account_id, rationale')
        .eq('build_id', buildId);
      
      if (error) throw error;
      return data.map(item => ({
        accountId: item.sfdc_account_id,
        reason: item.rationale || ''
      })) as AssignmentReason[];
    },
    enabled: !!buildId
  });

  // Force refresh of React Query cache to show updates
  const refreshData = useCallback(async () => {
    await refetchAccounts();
    // Also invalidate assignment reasons to refresh them
    queryClient.invalidateQueries({ queryKey: ['build-assignment-reasons', buildId] });
  }, [refetchAccounts, queryClient, buildId]);

  // Classify ALL parent accounts as either customers or prospects
  // Use getAccountARR() > 0 to determine customer vs prospect - consistent with buildDataService
  // This ensures Assignments tab and Data Overview show the same counts
  // @see MASTER_LOGIC.mdc §3.1 - Customer = getAccountARR() > 0
  const customerAccounts = (accounts as Account[]).filter(account => getAccountARR(account) > 0);
  const prospectAccounts = (accounts as Account[]).filter(account => getAccountARR(account) === 0);

  // Debug logging to verify all accounts are included and authentication
  console.log(`[AssignmentEngine] 📊 Final Account Summary:`, {
    totalParentAccounts: accounts.length,
    customerAccounts: customerAccounts.length,
    prospectAccounts: prospectAccounts.length,
    totalDisplayed: customerAccounts.length + prospectAccounts.length,
    allAccountsIncluded: (customerAccounts.length + prospectAccounts.length) === accounts.length,
    hasError: !!accountsError,
    errorDetails: accountsError ? { message: accountsError.message, code: (accountsError as any).code } : null,
    buildId,
    authState: {
      hasUser: !!user,
      hasSession: !!session,
      userRole: profile?.role,
      userRegion: profile?.region
    }
  });

  // Show authentication warning if no user
  useEffect(() => {
    if (!user && buildId) {
      console.warn(`[AssignmentEngine] ⚠️ No authenticated user found for build ${buildId}`);
      toast({
        title: "Authentication Required",
        description: "Please ensure you are logged in to view accounts",
        variant: "destructive"
      });
    }
  }, [user, buildId, toast]);

  // Generate assignments using the Collaborative Assignment Service
  const handleGenerateAssignments = async (accountType: 'customers' | 'prospects' | 'all' = 'all') => {
    if (!buildId) return;

    setIsGenerating(true);
    setAssignmentProgress(null);
    
    try {
      console.log(`[AssignmentEngine] 🚀 Generating assignments for ${accountType} using waterfall logic`);
      
      // ALWAYS use the waterfall engine (simplified assignment engine) - it has the proper logic
      setAssignmentProgress({
        stage: 'scoring',
        status: 'Generating assignments with waterfall logic...',
        progress: 40,
        rulesCompleted: 0,
        totalRules: 4, // 4 priority levels in waterfall
        accountsProcessed: 0,
        totalAccounts: accounts.length,
        assignmentsMade: 0,
        conflicts: 0
      });
      
      // Filter accounts by type - trust is_customer flag (synced with hierarchy)
      const filteredAccounts = accountType === 'all' 
        ? accounts.filter(a => a.is_parent) // Only parents
        : accounts.filter(acc => {
            if (!acc.is_parent) return false; // Always exclude children
            if (accountType === 'customers') return acc.is_customer;
            return !acc.is_customer;
          });

      console.log(`[AssignmentEngine] Filtered accounts for ${accountType}:`, {
        input: accounts.length,
        output: filteredAccounts.length,
        parents: accounts.filter(a => a.is_parent).length,
        customers: filteredAccounts.filter(a => a.is_customer).length,
        prospects: filteredAccounts.filter(a => !a.is_customer).length
      });
      
      // Fetch assignment configuration (NOT rules - waterfall logic doesn't use rules)
      console.log(`[AssignmentEngine] 🔍 Querying assignment_configuration for build_id: ${buildId}, account_scope: 'all'`);
      
      const { data: configData, error: configError } = await supabase
        .from('assignment_configuration')
        .select('*')
        .eq('build_id', buildId)
        .eq('account_scope', 'all')
        .maybeSingle();

      console.log(`[AssignmentEngine] 📋 Configuration query result:`, {
        found: !!configData,
        error: configError,
        data: configData,
        buildId
      });

      if (!configData) {
        const errorMessage = 'Assignment configuration not found. Please click "Configure Assignment Targets" to set up targets first.';
        console.error('[AssignmentEngine] ❌', errorMessage);
        console.error('[AssignmentEngine] 💡 Hint: Go to the configuration page and save your targets.');
        throw new Error(errorMessage);
      }
      
      // Auto-calculate balance thresholds if not calculated yet
      if (!configData.last_calculated_at) {
        console.warn('[AssignmentEngine] ⚠️ Balance thresholds not calculated. Auto-calculating now...');
        
        toast({
          title: 'Calculating balance thresholds',
          description: 'This will take a moment...'
        });
        
        try {
          // Fetch accounts and reps for calculation
          const { data: customerAccounts, error: accountsError } = await supabase
            .from('accounts')
            .select('*')
            .eq('build_id', buildId)
            .eq('is_parent', true)
            .eq('is_customer', true);
            
          if (accountsError) {
            console.error('[AssignmentEngine] Error fetching accounts for threshold calculation:', accountsError);
            throw accountsError;
          }
            
          const { data: activeReps, error: repsError } = await supabase
            .from('sales_reps')
            .select('*')
            .eq('build_id', buildId)
            .eq('is_active', true);
          
          if (repsError) {
            console.error('[AssignmentEngine] Error fetching reps for threshold calculation:', repsError);
            throw repsError;
          }
          
          if (customerAccounts && activeReps) {
            console.log('[AssignmentEngine] Fetched data for threshold calculation:', {
              accounts: customerAccounts.length,
              reps: activeReps.length
            });
            
            const { BalanceThresholdCalculator } = await import('@/services/balanceThresholdCalculator');
            const calculated = BalanceThresholdCalculator.calculateThresholds(
              customerAccounts,
              activeReps,
              {
                cre_variance: configData.cre_variance || 20,
                atr_variance: configData.atr_variance || 20,
                tier1_variance: configData.tier1_variance || 25,
                tier2_variance: configData.tier2_variance || 25,
                renewal_concentration_max: configData.renewal_concentration_max || 35
              }
            );
            
            console.log('[AssignmentEngine] Calculated thresholds:', calculated);
            console.log('[AssignmentEngine] 🎯 Balance Thresholds Breakdown:');
            console.log(`   ARR: Target=${(configData.customer_target_arr/1000000).toFixed(2)}M, CRE: ${calculated.cre_min}-${calculated.cre_target}-${calculated.cre_max}`);
            console.log(`   ATR: ${calculated.atr_min}-${calculated.atr_target}-${calculated.atr_max}, Tier1: ${calculated.tier1_min}-${calculated.tier1_target}-${calculated.tier1_max}, Tier2: ${calculated.tier2_min}-${calculated.tier2_target}-${calculated.tier2_max}`);
            console.log(`   Q1: ${calculated.q1_renewal_target}, Q2: ${calculated.q2_renewal_target}, Q3: ${calculated.q3_renewal_target}, Q4: ${calculated.q4_renewal_target}`);
            
            // Update config in database with account_scope filter
            // Filter out total* fields which are for UI display only, not database columns
            const { totalCRE, totalATR, totalTier1, totalTier2, totalQ1, totalQ2, totalQ3, totalQ4, ...dbFields } = calculated;
            const { error: updateError } = await supabase
              .from('assignment_configuration')
              .update(dbFields)
              .eq('build_id', buildId)
              .eq('account_scope', 'all');
            
            if (updateError) {
              console.error('[AssignmentEngine] Error updating thresholds in database:', updateError);
              throw updateError;
            }
            
            console.log('[AssignmentEngine] ✅ Balance thresholds saved to database');
            console.log('[AssignmentEngine] 📊 Multi-dimensional balance enforcement ENABLED for CRE, ATR, Tiers, and Renewals');
            
            // Merge calculated values into configData
            Object.assign(configData, calculated);
            
            toast({
              title: 'Multi-dimensional balance calculated',
              description: `Using CRE (${calculated.cre_target}), ATR ($${(calculated.atr_target/1000000).toFixed(2)}M), Tier (${calculated.tier1_target}/${calculated.tier2_target}), and Renewals`,
              duration: 5000
            });
          } else {
            throw new Error('No customer accounts or active reps found');
          }
        } catch (calcError) {
          console.error('[AssignmentEngine] ❌ Failed to auto-calculate thresholds:', calcError);
          toast({
            title: 'Warning: Balance optimization disabled',
            description: 'Could not calculate balance thresholds. Assignments will use basic ARR balancing only.',
            variant: 'destructive',
            duration: 5000
          });
        }
      }
      
      // Cast to include new LP columns (not yet in generated types)
      const config = configData as typeof configData & { optimization_model?: string };
      
      console.log(`[AssignmentEngine] ✅ Assignment configuration loaded:`, {
        customer_target_arr: configData.customer_target_arr,
        customer_max_arr: configData.customer_max_arr,
        prospect_target_arr: configData.prospect_target_arr,
        territory_mappings: configData.territory_mappings,
        optimization_model: config.optimization_model
      });
      
      // Check if Relaxed Optimization model is selected
      if (config.optimization_model === 'relaxed_optimization') {
        console.log(`[AssignmentEngine] 🧪 Using Relaxed Optimization LP Engine`);
        return await handlePureOptimization(buildId, accountType, filteredAccounts);
      }
      
      // Transform owners to match SimplifiedAssignmentEngine interface
      const repsForEngine = owners.map(owner => {
        const repAccounts = filteredAccounts.filter(
          acc => acc.owner_id === owner.rep_id || acc.new_owner_id === owner.rep_id
        );
        
        // Use getAccountARR from @/_domain (single source of truth)
        const currentARR = repAccounts.reduce((sum, acc) => sum + getAccountARR(acc), 0);
        const currentAccountCount = repAccounts.length;
        const currentCRECount = repAccounts.reduce((sum, acc) => sum + (acc.cre_count || 0), 0);
        
        return {
          id: owner.rep_id,
          rep_id: owner.rep_id,
          name: owner.name,
          region: owner.region || null,
          is_active: owner.is_active ?? true,
          is_strategic_rep: (owner as any).is_strategic_rep ?? false,
          include_in_assignments: owner.include_in_assignments ?? true,
          team_tier: (owner as any).team_tier || null,  // For team alignment
          current_arr: currentARR,
          current_accounts: currentAccountCount,
          current_cre_count: currentCRECount
        };
      });

      // Fetch opportunities for prospects to calculate Net ARR
      let opportunitiesData: Array<{sfdc_account_id: string, net_arr: number}> = [];
      if (accountType !== 'customers') {
        const { data: opps } = await supabase
          .from('opportunities')
          .select('sfdc_account_id, net_arr')
          .eq('build_id', buildId)
          .gt('net_arr', 0);
        opportunitiesData = opps || [];
        console.log(`📊 Loaded ${opportunitiesData.length} opportunities with Net ARR > 0 for prospects`);
      }

      // When generating 'all', we need to run both customer and prospect assignments
      let proposals: any[] = [];
      let warnings: any[] = [];

      if (accountType === 'all') {
        // Separate accounts into customers and prospects
        const customerAccounts = filteredAccounts.filter(a => a.is_customer);
        const prospectAccounts = filteredAccounts.filter(a => !a.is_customer);

        console.log(`[AssignmentEngine] 🔄 Generating ALL assignments:`, {
          customers: customerAccounts.length,
          prospects: prospectAccounts.length
        });

        // Generate customer assignments first (progress 10-50%)
        if (customerAccounts.length > 0) {
          setAssignmentProgress({
            stage: 'assigning',
            status: 'Generating customer assignments...',
            progress: 10,
            rulesCompleted: 0,
            totalRules: 4,
            accountsProcessed: 0,
            totalAccounts: filteredAccounts.length,
            assignmentsMade: 0,
            conflicts: 0
          });

          // Create progress callback for customer assignments (maps 0-100 to 10-50)
          const customerProgressCallback = (wp: WaterfallProgress) => {
            setAssignmentProgress(waterfallToAssignmentProgress(wp, 10, 0.4));
          };

          const customerResult = await generateSimplifiedAssignments(
            buildId,
            'customer',
            customerAccounts as any,
            repsForEngine,
            {
              ...configData,
              territory_mappings: configData.territory_mappings as Record<string, string> | null
            },
            undefined, // no opportunities for customers
            customerProgressCallback
          );
          // Use concat to avoid stack overflow with large arrays (spread operator fails at ~10k items)
          proposals = proposals.concat(customerResult.proposals);
          warnings = warnings.concat(customerResult.warnings);
          console.log(`✅ Customer assignments: ${customerResult.proposals.length} proposals`);
        }

        // Then generate prospect assignments (progress 50-90%)
        if (prospectAccounts.length > 0) {
          setAssignmentProgress({
            stage: 'assigning',
            status: 'Generating prospect assignments...',
            progress: 50,
            rulesCompleted: 2,
            totalRules: 4,
            accountsProcessed: customerAccounts.length,
            totalAccounts: filteredAccounts.length,
            assignmentsMade: proposals.length,
            conflicts: 0
          });

          // Create progress callback for prospect assignments (maps 0-100 to 50-90)
          const prospectProgressCallback = (wp: WaterfallProgress) => {
            setAssignmentProgress({
              ...waterfallToAssignmentProgress(wp, 50, 0.4),
              assignmentsMade: proposals.length + (wp.assignmentsMade || 0)
            });
          };

          const prospectResult = await generateSimplifiedAssignments(
            buildId,
            'prospect',
            prospectAccounts as any,
            repsForEngine,
            {
              ...configData,
              territory_mappings: configData.territory_mappings as Record<string, string> | null
            },
            opportunitiesData,
            prospectProgressCallback
          );
          // Use concat to avoid stack overflow with large arrays (spread operator fails at ~10k items)
          proposals = proposals.concat(prospectResult.proposals);
          warnings = warnings.concat(prospectResult.warnings);
          console.log(`✅ Prospect assignments: ${prospectResult.proposals.length} proposals`);
        }

        console.log(`✅ Total ALL assignments: ${proposals.length} proposals, ${warnings.length} warnings`);
      } else {
        // Single type generation (customers or prospects only)
        // Progress callback maps 0-100 to 10-90
        const progressCallback = (wp: WaterfallProgress) => {
          setAssignmentProgress(waterfallToAssignmentProgress(wp, 10, 0.8));
        };

        const result = await generateSimplifiedAssignments(
          buildId,
          accountType === 'customers' ? 'customer' : 'prospect',
          filteredAccounts as any,
          repsForEngine,
          {
            ...configData,
            territory_mappings: configData.territory_mappings as Record<string, string> | null
          },
          opportunitiesData,
          progressCallback
        );
        proposals = result.proposals;
        warnings = result.warnings;
      }
      
      console.log(`✅ Assignment complete: ${proposals.length} proposals, ${warnings.length} warnings`);
      
      setAssignmentProgress({
        stage: 'post-processing',
        status: 'Checking for edge cases...',
        progress: 70,
        rulesCompleted: 4,
        totalRules: 4,
        accountsProcessed: proposals.length,
        totalAccounts: filteredAccounts.length,
        assignmentsMade: proposals.length,
        conflicts: proposals.filter(p => p.warnings.length > 0).length
      });
      
      setAssignmentProgress({
        stage: 'finalizing',
        status: 'Finalizing assignments...',
        progress: 90,
        rulesCompleted: 4,
        totalRules: 4,
        accountsProcessed: proposals.length,
        totalAccounts: filteredAccounts.length,
        assignmentsMade: proposals.length,
        conflicts: proposals.filter(p => p.warnings.length > 0).length
      });
      
      // Transform proposals to match expected result format
      const result = {
        totalAccounts: filteredAccounts.length,
        assignedAccounts: proposals.length,
        unassignedAccounts: filteredAccounts.length - proposals.length,
        proposals: proposals.map(p => ({
          accountId: p.account.sfdc_account_id,
          accountName: p.account.account_name,
          currentOwnerId: p.currentOwner?.rep_id,
          currentOwnerName: p.currentOwner?.name,
          proposedOwnerId: p.proposedRep.rep_id,
          proposedOwnerName: p.proposedRep.name,
          proposedOwnerRegion: p.proposedRep.region || undefined,
          assignmentReason: p.rationale,
          warningDetails: p.warnings.length > 0 
            ? p.warnings.map(w => `${w.reason}${w.details ? `: ${w.details}` : ''}`).join('; ')
            : undefined,
          ruleApplied: p.ruleApplied,
          confidence: calculateAssignmentConfidence(p.warnings)
        })),
        conflicts: proposals.filter(p => 
          p.warnings.some(w => w.severity === 'high' || w.severity === 'medium')
        ).map(p => ({
          accountId: p.account.sfdc_account_id,
          accountName: p.account.account_name,
          currentOwnerId: p.currentOwner?.rep_id,
          currentOwnerName: p.currentOwner?.name,
          proposedOwnerId: p.proposedRep.rep_id,
          proposedOwnerName: p.proposedRep.name,
          proposedOwnerRegion: p.proposedRep.region || undefined,
          assignmentReason: p.warnings
            .filter(w => w.severity === 'high' || w.severity === 'medium')
            .map(w => `${w.reason}${w.details ? `: ${w.details}` : ''}`)
            .join('; '),
          ruleApplied: p.ruleApplied,
          confidence: calculateAssignmentConfidence(p.warnings)
        })),
        statistics: {
          totalAccounts: filteredAccounts.length,
          assignedAccounts: proposals.length,
          balanceScore: 0.85,
          avgARRPerRep: proposals.reduce((sum, p) => sum + getAccountARR(p.account), 0) / repsForEngine.length
        }
      } as AssignmentResult;
      
      toast({
        title: "Waterfall Assignments Generated",
        description: `Generated ${proposals.length} proposals using waterfall logic with ${result.conflicts.length} conflicts to review`,
      });
      
      setAssignmentResult(result);
      
      // Set progress to 100% - keep it visible until dialog closes
      // Don't clear to null here - let the UI handle the transition
      setAssignmentProgress({
        stage: 'finalizing',
        status: 'Assignment generation complete!',
        progress: 100,
        rulesCompleted: 4,
        totalRules: 4,
        accountsProcessed: proposals.length,
        totalAccounts: filteredAccounts.length,
        assignmentsMade: proposals.length,
        conflicts: proposals.filter(p => p.warnings.length > 0).length
      });
      
      return result;
    } catch (error) {
      console.error('Assignment generation error:', error);
      
      // Clear assignment result to prevent showing stale data
      setAssignmentResult(null);
      
      // Set error state in progress for visibility
      // Keep the current progress value to avoid backwards jump
      const currentProgress = assignmentProgress?.progress || 0;
      setAssignmentProgress({
        stage: 'error',
        status: `Assignment generation failed: ${error.message || 'Unknown error'}`,
        progress: currentProgress, // Preserve current progress to avoid flash to 0
        rulesCompleted: assignmentProgress?.rulesCompleted || 0,
        totalRules: assignmentProgress?.totalRules || 0,
        accountsProcessed: assignmentProgress?.accountsProcessed || 0,
        totalAccounts: assignmentProgress?.totalAccounts || 0,
        assignmentsMade: assignmentProgress?.assignmentsMade || 0,
        conflicts: assignmentProgress?.conflicts || 0,
        error: error.message || 'Unknown error occurred during assignment generation'
      });
      
      // Clear progress after 5 seconds so user can read the error
      setTimeout(() => {
        setAssignmentProgress(null);
      }, 5000);
      
      toast({
        title: "Assignment Generation Failed",
        description: error.message || "Failed to generate assignments. Please try again or check your configuration.",
        variant: "destructive"
      });
      
      // Throw error so calling code knows it failed
      throw error;
    } finally {
      setIsGenerating(false);
    }
  };

  // Main execute function - delegates to internal with imbalance check
  // Returns true if execution happened, false if blocked by imbalance warning
  const handleExecuteAssignments = async (): Promise<boolean> => {
    const result = await executeAssignmentsInternal(false);
    return result === true;
  };

  // Internal execution function that can skip the imbalance check
  // Returns true if execution succeeded, false if blocked or failed
  const executeAssignmentsInternal = async (skipImbalanceCheck: boolean = false): Promise<boolean> => {
    if (!buildId || !assignmentResult) {
      console.warn('[Assignment Execute] ❌ Missing buildId or assignmentResult');
      return false;
    }

    // Set executing state IMMEDIATELY for responsive UI feedback
    setIsExecuting(true);

    // Phase 3: Balance Verification Pre-flight Check - show warning toast but proceed anyway
    if (!skipImbalanceCheck) {
      const proposals = assignmentResult.proposals;
      const repARRMap = new Map<string, number>();
      
      // Check for orphaned proposals (owner_ids not in sales_reps)
      const validRepIds = new Set(owners.map(o => o.rep_id));
      const orphanedProposals = proposals.filter(p => p.proposedOwnerId && !validRepIds.has(p.proposedOwnerId));
      if (orphanedProposals.length > 0) {
        console.warn(`[Imbalance Check] ${orphanedProposals.length} proposals have owner_ids not in sales_reps:`, 
          orphanedProposals.slice(0, 5).map(p => ({ accountId: p.accountId, proposedOwnerId: p.proposedOwnerId }))
        );
      }
      
      // Calculate ARR per rep (only for valid reps to avoid "Unknown" in warning)
      proposals.forEach(p => {
        // Skip orphaned proposals from ARR calculation to avoid "Unknown" rep warning
        if (!validRepIds.has(p.proposedOwnerId)) return;
        
        const current = repARRMap.get(p.proposedOwnerId) || 0;
        const account = accounts.find(a => a.sfdc_account_id === p.accountId);
        // Use getAccountARR from @/_domain (single source of truth)
        const arr = account ? getAccountARR(account) : 0;
        repARRMap.set(p.proposedOwnerId, current + arr);
      });
      
      const arrValues = Array.from(repARRMap.values());
      if (arrValues.length > 0) {
        const totalARR = arrValues.reduce((sum, arr) => sum + arr, 0);
        const avgARR = totalARR / arrValues.length;
        const maxARR = Math.max(...arrValues);
        const maxRepEntry = Array.from(repARRMap.entries()).find(([_, arr]) => arr === maxARR);
        const maxRepName = owners.find(o => o.rep_id === maxRepEntry?.[0])?.name || 'Unknown';
        
        // Previously showed imbalance warning here - removed as it adds noise without blocking action
      }
    }

    try {
      const proposalCount = assignmentResult.proposals.length;
      console.log('[Assignment Execute] 🚀 Starting execution for', proposalCount, 'proposals');
      console.log('[Assignment Execute] 📋 Execution Details:', {
        buildId,
        proposalCount,
        hasConflicts: assignmentResult.conflicts?.length > 0,
        conflictCount: assignmentResult.conflicts?.length || 0,
        sampleProposal: assignmentResult.proposals[0],
        timestamp: new Date().toISOString()
      });
      
      // Deduplicate proposals by accountId to prevent constraint violations
      const uniqueProposals = Array.from(
        new Map(assignmentResult.proposals.map(p => [p.accountId, p])).values()
      );
      
      if (uniqueProposals.length < assignmentResult.proposals.length) {
        console.warn(`[Assignment Execute] ⚠️ Deduplicated ${assignmentResult.proposals.length - uniqueProposals.length} duplicate proposals`);
      }
      
      // Execute assignments to update new_owner_* fields in database (using legacy service)
      console.log('[Assignment Execute] 🔄 Calling assignment service...');
      
      try {
        await assignmentService.executeAssignments(buildId, uniqueProposals);
        console.log('[Assignment Execute] ✅ Assignment service completed');
      } catch (execError: any) {
        console.error('[Assignment Execute] ❌ Detailed execution error:', {
          message: execError.message,
          code: execError.code,
          details: execError.details,
          hint: execError.hint,
          stack: execError.stack
        });
        
        // Provide specific error message based on error type
        let errorMessage = 'Failed to apply assignments. ';
        if (execError.code === '23505') {
          errorMessage += 'Duplicate assignment detected. Please try regenerating assignments.';
        } else if (execError.message?.includes('timeout')) {
          errorMessage += 'Database operation timed out. Please try again.';
        } else {
          errorMessage += execError.message || 'Unknown database error.';
        }
        
        throw new Error(errorMessage);
      }
      
      // Verify database updates with sample check
      try {
        const { data: sampleUpdates } = await supabase
          .from('accounts')
          .select('sfdc_account_id, new_owner_id, new_owner_name')
          .eq('build_id', buildId)
          .in('sfdc_account_id', uniqueProposals.slice(0, 3).map(p => p.accountId));
        
        console.log('[Assignment Execute] 📊 Database Update Verification:', {
          sampleUpdates,
          expectedUpdates: uniqueProposals.slice(0, 3).map(p => ({
            accountId: p.accountId,
            expectedOwnerId: p.proposedOwnerId,
            expectedOwnerName: p.proposedOwnerName
          }))
        });
      } catch (error) {
        console.warn('[Assignment Execute] ⚠️ Could not verify database updates:', error);
      }
      
      // Clear service cache and comprehensive data refresh
      console.log('[Assignment Execute] 🗑️ Invalidating all build data caches...');
      invalidateBuildData(buildId);
      
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['build-assignment-reasons', buildId] });
      queryClient.invalidateQueries({ queryKey: ['enhanced-balancing', buildId] });
      queryClient.invalidateQueries({ queryKey: ['workload-balance', buildId] });
      
      console.log('[Assignment Execute] 🔄 Refreshing accounts data...');
      await refetchAccounts();
      
      // Small delay to ensure data propagation
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Note: Success dialog is shown by AssignmentEngine.tsx, not a toast here
      // This avoids duplicate notifications
      
      // Clear assignment result after successful execution and refresh
      console.log('[Assignment Execute] 🧹 Clearing assignment result after successful execution');
      setAssignmentResult(null);
      console.log('[Assignment Execute] 🎉 Execution completed successfully');
      return true;
    } catch (error: any) {
      console.error('Assignment execution error:', error);
      toast({
        title: "Assignment Execution Failed",
        description: error.message || "There was an error applying the assignments. Check console for details.",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsExecuting(false);
    }
  };

  // Function to get assignment reasons from database
  const getAssignmentReasons = async (buildId: string): Promise<AssignmentReason[]> => {
    try {
      const { data, error } = await supabase
        .from('assignments')
        .select('sfdc_account_id, rationale')
        .eq('build_id', buildId);

      if (error) {
        console.error('Error fetching assignment reasons:', error);
        return [];
      }

      return data?.map(item => ({
        accountId: item.sfdc_account_id,
        reason: item.rationale || ''
      })) || [];
    } catch (error) {
      console.error('Error in getAssignmentReasons:', error);
      return [];
    }
  };

  // Convert assignment progress to dialog format
  const getProgressDialogData = () => {
    if (!assignmentProgress) {
      return {
        isRunning: isGenerating,
        progress: 0,
        status: 'Ready to generate assignments',
        stages: createAssignmentStages('generation')
      };
    }
    
    const stages = createAssignmentStages('generation');
    
    // Update stages based on current progress
    stages.forEach(stage => {
      stage.isActive = false;
      stage.isCompleted = false;
      stage.progress = 0;
    });
    
    // Map progress stage to dialog stages
    const stageMap = {
      'loading': 0,
      'analyzing': 1,
      'applying': 2,
      'finalizing': 3
    };
    
    const currentStageIndex = stageMap[assignmentProgress.stage] || 0;
    
    stages.forEach((stage, index) => {
      if (index < currentStageIndex) {
        stage.isCompleted = true;
        stage.progress = 100;
      } else if (index === currentStageIndex) {
        stage.isActive = true;
        stage.progress = assignmentProgress.progress;
      }
    });
    
    // Update current stage description with rule info
    if (assignmentProgress.currentRule && currentStageIndex === 2) {
      stages[2].description = `Applying ${assignmentProgress.currentRule} rule (${assignmentProgress.rulesCompleted}/${assignmentProgress.totalRules})`;
    }
    
    return {
      isRunning: isGenerating,
      progress: assignmentProgress.progress,
      status: assignmentProgress.status,
      stages,
      accountsProcessed: assignmentProgress.accountsProcessed,
      totalAccounts: assignmentProgress.totalAccounts,
      assignmentsMade: assignmentProgress.assignmentsMade,
      conflicts: assignmentProgress.conflicts,
      rulesCompleted: assignmentProgress.rulesCompleted,
      totalRules: assignmentProgress.totalRules,
      stage: assignmentProgress.stage,
      error: assignmentProgress.error
    };
  };

  // Handle Pure Optimization LP Engine with waterfall fallback
  const handlePureOptimization = async (
    buildId: string,
    accountType: 'customers' | 'prospects' | 'all',
    filteredAccounts: Account[]
  ): Promise<AssignmentResult> => {
    console.log(`[PureOptimization] Starting LP optimization for ${accountType}...`);

    // Map accountType to LP engine format
    const lpAccountType = accountType === 'customers' ? 'customer' : 'prospect';

    // Track batch info for progress calculation
    let currentBatch = 0;
    let totalBatches = accountType === 'all' ? 2 : 1; // customers + prospects = 2 batches
    
    // Progress callback to update UI with batch-aware progress
    const onLPProgress = (progress: LPProgress) => {
      // Scale progress within batch: each batch gets 0-50% of total progress
      // Batch 1 (customers): 0-50%, Batch 2 (prospects): 50-100%
      const batchProgressRange = 100 / totalBatches;
      const scaledProgress = (currentBatch * batchProgressRange) + (progress.progress * batchProgressRange / 100);
      
      setAssignmentProgress({
        stage: progress.stage === 'solving' ? 'analyzing' :
               progress.stage === 'postprocessing' ? 'finalizing' :
               progress.stage as any,
        status: totalBatches > 1 
          ? `[${currentBatch + 1}/${totalBatches}] ${progress.status}`
          : progress.status,
        progress: Math.round(scaledProgress),
        rulesCompleted: currentBatch,
        totalRules: totalBatches,
        accountsProcessed: progress.accountsProcessed || 0,
        totalAccounts: progress.totalAccounts || filteredAccounts.length,
        assignmentsMade: 0,
        conflicts: 0
      });
    };
    
    // Helper to advance to next batch
    const advanceBatch = () => {
      currentBatch++;
    };

    let allProposals: LPSolveResult['proposals'] = [];
    let allWarnings: string[] = [];
    let combinedMetrics: LPSolveResult['metrics'] | null = null;
    let usedFallback = false;

    // Helper to run LP with waterfall fallback
    const runLPWithFallback = async (
      type: 'customer' | 'prospect',
      accountsForType: Account[]
    ): Promise<{ proposals: LPSolveResult['proposals']; warnings: string[]; metrics: LPSolveResult['metrics'] | null; usedFallback: boolean }> => {
      try {
        const result = await runPureOptimization(buildId, type, onLPProgress);

        if (result.success) {
          return { proposals: result.proposals, warnings: result.warnings, metrics: result.metrics, usedFallback: false };
        }

        // LP failed or returned error - fall back to waterfall
        console.warn(`[PureOptimization] LP ${type} failed: ${result.error}, falling back to waterfall`);
      } catch (lpError: any) {
        console.warn(`[PureOptimization] LP ${type} threw exception: ${lpError.message}, falling back to waterfall`);
      }

      // Waterfall fallback
      console.log(`[PureOptimization] Running waterfall fallback for ${type}...`);
      setAssignmentProgress({
        stage: 'analyzing',
        status: `LP solver failed, using waterfall fallback for ${type}s...`,
        progress: 50,
        rulesCompleted: 0,
        totalRules: 4,
        accountsProcessed: 0,
        totalAccounts: accountsForType.length,
        assignmentsMade: 0,
        conflicts: 0
      });

      // Fetch config for waterfall
      const { data: configData } = await supabase
        .from('assignment_configuration')
        .select('*')
        .eq('build_id', buildId)
        .eq('account_scope', 'all')
        .maybeSingle();

      if (!configData) {
        throw new Error('Assignment configuration not found for waterfall fallback');
      }

      // Transform owners for waterfall engine
      const repsForEngine = owners.map(owner => {
        const repAccounts = accountsForType.filter(
          acc => acc.owner_id === owner.rep_id || acc.new_owner_id === owner.rep_id
        );
        const currentARR = repAccounts.reduce((sum, acc) => sum + getAccountARR(acc), 0);
        return {
          id: owner.rep_id,
          rep_id: owner.rep_id,
          name: owner.name,
          region: owner.region || null,
          is_active: owner.is_active ?? true,
          is_strategic_rep: (owner as any).is_strategic_rep ?? false,
          include_in_assignments: owner.include_in_assignments ?? true,
          team_tier: (owner as any).team_tier || null,
          current_arr: currentARR,
          current_accounts: repAccounts.length,
          current_cre_count: repAccounts.reduce((sum, acc) => sum + (acc.cre_count || 0), 0)
        };
      });

      // Run waterfall engine with progress callback
      const waterfallProgressCallback = (wp: WaterfallProgress) => {
        setAssignmentProgress(waterfallToAssignmentProgress(wp, 10, 0.8));
      };

      const waterfallResult = await generateSimplifiedAssignments(
        buildId,
        type,
        accountsForType as any,
        repsForEngine,
        { ...configData, territory_mappings: configData.territory_mappings as Record<string, string> | null },
        undefined, // opportunities
        waterfallProgressCallback
      );

      // Transform waterfall proposals to LP format
      const lpStyleProposals: LPSolveResult['proposals'] = waterfallResult.proposals.map(p => ({
        accountId: p.account.sfdc_account_id,
        accountName: p.account.account_name,
        repId: p.proposedRep.rep_id,
        repName: p.proposedRep.name,
        repRegion: p.proposedRep.region || '',
        scores: { continuity: 0, geography: 0, teamAlignment: null, tieBreaker: 0 },
        totalScore: 0.5,
        lockResult: null,
        rationale: `${p.ruleApplied} (Waterfall Fallback)`,
        isStrategicPreAssignment: false,
        childIds: []
      }));

      return {
        proposals: lpStyleProposals,
        warnings: [`Used waterfall fallback for ${type} optimization (LP solver unavailable)`],
        metrics: null,
        usedFallback: true
      };
    };

    if (accountType === 'all') {
      // Run both customer and prospect solves with fallback
      const customerAccounts = filteredAccounts.filter(a => a.is_customer);
      const prospectAccounts = filteredAccounts.filter(a => !a.is_customer);

      console.log(`[PureOptimization] Running customer solve (batch 1/${totalBatches})...`);
      const customerResult = await runLPWithFallback('customer', customerAccounts);
      // Use concat to avoid stack overflow with large arrays
      allProposals = allProposals.concat(customerResult.proposals);
      allWarnings = allWarnings.concat(customerResult.warnings);
      combinedMetrics = customerResult.metrics;
      if (customerResult.usedFallback) usedFallback = true;

      // Advance to next batch before prospect solve
      advanceBatch();
      
      console.log(`[PureOptimization] Running prospect solve (batch 2/${totalBatches})...`);
      const prospectResult = await runLPWithFallback('prospect', prospectAccounts);
      // Use concat to avoid stack overflow with large arrays
      allProposals = allProposals.concat(prospectResult.proposals);
      allWarnings = allWarnings.concat(prospectResult.warnings);
      if (prospectResult.usedFallback) usedFallback = true;

      console.log(`[PureOptimization] Combined: ${allProposals.length} proposals`);
    } else {
      // Single type with fallback
      const accountsForType = accountType === 'customers'
        ? filteredAccounts.filter(a => a.is_customer)
        : filteredAccounts.filter(a => !a.is_customer);

      const result = await runLPWithFallback(lpAccountType, accountsForType);
      allProposals = result.proposals;
      allWarnings = result.warnings;
      combinedMetrics = result.metrics;
      usedFallback = result.usedFallback;
    }
    
    // Transform LP proposals to AssignmentResult format
    const originalOwners = new Map(filteredAccounts.map(a => [a.sfdc_account_id, a.owner_id]));
    
    const result: AssignmentResult = {
      totalAccounts: filteredAccounts.length,
      assignedAccounts: allProposals.length,
      unassignedAccounts: filteredAccounts.length - allProposals.length,
      proposals: allProposals.map(p => ({
        accountId: p.accountId,
        accountName: p.accountName,
        currentOwnerId: originalOwners.get(p.accountId) || undefined,
        currentOwnerName: undefined, // Not tracked in LP proposals
        proposedOwnerId: p.repId,
        proposedOwnerName: p.repName,
        proposedOwnerRegion: p.repRegion || undefined,
        assignmentReason: p.rationale,
        ruleApplied: extractPriorityCode(p.rationale),
        // Low score = low confidence, high score = high confidence
        confidence: p.totalScore < 0.3 ? 'MEDIUM' as const : 'HIGH' as const
      })),
      conflicts: allProposals
        .filter(p => p.totalScore < 0.3 || allWarnings.length > 0)
        .map(p => ({
          accountId: p.accountId,
          accountName: p.accountName,
          currentOwnerId: originalOwners.get(p.accountId) || undefined,
          currentOwnerName: undefined,
          proposedOwnerId: p.repId,
          proposedOwnerName: p.repName,
          proposedOwnerRegion: p.repRegion || undefined,
          assignmentReason: p.rationale,
          ruleApplied: extractPriorityCode(p.rationale),
          confidence: 'MEDIUM' as const
        })),
      statistics: {
        totalAccounts: filteredAccounts.length,
        assignedAccounts: allProposals.length,
        balanceScore: combinedMetrics ? 1 - (combinedMetrics.arr_variance_percent / 100) : 0.85,
        avgARRPerRep: combinedMetrics ? 
          allProposals.reduce((sum, p) => {
            const account = filteredAccounts.find(a => a.sfdc_account_id === p.accountId);
            return sum + (account ? getAccountARR(account) : 0);
          }, 0) / (combinedMetrics.total_reps || 1) : 0
      }
    };
    
    // Show appropriate toast based on method used
    if (usedFallback) {
      toast({
        title: "Assignments Generated (Waterfall Fallback)",
        description: `Generated ${allProposals.length} assignments using waterfall logic (LP solver was unavailable)`,
        variant: "default",
      });
    } else {
      toast({
        title: "LP Optimization Complete",
        description: `Generated ${allProposals.length} assignments (${combinedMetrics?.continuity_rate.toFixed(0)}% continuity, ${combinedMetrics?.arr_variance_percent.toFixed(1)}% variance)`,
      });
    }

    // Show warnings if any (excluding fallback warning which is already shown in toast)
    const nonFallbackWarnings = allWarnings.filter(w => !w.includes('waterfall fallback'));
    if (nonFallbackWarnings.length > 0) {
      console.warn(`[PureOptimization] Warnings:`, nonFallbackWarnings);
      toast({
        title: "Optimization Warnings",
        description: nonFallbackWarnings.slice(0, 2).join('; '),
        variant: "default",
      });
    }
    
    setAssignmentResult(result);
    
    // Set progress to 100% complete - don't clear to null, let UI handle transition
    setAssignmentProgress({
      stage: 'finalizing',
      status: 'Optimization complete!',
      progress: 100,
      rulesCompleted: 4,
      totalRules: 4,
      accountsProcessed: allProposals.length,
      totalAccounts: filteredAccounts.length,
      assignmentsMade: allProposals.length,
      conflicts: 0
    });
    
    return result;
  };

  // Handle imbalance warning confirmation - proceed with execution
  // Returns true if execution succeeded, false if it failed
  const handleImbalanceConfirm = async (): Promise<boolean> => {
    setImbalanceWarning(null);
    // Re-run execution without the imbalance check (force flag)
    const result = await executeAssignmentsInternal(true);
    return result === true;
  };

  // Handle imbalance warning cancellation
  const handleImbalanceDismiss = () => {
    setImbalanceWarning(null);
    toast({
      title: "Assignment Paused",
      description: "Adjust your assignment configuration and regenerate to achieve better balance.",
    });
  };

  // Cancel the current generation process
  const cancelGeneration = () => {
    // Note: Cannot cancel in-flight LP solver - this resets UI state only
    setIsGenerating(false);
    setAssignmentProgress(null);
    toast({
      title: "Generation Stopped",
      description: "UI reset. Note: Any in-flight solver will complete in background.",
    });
  };

  return {
    accounts,
    customerAccounts,
    prospectAccounts,
    owners,
    assignmentResult,
    assignmentReasons,
    isGenerating,
    accountsLoading,
    ownersLoading,
    accountsError,
    handleGenerateAssignments,
    handleExecuteAssignments,
    cancelGeneration,
    refetchAccounts,
    refreshData,
    getAssignmentReasons,
    isExecuting,
    assignmentProgress: getProgressDialogData(),
    // Imbalance warning state and handlers
    imbalanceWarning,
    handleImbalanceConfirm,
    handleImbalanceDismiss
  };
};