import { supabase } from '@/integrations/supabase/client';

export interface ProblemRep {
  repId: string;
  repName: string;
  region: string;
  currentARR: number;
  currentAccounts: number;
  deficit: number;
}

export interface OptimizationSuggestion {
  accountId: string;
  accountName: string;
  accountARR: number;
  fromRepId: string;
  fromRepName: string;
  toRepId: string;
  toRepName: string;
  reasoning: string;
  priority: number;
}

export interface OptimizationResult {
  suggestions: OptimizationSuggestion[];
  problemReps: ProblemRep[];
  aiReasoning: string;
}

export class AIBalancingOptimizer {
  /**
   * Fetch AI Balancer rule configuration for a build
   */
  static async getAIBalancerConfig(buildId: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('assignment_rules')
        .select('*')
        .eq('build_id', buildId)
        .eq('rule_type', 'AI_BALANCER')
        .eq('enabled', true)
        .order('priority', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        console.log('[AIBalancingOptimizer] No AI Balancer rule found, using defaults');
        return {
          minARRThreshold: 1000000,
          maxARRThreshold: 3000000,
          targetVariance: 15,
          mustStayInRegion: true,
          maintainContinuity: true,
          maxMovesPerRep: 5,
          maxTotalMoves: 20,
        };
      }

      console.log('[AIBalancingOptimizer] Using AI Balancer config:', data.conditions);
      return data.conditions;
    } catch (err) {
      console.error('[AIBalancingOptimizer] Error fetching config:', err);
      return {
        minARRThreshold: 1000000,
        maxARRThreshold: 3000000,
        targetVariance: 15,
        mustStayInRegion: true,
        maintainContinuity: true,
        maxMovesPerRep: 5,
        maxTotalMoves: 20,
      };
    }
  }

  /**
   * Quick health check to determine if AI optimization is needed (now async)
   */
  static async checkBalanceHealth(
    buildId: string,
    assignments: any[],
    salesReps: any[],
    accounts: any[]
  ): Promise<{ needsOptimization: boolean; problemReps: ProblemRep[] }> {
    const config = await this.getAIBalancerConfig(buildId);
    const problemReps = this.analyzeWorkloadImbalance(assignments, salesReps, accounts, config.minARRThreshold);
    return {
      needsOptimization: problemReps.length > 0,
      problemReps
    };
  }

  static analyzeWorkloadImbalance(
    assignments: any[],
    salesReps: any[],
    accounts: any[],
    minARRThreshold: number = 1000000
  ): ProblemRep[] {
    const repWorkloads = salesReps.map(rep => {
      const repAssignments = assignments.filter(a => a.new_owner_id === rep.rep_id);
      const totalARR = repAssignments.reduce((sum, a) => {
        const account = accounts.find(acc => acc.sfdc_account_id === a.sfdc_account_id);
        // Use hierarchy_bookings_arr_converted for customer ARR (primary), fallback to calculated_arr, then arr
        return sum + (account?.hierarchy_bookings_arr_converted || account?.calculated_arr || account?.arr || 0);
      }, 0);
      
      return {
        repId: rep.rep_id,
        repName: rep.name,
        region: rep.region,
        currentARR: totalARR,
        currentAccounts: repAssignments.length,
        deficit: Math.max(0, minARRThreshold - totalARR)
      };
    });
    
    return repWorkloads
      .filter(w => w.currentARR < minARRThreshold)
      .sort((a, b) => a.currentARR - b.currentARR);
  }
  
  /**
   * Generate full assignment for all accounts using AI (PRIMARY_ASSIGNER mode)
   */
  static async generateFullAssignment(
    buildId: string,
    accounts: any[],
    salesReps: any[],
    configOverride?: any
  ): Promise<any[]> {
    const defaultConfig = await this.getAIBalancerConfig(buildId);
    const config = configOverride || defaultConfig;
    console.log('[AIBalancingOptimizer] Generating full assignment with config:', config);

    // Prepare accounts data for AI
    const allAccounts = accounts.map(acc => ({
      accountId: acc.sfdc_account_id,
      accountName: acc.account_name,
      arr: acc.calculated_arr || acc.arr || 0,
      creCount: acc.cre_count || 0,
      territory: acc.sales_territory || acc.geo,
      region: acc.geo,
      currentOwner: acc.owner_name,
      currentOwnerId: acc.owner_id
    }));

    // Prepare rep workloads
    const repWorkloads = salesReps.map(rep => ({
      repId: rep.rep_id,
      repName: rep.name,
      region: rep.region,
      currentARR: 0,
      accountCount: 0
    }));

    console.log('[AIBalancingOptimizer] Full assignment request:', {
      accountsCount: allAccounts.length,
      repsCount: repWorkloads.length,
      totalARR: allAccounts.reduce((sum, a) => sum + a.arr, 0),
      avgARRPerRep: allAccounts.reduce((sum, a) => sum + a.arr, 0) / repWorkloads.length
    });

    const { data, error } = await supabase.functions.invoke('optimize-balancing', {
      body: {
        buildId,
        config: {
          ...config,
          assignmentMode: 'FULL_ASSIGNMENT'
        },
        assignmentMode: 'FULL_ASSIGNMENT',
        allAccounts,
        repWorkloads
      }
    });

    if (error) {
      console.error('[AIBalancingOptimizer] Full assignment error:', error);
      throw new Error(`AI full assignment failed: ${error.message}`);
    }

    console.log('[AIBalancingOptimizer] Full assignment response:', {
      assignmentsCount: data.assignments?.length || 0,
      mode: data.mode
    });

    return data.assignments || [];
  }

  /**
   * Generate rebalancing suggestions for existing assignments (REBALANCING mode)
   */
  static async generateOptimizations(
    buildId: string,
    problemReps: ProblemRep[]
  ): Promise<OptimizationResult> {
    // Fetch AI Balancer configuration
    const config = await this.getAIBalancerConfig(buildId);
    console.log('[AIBalancingOptimizer] Using config for optimization:', config);

    const { data: accounts } = await supabase
      .from('accounts')
      .select('*')
      .eq('build_id', buildId)
      .eq('is_parent', true)
      .eq('is_customer', true);
    
    const { data: salesReps } = await supabase
      .from('sales_reps')
      .select('*')
      .eq('build_id', buildId)
      .eq('is_active', true);
    
    const { data: assignments } = await supabase
      .from('accounts')
      .select('sfdc_account_id, new_owner_id, new_owner_name, account_name, calculated_arr, sales_territory, geo')
      .eq('build_id', buildId)
      .not('new_owner_id', 'is', null);
    
    const repWorkloads = salesReps?.map(rep => {
      const repAccounts = assignments?.filter(a => a.new_owner_id === rep.rep_id) || [];
      const totalARR = repAccounts.reduce((sum, a) => sum + (a.calculated_arr || 0), 0);
      
      return {
        repId: rep.rep_id,
        repName: rep.name,
        region: rep.region,
        currentARR: totalARR,
        accountCount: repAccounts.length,
        accounts: repAccounts.slice(0, 20).map(a => ({
          id: a.sfdc_account_id,
          name: a.account_name,
          arr: a.calculated_arr,
          territory: a.sales_territory || a.geo
        }))
      };
    }) || [];
    
    const { data, error } = await supabase.functions.invoke('optimize-balancing', {
      body: {
        problemReps,
        repWorkloads,
        buildId,
        config, // Pass configuration to edge function
        assignmentMode: 'REBALANCING'
      }
    });
    
    if (error) {
      console.error('AI optimization error:', error);
      throw new Error(`AI optimization failed: ${error.message}`);
    }
    
    return data as OptimizationResult;
  }
  
  static async applyOptimizations(
    buildId: string,
    suggestions: OptimizationSuggestion[]
  ): Promise<{ success: boolean; applied: number }> {
    let applied = 0;
    
    for (const suggestion of suggestions) {
      try {
        const { error: accountError } = await supabase
          .from('accounts')
          .update({
            new_owner_id: suggestion.toRepId,
            new_owner_name: suggestion.toRepName
          })
          .eq('build_id', buildId)
          .eq('sfdc_account_id', suggestion.accountId);
        
        if (accountError) {
          console.error(`Failed to update account ${suggestion.accountId}:`, accountError);
          continue;
        }
        
        // Delete existing assignment first, then insert
        await supabase
          .from('assignments')
          .delete()
          .eq('build_id', buildId)
          .eq('sfdc_account_id', suggestion.accountId);
        
        const { error: assignmentError } = await supabase
          .from('assignments')
          .insert({
            build_id: buildId,
            sfdc_account_id: suggestion.accountId,
            proposed_owner_id: suggestion.toRepId,
            proposed_owner_name: suggestion.toRepName,
            assignment_type: 'customer',
            rationale: `AI OPTIMIZATION: ${suggestion.reasoning}`
          });
        
        if (assignmentError) {
          console.error(`Failed to create assignment for ${suggestion.accountId}:`, assignmentError);
          continue;
        }
        
        applied++;
        console.log(`✅ Applied: ${suggestion.accountName} → ${suggestion.toRepName}`);
      } catch (error) {
        console.error(`Error applying suggestion for ${suggestion.accountId}:`, error);
      }
    }
    
    return { success: applied > 0, applied };
  }
}
