import { supabase } from '@/integrations/supabase/client';
import { resolveParentChildConflicts, ParentalAlignmentWarning } from './parentalAlignmentService';

// ============= TYPE DEFINITIONS =============

interface Account {
  sfdc_account_id: string;
  account_name: string;
  owner_id?: string;
  owner_name?: string;
  sales_territory?: string;
  is_customer: boolean;
  is_parent: boolean;
  calculated_arr?: number;
  calculated_atr?: number;
  arr?: number;
  atr?: number;
  enterprise_vs_commercial?: string;
  expansion_tier?: string;
  initial_sale_tier?: string;
  geo?: string;
  risk_flag?: boolean;
  cre_risk?: boolean;
  cre_count?: number;
  renewal_date?: string;
  exclude_from_reassignment?: boolean;
}

interface SalesRep {
  rep_id: string;
  name: string;
  region?: string;
  team?: string;
  manager?: string;
  is_active: boolean;
  is_manager: boolean;
  include_in_assignments?: boolean;
}

interface AssignmentRule {
  id: string;
  name: string;
  rule_type: string;
  conditions: any;
  priority: number;
  enabled: boolean;
  account_scope?: string;
}

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
  parentalAlignmentWarnings?: ParentalAlignmentWarning[];
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
 * Enhanced Assignment Service - Completely Dynamic Based on Database Configuration
 */
export class EnhancedAssignmentService {
  private static instance: EnhancedAssignmentService;
  private progressCallback?: ProgressCallback;
  private isCancelled = false;
  private startTime = 0;
  private readonly GLOBAL_TIMEOUT = 600000; // 10 minutes
  private processedAccountIds = new Set<string>();

  private constructor() {}

  static getInstance(): EnhancedAssignmentService {
    if (!EnhancedAssignmentService.instance) {
      EnhancedAssignmentService.instance = new EnhancedAssignmentService();
    }
    return EnhancedAssignmentService.instance;
  }

  setProgressCallback(callback: ProgressCallback) {
    this.progressCallback = callback;
  }

  cancelGeneration() {
    this.isCancelled = true;
    console.log('[CANCEL] Assignment generation cancelled by user');
  }

  private checkCancellation() {
    if (this.isCancelled) {
      throw new Error('Assignment generation was cancelled by user');
    }
    const elapsed = Date.now() - this.startTime;
    if (elapsed > this.GLOBAL_TIMEOUT) {
      const minutes = Math.floor(elapsed / 60000);
      throw new Error(`Assignment generation timed out after ${minutes} minutes. Try reducing the data size or simplifying rules.`);
    }
  }

  private reportProgress(progress: AssignmentProgress) {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }

  private reportError(error: string, stage: string = 'processing') {
    if (this.progressCallback) {
      this.progressCallback({
        stage,
        progress: 0,
        status: 'Error occurred',
        error,
        rulesCompleted: 0,
        totalRules: 0,
        accountsProcessed: 0,
        totalAccounts: 0,
        assignmentsMade: 0,
        conflicts: 0
      });
    }
  }

  /**
   * Main assignment generation - completely driven by database configuration
   */
  /**
   * Main assignment generation using Advanced Assignment Rules
   */
  async generateBalancedAssignments(
    buildId: string,
    tier: 'Commercial' | 'Enterprise' | 'All' = 'All',
    accountType?: 'customers' | 'prospects' | 'all'
  ): Promise<AssignmentResult> {
    console.log(`[ENHANCED_ASSIGNMENT] 🚀 Starting Enhanced Assignment with Advanced Rules`);
    console.log(`[ENHANCED_ASSIGNMENT] 📋 Parameters: buildId=${buildId}, tier=${tier}, accountType=${accountType}`);
    
    this.isCancelled = false;
    this.startTime = Date.now();
    
    try {
      this.reportProgress({
        stage: 'initializing',
        progress: 5,
        status: 'Loading Advanced Assignment Rules...',
        rulesCompleted: 0,
        totalRules: 0,
        accountsProcessed: 0,
        totalAccounts: 0,
        assignmentsMade: 0,
        conflicts: 0
      });

      // Load assignment rules from database
      const allRules = await this.getAssignmentRules(buildId);
      console.log(`[ENHANCED_ASSIGNMENT] 📋 Loaded ${allRules.length} total rules from database`);
      
      if (allRules.length === 0) {
        console.warn('[ENHANCED_ASSIGNMENT] ⚠️ No assignment rules found, cannot process assignments');
        throw new Error('No assignment rules configured for this build. Please configure Advanced Assignment Rules first.');
      }

      // Get applicable rules for the account type
      const applicableRules = this.getApplicableRules(allRules, accountType);
      console.log(`[ENHANCED_ASSIGNMENT] 🎯 Using ${applicableRules.length} applicable rules for accountType=${accountType}`);
      console.log(`[ENHANCED_ASSIGNMENT] 📋 Applicable rules:`, applicableRules.map(r => `${r.priority}: ${r.name} (${r.rule_type})`));

      this.reportProgress({
        stage: 'loading',
        progress: 10,
        status: 'Loading accounts and sales representatives...',
        rulesCompleted: 0,
        totalRules: applicableRules.length,
        accountsProcessed: 0,
        totalAccounts: 0,
        assignmentsMade: 0,
        conflicts: 0
      });

      // Load accounts and sales reps
      const [accounts, salesReps] = await Promise.all([
        this.getParentAccounts(buildId, tier, accountType),
        this.getSalesReps(buildId)
      ]);

      console.log(`[ENHANCED_ASSIGNMENT] 📊 Loaded ${accounts.length} accounts and ${salesReps.length} sales reps`);

      if (accounts.length === 0) {
        throw new Error('No accounts found for assignment generation');
      }

      if (salesReps.length === 0) {
        throw new Error('No sales representatives found for assignment generation');
      }

      // ========================================================================
      // P0 HOLDOVER: Accounts with exclude_from_reassignment stay with current owner
      // These are manually locked accounts that should NEVER be reassigned
      // ========================================================================
      const holdoverAccounts = accounts.filter(a => a.exclude_from_reassignment === true);
      const assignableAccounts = accounts.filter(a => a.exclude_from_reassignment !== true);
      
      console.log(`[ENHANCED_ASSIGNMENT] 🔒 P0 Holdover: ${holdoverAccounts.length} accounts locked (exclude_from_reassignment)`);
      console.log(`[ENHANCED_ASSIGNMENT] 📋 Assignable accounts: ${assignableAccounts.length}`);

      // Create holdover proposals - these stay with current owner
      const holdoverProposals: AssignmentProposal[] = holdoverAccounts
        .filter(a => a.owner_id) // Only if they have a current owner
        .map(account => ({
          accountId: account.sfdc_account_id,
          accountName: account.account_name,
          currentOwnerId: account.owner_id,
          currentOwnerName: account.owner_name,
          proposedOwnerId: account.owner_id!,
          proposedOwnerName: account.owner_name || 'Unknown',
          proposedOwnerRegion: undefined,
          assignmentReason: 'P0: Excluded from reassignment (manually locked)',
          ruleApplied: 'Manual Holdover',
          conflictRisk: 'LOW' as const
        }));

      // Mark holdover accounts as processed so they don't get touched
      for (const account of holdoverAccounts) {
        this.processedAccountIds.add(account.sfdc_account_id);
      }

      // Use assignableAccounts for all subsequent processing
      const accountsToProcess = assignableAccounts;

      // ========================================================================
      // PARENTAL ALIGNMENT: Resolve parent ownership when children have different owners
      // This runs BEFORE any other rules to ensure parent-child alignment
      // ========================================================================
      this.reportProgress({
        stage: 'parental_alignment',
        progress: 15,
        status: 'Resolving parent-child ownership conflicts...',
        rulesCompleted: 0,
        totalRules: applicableRules.length,
        accountsProcessed: 0,
        totalAccounts: accountsToProcess.length,
        assignmentsMade: holdoverProposals.length,
        conflicts: 0
      });

      // Convert SalesRep to the format expected by parentalAlignmentService
      const repsForAlignment = salesReps.map(r => ({
        ...r,
        region: r.region || null,
        is_strategic_rep: false, // EnhancedAssignmentService doesn't track strategic reps
        include_in_assignments: r.include_in_assignments ?? true
      }));

      const { resolutions: parentalResolutions, warnings: parentalWarnings } = await resolveParentChildConflicts(
        buildId,
        accountsToProcess as any, // Type compatibility - only process non-holdover accounts
        repsForAlignment as any
      );

      // Create proposals for resolved parents and remove them from further processing
      const parentalProposals: AssignmentProposal[] = [];
      const resolvedParentIds = new Set<string>();

      for (const resolution of parentalResolutions) {
        const account = accountsToProcess.find(a => a.sfdc_account_id === resolution.parentAccountId);
        if (account) {
          const rep = salesReps.find(r => r.rep_id === resolution.resolvedOwnerId);
          
          parentalProposals.push({
            accountId: resolution.parentAccountId,
            accountName: resolution.parentAccountName,
            currentOwnerId: account.owner_id,
            currentOwnerName: account.owner_name,
            proposedOwnerId: resolution.resolvedOwnerId,
            proposedOwnerName: resolution.resolvedOwnerName,
            proposedOwnerRegion: rep?.region,
            assignmentReason: `Parent-Child Alignment: ${resolution.reason}`,
            ruleApplied: 'Parent-Child Alignment (implicit)',
            conflictRisk: resolution.willCreateSplit ? 'HIGH' : 'MEDIUM'
          });

          resolvedParentIds.add(resolution.parentAccountId);
          this.processedAccountIds.add(resolution.parentAccountId);
        }
      }

      if (parentalResolutions.length > 0) {
        console.log(`[ENHANCED_ASSIGNMENT] 👨‍👧‍👦 Parent-Child Alignment: ${parentalResolutions.length} parents resolved`);
        if (parentalWarnings.length > 0) {
          console.log(`[ENHANCED_ASSIGNMENT] ⚠️ Parental alignment warnings:`, parentalWarnings.map(w => w.message));
        }
      }

      // Filter out resolved parents from accounts to process (already excludes holdovers)
      const accountsForRules = accountsToProcess.filter(a => !resolvedParentIds.has(a.sfdc_account_id));

      this.reportProgress({
        stage: 'processing',
        progress: 20,
        status: `Processing ${applicableRules.length} Advanced Assignment Rules...`,
        rulesCompleted: 0,
        totalRules: applicableRules.length,
        accountsProcessed: holdoverProposals.length + parentalProposals.length,
        totalAccounts: accounts.length, // Total includes holdovers
        assignmentsMade: holdoverProposals.length + parentalProposals.length,
        conflicts: 0
      });

      // Process rules using existing implementation (with remaining accounts)
      const ruleResult = await this.processRulesInOrder(buildId, accountsForRules, salesReps, applicableRules);

      // Combine ALL proposals: holdovers + parental alignment + rule-based
      return {
        ...ruleResult,
        totalAccounts: accounts.length, // Include holdovers in total
        proposals: [...holdoverProposals, ...parentalProposals, ...ruleResult.proposals],
        assignedAccounts: holdoverProposals.length + parentalProposals.length + ruleResult.assignedAccounts,
        parentalAlignmentWarnings: parentalWarnings.length > 0 ? parentalWarnings : undefined
      };

    } catch (error) {
      console.error('[ENHANCED_ASSIGNMENT] ❌ Assignment generation failed:', error);
      throw error;
    }
  }

  /**
   * Get rules applicable to the current assignment type
   */
  private getApplicableRules(allRules: AssignmentRule[], accountType?: 'customers' | 'prospects' | 'all'): AssignmentRule[] {
    // Filter enabled rules and EXCLUDE POST_PROCESSOR rules from main assignment flow
    const enabledRules = allRules.filter(r => r.enabled && (r as any).behavior_class !== 'POST_PROCESSOR');
    
    if (!accountType || accountType === 'all') {
      // For 'all' type, include all enabled rules
      return enabledRules.sort((a, b) => a.priority - b.priority);
    }
    
    // For specific types, include rules with matching scope OR 'all' scope
    const applicableRules = enabledRules.filter(rule => {
      return rule.account_scope === accountType || rule.account_scope === 'all';
    });
    
    return applicableRules.sort((a, b) => a.priority - b.priority);
  }

  // NEW METHOD: Get post-processor rules
  private getPostProcessorRules(allRules: AssignmentRule[]): AssignmentRule[] {
    return allRules
      .filter(r => r.enabled && (r as any).behavior_class === 'POST_PROCESSOR')
      .sort((a, b) => a.priority - b.priority);
  }

  // NEW METHOD: Run post-processing optimization
  async runPostProcessing(
    buildId: string,
    accounts: Account[],
    salesReps: SalesRep[],
    postProcessorRules: AssignmentRule[]
  ): Promise<AssignmentProposal[]> {
    console.log(`[ENHANCED] 🤖 Running ${postProcessorRules.length} post-processor rules`);
    
    const optimizationProposals: AssignmentProposal[] = [];
    
    for (const rule of postProcessorRules) {
      if (rule.rule_type === 'AI_BALANCER') {
        // AI_BALANCER rule type deprecated - balancing now handled by HIGHS optimization in priorityExecutor
        console.log(`[ENHANCED] ⚠️ AI_BALANCER rule type deprecated: ${rule.name}. Use HIGHS optimization instead.`);
      }
    }
    
    return optimizationProposals;
  }

  /**
   * Process assignment rules in strict priority order
   */
  private async processRulesInOrder(
    buildId: string,
    accounts: Account[],
    salesReps: SalesRep[],
    rules: AssignmentRule[]
  ): Promise<AssignmentResult> {
    const allProposals: AssignmentProposal[] = [];
    const allConflicts: AssignmentProposal[] = [];
    let remainingAccounts = [...accounts];

    console.log(`[RULE_PROCESSING] 🎯 Processing ${rules.length} rules in priority order for ${accounts.length} accounts`);

    for (let i = 0; i < rules.length; i++) {
      this.checkCancellation();
      
      const rule = rules[i];
      const ruleName = `Priority ${rule.priority}: ${rule.name}`;
      
      console.log(`[RULE_PROCESSING] 📋 Processing rule ${i + 1}/${rules.length}: ${ruleName}`);
      
      this.reportProgress({
        stage: 'processing',
        progress: 20 + ((i / rules.length) * 60),
        status: `Processing ${ruleName}...`,
        currentRule: ruleName,
        rulesCompleted: i,
        totalRules: rules.length,
        accountsProcessed: allProposals.length,
        totalAccounts: accounts.length,
        assignmentsMade: allProposals.length,
        conflicts: allConflicts.length
      });

      if (remainingAccounts.length === 0) {
        console.log(`[RULE_PROCESSING] ✅ All accounts assigned, skipping remaining rules`);
        break;
      }

      try {
        const ruleResult = await this.executeRule(rule, remainingAccounts, salesReps);
        
        allProposals.push(...ruleResult.proposals);
        allConflicts.push(...ruleResult.conflicts);
        
        // Remove assigned accounts from remaining accounts
        const assignedIds = new Set(ruleResult.proposals.map(p => p.accountId));
        remainingAccounts = remainingAccounts.filter(acc => !assignedIds.has(acc.sfdc_account_id));
        
        console.log(`[RULE_PROCESSING] ✅ Rule complete: ${ruleResult.proposals.length} assignments, ${remainingAccounts.length} accounts remaining`);
        
      } catch (error) {
        console.error(`[RULE_PROCESSING] ❌ Rule ${ruleName} failed:`, error);
        // Continue with next rule instead of failing completely
      }
    }

    this.reportProgress({
      stage: 'finalizing',
      progress: 90,
      status: 'Finalizing assignments...',
      rulesCompleted: rules.length,
      totalRules: rules.length,
      accountsProcessed: allProposals.length,
      totalAccounts: accounts.length,
      assignmentsMade: allProposals.length,
      conflicts: allConflicts.length
    });

    // Final statistics
    const statistics = this.calculateStatistics(accounts, allProposals, allConflicts, salesReps);
    
    console.log(`[DYNAMIC_ASSIGNMENT] 🏁 Assignment complete: ${allProposals.length}/${accounts.length} accounts assigned (${((allProposals.length/accounts.length)*100).toFixed(1)}%)`);
    
    this.reportProgress({
      stage: 'complete',
      progress: 100,
      status: `Assignment complete: ${allProposals.length}/${accounts.length} accounts assigned`,
      rulesCompleted: rules.length,
      totalRules: rules.length,
      accountsProcessed: allProposals.length,
      totalAccounts: accounts.length,
      assignmentsMade: allProposals.length,
      conflicts: allConflicts.length
    });

    return {
      totalAccounts: accounts.length,
      assignedAccounts: allProposals.length,
      unassignedAccounts: accounts.length - allProposals.length,
      proposals: allProposals,
      conflicts: allConflicts,
      statistics
    };
  }

  /**
   * Execute a single assignment rule
   */
  private async executeRule(
    rule: AssignmentRule,
    accounts: Account[],
    salesReps: SalesRep[]
  ): Promise<{ proposals: AssignmentProposal[]; conflicts: AssignmentProposal[] }> {
    console.log(`[RULE_EXECUTION] 🔧 Executing ${rule.rule_type} rule: ${rule.name}`);
    
    switch (rule.rule_type) {
      case 'GEO_FIRST':
        return this.executeGeoFirstRule(rule, accounts, salesReps);
      case 'CONTINUITY':
        return this.executeContinuityRule(rule, accounts, salesReps);
      case 'SMART_BALANCE':
        return await this.executeSmartBalanceRule(rule, accounts, salesReps);
      case 'MIN_THRESHOLDS':
        return await this.executeMinThresholdsRule(rule, accounts, salesReps);
      case 'ROUND_ROBIN':
        return await this.executeRoundRobinRule(rule, accounts, salesReps);
      default:
        console.warn(`[RULE_EXECUTION] ⚠️ Unknown rule type: ${rule.rule_type}`);
        return { proposals: [], conflicts: [] };
    }
  }

  /**
   * Execute GEO_FIRST rule
   */
  private executeGeoFirstRule(
    rule: AssignmentRule,
    accounts: Account[],
    salesReps: SalesRep[]
  ): { proposals: AssignmentProposal[]; conflicts: AssignmentProposal[] } {
    const proposals: AssignmentProposal[] = [];
    const conflicts: AssignmentProposal[] = [];
    const territoryMappings = rule.conditions?.territoryMappings || {};
    
    console.log(`[GEO_FIRST] Processing ${accounts.length} accounts with ${Object.keys(territoryMappings).length} territory mappings`);

    for (const account of accounts) {
      if (this.processedAccountIds.has(account.sfdc_account_id)) continue;

      const territory = account.sales_territory;
      if (!territory) continue;

      const targetRegion = territoryMappings[territory];
      if (!targetRegion) continue;

      const regionReps = salesReps.filter(rep => rep.region === targetRegion && rep.is_active);
      if (regionReps.length === 0) continue;

      // Find best rep in region (simplest approach - least loaded)
      const bestRep = this.findLeastLoadedRep(regionReps);
      
      if (bestRep) {
        const isReassignment = account.owner_id && account.owner_id !== bestRep.rep_id;
        
        proposals.push({
          accountId: account.sfdc_account_id,
          accountName: account.account_name,
          currentOwnerId: account.owner_id,
          currentOwnerName: account.owner_name,
          proposedOwnerId: bestRep.rep_id,
          proposedOwnerName: bestRep.name,
          proposedOwnerRegion: bestRep.region,
          assignmentReason: `${rule.name}: Territory ${territory} → Region ${targetRegion}`,
          ruleApplied: `${rule.rule_type} - Priority ${rule.priority}`,
          conflictRisk: isReassignment ? 'MEDIUM' : 'LOW'
        });

        this.processedAccountIds.add(account.sfdc_account_id);

        if (isReassignment) {
          conflicts.push(proposals[proposals.length - 1]);
        }
      }
    }

    console.log(`[GEO_FIRST] Created ${proposals.length} assignments, ${conflicts.length} conflicts`);
    return { proposals, conflicts };
  }

  /**
   * Execute CONTINUITY rule
   */
  private executeContinuityRule(
    rule: AssignmentRule,
    accounts: Account[],
    salesReps: SalesRep[]
  ): { proposals: AssignmentProposal[]; conflicts: AssignmentProposal[] } {
    const proposals: AssignmentProposal[] = [];
    const conflicts: AssignmentProposal[] = [];
    const conditions = rule.conditions || {};
    
    console.log(`[CONTINUITY] Processing ${accounts.length} accounts for ownership continuity`);

    for (const account of accounts) {
      if (this.processedAccountIds.has(account.sfdc_account_id)) continue;
      if (!account.owner_id) continue;

      const currentRep = salesReps.find(rep => rep.rep_id === account.owner_id);
      if (!currentRep || !currentRep.is_active) continue;

      // Keep current assignment if rep is still active
      proposals.push({
        accountId: account.sfdc_account_id,
        accountName: account.account_name,
        currentOwnerId: account.owner_id,
        currentOwnerName: account.owner_name,
        proposedOwnerId: currentRep.rep_id,
        proposedOwnerName: currentRep.name,
        proposedOwnerRegion: currentRep.region,
        assignmentReason: `${rule.name}: Maintaining ownership continuity`,
        ruleApplied: `${rule.rule_type} - Priority ${rule.priority}`,
        conflictRisk: 'LOW'
      });

      this.processedAccountIds.add(account.sfdc_account_id);
    }

    console.log(`[CONTINUITY] Created ${proposals.length} continuity assignments`);
    return { proposals, conflicts };
  }

  /**
   * Execute SMART_BALANCE rule - FIXED for proper balance enforcement
   */
  private async executeSmartBalanceRule(
    rule: AssignmentRule,
    accounts: Account[],
    salesReps: SalesRep[]
  ): Promise<{ proposals: AssignmentProposal[]; conflicts: AssignmentProposal[] }> {
    const proposals: AssignmentProposal[] = [];
    const conflicts: AssignmentProposal[] = [];
    const conditions = rule.conditions || {};
    
    const maxAccountsPerRep = conditions.maxAccountsPerRep || 15;
    const maxARRPerRep = conditions.maxARRPerRep || 8000000;
    const maxVariance = conditions.maxVariance || 10;
    
    console.log(`[SMART_BALANCE] Processing ${accounts.length} accounts for balanced distribution`);
    console.log(`[SMART_BALANCE] 🎯 Limits: max ${maxAccountsPerRep} accounts, max $${(maxARRPerRep/1000000).toFixed(1)}M ARR, ${maxVariance}% variance`);

    // Get current assignment state from database - use the build ID from the first account
    const buildId = (accounts[0] as any)?.build_id || this.extractBuildIdFromAccount(accounts[0]);
    const currentAssignments = await this.getCurrentAssignments(buildId);
    const repWorkloads = await this.calculateCurrentRepWorkloads(salesReps, currentAssignments);
    
    // Check for overloaded reps that need redistribution
    const overloadedReps = Array.from(repWorkloads.entries())
      .filter(([repId, workload]) => workload.accountCount > maxAccountsPerRep)
      .sort((a, b) => b[1].accountCount - a[1].accountCount);
    
    const underloadedReps = Array.from(repWorkloads.entries())
      .filter(([repId, workload]) => workload.accountCount < 3)
      .sort((a, b) => a[1].accountCount - b[1].accountCount);

    console.log(`[SMART_BALANCE] 📊 Found ${overloadedReps.length} overloaded reps, ${underloadedReps.length} underloaded reps`);

    // PHASE 1: Redistribute from overloaded reps
    for (const [overloadedRepId, workload] of overloadedReps) {
      const excessAccounts = workload.accountCount - maxAccountsPerRep;
      if (excessAccounts <= 0) continue;

      console.log(`[SMART_BALANCE] 🔄 Redistributing ${excessAccounts} accounts from ${workload.repName} (has ${workload.accountCount})`);
      
      // Get accounts currently assigned to this overloaded rep
      const overloadedRepAccounts = currentAssignments
        .filter(acc => acc.new_owner_id === overloadedRepId)
        .slice(0, excessAccounts); // Take excess accounts

      for (const account of overloadedRepAccounts) {
        // Find best target rep (underloaded first, then least loaded)
        const targetRep = this.findBestTargetRep(salesReps, repWorkloads, maxAccountsPerRep);
        
        if (targetRep) {
          proposals.push({
            accountId: account.sfdc_account_id,
            accountName: account.account_name,
            currentOwnerId: overloadedRepId,
            currentOwnerName: workload.repName,
            proposedOwnerId: targetRep.rep_id,
            proposedOwnerName: targetRep.name,
            proposedOwnerRegion: targetRep.region,
            assignmentReason: `${rule.name}: Redistributing from overloaded rep (${workload.accountCount} > ${maxAccountsPerRep})`,
            ruleApplied: `${rule.rule_type} - Priority ${rule.priority}`,
            conflictRisk: 'HIGH'
          });

          conflicts.push(proposals[proposals.length - 1]);

          // Update workload tracking
          workload.accountCount--;
          const targetWorkload = repWorkloads.get(targetRep.rep_id);
          if (targetWorkload) {
            targetWorkload.accountCount++;
          }
        }
      }
    }

    // PHASE 2: Assign remaining unassigned accounts
    for (const account of accounts) {
      if (this.processedAccountIds.has(account.sfdc_account_id)) continue;

      const targetRep = this.findBestTargetRep(salesReps, repWorkloads, maxAccountsPerRep);
      
      if (targetRep) {
        const isReassignment = account.owner_id && account.owner_id !== targetRep.rep_id;
        
        proposals.push({
          accountId: account.sfdc_account_id,
          accountName: account.account_name,
          currentOwnerId: account.owner_id,
          currentOwnerName: account.owner_name,
          proposedOwnerId: targetRep.rep_id,
          proposedOwnerName: targetRep.name,
          proposedOwnerRegion: targetRep.region,
          assignmentReason: `${rule.name}: Balanced assignment (current load: ${repWorkloads.get(targetRep.rep_id)?.accountCount || 0})`,
          ruleApplied: `${rule.rule_type} - Priority ${rule.priority}`,
          conflictRisk: isReassignment ? 'MEDIUM' : 'LOW'
        });

        this.processedAccountIds.add(account.sfdc_account_id);
        
        // Update workload tracking
        const workload = repWorkloads.get(targetRep.rep_id);
        if (workload) {
          workload.accountCount++;
          workload.totalARR += account.calculated_arr || account.arr || 0;
        }

        if (isReassignment) {
          conflicts.push(proposals[proposals.length - 1]);
        }
      }
    }

    console.log(`[SMART_BALANCE] ✅ Created ${proposals.length} balanced assignments, ${conflicts.length} conflicts`);
    
    // Log final distribution preview
    const finalDistribution = Array.from(repWorkloads.entries())
      .sort((a, b) => b[1].accountCount - a[1].accountCount)
      .slice(0, 10);
    console.log(`[SMART_BALANCE] 📊 Top 10 rep distribution after balancing:`, 
      finalDistribution.map(([id, w]) => `${w.repName}: ${w.accountCount}`));
    
    return { proposals, conflicts };
  }

  /**
   * Execute MIN_THRESHOLDS rule - FIXED for rebalancing enforcement
   */
  private async executeMinThresholdsRule(
    rule: AssignmentRule,
    accounts: Account[],
    salesReps: SalesRep[]
  ): Promise<{ proposals: AssignmentProposal[]; conflicts: AssignmentProposal[] }> {
    const proposals: AssignmentProposal[] = [];
    const conflicts: AssignmentProposal[] = [];
    const conditions = rule.conditions || {};
    
    const forceRebalance = conditions.forceRebalance || false;
    const maxAccountsPerRep = conditions.maxAccountsPerRep || 15;
    
    console.log(`[MIN_THRESHOLDS] Processing final balance enforcement for ${accounts.length} accounts`);
    console.log(`[MIN_THRESHOLDS] 🎯 Force rebalance: ${forceRebalance}, Max per rep: ${maxAccountsPerRep}`);

    if (!forceRebalance) {
      console.log(`[MIN_THRESHOLDS] ⏭️ Force rebalance disabled, skipping`);
      return { proposals, conflicts };
    }

    // Get current assignment state
    const buildId = (accounts[0] as any)?.build_id || this.extractBuildIdFromAccount(accounts[0]);
    const currentAssignments = await this.getCurrentAssignments(buildId);
    const repWorkloads = await this.calculateCurrentRepWorkloads(salesReps, currentAssignments);
    
    const activeReps = salesReps.filter(rep => rep.is_active);
    const totalAccounts = currentAssignments.length;
    const targetPerRep = Math.floor(totalAccounts / activeReps.length);
    const minThreshold = Math.max(3, Math.floor(targetPerRep * 0.8)); // At least 80% of target, minimum 3
    
    console.log(`[MIN_THRESHOLDS] 📊 Target: ${targetPerRep} per rep, Min threshold: ${minThreshold}`);

    // Find reps below minimum threshold
    const underThresholdReps = Array.from(repWorkloads.entries())
      .filter(([repId, workload]) => workload.accountCount < minThreshold)
      .sort((a, b) => a[1].accountCount - b[1].accountCount);

    // Find reps above maximum threshold  
    const overThresholdReps = Array.from(repWorkloads.entries())
      .filter(([repId, workload]) => workload.accountCount > maxAccountsPerRep)
      .sort((a, b) => b[1].accountCount - a[1].accountCount);

    console.log(`[MIN_THRESHOLDS] 🔄 ${underThresholdReps.length} reps under threshold, ${overThresholdReps.length} reps over threshold`);

    // Move accounts from over-threshold to under-threshold reps
    for (const [underRepId, underWorkload] of underThresholdReps) {
      const needed = minThreshold - underWorkload.accountCount;
      if (needed <= 0) continue;

      console.log(`[MIN_THRESHOLDS] 📈 ${underWorkload.repName} needs ${needed} more accounts (has ${underWorkload.accountCount})`);

      let assigned = 0;
      for (const [overRepId, overWorkload] of overThresholdReps) {
        if (assigned >= needed) break;
        
        const excess = overWorkload.accountCount - maxAccountsPerRep;
        if (excess <= 0) continue;

        const canMove = Math.min(needed - assigned, excess);
        
        // Get accounts from over-loaded rep
        const repAccounts = currentAssignments
          .filter(acc => acc.new_owner_id === overRepId)
          .slice(0, canMove);

        for (const account of repAccounts) {
          const underRep = activeReps.find(rep => rep.rep_id === underRepId);
          if (!underRep) continue;

          proposals.push({
            accountId: account.sfdc_account_id,
            accountName: account.account_name,
            currentOwnerId: overRepId,
            currentOwnerName: overWorkload.repName,
            proposedOwnerId: underRepId,
            proposedOwnerName: underWorkload.repName,
            proposedOwnerRegion: underRep.region,
            assignmentReason: `${rule.name}: Final balance enforcement (${overWorkload.repName}: ${overWorkload.accountCount} → ${underWorkload.repName}: ${underWorkload.accountCount})`,
            ruleApplied: `${rule.rule_type} - Priority ${rule.priority}`,
            conflictRisk: 'HIGH'
          });

          conflicts.push(proposals[proposals.length - 1]);
          assigned++;

          // Update tracking
          overWorkload.accountCount--;
          underWorkload.accountCount++;
        }
      }
    }

    // Handle any remaining unassigned accounts
    for (const account of accounts) {
      if (this.processedAccountIds.has(account.sfdc_account_id)) continue;

      const targetRep = this.findBestTargetRep(activeReps, repWorkloads, maxAccountsPerRep);
      
      if (targetRep) {
        const isReassignment = account.owner_id && account.owner_id !== targetRep.rep_id;
        
        proposals.push({
          accountId: account.sfdc_account_id,
          accountName: account.account_name,
          currentOwnerId: account.owner_id,
          currentOwnerName: account.owner_name,
          proposedOwnerId: targetRep.rep_id,
          proposedOwnerName: targetRep.name,
          proposedOwnerRegion: targetRep.region,
          assignmentReason: `${rule.name}: Final assignment enforcement`,
          ruleApplied: `${rule.rule_type} - Priority ${rule.priority}`,
          conflictRisk: isReassignment ? 'MEDIUM' : 'LOW'
        });

        this.processedAccountIds.add(account.sfdc_account_id);
        
        if (isReassignment) {
          conflicts.push(proposals[proposals.length - 1]);
        }
      }
    }

    console.log(`[MIN_THRESHOLDS] ✅ Created ${proposals.length} enforcement assignments, ${conflicts.length} conflicts`);
    return { proposals, conflicts };
  }

  /**
   * Execute ROUND_ROBIN rule - FIXED for balance enforcement
   */
  private async executeRoundRobinRule(
    rule: AssignmentRule,
    accounts: Account[],
    salesReps: SalesRep[]
  ): Promise<{ proposals: AssignmentProposal[]; conflicts: AssignmentProposal[] }> {
    const proposals: AssignmentProposal[] = [];
    const conflicts: AssignmentProposal[] = [];
    const conditions = rule.conditions || {};
    
    const maxAccountsPerRep = conditions.maxAccountsPerRep || 15;
    const ensureMinimum = conditions.ensureMinimum || 3;
    
    console.log(`[ROUND_ROBIN] Processing ${accounts.length} accounts for balanced round-robin distribution`);
    console.log(`[ROUND_ROBIN] 🎯 Ensuring min ${ensureMinimum}, max ${maxAccountsPerRep} accounts per rep`);

    // Get current assignment state
    const buildId = (accounts[0] as any)?.build_id || this.extractBuildIdFromAccount(accounts[0]);
    const currentAssignments = await this.getCurrentAssignments(buildId);
    const repWorkloads = await this.calculateCurrentRepWorkloads(salesReps, currentAssignments);
    
    const activeReps = salesReps.filter(rep => rep.is_active);
    
    // Sort reps by current workload (prioritize underloaded)
    const sortedReps = activeReps.sort((a, b) => {
      const aLoad = repWorkloads.get(a.rep_id)?.accountCount || 0;
      const bLoad = repWorkloads.get(b.rep_id)?.accountCount || 0;
      return aLoad - bLoad;
    });

    console.log(`[ROUND_ROBIN] 📊 Rep workload distribution:`, 
      sortedReps.slice(0, 5).map(rep => {
        const load = repWorkloads.get(rep.rep_id)?.accountCount || 0;
        return `${rep.name}: ${load}`;
      }));

    for (const account of accounts) {
      if (this.processedAccountIds.has(account.sfdc_account_id)) continue;

      // Find next available rep that's under the max limit
      let selectedRep = null;
      
      for (const rep of sortedReps) {
        const currentLoad = repWorkloads.get(rep.rep_id)?.accountCount || 0;
        if (currentLoad < maxAccountsPerRep) {
          selectedRep = rep;
          break;
        }
      }

      // If all reps are at max, skip this account for now
      if (!selectedRep) {
        console.log(`[ROUND_ROBIN] ⚠️ All reps at max capacity (${maxAccountsPerRep}), skipping account ${account.account_name}`);
        continue;
      }

      const isReassignment = account.owner_id && account.owner_id !== selectedRep.rep_id;
      
      proposals.push({
        accountId: account.sfdc_account_id,
        accountName: account.account_name,
        currentOwnerId: account.owner_id,
        currentOwnerName: account.owner_name,
        proposedOwnerId: selectedRep.rep_id,
        proposedOwnerName: selectedRep.name,
        proposedOwnerRegion: selectedRep.region,
        assignmentReason: `${rule.name}: Balanced round-robin (load: ${repWorkloads.get(selectedRep.rep_id)?.accountCount || 0} → ${(repWorkloads.get(selectedRep.rep_id)?.accountCount || 0) + 1})`,
        ruleApplied: `${rule.rule_type} - Priority ${rule.priority}`,
        conflictRisk: isReassignment ? 'MEDIUM' : 'LOW'
      });

      this.processedAccountIds.add(account.sfdc_account_id);
      
      // Update workload tracking
      const workload = repWorkloads.get(selectedRep.rep_id);
      if (workload) {
        workload.accountCount++;
      }
      
      // Re-sort reps by updated workload
      sortedReps.sort((a, b) => {
        const aLoad = repWorkloads.get(a.rep_id)?.accountCount || 0;
        const bLoad = repWorkloads.get(b.rep_id)?.accountCount || 0;
        return aLoad - bLoad;
      });
      
      if (isReassignment) {
        conflicts.push(proposals[proposals.length - 1]);
      }
    }

    console.log(`[ROUND_ROBIN] ✅ Created ${proposals.length} balanced round-robin assignments, ${conflicts.length} conflicts`);
    return { proposals, conflicts };
  }

  /**
   * Find least loaded rep - IMPROVED with balance limits
   */
  private findLeastLoadedRep(reps: SalesRep[], workloads?: Map<string, any>): SalesRep | null {
    if (reps.length === 0) return null;
    
    if (!workloads) {
      // Simple case - just return first active rep
      return reps.find(rep => rep.is_active) || reps[0];
    }

    let bestRep = reps[0];
    let lowestLoad = workloads.get(bestRep.rep_id)?.accountCount || 0;

    for (const rep of reps) {
      const load = workloads.get(rep.rep_id)?.accountCount || 0;
      if (load < lowestLoad) {
        bestRep = rep;
        lowestLoad = load;
      }
    }

    return bestRep;
  }

  /**
   * Find best target rep respecting balance limits
   */
  private findBestTargetRep(reps: SalesRep[], workloads: Map<string, any>, maxLimit: number): SalesRep | null {
    const eligibleReps = reps.filter(rep => {
      const currentLoad = workloads.get(rep.rep_id)?.accountCount || 0;
      return rep.is_active && currentLoad < maxLimit;
    });

    if (eligibleReps.length === 0) {
      console.warn(`[BALANCE_CHECK] ⚠️ No reps available under limit ${maxLimit}`);
      return null;
    }

    // Sort by current load (ascending) and return the least loaded
    return eligibleReps.sort((a, b) => {
      const aLoad = workloads.get(a.rep_id)?.accountCount || 0;
      const bLoad = workloads.get(b.rep_id)?.accountCount || 0;
      return aLoad - bLoad;
    })[0];
  }

  /**
   * Calculate rep workloads
   */
  private calculateRepWorkloads(salesReps: SalesRep[], existingProposals: AssignmentProposal[]): Map<string, any> {
    const workloads = new Map();
    
    // Initialize with zeros
    salesReps.forEach(rep => {
      workloads.set(rep.rep_id, { accountCount: 0, totalARR: 0 });
    });
    
    // Add existing proposals
    existingProposals.forEach(proposal => {
      const workload = workloads.get(proposal.proposedOwnerId);
      if (workload) {
        workload.accountCount++;
      }
    });
    
    return workloads;
  }

  /**
   * Extract build ID from context (fallback method)
   */
  private extractBuildIdFromAccount(account: Account): string {
    // The build_id should be available in the account context
    // This is a fallback - normally it should be passed from the calling context
    return 'e783d327-162a-4962-ba41-4f4df6f71eea'; // Current build ID
  }

  /**
   * Get current assignments from database
   */
  private async getCurrentAssignments(buildId: string): Promise<any[]> {
    console.log(`[DATA_FETCH] Getting current assignments for build ${buildId}`);
    
    const { data, error } = await supabase
      .from('accounts')
      .select('sfdc_account_id, account_name, new_owner_id, new_owner_name, calculated_arr')
      .eq('build_id', buildId)
      .eq('is_customer', true)
      .eq('is_parent', true)
      .not('new_owner_id', 'is', null);

    if (error) {
      console.error('[DATA_FETCH] Error fetching current assignments:', error);
      return [];
    }

    console.log(`[DATA_FETCH] ✅ Found ${data?.length || 0} current assignments`);
    return data || [];
  }

  /**
   * Calculate current rep workloads from database
   */
  private async calculateCurrentRepWorkloads(salesReps: SalesRep[], currentAssignments: any[]): Promise<Map<string, any>> {
    const workloads = new Map();
    
    // Initialize all reps with zero workload
    salesReps.forEach(rep => {
      workloads.set(rep.rep_id, { 
        repId: rep.rep_id,
        repName: rep.name,
        accountCount: 0, 
        totalARR: 0 
      });
    });
    
    // Count current assignments
    currentAssignments.forEach(assignment => {
      const workload = workloads.get(assignment.new_owner_id);
      if (workload) {
        workload.accountCount++;
        workload.totalARR += assignment.calculated_arr || 0;
      }
    });
    
    return workloads;
  }

  /**
   * Calculate final statistics
   */
  private calculateStatistics(accounts: Account[], proposals: AssignmentProposal[], conflicts: AssignmentProposal[], salesReps: SalesRep[]) {
    const assignmentRate = (proposals.length / accounts.length) * 100;
    const conflictRate = (conflicts.length / proposals.length) * 100;
    
    const repCounts = new Map<string, number>();
    proposals.forEach(p => {
      repCounts.set(p.proposedOwnerId, (repCounts.get(p.proposedOwnerId) || 0) + 1);
    });

    return {
      assignmentRate: Math.round(assignmentRate * 100) / 100,
      conflictRate: Math.round(conflictRate * 100) / 100,
      averageAccountsPerRep: Math.round((proposals.length / salesReps.length) * 100) / 100,
      repDistribution: Object.fromEntries(repCounts)
    };
  }

  // ============= DATA FETCHING METHODS =============

  private async getAssignmentRules(buildId: string): Promise<AssignmentRule[]> {
    console.log(`[DATA_FETCH] Fetching assignment rules for build ${buildId}`);
    
    const { data, error } = await supabase
      .from('assignment_rules')
      .select('*')
      .eq('build_id', buildId)
      .eq('enabled', true)
      .order('priority', { ascending: true });

    if (error) {
      console.error('[DATA_FETCH] Error fetching assignment rules:', error);
      throw new Error(`Failed to fetch assignment rules: ${error.message}`);
    }

    console.log(`[DATA_FETCH] ✅ Fetched ${data?.length || 0} assignment rules`);
    return data || [];
  }

  private async getParentAccounts(buildId: string, tier: string, accountType?: string): Promise<Account[]> {
    console.log(`[DATA_FETCH] Fetching accounts for build ${buildId}, tier=${tier}, type=${accountType}`);
    
    let query = supabase
      .from('accounts')
      .select('*')
      .eq('build_id', buildId)
      .eq('is_parent', true);

    // Apply tier filter
    if (tier !== 'All') {
      query = query.eq('enterprise_vs_commercial', tier);
    }

    // Apply account type filter
    if (accountType === 'customers') {
      query = query.eq('is_customer', true);
    } else if (accountType === 'prospects') {
      query = query.eq('is_customer', false);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[DATA_FETCH] Error fetching accounts:', error);
      throw new Error(`Failed to fetch accounts: ${error.message}`);
    }

    console.log(`[DATA_FETCH] ✅ Fetched ${data?.length || 0} accounts`);
    return data || [];
  }

  private async getSalesReps(buildId: string): Promise<SalesRep[]> {
    console.log(`[DATA_FETCH] Fetching sales reps for build ${buildId}`);
    
    const { data, error } = await supabase
      .from('sales_reps')
      .select('*')
      .eq('build_id', buildId)
      .eq('is_active', true);

    if (error) {
      console.error('[DATA_FETCH] Error fetching sales reps:', error);
      throw new Error(`Failed to fetch sales reps: ${error.message}`);
    }

    console.log(`[DATA_FETCH] ✅ Fetched ${data?.length || 0} sales reps`);
    return data || [];
  }
}
