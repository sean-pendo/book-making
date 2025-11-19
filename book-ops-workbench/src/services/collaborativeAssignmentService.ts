import { supabase } from '@/integrations/supabase/client';
import { MultiCriteriaScoringService } from './multiCriteriaScoringService';
import { 
  AlgorithmicAssignmentService, 
  AssignmentConfiguration, 
  AssignmentProposal as AlgoProposal,
  Account as AlgoAccount,
  SalesRep as AlgoRep
} from './algorithmicAssignmentService';

// ============= TYPE DEFINITIONS =============

export interface AssignmentProposal {
  accountId: string;
  accountName: string;
  currentOwnerId?: string;
  currentOwnerName?: string;
  proposedOwnerId: string;
  proposedOwnerName: string;
  proposedOwnerRegion?: string;
  assignmentReason: string;
  ruleApplied: string;
  conflictRisk: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface AssignmentResult {
  totalAccounts: number;
  assignedAccounts: number;
  unassignedAccounts: number;
  proposals: AssignmentProposal[];
  conflicts: AssignmentProposal[];
  statistics: any;
  aiOptimizations?: AssignmentProposal[];
  requiresReview?: boolean;
}

export interface AssignmentProgress {
  stage: string;
  progress: number;
  status: string;
  currentRule?: string;
  rulesCompleted: number;
  totalRules: number;
  accountsProcessed: number;
  totalAccounts: number;
  assignmentsMade: number;
  conflicts: number;
  error?: string;
}

export type ProgressCallback = (progress: AssignmentProgress) => void;

/**
 * Collaborative Assignment Service - Redesigned
 * 
 * Now uses AlgorithmicAssignmentService for fast, deterministic assignments
 * with optional AI optimization layer
 */
export class CollaborativeAssignmentService {
  private static instance: CollaborativeAssignmentService;
  private progressCallback?: ProgressCallback;
  private isCancelled = false;
  private startTime = 0;
  private readonly GLOBAL_TIMEOUT = 1800000; // 30 minutes (increased for large AI batches)
  private readonly STAGE_TIMEOUTS = {
    loading: 120000,      // 2 minutes
    scoring: 300000,      // 5 minutes
    ai_optimization: 1200000, // 20 minutes
    saving: 180000        // 3 minutes
  };
  private stageStartTime = 0;

  private constructor() {
    // Simplified - no complex engines needed
  }

  static getInstance(): CollaborativeAssignmentService {
    if (!CollaborativeAssignmentService.instance) {
      CollaborativeAssignmentService.instance = new CollaborativeAssignmentService();
    }
    return CollaborativeAssignmentService.instance;
  }

  setProgressCallback(callback: ProgressCallback) {
    this.progressCallback = callback;
  }

  cancelGeneration() {
    this.isCancelled = true;
    console.log('[ASSIGNMENT] Assignment generation cancelled by user');
  }

  private checkCancellation(stage?: string) {
    if (this.isCancelled) {
      throw new Error('Assignment generation was cancelled by user');
    }
    
    const elapsed = Date.now() - this.startTime;
    
    // Check global timeout
    if (elapsed > this.GLOBAL_TIMEOUT) {
      const minutes = Math.floor(elapsed / 60000);
      throw new Error(`Assignment generation timed out after ${minutes} minutes. Consider processing fewer accounts or disabling AI optimization.`);
    }
    
    // Warn at 20 minutes
    if (elapsed > 1200000 && elapsed < 1205000) {
      console.warn('[ASSIGNMENT] ⚠️ Processing has been running for 20 minutes. Will timeout at 30 minutes.');
    }
    
    // Check stage-specific timeout
    if (stage && this.stageStartTime > 0) {
      const stageElapsed = Date.now() - this.stageStartTime;
      const timeout = this.STAGE_TIMEOUTS[stage as keyof typeof this.STAGE_TIMEOUTS];
      
      if (timeout && stageElapsed > timeout) {
        const stageMinutes = Math.floor(stageElapsed / 60000);
        throw new Error(`${stage} stage timed out after ${stageMinutes} minutes. This stage should complete faster.`);
      }
    }
  }
  
  private startStage(stageName: string) {
    this.stageStartTime = Date.now();
    console.log(`[ASSIGNMENT] 🎬 Starting stage: ${stageName}`);
  }
  
  private endStage(stageName: string) {
    const duration = ((Date.now() - this.stageStartTime) / 1000).toFixed(1);
    console.log(`[ASSIGNMENT] ✅ Stage ${stageName} completed in ${duration}s`);
    this.stageStartTime = 0;
  }

  private reportProgress(progress: AssignmentProgress) {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }

  /**
   * Main assignment generation using RULE-BASED approach
   */
  async generateBalancedAssignments(
    buildId: string,
    tier: 'Commercial' | 'Enterprise' | 'All' = 'All',
    accountType?: 'customers' | 'prospects' | 'all'
  ): Promise<AssignmentResult> {
    console.log(`[ASSIGNMENT] 🚀 Starting Rule-Based Assignment`);
    console.log(`[ASSIGNMENT] 📋 Parameters: buildId=${buildId}, tier=${tier}, accountType=${accountType}`);
    
    this.isCancelled = false;
    this.startTime = Date.now();
    
    try {
      this.reportProgress({
        stage: 'initializing',
        progress: 5,
        status: 'Loading configuration and data...',
        rulesCompleted: 0,
        totalRules: 1,
        accountsProcessed: 0,
        totalAccounts: 0,
        assignmentsMade: 0,
        conflicts: 0
      });

      // Load configuration and rules
      this.startStage('loading');
      const config = await this.loadConfiguration(buildId, accountType);
      const rules = await this.loadAssignmentRules(buildId, accountType);
      this.checkCancellation('loading');
      
      // Check if we have a FINAL_ARBITER rule enabled
      const hasFinalArbiter = rules.some(r => r.enabled && r.behavior_class === 'FINAL_ARBITER');
      
      console.log(`[ASSIGNMENT] 🎯 Assignment Mode: ${hasFinalArbiter ? 'MULTI-CRITERIA + AI ARBITER' : 'SEQUENTIAL RULES'}`);
      
      // Load accounts and sales reps
      let accounts = await this.getAccounts(buildId, tier, accountType);
      const salesReps = await this.getSalesReps(buildId);
      this.endStage('loading');

      console.log(`[ASSIGNMENT] 📊 Loaded ${accounts.length} accounts, ${salesReps.length} reps, ${rules.length} rules`);

      // Strategic rep tracking
      const strategicReps = salesReps.filter(r => r.is_strategic_rep);
      const strategicAccountIds = new Set<string>();
      accounts.forEach(account => {
        if (account.owner_id) {
          const currentOwner = salesReps.find(r => r.rep_id === account.owner_id);
          if (currentOwner?.is_strategic_rep) {
            strategicAccountIds.add(account.sfdc_account_id);
          }
        }
      });
      
      if (strategicReps.length > 0) {
        console.log(`[ASSIGNMENT] 🎯 Strategic Rep Tracking: ${strategicReps.length} strategic reps, ${strategicAccountIds.size} accounts require strategic assignment`);
      }

      if (accounts.length === 0) {
        throw new Error('No accounts found for assignment generation');
      }

      if (salesReps.length === 0) {
        throw new Error('No sales representatives found for assignment generation');
      }

      // Calculate current rep workloads from database
      const repWorkloads = await this.calculateRepWorkloads(buildId, salesReps);
      console.log(`[ASSIGNMENT] 📊 Calculated workloads for ${repWorkloads.size} reps`);

      this.reportProgress({
        stage: 'assigning',
        progress: 20,
        status: hasFinalArbiter ? 'Generating multi-criteria scores...' : 'Executing assignment rules...',
        rulesCompleted: 0,
        totalRules: rules.length,
        accountsProcessed: 0,
        totalAccounts: accounts.length,
        assignmentsMade: 0,
        conflicts: 0
      });

      let allProposals: AlgoProposal[] = [];

      if (hasFinalArbiter) {
        // ===== MULTI-CRITERIA SCORING MODE =====
        console.log('[ASSIGNMENT] 🎯 Using Multi-Criteria Scoring + AI Arbiter');
        
        // Phase 1: Score all accounts against all rules to generate initial proposals
        this.startStage('scoring');
        this.reportProgress({
          stage: 'assigning',
          progress: 30,
          status: 'Scoring accounts against all rules...',
          rulesCompleted: 0,
          totalRules: rules.length,
          accountsProcessed: 0,
          totalAccounts: accounts.length,
          assignmentsMade: 0,
          conflicts: 0
        });

        const initialProposals = await MultiCriteriaScoringService.generateInitialProposals(
          accounts,
          salesReps,
          rules,
          repWorkloads,
          config
        );

        this.checkCancellation('scoring');
        this.endStage('scoring');

        // Phase 2: Send to AI for final arbitration
        this.startStage('ai_optimization');
        this.reportProgress({
          stage: 'assigning',
          progress: 60,
          status: 'AI reviewing and finalizing assignments...',
          rulesCompleted: rules.length - 1,
          totalRules: rules.length,
          accountsProcessed: initialProposals.length,
          totalAccounts: accounts.length,
          assignmentsMade: initialProposals.length,
          conflicts: 0
        });

        // Use try-catch for FAIL-LOUD error handling
        let finalAssignments;
        try {
          // Pass batch progress callback to show real-time AI processing
          finalAssignments = await MultiCriteriaScoringService.getFinalAssignments(
            accounts,
            initialProposals,
            repWorkloads,
            config,
            buildId,
            (batchCurrent, batchTotal) => {
              // Update progress with batch info
              this.reportProgress({
                stage: 'assigning',
                progress: 60 + (batchCurrent / batchTotal) * 35, // 60-95% range for AI processing
                status: `AI optimization batch ${batchCurrent}/${batchTotal} (${Math.round((batchCurrent / batchTotal) * 100)}%)`,
                rulesCompleted: rules.length - 1,
                totalRules: rules.length,
                accountsProcessed: initialProposals.length,
                totalAccounts: accounts.length,
                assignmentsMade: initialProposals.length,
                conflicts: 0
              });
              
              // Check timeout during AI processing
              this.checkCancellation('ai_optimization');
            }
          );

          this.endStage('ai_optimization');
          console.log(`[CollaborativeAssignment] ✅ AI Arbiter completed: ${finalAssignments.length} final assignments`);

          // Convert to AlgoProposal format (includes account_name and rule_applied now)
          allProposals = finalAssignments.map(fa => {
            const account = accounts.find(a => a.sfdc_account_id === fa.sfdc_account_id);
            return {
              sfdc_account_id: fa.sfdc_account_id,
              proposed_owner_id: fa.final_owner_id,
              proposed_owner_name: fa.final_owner_name,
              assignment_type: fa.assignment_type || 'customer',
              rationale: (fa.rationale || `Assigned via ${fa.rule_applied || 'AI optimization'}`).replace(/^(customer|prospect):\s*/i, ''),
              score: 0,
              // Store rule_applied for preview display (not in AlgoProposal type but needed for conversion)
              rule_applied: fa.rule_applied || 'AI_ARBITER',
              // Preserve account info for proper display in preview
              account_name: account?.account_name || 'Unknown',
              owner_name: account?.owner_name,
              owner_id: account?.owner_id
            } as any;
          });
        } catch (error) {
          console.error('[CollaborativeAssignment] 💥 AI Arbiter failed:', error);
          
          // FAIL LOUDLY - Do not proceed with incomplete assignments
          throw new Error(
            `AI assignment failed: ${error.message}\n\n` +
            `This typically occurs when processing large datasets. ` +
            `The system cannot proceed with incomplete assignments to avoid severe imbalances. ` +
            `Please try again or contact support if the issue persists.`
          );
        }

        console.log(`[ASSIGNMENT] 📊 AI Arbiter Stats:`, {
          totalAccounts: accounts.length,
          proposalsGenerated: initialProposals.length,
          finalAssignments: allProposals.length,
          acceptedByAI: finalAssignments.filter(f => f.decision_type === 'ACCEPT').length,
          overriddenByAI: finalAssignments.filter(f => f.decision_type === 'OVERRIDE').length
        });

        console.log(`[ASSIGNMENT] ✅ Multi-Criteria + AI: ${allProposals.length} final assignments`);
      } else {
        // ===== SEQUENTIAL RULES MODE (Legacy) =====
        console.log('[ASSIGNMENT] 📐 Using Sequential Rules Mode');
        
        let unassignedAccounts = [...accounts];
        
      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        
        if (!rule.enabled) {
          console.log(`[ASSIGNMENT] ⏭️ Skipping disabled rule: ${rule.name}`);
          continue;
        }

        this.checkCancellation();

        const progressPercent = 20 + (i / rules.length) * 60;
        this.reportProgress({
          stage: 'assigning',
          progress: progressPercent,
          status: `Applying ${rule.name} rule...`,
          currentRule: rule.name,
          rulesCompleted: i,
          totalRules: rules.length,
          accountsProcessed: allProposals.length,
          totalAccounts: accounts.length,
          assignmentsMade: allProposals.length,
          conflicts: 0
        });

        console.log(`[ASSIGNMENT] 📐 Rule ${i + 1}/${rules.length}: ${rule.name} (${rule.rule_type})`);
        console.log(`[ASSIGNMENT] 📊 Unassigned accounts: ${unassignedAccounts.length}`);

        let ruleProposals: AlgoProposal[] = [];

        switch (rule.rule_type) {
          case 'GEO_FIRST':
            ruleProposals = await this.applyGeoRule(rule, unassignedAccounts, salesReps, config, repWorkloads);
            break;
          case 'CONTINUITY':
            ruleProposals = await this.applyContinuityRule(rule, unassignedAccounts, salesReps, config, repWorkloads);
            break;
          case 'AI_BALANCER':
            ruleProposals = await this.applyAIRule(rule, unassignedAccounts, salesReps, config, repWorkloads, allProposals);
            break;
          default:
            console.warn(`[ASSIGNMENT] ⚠️ Unknown rule type: ${rule.rule_type}`);
            continue;
        }

        // Update tracking
        allProposals.push(...ruleProposals);
        
        // Remove assigned accounts from unassigned list
        const assignedIds = new Set(ruleProposals.map(p => p.sfdc_account_id));
        unassignedAccounts = unassignedAccounts.filter(a => !assignedIds.has(a.sfdc_account_id));

        // Update workloads with new assignments
        ruleProposals.forEach(p => {
          const workload = repWorkloads.get(p.proposed_owner_id);
          if (workload) {
            const account = accounts.find(a => a.sfdc_account_id === p.sfdc_account_id);
            if (account) {
              workload.total_arr += account.calculated_arr || 0;
              workload.account_count += 1;
              workload.cre_count += account.cre_count || 0;
            }
          }
        });

        console.log(`[ASSIGNMENT] ✅ Rule ${rule.name} assigned ${ruleProposals.length} accounts`);
        console.log(`[ASSIGNMENT] 📊 Remaining unassigned: ${unassignedAccounts.length}`);
      }
      } // End of if/else for hasFinalArbiter

      this.checkCancellation();

      // No separate AI optimization phase - AI is part of the rule execution
      let aiOptimizations: AssignmentProposal[] = [];

      // PHASE 4: Save to database
      this.startStage('saving');
      this.reportProgress({
        stage: 'saving',
        progress: 90,
        status: 'Saving assignments to database...',
        rulesCompleted: rules.length,
        totalRules: rules.length,
        accountsProcessed: allProposals.length,
        totalAccounts: accounts.length,
        assignmentsMade: allProposals.length,
        conflicts: 0
      });

      await this.saveAssignments(buildId, allProposals);
      this.checkCancellation('saving');
      this.endStage('saving');

      // Convert to legacy format
      const proposals = allProposals.map(p => this.convertToLegacyProposal(p, accounts));

      this.reportProgress({
        stage: 'complete',
        progress: 100,
        status: 'Assignment generation complete',
        rulesCompleted: rules.length,
        totalRules: rules.length,
        accountsProcessed: allProposals.length,
        totalAccounts: accounts.length,
        assignmentsMade: allProposals.length,
        conflicts: 0
      });

      return {
        totalAccounts: accounts.length,
        assignedAccounts: allProposals.length,
        unassignedAccounts: accounts.length - allProposals.length,
        proposals,
        conflicts: [],
        statistics: this.calculateStatistics(allProposals, salesReps),
        aiOptimizations,
        requiresReview: aiOptimizations.length > 0
      };

    } catch (error: any) {
      console.error('[ASSIGNMENT] Error:', error);
      
      this.reportProgress({
        stage: 'error',
        progress: 0,
        status: 'Assignment generation failed',
        rulesCompleted: 0,
        totalRules: 1,
        accountsProcessed: 0,
        totalAccounts: 0,
        assignmentsMade: 0,
        conflicts: 0,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Load configuration from assignment_configuration table
   */
  private async loadConfiguration(
    buildId: string, 
    accountType?: 'customers' | 'prospects' | 'all'
  ): Promise<AssignmentConfiguration> {
    // Determine which scope to query
    const scopeToQuery = accountType && accountType !== 'all' ? accountType : 'all';
    
    // Use type assertion to avoid deep type instantiation
    type ConfigResult = { data: any; error: any };
    
    // Query for scope-specific config
    const result: ConfigResult = await (supabase as any)
      .from('assignment_configuration')
      .select('*')
      .eq('build_id', buildId)
      .eq('account_scope', scopeToQuery)
      .limit(1);

    let data = result.data?.[0];

    // Fallback to 'all' scope if no specific config found
    if (!data && !result.error && accountType && accountType !== 'all') {
      console.log(`[ASSIGNMENT] No ${accountType} config found, falling back to 'all' scope`);
      const fallbackResult: ConfigResult = await (supabase as any)
        .from('assignment_configuration')
        .select('*')
        .eq('build_id', buildId)
        .eq('account_scope', 'all')
        .limit(1);
      
      data = fallbackResult.data?.[0];
    }

    if (result.error) {
      console.error('[ASSIGNMENT] Error loading configuration:', result.error);
      throw new Error('Failed to load assignment configuration');
    }

    if (!data) {
      // Return default configuration
      console.log('[ASSIGNMENT] No configuration found, using defaults');
      return {
        description: 'Balance workload, minimize risk concentration, prefer geographic matches',
        customer_min_arr: 1200000,
        customer_target_arr: 1300000,
        customer_max_arr: 3000000,
        max_cre_per_rep: 3,
        assign_prospects: false,
        prospect_min_arr: 300000,
        prospect_target_arr: 500000,
        prospect_max_arr: 2000000,
        prefer_geographic_match: true,
        prefer_continuity: true,
        continuity_days_threshold: 90,
        territory_mappings: {}
      };
    }

    return this.mapConfigurationData(data);
  }

  /**
   * Map database configuration to AssignmentConfiguration type
   */
  private mapConfigurationData(data: any): AssignmentConfiguration {
    return {
      description: data.description,
      customer_min_arr: data.customer_min_arr,
      customer_target_arr: data.customer_target_arr,
      customer_max_arr: data.customer_max_arr,
      max_cre_per_rep: data.max_cre_per_rep,
      assign_prospects: data.assign_prospects,
      prospect_min_arr: data.prospect_min_arr,
      prospect_target_arr: data.prospect_target_arr,
      prospect_max_arr: data.prospect_max_arr,
      prefer_geographic_match: data.prefer_geographic_match,
      prefer_continuity: data.prefer_continuity,
      continuity_days_threshold: data.continuity_days_threshold,
      use_ai_optimization: data.use_ai_optimization,
      territory_mappings: (data.territory_mappings as Record<string, string>) || {}
    };
  }

  /**
   * Get accounts for assignment
   */
  private async getAccounts(
    buildId: string,
    tier: 'Commercial' | 'Enterprise' | 'All',
    accountType?: 'customers' | 'prospects' | 'all'
  ): Promise<AlgoAccount[]> {
    let query = supabase
      .from('accounts')
      .select('*')
      .eq('build_id', buildId)
      .eq('is_parent', true);

    // Filter by tier
    if (tier !== 'All') {
      query = query.eq('enterprise_vs_commercial', tier);
    }

    // Filter by account type
    if (accountType === 'customers') {
      query = query.eq('is_customer', true);
    } else if (accountType === 'prospects') {
      query = query.eq('is_customer', false);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ASSIGNMENT] Error loading accounts:', error);
      throw new Error('Failed to load accounts');
    }

    return (data || []).map(a => ({
      sfdc_account_id: a.sfdc_account_id,
      account_name: a.account_name,
      is_customer: a.is_customer || false,
      calculated_arr: a.calculated_arr || 0,
      calculated_atr: a.calculated_atr || 0,
      cre_count: a.cre_count || 0,
      sales_territory: a.sales_territory || '',
      geo: a.geo || '',
      owner_id: a.owner_id || null,
      owner_name: a.owner_name || null,
      created_at: a.created_at || new Date().toISOString()
    }));
  }

  /**
   * Get sales reps for assignment
   */
  private async getSalesReps(buildId: string): Promise<AlgoRep[]> {
    const { data, error } = await supabase
      .from('sales_reps')
      .select('*')
      .eq('build_id', buildId)
      .eq('is_active', true)
      .eq('include_in_assignments', true);

    if (error) {
      console.error('[ASSIGNMENT] Error loading sales reps:', error);
      throw new Error('Failed to load sales representatives');
    }

    return (data || []).map(r => ({
      rep_id: r.rep_id,
      name: r.name,
      region: r.region || '',
      team: r.team || '',
      is_active: r.is_active,
      include_in_assignments: r.include_in_assignments,
      is_strategic_rep: r.is_strategic_rep || false
    }));
  }

  /**
   * Get AI optimization suggestions
   */
  private async getAIOptimizations(
    buildId: string,
    proposals: AlgoProposal[],
    config: AssignmentConfiguration,
    accounts: AlgoAccount[]
  ): Promise<AssignmentProposal[]> {
    try {
      // Prepare data for AI
      const currentAssignments = proposals.map(p => {
        const account = accounts.find(a => a.sfdc_account_id === p.sfdc_account_id);
        return {
          ...p,
          account_arr: account?.calculated_arr || 0,
          account_cre_count: account?.cre_count || 0
        };
      });

      const { data, error } = await supabase.functions.invoke('optimize-balancing', {
        body: {
          currentAssignments,
          config,
          buildId
        }
      });

      if (error) throw error;

      const suggestions = data?.suggestions || [];
      
      // Convert AI suggestions to AssignmentProposal format
      return suggestions.map((s: any) => {
        const account = accounts.find(a => a.sfdc_account_id === s.accountId);
        return {
          accountId: s.accountId,
          accountName: s.accountName,
          currentOwnerId: s.fromRepId,
          currentOwnerName: s.fromRepName,
          proposedOwnerId: s.toRepId,
          proposedOwnerName: s.toRepName,
          proposedOwnerRegion: '',
          assignmentReason: `AI Optimization: ${s.reasoning}`,
          ruleApplied: 'AI_OPTIMIZATION',
          conflictRisk: 'LOW'
        } as AssignmentProposal;
      });
    } catch (error) {
      console.error('[ASSIGNMENT] AI optimization error:', error);
      return [];
    }
  }

  /**
   * Save assignments to database
   */
  private async saveAssignments(buildId: string, proposals: AlgoProposal[]): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    
    // Build update payload for batch operation
    const updates = proposals.reduce((acc, proposal) => {
      acc[proposal.sfdc_account_id] = {
        new_owner_id: proposal.proposed_owner_id,
        new_owner_name: proposal.proposed_owner_name
      };
      return acc;
    }, {} as Record<string, { new_owner_id: string; new_owner_name: string }>);

    console.log(`[ASSIGNMENT] Batch updating ${proposals.length} accounts...`);
    const startTime = Date.now();
    
    // Use batch RPC function for ultra-fast updates
    const { data: updatedCount, error: updateError } = await supabase
      .rpc('batch_update_account_owners', {
        p_build_id: buildId,
        p_updates: updates
      });

    if (updateError) {
      console.error('[ASSIGNMENT] Batch update failed:', updateError);
      throw updateError;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[ASSIGNMENT] ✅ Batch updated ${updatedCount} accounts in ${elapsed}s`);

    // Clear existing assignments for this build first
    console.log(`[ASSIGNMENT] Clearing existing assignments for build ${buildId}...`);
    const { error: deleteError } = await supabase
      .from('assignments')
      .delete()
      .eq('build_id', buildId);
    
    if (deleteError) {
      console.warn(`[ASSIGNMENT] Warning: Could not clear old assignments:`, deleteError);
    }

    // Deduplicate proposals by sfdc_account_id (keep last occurrence)
    const deduplicatedProposals = Array.from(
      proposals.reduce((map, proposal) => {
        map.set(proposal.sfdc_account_id, proposal);
        return map;
      }, new Map<string, AlgoProposal>()).values()
    );

    const duplicatesRemoved = proposals.length - deduplicatedProposals.length;
    if (duplicatesRemoved > 0) {
      console.log(`[ASSIGNMENT] Removed ${duplicatesRemoved} duplicate proposals`);
    }

    // Create assignment records
    const assignmentRecords = deduplicatedProposals.map(p => ({
      build_id: buildId,
      sfdc_account_id: p.sfdc_account_id,
      proposed_owner_id: p.proposed_owner_id,
      proposed_owner_name: p.proposed_owner_name,
      assignment_type: p.assignment_type,
      rationale: p.rationale,
      created_by: user?.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    // Batch insert in chunks of 500
    const chunkSize = 500;
    for (let i = 0; i < assignmentRecords.length; i += chunkSize) {
      const chunk = assignmentRecords.slice(i, i + chunkSize);
      const batchNum = Math.floor(i / chunkSize) + 1;
      const totalBatches = Math.ceil(assignmentRecords.length / chunkSize);
      
      console.log(`[ASSIGNMENT] Saving batch ${batchNum}/${totalBatches} (${chunk.length} records)`);
      
      const { error: insertError } = await supabase.from('assignments').insert(chunk);
      
      if (insertError) {
        console.error(`[ASSIGNMENT] ❌ Failed to save batch ${batchNum}:`, insertError);
        throw new Error(`Failed to save assignments batch ${batchNum}: ${insertError.message}`);
      }
    }

    console.log(`[ASSIGNMENT] ✅ Successfully saved ${assignmentRecords.length} unique assignments`);

    // Update accounts table with new_owner_id and new_owner_name
    console.log('[ASSIGNMENT] Updating accounts.new_owner_id fields...');
    
    // First, fetch sales reps to create a name-to-ID mapping
    const { data: salesReps, error: repsError } = await supabase
      .from('sales_reps')
      .select('rep_id, name')
      .eq('build_id', buildId);
    
    if (repsError) {
      console.error('[ASSIGNMENT] Failed to fetch sales reps for mapping:', repsError);
      throw repsError;
    }
    
    // Create name-to-ID mapping (case-insensitive)
    const nameToIdMap: Record<string, string> = {};
    salesReps?.forEach(rep => {
      const normalizedName = rep.name.toLowerCase().trim();
      nameToIdMap[normalizedName] = rep.rep_id;
    });
    
    console.log(`[ASSIGNMENT] Created name-to-ID mapping for ${Object.keys(nameToIdMap).length} reps`);
    
    // Map proposals to account updates, using rep_id lookup
    const accountUpdates = deduplicatedProposals
      .map(p => {
        const normalizedOwnerName = (p.proposed_owner_name || '').toLowerCase().trim();
        const repId = nameToIdMap[normalizedOwnerName];
        
        if (!repId) {
          console.error(`❌ [ASSIGNMENT] Could not map owner name to rep_id: "${p.proposed_owner_name}" for account ${p.sfdc_account_id}`);
          return null; // Skip this account - don't save corrupt data
        }
        
        return {
          sfdc_account_id: p.sfdc_account_id,
          new_owner_id: repId, // ONLY valid rep_id, NO fallback
          new_owner_name: p.proposed_owner_name
        };
      })
      .filter(Boolean); // Remove nulls
    
    // Add validation before updates
    const mappingSuccessRate = (accountUpdates.length / deduplicatedProposals.length) * 100;
    console.log(`[ASSIGNMENT] Mapped ${accountUpdates.length}/${deduplicatedProposals.length} accounts (${mappingSuccessRate.toFixed(1)}%)`);
    
    if (accountUpdates.length === 0) {
      throw new Error('❌ CRITICAL: No valid rep_id mappings found. Cannot proceed with assignment.');
    }
    
    if (mappingSuccessRate < 90) {
      throw new Error(`❌ CRITICAL: Only ${mappingSuccessRate.toFixed(1)}% of assignments could be mapped to valid rep_ids. Please check sales_reps data.`);
    }

    // Update accounts in batches
    for (let i = 0; i < accountUpdates.length; i += chunkSize) {
      const chunk = accountUpdates.slice(i, i + chunkSize);
      const batchNum = Math.floor(i / chunkSize) + 1;
      const totalBatches = Math.ceil(accountUpdates.length / chunkSize);
      
      console.log(`[ASSIGNMENT] Updating accounts batch ${batchNum}/${totalBatches} (${chunk.length} records)`);
      
      for (const update of chunk) {
        const { error: updateError } = await supabase
          .from('accounts')
          .update({
            new_owner_id: update.new_owner_id,
            new_owner_name: update.new_owner_name
          })
          .eq('build_id', buildId)
          .eq('sfdc_account_id', update.sfdc_account_id);
          
        if (updateError) {
          console.error('[ASSIGNMENT] Failed to update account:', update.sfdc_account_id, updateError);
        }
      }
    }

    console.log(`[ASSIGNMENT] ✅ Successfully updated ${accountUpdates.length} accounts with new owners`);
  }

  /**
   * Convert algo proposal to legacy format
   */
  private convertToLegacyProposal(proposal: AlgoProposal, accounts: AlgoAccount[]): AssignmentProposal {
    // Fix: Properly identify the account ID from proposal
    const accountId = proposal.sfdc_account_id;
    const account = accounts.find(a => a.sfdc_account_id === accountId);
    
    if (!account) {
      console.warn(`[ASSIGNMENT] Account not found for ID: ${accountId}`);
    }
    
    return {
      accountId: accountId,
      accountName: (proposal as any).account_name || account?.account_name || 'Unknown Account',
      currentOwnerId: (proposal as any).owner_id || account?.owner_id || undefined,
      currentOwnerName: (proposal as any).owner_name || account?.owner_name || undefined,
      proposedOwnerId: proposal.proposed_owner_id,
      proposedOwnerName: proposal.proposed_owner_name,
      proposedOwnerRegion: '',
      assignmentReason: proposal.rationale || '',
      ruleApplied: (proposal as any).rule_applied || 'AI_ARBITER',
      conflictRisk: 'LOW'
    };
  }

  /**
   * Calculate assignment statistics
   */
  private calculateStatistics(proposals: AlgoProposal[], salesReps: AlgoRep[]): any {
    const repStats: Record<string, { count: number; arr: number }> = {};

    // Initialize all reps
    salesReps.forEach(rep => {
      repStats[rep.rep_id] = { count: 0, arr: 0 };
    });

    // Count assignments per rep
    proposals.forEach(p => {
      if (repStats[p.proposed_owner_id]) {
        repStats[p.proposed_owner_id].count++;
      }
    });

    return {
      totalAssignments: proposals.length,
      byRep: repStats,
      customers: proposals.filter(p => p.assignment_type === 'customer').length,
      prospects: proposals.filter(p => p.assignment_type === 'prospect').length
    };
  }

  // ============= NEW RULE-BASED METHODS =============

  /**
   * Load assignment rules from database in priority order
   */
  private async loadAssignmentRules(
    buildId: string,
    accountType?: 'customers' | 'prospects' | 'all'
  ): Promise<any[]> {
    const scopeToQuery = accountType && accountType !== 'all' ? accountType : 'all';
    
    const { data, error } = await supabase
      .from('assignment_rules')
      .select('*')
      .eq('build_id', buildId)
      .in('account_scope', [scopeToQuery, 'all'])
      .order('priority', { ascending: true });

    if (error) {
      console.error('[ASSIGNMENT] Error loading rules:', error);
      throw new Error('Failed to load assignment rules');
    }

    console.log(`[ASSIGNMENT] 📋 Loaded ${data?.length || 0} rules for scope: ${scopeToQuery}`);
    return data || [];
  }

  /**
   * Calculate current rep workloads from database
   */
  private async calculateRepWorkloads(
    buildId: string,
    reps: AlgoRep[]
  ): Promise<Map<string, any>> {
    const workloads = new Map();

    for (const rep of reps) {
      // Query accounts currently assigned to this rep
      const { data: assignedAccounts } = await supabase
        .from('accounts')
        .select('calculated_arr, cre_count')
        .eq('build_id', buildId)
        .eq('new_owner_id', rep.rep_id)
        .eq('is_parent', true);

      const total_arr = assignedAccounts?.reduce((sum, a) => sum + (a.calculated_arr || 0), 0) || 0;
      const cre_count = assignedAccounts?.reduce((sum, a) => sum + (a.cre_count || 0), 0) || 0;

      workloads.set(rep.rep_id, {
        rep_id: rep.rep_id,
        name: rep.name,
        region: rep.region,
        team: rep.team,
        total_arr,
        account_count: assignedAccounts?.length || 0,
        cre_count
      });
    }

    return workloads;
  }

  /**
   * Apply GEO_FIRST rule - Match territory to rep region
   */
  private async applyGeoRule(
    rule: any,
    accounts: AlgoAccount[],
    reps: AlgoRep[],
    config: AssignmentConfiguration,
    workloads: Map<string, any>
  ): Promise<AlgoProposal[]> {
    const proposals: AlgoProposal[] = [];
    
    // Get territory mappings from config - handle both possible formats
    let territoryMap: Record<string, string> = {};
    
    // Check if territory_mappings exists and use it
    if (config.territory_mappings && typeof config.territory_mappings === 'object') {
      territoryMap = config.territory_mappings;
    }
    
    // If no mappings, query from assignment_configuration.rep_matching_rules
    if (Object.keys(territoryMap).length === 0 && rule.build_id) {
      try {
        const { data: configData } = await (supabase as any)
          .from('assignment_configuration')
          .select('rep_matching_rules')
          .eq('build_id', rule.build_id)
          .limit(1)
          .single();
        
        if (configData?.rep_matching_rules && Array.isArray(configData.rep_matching_rules)) {
          const geoRule = configData.rep_matching_rules.find((r: any) => r.field === 'sales_territory');
          if (geoRule?.value_map) {
            territoryMap = geoRule.value_map;
          }
        }
      } catch (error) {
        console.warn('[ASSIGNMENT] Could not load territory mappings:', error);
      }
    }
    
    // Build case-insensitive lookup map for robust matching
    const normalizedMappings = new Map<string, string>();
    Object.entries(territoryMap).forEach(([territory, region]) => {
      const normalized = territory.toUpperCase().trim();
      normalizedMappings.set(normalized, region as string);
    });
    
    console.log(`[ASSIGNMENT] 🌍 Geo Rule: Processing ${accounts.length} accounts`);
    console.log(`[ASSIGNMENT] 🗺️ Territory mappings loaded: ${normalizedMappings.size} entries`);

    for (const account of accounts) {
      // Find matching region from territory - case-insensitive matching
      const accountTerritory = account.sales_territory?.toUpperCase().trim() || '';
      const targetRegion = normalizedMappings.get(accountTerritory);

      if (!targetRegion) {
        continue; // Skip if no mapping
      }

      // Find reps in target region
      let eligibleReps = reps.filter(r => r.region === targetRegion);

      // Strategic rep constraint (bidirectional):
      // - Strategic accounts → only strategic reps
      // - Regular accounts → only regular (non-strategic) reps
      if (account.owner_id) {
        const currentOwner = reps.find(r => r.rep_id === account.owner_id);
        if (currentOwner?.is_strategic_rep) {
          // Strategic account → only strategic reps
          eligibleReps = eligibleReps.filter(r => r.is_strategic_rep);
          console.log(`[ASSIGNMENT] 🎯 Strategic account ${account.sfdc_account_id} - limiting to ${eligibleReps.length} strategic reps`);
        } else {
          // Regular account → only regular reps
          eligibleReps = eligibleReps.filter(r => !r.is_strategic_rep);
          console.log(`[ASSIGNMENT] 🎯 Regular account ${account.sfdc_account_id} - limiting to ${eligibleReps.length} regular reps`);
        }
      }

      if (eligibleReps.length === 0) {
        console.warn(`[ASSIGNMENT] ⚠️ No eligible reps found for region: ${targetRegion}`);
        continue;
      }

      // Find best rep based on workload
      let bestRep = eligibleReps[0];
      let bestWorkload = workloads.get(bestRep.rep_id);

      for (const rep of eligibleReps) {
        const workload = workloads.get(rep.rep_id);
        if (!workload) continue;

        // Check constraints
        const wouldExceedMaxArr = (workload.total_arr + (account.calculated_arr || 0)) > config.customer_max_arr;
        const wouldExceedMaxCre = (workload.cre_count + (account.cre_count || 0)) > config.max_cre_per_rep;

        if (wouldExceedMaxArr || wouldExceedMaxCre) {
          continue; // Skip reps that would exceed limits
        }

        // Prefer rep with lower ARR (better balance)
        if (workload.total_arr < (bestWorkload?.total_arr || Infinity)) {
          bestRep = rep;
          bestWorkload = workload;
        }
      }

      // Check if best rep still within limits
      if (bestWorkload) {
        const wouldExceedMaxArr = (bestWorkload.total_arr + (account.calculated_arr || 0)) > config.customer_max_arr;
        const wouldExceedMaxCre = (bestWorkload.cre_count + (account.cre_count || 0)) > config.max_cre_per_rep;

        if (!wouldExceedMaxArr && !wouldExceedMaxCre) {
          proposals.push({
            sfdc_account_id: account.sfdc_account_id,
            proposed_owner_id: bestRep.rep_id,
            proposed_owner_name: bestRep.name,
            assignment_type: account.is_customer ? 'customer' : 'prospect',
            rationale: `GEO MATCH: Territory ${accountTerritory} → Region ${targetRegion}`,
            score: 1.0
          });
        }
      }
    }

    console.log(`[ASSIGNMENT] 🌍 Geo Rule assigned ${proposals.length} accounts`);
    return proposals;
  }

  /**
   * Apply CONTINUITY rule - Keep accounts with current owner
   */
  private async applyContinuityRule(
    rule: any,
    accounts: AlgoAccount[],
    reps: AlgoRep[],
    config: AssignmentConfiguration,
    workloads: Map<string, any>
  ): Promise<AlgoProposal[]> {
    const proposals: AlgoProposal[] = [];
    
    console.log(`[ASSIGNMENT] 🔄 Continuity Rule: Processing ${accounts.length} accounts`);

    const repMap = new Map(reps.map(r => [r.rep_id, r]));

    for (const account of accounts) {
      // Check if account has current owner
      if (!account.owner_id || account.owner_id.trim() === '') {
        continue;
      }

      const currentRep = repMap.get(account.owner_id);
      if (!currentRep) {
        continue; // Current owner not in active rep list
      }

      const workload = workloads.get(account.owner_id);
      if (!workload) {
        continue;
      }

      // Check constraints
      const wouldExceedMaxArr = (workload.total_arr + (account.calculated_arr || 0)) > config.customer_max_arr;
      const wouldExceedMaxCre = (workload.cre_count + (account.cre_count || 0)) > config.max_cre_per_rep;

      // Apply conditions from rule
      const skipIfOverloaded = rule.conditions?.skipIfOverloaded !== false;
      
      if (skipIfOverloaded && (wouldExceedMaxArr || wouldExceedMaxCre)) {
        continue; // Skip overloaded reps
      }

      proposals.push({
        sfdc_account_id: account.sfdc_account_id,
        proposed_owner_id: account.owner_id,
        proposed_owner_name: account.owner_name || currentRep.name,
        assignment_type: account.is_customer ? 'customer' : 'prospect',
        rationale: `CONTINUITY: Kept with current owner ${account.owner_name}`,
        score: 0.9
      });
    }

    console.log(`[ASSIGNMENT] 🔄 Continuity Rule assigned ${proposals.length} accounts`);
    return proposals;
  }

  /**
   * Apply AI_BALANCER rule - AI assigns remaining unassigned accounts
   */
  private async applyAIRule(
    rule: any,
    unassignedAccounts: AlgoAccount[],
    reps: AlgoRep[],
    config: AssignmentConfiguration,
    workloads: Map<string, any>,
    existingProposals: AlgoProposal[]
  ): Promise<AlgoProposal[]> {
    if (unassignedAccounts.length === 0) {
      console.log(`[ASSIGNMENT] 🤖 AI Rule: No unassigned accounts to process`);
      return [];
    }

    console.log(`[ASSIGNMENT] 🤖 AI Rule: Processing ${unassignedAccounts.length} unassigned accounts`);

    try {
      // Prepare workload summary for AI
      const workloadArray = Array.from(workloads.values());

      // Call AI edge function with unassigned accounts
      const { data, error } = await supabase.functions.invoke('optimize-balancing', {
        body: {
          unassignedAccounts: unassignedAccounts.map(a => ({
            sfdc_account_id: a.sfdc_account_id,
            account_name: a.account_name,
            calculated_arr: a.calculated_arr || 0,
            cre_count: a.cre_count || 0,
            sales_territory: a.sales_territory || '',
            owner_id: a.owner_id,
            owner_name: a.owner_name
          })),
          repWorkloads: workloadArray,
          config,
          buildId: rule.build_id,
          mode: 'ASSIGN' // PRIMARY assignment mode
        }
      });

      if (error) {
        console.error('[ASSIGNMENT] AI Rule error:', error);
        return [];
      }

      const aiAssignments = data?.assignments || [];
      console.log(`[ASSIGNMENT] 🤖 AI assigned ${aiAssignments.length} accounts`);

      // Convert AI assignments to proposals
      const proposals: AlgoProposal[] = aiAssignments
        .filter((a: any) => a.accountId && a.toRepId)
        .map((a: any) => ({
          sfdc_account_id: a.accountId,
          proposed_owner_id: a.toRepId,
          proposed_owner_name: a.toRepName,
          assignment_type: 'customer',
          rationale: `AI BALANCER: ${a.reasoning || 'Balanced workload distribution'}`,
          score: a.confidence || 0.8
        }));

      return proposals;

    } catch (error) {
      console.error('[ASSIGNMENT] AI Rule failed:', error);
      return [];
    }
  }
}
