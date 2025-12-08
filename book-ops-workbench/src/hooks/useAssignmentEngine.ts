import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { assignmentService } from '@/services/assignmentService';
import { EnhancedAssignmentService } from '@/services/enhancedAssignmentService';
import { RebalancingAssignmentService } from '@/services/rebalancingAssignmentService';
import { generateSimplifiedAssignments } from '@/services/simplifiedAssignmentEngine';
import { buildDataService } from '@/services/buildDataService';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useInvalidateBuildData } from '@/hooks/useBuildData';
import type { AssignmentResult, AssignmentProgress } from '@/services/rebalancingAssignmentService';
import { createAssignmentStages } from '@/components/AssignmentProgressDialog';

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
      
      console.log(`[AssignmentEngine] 📊 Starting PARALLEL paginated query for build ${buildId}...`);
      
      // Get total count first
      const { count } = await supabase
        .from('accounts')
        .select('*', { count: 'exact', head: true })
        .eq('build_id', buildId)
        .eq('is_parent', true);
      
      console.log(`[AssignmentEngine] 📋 Total records available: ${count}`);
      
      // If no records, return early
      if (!count || count === 0) {
        console.warn('[AssignmentEngine] ⚠️ No accounts found in count query');
        return [];
      }
      
      // PARALLEL FETCH: Calculate all page ranges upfront, then fetch concurrently
      const pageSize = 1000;
      const totalPages = Math.ceil(count / pageSize);
      
      console.log(`[AssignmentEngine] 🚀 Fetching ${totalPages} pages in parallel...`);
      
      const pagePromises = Array.from({ length: totalPages }, (_, pageIndex) => {
        const from = pageIndex * pageSize;
        const to = Math.min((pageIndex + 1) * pageSize - 1, count - 1);
        
        return supabase
          .from('accounts')
          .select('*')
          .eq('build_id', buildId)
          .eq('is_parent', true)
          .order('account_name')
          .range(from, to)
          .then(({ data: pageData, error }) => {
            if (error) {
              console.error(`[AssignmentEngine] ❌ Error loading page ${pageIndex + 1}:`, error);
              throw error;
            }
            console.log(`[AssignmentEngine] 📄 Loaded page ${pageIndex + 1}: ${pageData?.length || 0} records`);
            return (pageData || []) as Account[];
          });
      });
      
      // Wait for all pages to load in parallel
      const allPages = await Promise.all(pagePromises);
      const data = allPages.flat();
      
      console.log(`[AssignmentEngine] 📈 Parallel Fetch Results:`, {
        totalPages,
        totalRecords: data.length,
        expectedCount: count,
        buildId,
        sampleAccount: data?.[0] ? { 
          id: data[0].sfdc_account_id, 
          name: data[0].account_name 
        } : null
      });

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
  // Uses is_customer field from database (synced based on hierarchy_bookings_arr_converted > 0)
  const customerAccounts = (accounts as Account[]).filter(account => account.is_customer === true);
  const prospectAccounts = (accounts as Account[]).filter(account => account.is_customer !== true);

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
      
      console.log(`[AssignmentEngine] ✅ Assignment configuration loaded:`, {
        customer_target_arr: configData.customer_target_arr,
        customer_max_arr: configData.customer_max_arr,
        prospect_target_arr: configData.prospect_target_arr,
        territory_mappings: configData.territory_mappings
      });
      
      // Transform owners to match SimplifiedAssignmentEngine interface
      const repsForEngine = owners.map(owner => {
        const repAccounts = filteredAccounts.filter(
          acc => acc.owner_id === owner.rep_id || acc.new_owner_id === owner.rep_id
        );
        
        const currentARR = repAccounts.reduce((sum, acc) => 
          sum + (acc.calculated_arr || acc.arr || 0), 0
        );
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

        // Generate customer assignments first
        if (customerAccounts.length > 0) {
          setAssignmentProgress({
            stage: 'scoring',
            status: 'Generating customer assignments...',
            progress: 30,
            rulesCompleted: 0,
            totalRules: 4,
            accountsProcessed: 0,
            totalAccounts: filteredAccounts.length,
            assignmentsMade: 0,
            conflicts: 0
          });

          const customerResult = await generateSimplifiedAssignments(
            buildId,
            'customer',
            customerAccounts as any,
            repsForEngine,
            {
              ...configData,
              territory_mappings: configData.territory_mappings as Record<string, string> | null
            }
          );
          proposals.push(...customerResult.proposals);
          warnings.push(...customerResult.warnings);
          console.log(`✅ Customer assignments: ${customerResult.proposals.length} proposals`);
        }

        // Then generate prospect assignments
        if (prospectAccounts.length > 0) {
          setAssignmentProgress({
            stage: 'scoring',
            status: 'Generating prospect assignments...',
            progress: 55,
            rulesCompleted: 2,
            totalRules: 4,
            accountsProcessed: customerAccounts.length,
            totalAccounts: filteredAccounts.length,
            assignmentsMade: proposals.length,
            conflicts: 0
          });

          const prospectResult = await generateSimplifiedAssignments(
            buildId,
            'prospect',
            prospectAccounts as any,
            repsForEngine,
            {
              ...configData,
              territory_mappings: configData.territory_mappings as Record<string, string> | null
            },
            opportunitiesData
          );
          proposals.push(...prospectResult.proposals);
          warnings.push(...prospectResult.warnings);
          console.log(`✅ Prospect assignments: ${prospectResult.proposals.length} proposals`);
        }

        console.log(`✅ Total ALL assignments: ${proposals.length} proposals, ${warnings.length} warnings`);
      } else {
        // Single type generation (customers or prospects only)
        const result = await generateSimplifiedAssignments(
          buildId,
          accountType === 'customers' ? 'customer' : 'prospect',
          filteredAccounts as any,
          repsForEngine,
          {
            ...configData,
            territory_mappings: configData.territory_mappings as Record<string, string> | null
          },
          opportunitiesData
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
          assignmentReason: p.warnings.length > 0 
            ? p.warnings.map(w => `${w.reason}${w.details ? `: ${w.details}` : ''}`).join('; ')
            : p.rationale,
          ruleApplied: p.ruleApplied,
          conflictRisk: p.warnings.some(w => w.severity === 'high') ? 'HIGH' : 
                        p.warnings.some(w => w.severity === 'medium') ? 'MEDIUM' : 'LOW'
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
          conflictRisk: p.warnings.some(w => w.severity === 'high') ? 'HIGH' as const : 'MEDIUM' as const
        })),
        statistics: {
          totalAccounts: filteredAccounts.length,
          assignedAccounts: proposals.length,
          balanceScore: 0.85,
          avgARRPerRep: proposals.reduce((sum, p) => sum + (p.account.calculated_arr || p.account.arr), 0) / repsForEngine.length
        }
      } as AssignmentResult;
      
      toast({
        title: "Waterfall Assignments Generated",
        description: `Generated ${proposals.length} proposals using waterfall logic with ${result.conflicts.length} conflicts to review`,
      });
      
      setAssignmentResult(result);
      
      // Clear progress after completion
      setAssignmentProgress(null);
      
      return result;
    } catch (error) {
      console.error('Assignment generation error:', error);
      
      // Clear assignment result to prevent showing stale data
      setAssignmentResult(null);
      
      // Set error state in progress for visibility
      setAssignmentProgress({
        stage: 'error',
        status: `Assignment generation failed: ${error.message || 'Unknown error'}`,
        progress: 0,
        rulesCompleted: 0,
        totalRules: 0,
        accountsProcessed: 0,
        totalAccounts: 0,
        assignmentsMade: 0,
        conflicts: 0,
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

    // Phase 3: Balance Verification Pre-flight Check (unless skipping)
    if (!skipImbalanceCheck) {
      const proposals = assignmentResult.proposals;
      const repARRMap = new Map<string, number>();
      
      // Calculate ARR per rep
      proposals.forEach(p => {
        const current = repARRMap.get(p.proposedOwnerId) || 0;
        const accountARR = accounts.find(a => a.sfdc_account_id === p.accountId);
        const arr = accountARR?.calculated_arr || accountARR?.arr || 0;
        repARRMap.set(p.proposedOwnerId, current + arr);
      });
      
      const arrValues = Array.from(repARRMap.values());
      const totalARR = arrValues.reduce((sum, arr) => sum + arr, 0);
      const avgARR = totalARR / arrValues.length;
      const maxARR = Math.max(...arrValues);
      const maxRepEntry = Array.from(repARRMap.entries()).find(([_, arr]) => arr === maxARR);
      const maxRepName = owners.find(o => o.rep_id === maxRepEntry?.[0])?.name || 'Unknown';
      
      // Check if any rep is >30% over target - show proper UI dialog
      if (maxARR / avgARR > 1.3) {
        setImbalanceWarning({
          show: true,
          repName: maxRepName,
          repARR: maxARR,
          targetARR: avgARR,
          overloadPercent: Math.round((maxARR / avgARR - 1) * 100)
        });
        return false; // Execution blocked - wait for user confirmation via the dialog
      }
    }

    setIsExecuting(true);
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
      error: assignmentProgress.error
    };
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