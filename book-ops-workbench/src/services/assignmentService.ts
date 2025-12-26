import { supabase } from '@/integrations/supabase/client';
import { AssignmentServiceHelpers } from './assignmentServiceHelpers';
import { getAccountARR, HIGH_VALUE_ARR_THRESHOLD, TIER_1_PRIORITY_EMPLOYEE_THRESHOLD, WORKLOAD_SCORE_WEIGHTS, APPROACHING_CAPACITY_THRESHOLD, SUPABASE_LIMITS, type AssignmentConfidence } from '@/_domain';

export interface Account {
  sfdc_account_id: string;
  account_name: string;
  parent_id?: string;
  ultimate_parent_id?: string;
  enterprise_vs_commercial?: string;
  expansion_tier?: string;
  initial_sale_tier?: string;
  arr?: number;
  calculated_arr?: number;
  atr?: number;
  calculated_atr?: number;
  hierarchy_bookings_arr_converted?: number;
  owner_id?: string;
  owner_name?: string;
  geo?: string;
  hq_country?: string;
  sales_territory?: string;
  is_customer?: boolean;
  risk_flag?: boolean;
  expansion_score?: number;
  employees?: number;
  is_parent?: boolean;
}

export interface SalesRep {
  rep_id: string;
  name: string;
  /** @deprecated Use team_tier instead. Removed from import in v1.4.1 */
  team?: string;
  team_tier?: 'SMB' | 'Growth' | 'MM' | 'ENT' | null;
  region?: string;
  manager?: string;
  flm?: string;
  slm?: string;
  is_active?: boolean;
  include_in_assignments?: boolean;
  is_manager?: boolean;
  status_notes?: string;
}

interface AssignmentRule {
  id: string;
  rule_type: string;
  conditions: any; // Changed from specific type to any to match Supabase Json type
  enabled: boolean;
  priority: number;
  name?: string;
  description?: string;
}

interface BuildConfig {
  enterprise_threshold: number;
  apply_50k_rule: boolean;
  geo_emea_mappings: { [key: string]: string[] };
  holdover_policy: {
    accountsAndOpps: boolean;
    cutoffDays: number;
  };
}

interface AssignmentProposal {
  accountId: string;
  accountName: string;
  currentOwnerId?: string;
  currentOwnerName?: string;
  proposedOwnerId: string;
  proposedOwnerName: string;
  proposedOwnerRegion?: string;
  assignmentReason: string;
  warningDetails?: string;
  ruleApplied: string;
  /** How confident is the system in this assignment? @see MASTER_LOGIC.mdc §13.4.1 */
  confidence: AssignmentConfidence;
}

export interface RebalanceSuggestion {
  accountId: string;
  accountName: string;
  accountARR: number;
  fromRepId: string;
  fromRepName: string;
  toRepId: string;
  toRepName: string;
  reason: string;
  estimatedImpact: string;
}

export interface RuleExecutionSummary {
  ruleName: string;
  accountsProcessed: number;
  accountsAssigned: number;
  percentOfTotal: number;
}

interface AssignmentResult {
  totalAccounts: number;
  assignedAccounts: number;
  unassignedAccounts: number;
  proposals: AssignmentProposal[];
  conflicts: AssignmentProposal[];
  rebalancingSuggestions?: RebalanceSuggestion[];
  rebalanceWarnings?: string[];
  ruleExecutionSummary?: RuleExecutionSummary[];
  statistics: {
    byGeo: { [key: string]: { 
      repCount: number; 
      customerAccounts: number; 
      prospectAccounts?: number; // Optional for backward compatibility
      totalARR: number; 
      totalATR?: number; // New ATR field
      tier1Accounts?: number; // Optional for backward compatibility
    } };
    byTier?: { [key: string]: number }; // Optional for backward compatibility
    byRep: { [key: string]: { 
      parentAccounts?: number; // Optional for backward compatibility
      customerAccounts?: number; // Optional for backward compatibility
      prospectAccounts?: number; // Optional for backward compatibility
      totalAccounts?: number; // New field for enhanced stats
      totalARR: number; 
      totalATR?: number; // New ATR field
      customerARR?: number; // Optional for backward compatibility
      tier1Count?: number; // Optional for backward compatibility
      tier2Count?: number; // New field
      tier1CustomerCount?: number; // Optional for backward compatibility
      tier1ProspectCount?: number; // Optional for backward compatibility
      riskCount?: number; // New risk count field
    } };
    ruleUsage?: { [key: string]: { count: number; percentage: number } }; // New rule usage analytics
    ruleUsageByRegion?: { [key: string]: { [key: string]: number } }; // New regional rule usage
  };
}

class AssignmentService {
  private static instance: AssignmentService;

  static getInstance(): AssignmentService {
    if (!AssignmentService.instance) {
      AssignmentService.instance = new AssignmentService();
    }
    return AssignmentService.instance;
  }

  /**
   * Rule-based assignment engine with priority processing
   */
  async generateAssignments(
    buildId: string,
    tier: 'Commercial' | 'Enterprise' | 'All' = 'All',
    accountType?: 'customers' | 'prospects' | 'all'
  ): Promise<AssignmentResult> {
    try {
      // Fetch assignment rules, configuration, and data
      const [assignmentRules, config, accounts, salesReps] = await Promise.all([
        this.getAssignmentRules(buildId),
        this.getBuildConfiguration(buildId),
        this.getParentAccounts(buildId, tier, accountType),
        this.getSalesReps(buildId)
      ]);

      // Calculate realistic distribution targets with enhanced workload balancing
      const totalAccounts = accounts.length;
      const totalReps = salesReps.length;
      const targetAccountsPerRep = Math.floor(totalAccounts / totalReps);
      const varianceAllowance = Math.floor(targetAccountsPerRep * 0.15); // 15% variance
      const maxAccountsPerRep = targetAccountsPerRep + varianceAllowance; // Realistic max based on variance
      
      // Enhanced workload balancing - calculate ARR distribution targets with multi-factor tracking
      const totalARR = accounts.reduce((sum, acc) => sum + getAccountARR(acc), 0);
      const targetARRPerRep = totalARR / totalReps;
      const maxARRPerRep = targetARRPerRep * 1.25; // 25% variance for ARR (more restrictive)
      const maxAccountsPerRepStrict = targetAccountsPerRep + Math.floor(targetAccountsPerRep * 0.10); // 10% variance for accounts (stricter)
      
      console.log(`[AssignmentService] 🎯 Rule-Based Processing: ${assignmentRules.length} rules`);
      console.log(`[AssignmentService] 📊 Enhanced Distribution targets: ${targetAccountsPerRep} accounts/rep (strict max: ${maxAccountsPerRepStrict}, ±10% variance)`);
      console.log(`[AssignmentService] 💰 ARR targets: $${(targetARRPerRep/1000000).toFixed(1)}M/rep (max: $${(maxARRPerRep/1000000).toFixed(1)}M, ±25% variance)`);
      console.log(`[AssignmentService] Processing ${accounts.length} parent accounts across ${totalReps} reps`);

      // Initialize tracking
      const proposals: AssignmentProposal[] = [];
      const conflicts: AssignmentProposal[] = [];
      const processedAccountIds = new Set<string>();
      const repsByUSRegion = this.groupRepsByUSRegion(salesReps);
      const workloadTracker = await this.initializeEnhancedWorkloadTracker(buildId, salesReps, accounts);

      // Sort rules by priority (1 = highest priority)
      const sortedRules = assignmentRules
        .filter(rule => rule.enabled)
        .sort((a, b) => a.priority - b.priority);

      console.log(`[AssignmentService] 📋 Processing rules in order:`, 
        sortedRules.map(r => `${r.priority}: ${r.rule_type}`));

      // Process each rule in priority order
      for (const rule of sortedRules) {
        console.log(`\n[AssignmentService] 🎯 Applying Rule ${rule.priority}: ${rule.rule_type} (${rule.name})`);
        
        // Get accounts not yet processed by previous rules
        const unprocessedAccounts = accounts.filter(acc => !processedAccountIds.has(acc.sfdc_account_id));
        
        if (unprocessedAccounts.length === 0) {
          console.log(`[AssignmentService] ✅ All accounts processed by previous rules`);
          break;
        }

        console.log(`[AssignmentService] 📦 ${unprocessedAccounts.length} accounts remaining for ${rule.rule_type}`);
        
        // Log sample of unprocessed accounts for debugging
        if (unprocessedAccounts.length > 0) {
          console.log(`[AssignmentService] 📋 Sample unprocessed accounts for ${rule.rule_type}:`);
          unprocessedAccounts.slice(0, 3).forEach(acc => {
            const tierInfo = acc.expansion_tier || acc.initial_sale_tier || 'unknown';
            console.log(`[AssignmentService]   - ${acc.account_name} (Tier: ${tierInfo}, Current Owner: ${acc.owner_name || 'none'})`);
          });
          if (unprocessedAccounts.length > 3) {
            console.log(`[AssignmentService]   ... and ${unprocessedAccounts.length - 3} more`);
          }
        }

        // Apply the specific rule
        const ruleProposals = await this.applyRule(
          rule,
          unprocessedAccounts,
          salesReps,
          repsByUSRegion,
          workloadTracker,
          config,
          maxAccountsPerRepStrict,
          maxARRPerRep
        );

        // Process proposals and update tracking
        for (const proposal of ruleProposals) {
          if (!processedAccountIds.has(proposal.accountId)) {
            proposals.push(proposal);
            processedAccountIds.add(proposal.accountId);
            
            // Enhanced workload tracker update with ARR tracking
            this.updateEnhancedWorkloadTracker(workloadTracker, proposal.proposedOwnerId, proposal.accountId, accounts);
            
            // Mark as conflict if low confidence
            if (proposal.confidence === 'LOW') {
              conflicts.push(proposal);
            }
          }
        }

        console.log(`[AssignmentService] ✅ Rule ${rule.rule_type}: ${ruleProposals.length} assignments made`);
        console.log(`[AssignmentService] 📊 Total processed so far: ${processedAccountIds.size}/${accounts.length} accounts`);
      }

      // Handle continuity for unchanged assignments (accounts that stay with current owner)
      const unchangedAccounts = accounts.filter(acc => 
        !processedAccountIds.has(acc.sfdc_account_id) && 
        acc.owner_id &&
        salesReps.some(rep => rep.rep_id === acc.owner_id)
      );

      for (const account of unchangedAccounts) {
        const currentRep = salesReps.find(rep => rep.rep_id === account.owner_id);
        if (currentRep) {
          // Create continuity proposal showing the account stays with current owner
          proposals.push({
            accountId: account.sfdc_account_id,
            accountName: account.account_name,
            currentOwnerId: account.owner_id,
            currentOwnerName: account.owner_name,
            proposedOwnerId: account.owner_id,
            proposedOwnerName: account.owner_name || currentRep.name,
            proposedOwnerRegion: currentRep.region,
            assignmentReason: 'Account Continuity - maintaining existing assignment',
            ruleApplied: 'CONTINUITY',
            confidence: 'HIGH'
          });
          
          processedAccountIds.add(account.sfdc_account_id);
          this.updateEnhancedWorkloadTracker(workloadTracker, account.owner_id, account.sfdc_account_id, accounts);
        }
      }

      // VALIDATION: Ensure no duplicate proposals
      const uniqueProposals = proposals.filter((proposal, index, self) => 
        index === self.findIndex(p => p.accountId === proposal.accountId)
      );
      
      if (uniqueProposals.length !== proposals.length) {
        console.warn(`[AssignmentService] ⚠️ Removed ${proposals.length - uniqueProposals.length} duplicate proposals`);
      }
      
      // CRITICAL VALIDATION: Ensure proposals <= accounts
      if (uniqueProposals.length > accounts.length) {
        console.error(`[AssignmentService] ❌ CRITICAL: More proposals (${uniqueProposals.length}) than accounts (${accounts.length})`);
        throw new Error(`Invalid assignment state: ${uniqueProposals.length} proposals for ${accounts.length} accounts`);
      }

      // FINAL VALIDATION: Check distribution meets 15% variance requirement
      this.validateDistributionVariance(uniqueProposals, accounts, salesReps, targetAccountsPerRep);

      // CRITICAL: Save assignments to database during generation (not just execution)
      await this.saveAssignmentProposals(buildId, uniqueProposals);

      // Generate enhanced statistics
      const statistics = this.generateEnhancedStatistics(uniqueProposals, accounts, salesReps, workloadTracker);

      console.log(`[AssignmentService] ✅ Rule-based assignment complete:`);
      console.log(`[AssignmentService] 📊 Total: ${uniqueProposals.length} proposals for ${accounts.length} accounts`);
      console.log(`[AssignmentService] 📈 Processed: ${processedAccountIds.size}/${accounts.length} accounts`);

      return {
        totalAccounts: accounts.length,
        assignedAccounts: uniqueProposals.length,
        unassignedAccounts: Math.max(0, accounts.length - processedAccountIds.size),
        proposals: uniqueProposals,
        conflicts,
        statistics
      };

    } catch (error) {
      console.error('[AssignmentService] Error generating assignments:', error);
      throw error;
    }
  }

  /**
   * Save assignment proposals to database during generation phase
   */
  private async saveAssignmentProposals(buildId: string, proposals: AssignmentProposal[]): Promise<void> {
    try {
      console.log(`[AssignmentService] 💾 Saving ${proposals.length} assignment proposals to database...`);

      // Clear ALL existing assignments for this build to avoid constraint violations
      console.log(`[AssignmentService] 🗑️ Clearing all existing assignments for build ${buildId}...`);
      await supabase
        .from('assignments')
        .delete()
        .eq('build_id', buildId);

      // Save assignments to assignments table
      const currentUser = await supabase.auth.getUser();
      const assignmentRecords = proposals.map(proposal => {
        // Build rationale - avoid double-prefix when assignmentReason already starts with priority code
        let rationale: string;
        const alreadyHasPrefix = proposal.assignmentReason?.match(/^(P\d+|RO):\s/i);
        if (alreadyHasPrefix) {
          rationale = proposal.assignmentReason;
        } else {
          rationale = `${proposal.ruleApplied}: ${proposal.assignmentReason}`;
        }
        
        return {
          build_id: buildId,
          sfdc_account_id: proposal.accountId,
          proposed_owner_id: proposal.proposedOwnerId,
          proposed_owner_name: proposal.proposedOwnerName,
          proposed_team: '',
          assignment_type: 'AUTO_COMMERCIAL', // All automated assignments use this type
          rationale,
          is_approved: false, // Mark as pending until execution
          created_by: currentUser.data.user?.id
        };
      });

      const { error: assignmentError } = await supabase
        .from('assignments')
        .insert(assignmentRecords);

      if (assignmentError) {
        console.error('[AssignmentService] Assignment insertion error:', assignmentError);
        if (assignmentError.code === '23505') {
          throw new Error('Assignment constraint violation: Some accounts may already have assignments. Please try resetting assignments first.');
        }
        throw assignmentError;
      }

      // Update accounts with new_owner_* fields (keep current owner_* fields unchanged)
      const accountUpdatePromises = proposals.map(proposal =>
        supabase
          .from('accounts')
          .update({
            new_owner_id: proposal.proposedOwnerId,
            new_owner_name: proposal.proposedOwnerName
          })
          .eq('sfdc_account_id', proposal.accountId)
          .eq('build_id', buildId)
      );

      await Promise.all(accountUpdatePromises);

      // Cascade new assignments to child accounts and opportunities
      await this.cascadeNewAssignments(buildId, proposals);

      console.log(`[AssignmentService] ✅ Successfully saved all assignment proposals to database`);

    } catch (error) {
      console.error('[AssignmentService] Error saving assignment proposals:', error);
      throw error;
    }
  }

  /**
   * Cascade new assignment proposals to child accounts and opportunities
   */
  private async cascadeNewAssignments(buildId: string, proposals: AssignmentProposal[]): Promise<void> {
    try {
      console.log(`[AssignmentService] 🔄 Cascading new assignments to child accounts and opportunities...`);

      // First, get all child account IDs for all proposals (including lock status)
      const parentAccountIds = proposals.map(p => p.accountId);
      
      const { data: childAccounts, error: childError } = await supabase
        .from('accounts')
        .select('sfdc_account_id, ultimate_parent_id, exclude_from_reassignment')
        .eq('build_id', buildId)
        .in('ultimate_parent_id', parentAccountIds);

      if (childError) {
        console.warn('[AssignmentService] Warning fetching child accounts:', childError);
        // Continue without child accounts if query fails
      }

      // Create a map of parent -> NON-LOCKED child account IDs (for opportunity cascade)
      // Locked children should retain their own owner, so their opportunities shouldn't be updated
      const parentToChildMap = new Map<string, string[]>();
      proposals.forEach(p => {
        parentToChildMap.set(p.accountId, [p.accountId]); // Include parent itself
      });

      childAccounts?.forEach(child => {
        // Skip locked children - they retain their own ownership
        if (child.exclude_from_reassignment === true) {
          return;
        }
        if (child.ultimate_parent_id && parentToChildMap.has(child.ultimate_parent_id)) {
          parentToChildMap.get(child.ultimate_parent_id)!.push(child.sfdc_account_id);
        }
      });

      // Update child accounts with new_owner_* fields (skip locked children)
      const childAccountPromises = proposals.map(async (proposal) => {
        try {
          const { error } = await supabase
            .from('accounts')
            .update({
              new_owner_id: proposal.proposedOwnerId,
              new_owner_name: proposal.proposedOwnerName
            })
            .eq('ultimate_parent_id', proposal.accountId)
            .eq('build_id', buildId)
            .neq('is_parent', true) // Only update child accounts
            .or('exclude_from_reassignment.is.null,exclude_from_reassignment.eq.false'); // Skip locked children

          if (error) {
            console.warn(`[AssignmentService] Warning updating child accounts for ${proposal.accountId}:`, error);
          }
        } catch (error) {
          console.warn(`[AssignmentService] Warning updating child accounts for ${proposal.accountId}:`, error);
        }
      });

      // Update opportunities with new_owner_* fields in batches to avoid timeouts
      const BATCH_SIZE = 50; // Process opportunities in smaller batches
      const opportunityPromises = [];
      
      for (let i = 0; i < proposals.length; i += BATCH_SIZE) {
        const batch = proposals.slice(i, i + BATCH_SIZE);
        
        const batchPromise = Promise.all(batch.map(async (proposal) => {
          try {
            const accountIds = parentToChildMap.get(proposal.accountId) || [proposal.accountId];
            
            const { error } = await supabase
              .from('opportunities')
              .update({
                new_owner_id: proposal.proposedOwnerId,
                new_owner_name: proposal.proposedOwnerName
              })
              .eq('build_id', buildId)
              .in('sfdc_account_id', accountIds);

            if (error) {
              console.warn(`[AssignmentService] Warning updating opportunities for ${proposal.accountId}:`, error);
            }
          } catch (error) {
            console.warn(`[AssignmentService] Warning updating opportunities for ${proposal.accountId}:`, error);
          }
        }));
        
        opportunityPromises.push(batchPromise);
        
        // Add small delay between batches to prevent overwhelming the database
        if (i + BATCH_SIZE < proposals.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      await Promise.allSettled([...childAccountPromises, ...opportunityPromises]);
      console.log(`[AssignmentService] ✅ Completed cascade of new assignments`);

    } catch (error) {
      console.warn('[AssignmentService] Warning in cascadeNewAssignments:', error);
      // Don't throw - this shouldn't stop the main assignment process
    }
  }

  /**
   * Get assignment rules from database with build-specific configurations
   */
  private async getAssignmentRules(buildId: string): Promise<AssignmentRule[]> {
    try {
      const { data, error } = await supabase
        .from('assignment_rules')
        .select('*')
        .or(`build_id.eq.${buildId},build_id.is.null`)
        .eq('enabled', true)
        .order('priority');

      if (error) {
        console.error('[AssignmentService] Error fetching assignment rules:', error);
        return [];
      }

      console.log(`[AssignmentService] 📋 Loaded ${data?.length || 0} active assignment rules`);
      return data || [];
    } catch (error) {
      console.error('[AssignmentService] Error loading assignment rules:', error);
      return [];
    }
  }

  /**
   * Apply specific assignment rule with its configurations
   */
  private async applyRule(
    rule: any,
    accounts: Account[],
    salesReps: SalesRep[],
    repsByUSRegion: Map<string, SalesRep[]>,
    workloadTracker: Map<string, any>,
    config: BuildConfig,
    maxAccountsPerRep: number,
    maxARRPerRep: number
  ): Promise<AssignmentProposal[]> {
    const proposals: AssignmentProposal[] = [];
    const conditions = rule.conditions || {};

    console.log(`[AssignmentService] 🎯 Applying ${rule.rule_type} with conditions:`, conditions);

    switch (rule.rule_type) {
      case 'MIN_THRESHOLDS':
        return this.applyMinThresholdsRule(rule, accounts, salesReps, workloadTracker, maxAccountsPerRep);
      
      case 'GEO_FIRST':
        return this.applyGeoFirstRule(rule, accounts, repsByUSRegion, workloadTracker, maxAccountsPerRep, salesReps, maxARRPerRep);
      
      case 'CONTINUITY':
        return this.applyContinuityRule(rule, accounts, salesReps, workloadTracker, maxAccountsPerRep);
      
      case 'TIER_BALANCE':
        return this.applyTierBalanceRule(rule, accounts, salesReps, workloadTracker, maxAccountsPerRep);
      
      case 'ROUND_ROBIN':
        return this.applyRoundRobinRule(rule, accounts, salesReps, workloadTracker, maxAccountsPerRep);
      
      default:
        console.warn(`[AssignmentService] Unknown rule type: ${rule.rule_type}`);
        return [];
    }
  }

  /**
   * Apply GEO_FIRST rule with enhanced geo-continuity logic
   * Priority #1: If account owner is in correct geo, keep them
   * Priority #2: If account owner is not in correct geo, reassign to someone in correct geo
   */
  private applyGeoFirstRule(
    rule: any,
    accounts: Account[],
    repsByUSRegion: Map<string, SalesRep[]>,
    workloadTracker: Map<string, any>,
    maxAccountsPerRep: number,
    salesReps: SalesRep[],
    maxARRPerRep: number
  ): AssignmentProposal[] {
    const proposals: AssignmentProposal[] = [];
    const conditions = rule.conditions || {};
    const territoryMappings = conditions.territoryMappings || {};
    const fallbackStrategy = conditions.fallbackStrategy || 'ROUND_ROBIN';
    
    console.log(`[GEO_FIRST] 🗺️ Processing ${accounts.length} accounts with enhanced geo-continuity logic`);
    
    for (const account of accounts) {
      const territory = account.sales_territory;
      if (!territory) {
        console.log(`[GEO_FIRST] ⚠️ Skipping account ${account.account_name} - no sales_territory`);
        continue;
      }
      
      // Find which region this territory belongs to
      // Handle both territory->region mapping (current format) and region->territories mapping (legacy)
      let targetRegion = '';
      
      // Check if it's the new territory->region format
      if (territoryMappings[territory] && typeof territoryMappings[territory] === 'string') {
        targetRegion = territoryMappings[territory];
        console.log(`[GEO_FIRST] 📍 Found territory ${territory} mapped to region ${targetRegion}`);
      } else {
        // Fallback to legacy region->territories format
        for (const [region, territories] of Object.entries(territoryMappings)) {
          if (Array.isArray(territories) && territories.includes(territory)) {
            targetRegion = region;
            console.log(`[GEO_FIRST] 📍 Found territory ${territory} in region ${targetRegion} (legacy format)`);
            break;
          }
        }
      }
      
      if (!targetRegion) {
        console.log(`[GEO_FIRST] ⚠️ Territory ${territory} not found in territory mappings for account ${account.account_name}`);
        continue;
      }
      
      // PRIORITY #1: Check if current owner is in the correct geo
      if (account.owner_id) {
        const currentRep = salesReps.find(rep => rep.rep_id === account.owner_id);
        if (currentRep && currentRep.region === targetRegion) {
          const currentWorkload = workloadTracker.get(currentRep.rep_id)?.accountCount || 0;
          
          // Keep current assignment if rep is in correct geo AND not severely overloaded
          if (currentWorkload < maxAccountsPerRep * 1.5) {  // Allow 50% overload for geo continuity
            console.log(`[GEO_FIRST] ✅ CONTINUITY: Keeping ${account.account_name} with ${currentRep.name} (same geo: ${targetRegion})`);
            continue; // No proposal needed - keeping current assignment
          }
        }
      }
      
      // PRIORITY #2: Current owner not in correct geo OR severely overloaded, reassign
      const regionReps = repsByUSRegion.get(targetRegion) || [];
      if (regionReps.length === 0) {
        console.log(`[GEO_FIRST] ⚠️ No reps found for region ${targetRegion} (territory: ${territory})`);
        continue;
      }
      
      // Find best rep with capacity, prioritizing balanced workload
      let bestRep: SalesRep | null = null;
      let lowestScore = Infinity;
      
      for (const rep of regionReps) {
        const workload = workloadTracker.get(rep.rep_id) || { accountCount: 0, totalARR: 0 };
        const accountCount = workload.accountCount || 0;
        const totalARR = workload.totalARR || 0;
        
        // Skip if at capacity
        if (accountCount >= maxAccountsPerRep) continue;
        
        // Enhanced multi-factor scoring: account count + ARR balance + tier weighting
        const accountScore = accountCount * 1.0;
        const arrScore = (totalARR / 10000000) * 0.5; // $10M ARR = 0.5 points
        
        // Add account ARR weight to consider incoming assignment impact
        // Use getAccountARR from @/_domain for SSOT compliance
        const accountARR = getAccountARR(account);
        const arrImpactScore = (accountARR / 10000000) * 0.3; // Consider incoming ARR impact
        
        const totalScore = accountScore + arrScore + arrImpactScore;
        
        if (totalScore < lowestScore) {
          bestRep = rep;
          lowestScore = totalScore;
        }
      }
      
      if (!bestRep) {
        console.log(`[GEO_FIRST] ⚠️ No available capacity in region ${targetRegion} for ${account.account_name}`);
        continue;
      }
      
      // Enhanced assignment validation - check if this assignment would cause severe imbalance
      const selectedRepWorkload = workloadTracker.get(bestRep.rep_id) || { accountCount: 0, totalARR: 0 };
      // Use getAccountARR from @/_domain for SSOT compliance
      const newTotalARR = (selectedRepWorkload.totalARR || 0) + getAccountARR(account);
      
      // Warn if assignment would exceed balanced thresholds significantly
      if (newTotalARR > maxARRPerRep) {
        console.warn(`[GEO_FIRST] ⚠️ Assignment of ${account.account_name} to ${bestRep.name} would exceed ARR target ($${(newTotalARR/1000000).toFixed(1)}M > $${(maxARRPerRep/1000000).toFixed(1)}M)`);
      }
      
      const currentRep = account.owner_id ? salesReps.find(rep => rep.rep_id === account.owner_id) : null;
      const reason = currentRep && currentRep.region !== targetRegion 
        ? `GEO_REASSIGNMENT: Moving from ${currentRep.name} (${currentRep.region}) to ${bestRep.name} (${targetRegion}) for territory alignment`
        : `GEO_FIRST: Assigning to ${bestRep.name} in target region ${targetRegion}`;
      
      proposals.push({
        accountId: account.sfdc_account_id,
        accountName: account.account_name,
        currentOwnerId: account.owner_id,
        currentOwnerName: account.owner_name,
        proposedOwnerId: bestRep.rep_id,
        proposedOwnerName: bestRep.name,
        proposedOwnerRegion: bestRep.region,
        assignmentReason: reason,
        ruleApplied: 'GEO_FIRST',
        // Changing owner = medium confidence, keeping owner = high confidence
        confidence: account.owner_id && account.owner_id !== bestRep.rep_id ? 'MEDIUM' : 'HIGH'
      });
      
      // Update workload tracker
      this.updateWorkloadTracker(workloadTracker, bestRep.rep_id, account.sfdc_account_id, accounts);
    }
    
    console.log(`[GEO_FIRST] ✅ Processed ${accounts.length} accounts, generated ${proposals.length} geo-based assignments`);
    return proposals;
  }

  /**
   * Apply CONTINUITY rule using database configuration
   */
  private applyContinuityRule(
    rule: any,
    accounts: Account[],
    salesReps: SalesRep[],
    workloadTracker: Map<string, any>,
    maxAccountsPerRep: number
  ): AssignmentProposal[] {
    const proposals: AssignmentProposal[] = [];
    const conditions = rule.conditions || {};
    const minimumOwnershipDays = conditions.minimumOwnershipDays || 30;
    const overrideThreshold = conditions.overrideThreshold || 25;
    const skipIfOverloaded = conditions.skipIfOverloaded || true;
    const requireRegionalMatch = conditions.requireRegionalMatch || true;
    
    console.log(`[CONTINUITY] 🔄 Processing ${accounts.length} accounts with ${minimumOwnershipDays} day minimum`);
    
    for (const account of accounts) {
      if (!account.owner_id) continue;
      
      const currentRep = salesReps.find(rep => rep.rep_id === account.owner_id);
      if (!currentRep) continue;
      
      const currentWorkload = workloadTracker.get(currentRep.rep_id)?.accountCount || 0;
      const overloadPercent = ((currentWorkload - maxAccountsPerRep) / maxAccountsPerRep) * 100;
      
      // Check if we should skip continuity due to overload
      if (skipIfOverloaded && overloadPercent > overrideThreshold) {
        console.log(`[CONTINUITY] Skipping ${account.account_name} - rep ${currentRep.name} overloaded by ${overloadPercent.toFixed(1)}%`);
        continue;
      }
      
      // Maintain continuity if conditions are met
      if (currentWorkload < maxAccountsPerRep || overloadPercent <= overrideThreshold) {
        proposals.push({
          accountId: account.sfdc_account_id,
          accountName: account.account_name,
          currentOwnerId: account.owner_id,
          currentOwnerName: account.owner_name,
          proposedOwnerId: currentRep.rep_id,
          proposedOwnerName: currentRep.name,
          proposedOwnerRegion: currentRep.region,
          assignmentReason: `CONTINUITY: Maintaining assignment with ${currentRep.name} (${minimumOwnershipDays}+ days, workload: ${currentWorkload}/${maxAccountsPerRep})`,
          ruleApplied: 'CONTINUITY',
          confidence: 'HIGH'
        });
      }
    }
    
    console.log(`[CONTINUITY] ✅ Maintained ${proposals.length} existing assignments`);
    return proposals;
  }

  /**
   * Apply TIER_BALANCE rule using database configuration
   * NOTE: This rule now ONLY processes Tier 1 accounts for balanced distribution
   */
  private applyTierBalanceRule(
    rule: any,
    accounts: Account[],
    salesReps: SalesRep[],
    workloadTracker: Map<string, any>,
    maxAccountsPerRep: number
  ): AssignmentProposal[] {
    const proposals: AssignmentProposal[] = [];
    const conditions = rule.conditions || {};
    const tierFields = conditions.tierFields || ['expansion_tier'];
    const distributionMethod = conditions.distributionMethod || 'equal_percentage';
    const maxVariancePercent = conditions.maxVariancePercent || 15;
    
    console.log(`[TIER_BALANCE] ⚖️ Processing ${accounts.length} accounts using fields: ${tierFields.join(', ')}`);
    console.log(`[TIER_BALANCE] 🎯 ONLY processing Tier 1 accounts for balanced distribution`);
    
    // Filter to ONLY Tier 1 accounts
    const tier1Accounts: Account[] = [];
    const skippedAccounts: { account: Account, tier: string, reason: string }[] = [];
    
    for (const account of accounts) {
      let detectedTier = 'unknown';
      let isTier1 = false;
      
      // Check all tier fields for Tier 1 designation
      for (const field of tierFields) {
        const tierValue = account[field as keyof Account] as string;
        if (tierValue) {
          const lowerTierValue = tierValue.toLowerCase();
          
          // Detect actual tier for logging
          if (lowerTierValue.includes('tier 1') || lowerTierValue.includes('tier1')) {
            detectedTier = 'Tier 1';
            isTier1 = true;
            break;
          } else if (lowerTierValue.includes('tier 2') || lowerTierValue.includes('tier2')) {
            detectedTier = 'Tier 2';
          } else if (lowerTierValue.includes('tier 3') || lowerTierValue.includes('tier3')) {
            detectedTier = 'Tier 3';
          } else if (lowerTierValue.includes('tier 4') || lowerTierValue.includes('tier4')) {
            detectedTier = 'Tier 4';
          } else {
            detectedTier = tierValue; // Use actual value if no standard tier pattern
          }
        }
      }
      
      if (isTier1) {
        tier1Accounts.push(account);
      } else {
        skippedAccounts.push({
          account,
          tier: detectedTier,
          reason: `Not Tier 1 (detected: ${detectedTier})`
        });
      }
    }
    
    console.log(`[TIER_BALANCE] 📊 Tier Analysis:`);
    console.log(`[TIER_BALANCE] ✅ Tier 1 accounts: ${tier1Accounts.length}`);
    console.log(`[TIER_BALANCE] ⏭️  Skipped accounts: ${skippedAccounts.length}`);
    
    // Log first few skipped accounts for debugging
    if (skippedAccounts.length > 0) {
      console.log(`[TIER_BALANCE] 📋 Sample of skipped accounts:`);
      skippedAccounts.slice(0, 5).forEach(skip => {
        console.log(`[TIER_BALANCE]   - ${skip.account.account_name}: ${skip.reason}`);
      });
      if (skippedAccounts.length > 5) {
        console.log(`[TIER_BALANCE]   ... and ${skippedAccounts.length - 5} more`);
      }
    }
    
    // Only process Tier 1 accounts if we have any
    if (tier1Accounts.length === 0) {
      console.log(`[TIER_BALANCE] ⚠️ No Tier 1 accounts found to balance`);
      return proposals;
    }
    
    // Distribute Tier 1 accounts equally across reps
    const accountsPerRep = Math.floor(tier1Accounts.length / salesReps.length);
    const remainder = tier1Accounts.length % salesReps.length;
    
    console.log(`[TIER_BALANCE] 🎯 Distributing ${tier1Accounts.length} Tier 1 accounts: ${accountsPerRep} per rep + ${remainder} remainder`);
    
    let accountIndex = 0;
    for (let repIndex = 0; repIndex < salesReps.length; repIndex++) {
      const rep = salesReps[repIndex];
      const currentWorkload = workloadTracker.get(rep.rep_id)?.accountCount || 0;
      
      if (currentWorkload >= maxAccountsPerRep) {
        console.log(`[TIER_BALANCE] ⏭️  Skipping rep ${rep.name} - at capacity (${currentWorkload}/${maxAccountsPerRep})`);
        continue;
      }
      
      const assignmentCount = accountsPerRep + (repIndex < remainder ? 1 : 0);
      const availableCapacity = maxAccountsPerRep - currentWorkload;
      const actualAssignments = Math.min(assignmentCount, availableCapacity);
      
      console.log(`[TIER_BALANCE] 👤 Rep ${rep.name}: assigning ${actualAssignments} accounts (capacity: ${availableCapacity})`);
      
      for (let i = 0; i < actualAssignments && accountIndex < tier1Accounts.length; i++) {
        const account = tier1Accounts[accountIndex++];
        
        proposals.push({
          accountId: account.sfdc_account_id,
          accountName: account.account_name,
          currentOwnerId: account.owner_id,
          currentOwnerName: account.owner_name,
          proposedOwnerId: rep.rep_id,
          proposedOwnerName: rep.name,
          proposedOwnerRegion: rep.region,
          assignmentReason: `TIER_BALANCE: Tier 1 account distributed for balanced tier allocation (${distributionMethod})`,
          ruleApplied: 'TIER_BALANCE',
          confidence: account.owner_id && account.owner_id !== rep.rep_id ? 'MEDIUM' : 'HIGH'
        });
      }
    }
    
    console.log(`[TIER_BALANCE] ✅ Balanced ${proposals.length} Tier 1 accounts across ${salesReps.length} reps`);
    return proposals;
  }

  /**
   * Apply ROUND_ROBIN rule using database configuration
   */
  private applyRoundRobinRule(
    rule: any,
    accounts: Account[],
    salesReps: SalesRep[],
    workloadTracker: Map<string, any>,
    maxAccountsPerRep: number
  ): AssignmentProposal[] {
    const proposals: AssignmentProposal[] = [];
    const conditions = rule.conditions || {};
    const balancingCriteria = conditions.balancingCriteria || 'hybrid';
    const maxVariancePercent = conditions.maxVariancePercent || 10;
    const loadBalancingStrategy = conditions.loadBalancingStrategy || 'weighted_arr';
    
    console.log(`[ROUND_ROBIN] 🔄 Processing ${accounts.length} accounts with ${balancingCriteria} balancing`);
    
    // Sort reps by current workload (ascending)
    const sortedReps = [...salesReps].sort((a, b) => {
      const workloadA = workloadTracker.get(a.rep_id)?.accountCount || 0;
      const workloadB = workloadTracker.get(b.rep_id)?.accountCount || 0;
      return workloadA - workloadB;
    });
    
    let repIndex = 0;
    
    for (const account of accounts) {
      // Find next rep with capacity
      let attempts = 0;
      while (attempts < sortedReps.length) {
        const rep = sortedReps[repIndex % sortedReps.length];
        const currentWorkload = workloadTracker.get(rep.rep_id)?.accountCount || 0;
        
        if (currentWorkload < maxAccountsPerRep) {
          proposals.push({
            accountId: account.sfdc_account_id,
            accountName: account.account_name,
            currentOwnerId: account.owner_id,
            currentOwnerName: account.owner_name,
            proposedOwnerId: rep.rep_id,
            proposedOwnerName: rep.name,
            proposedOwnerRegion: rep.region,
            assignmentReason: `ROUND_ROBIN: Distributed using ${balancingCriteria} strategy for equal workload (${currentWorkload + 1}/${maxAccountsPerRep})`,
            ruleApplied: 'ROUND_ROBIN',
            confidence: 'HIGH'
          });
          
          repIndex++;
          break;
        }
        
        repIndex++;
        attempts++;
      }
    }
    
    console.log(`[ROUND_ROBIN] ✅ Distributed ${proposals.length} accounts in round-robin fashion`);
    return proposals;
  }

  /**
   * Apply minimum AND maximum thresholds rule - Enhanced balanced assignments with ARR limits
   */
  private applyMinThresholdsRule(
    rule: any,
    accounts: Account[],
    salesReps: SalesRep[],
    workloadTracker: Map<string, any>,
    maxAccountsPerRepInput: number
  ): AssignmentProposal[] {
    const proposals: AssignmentProposal[] = [];
    const conditions = rule.conditions || {};
    
    const minParentAccounts = conditions.minParentAccounts || 120;
    const minCustomerARR = conditions.minCustomerARR || 50000000; // $50M
    const maxCustomerARR = conditions.maxCustomerARR || 150000000; // $150M max to prevent huge disparities
    const maxAccountsAbsolute = conditions.maxAccountsAbsolute || 200; // Absolute max to prevent overloading
    const maxVariancePercent = conditions.maxVariancePercent || 15;

    console.log(`[MIN_MAX_THRESHOLDS] 📏 Enhanced Thresholds: ${minParentAccounts}-${maxAccountsAbsolute} accounts, $${(minCustomerARR/1000000).toFixed(1)}M-$${(maxCustomerARR/1000000).toFixed(1)}M ARR, ±${maxVariancePercent}% variance`);

    // Calculate realistic distribution targets
    // Use getAccountARR from @/_domain for SSOT compliance
    const totalAccounts = accounts.length;
    const totalARR = accounts.reduce((sum, acc) => sum + getAccountARR(acc), 0);
    const avgAccountsPerRep = Math.floor(totalAccounts / salesReps.length);
    const avgARRPerRep = totalARR / salesReps.length;
    const varianceAllowance = Math.floor(avgAccountsPerRep * (maxVariancePercent / 100));
    const arrVarianceAllowance = avgARRPerRep * (maxVariancePercent / 100);
    
    const minAccountsPerRep = Math.max(avgAccountsPerRep - varianceAllowance, minParentAccounts);
    const maxAccountsPerRep = Math.min(avgAccountsPerRep + varianceAllowance, maxAccountsAbsolute);
    const minARRPerRep = Math.max(avgARRPerRep - arrVarianceAllowance, minCustomerARR);
    const maxARRPerRep = Math.min(avgARRPerRep + arrVarianceAllowance, maxCustomerARR);
    
    console.log(`[MIN_MAX_THRESHOLDS] 📊 ENFORCING: Accounts ${minAccountsPerRep}-${maxAccountsPerRep} (avg ${avgAccountsPerRep}), ARR $${(minARRPerRep/1000000).toFixed(1)}M-$${(maxARRPerRep/1000000).toFixed(1)}M (avg $${(avgARRPerRep/1000000).toFixed(1)}M)`);

    // Get current distribution of accounts by owner
    const currentDistribution = new Map<string, { accounts: Account[]; customerARR: number }>();
    
    // Initialize all reps in distribution tracking
    salesReps.forEach(rep => {
      currentDistribution.set(rep.rep_id, { accounts: [], customerARR: 0 });
    });

    // Count current assignments
    accounts.forEach(account => {
      if (account.owner_id && currentDistribution.has(account.owner_id)) {
        const dist = currentDistribution.get(account.owner_id)!;
        dist.accounts.push(account);
        dist.customerARR += getAccountARR(account);
      }
    });

    // CRITICAL: Find severely overloaded reps (more than max cap) and underloaded reps (less than min)
    const severelyOverloaded: { repId: string; rep: SalesRep; excessAccounts: Account[] }[] = [];
    const underloaded: { repId: string; rep: SalesRep; neededCapacity: number }[] = [];
    const normalRange: { repId: string; rep: SalesRep; availableCapacity: number }[] = [];

    salesReps.forEach(rep => {
      const dist = currentDistribution.get(rep.rep_id)!;
      const currentCount = dist.accounts.length;
      const currentARR = dist.customerARR;
      
      if (currentCount > maxAccountsPerRep || currentARR > maxARRPerRep) {
        // SEVERELY OVERLOADED: Must redistribute excess accounts or ARR
        const excessAccounts = dist.accounts
          .sort((a, b) => {
            // Move lower-value accounts first to preserve high-value relationships
            const aValue = getAccountARR(a);
            const bValue = getAccountARR(b);
            return aValue - bValue;
          })
          .slice(maxAccountsPerRep); // Everything above max cap
        
        severelyOverloaded.push({ repId: rep.rep_id, rep, excessAccounts });
        console.log(`[MIN_MAX_THRESHOLDS] 🔥 OVERLOAD: ${rep.name} has ${currentCount} accounts/$${(currentARR/1000000).toFixed(1)}M ARR (${excessAccounts.length} accounts over limits)`);
        
      } else if (currentCount < minAccountsPerRep || currentARR < minARRPerRep) {
        // UNDERLOADED: Needs more accounts/ARR
        const neededAccounts = Math.max(minAccountsPerRep - currentCount, 0);
        const neededARR = Math.max(minARRPerRep - currentARR, 0);
        const neededCapacity = Math.max(neededAccounts, neededARR > 0 ? 3 : 0); // At least 3 accounts if ARR is needed
        
        underloaded.push({ repId: rep.rep_id, rep, neededCapacity });
        console.log(`[MIN_MAX_THRESHOLDS] 📈 UNDERLOADED: ${rep.name} has ${currentCount} accounts/$${(currentARR/1000000).toFixed(1)}M ARR (needs ${neededCapacity} more)`);
        
      } else {
        // NORMAL RANGE: Can accept some more accounts
        const availableCapacity = Math.max(maxAccountsPerRep - currentCount, 0);
        if (availableCapacity > 0) {
          normalRange.push({ repId: rep.rep_id, rep, availableCapacity });
        }
      }
    });

    console.log(`[MIN_THRESHOLDS] 📊 Distribution Analysis: ${severelyOverloaded.length} overloaded, ${underloaded.length} underloaded, ${normalRange.length} normal`);

    // PHASE 1: Redistribute from severely overloaded to underloaded
    let redistributionCount = 0;
    for (const overloaded of severelyOverloaded) {
      for (const account of overloaded.excessAccounts) {
        // Find best target: prioritize underloaded reps, then normal range reps
        let targetRep: { repId: string; rep: SalesRep } | null = null;
        
        // First try underloaded reps
        const availableUnderloaded = underloaded.find(under => under.neededCapacity > 0);
        if (availableUnderloaded) {
          targetRep = availableUnderloaded;
          availableUnderloaded.neededCapacity--;
        } else {
          // Try normal range reps
          const availableNormal = normalRange.find(normal => normal.availableCapacity > 0);
          if (availableNormal) {
            targetRep = availableNormal;
            availableNormal.availableCapacity--;
          }
        }

        if (!targetRep) break; // No available capacity anywhere

        const targetRepData = salesReps.find(r => r.rep_id === targetRep.repId)!;

        // Create redistribution proposal
        proposals.push({
          accountId: account.sfdc_account_id,
          accountName: account.account_name,
          currentOwnerId: account.owner_id,
          currentOwnerName: account.owner_name,
          proposedOwnerId: targetRepData.rep_id,
          proposedOwnerName: targetRepData.name,
          proposedOwnerRegion: targetRepData.region,
          assignmentReason: `BALANCED LOAD REDISTRIBUTION: Moving from ${overloaded.rep.name} (over limits) to ${targetRepData.name} to enforce ±${maxVariancePercent}% variance and prevent ARR/account disparities`,
          ruleApplied: 'MIN_MAX_THRESHOLDS',
          // Moving customers = low confidence, moving prospects = medium confidence
          confidence: account.is_customer ? 'LOW' : 'MEDIUM'
        });

        redistributionCount++;

        // Update workload tracker for the assignment engine
        this.updateWorkloadTracker(workloadTracker, targetRepData.rep_id, account.sfdc_account_id, accounts);
      }
    }

    console.log(`[MIN_MAX_THRESHOLDS] ✅ BALANCED REDISTRIBUTION: ${redistributionCount} accounts moved for balanced distribution`);
    
    // Additional logging for transparency
    if (redistributionCount === 0 && (severelyOverloaded.length > 0 || underloaded.length > 0)) {
      console.warn(`[MIN_MAX_THRESHOLDS] ⚠️ WARNING: Found imbalance but no redistribution occurred - may need manual intervention`);
    }
    
    return proposals;
  }

  /**
   * Execute approved assignments with parent-child cascade
   */
  async executeAssignments(buildId: string, proposals: AssignmentProposal[]): Promise<void> {
    try {
      console.log(`[AssignmentService] Executing ${proposals.length} parent account assignments`);
      
      // Separate Sales Tools accounts (empty proposedOwnerId) from normal assignments
      const salesToolsProposals = proposals.filter(p => !p.proposedOwnerId || p.proposedOwnerId === '');
      const normalProposals = proposals.filter(p => p.proposedOwnerId && p.proposedOwnerId !== '');
      
      if (salesToolsProposals.length > 0) {
        console.log(`[AssignmentService] 📦 ${salesToolsProposals.length} accounts routed to Sales Tools (no owner cascade)`);
      }
      
      // Build update payload for batch operation (only normal assignments)
      const updates = normalProposals.reduce((acc, proposal) => {
        acc[proposal.accountId] = {
          new_owner_id: proposal.proposedOwnerId,
          new_owner_name: proposal.proposedOwnerName
        };
        return acc;
      }, {} as Record<string, { new_owner_id: string; new_owner_name: string }>);

      // Only batch update accounts with normal assignments (not Sales Tools)
      if (Object.keys(updates).length > 0) {
        console.log(`[AssignmentService] Batch updating ${normalProposals.length} accounts using RPC...`);
        const startTime = Date.now();
        
        // Use batch RPC function for ultra-fast updates
        const { data: updatedCount, error: updateError } = await supabase
          .rpc('batch_update_account_owners', {
            p_build_id: buildId,
            p_updates: updates
          });

        if (updateError) {
          console.error('[AssignmentService] Batch update failed:', updateError);
          
          // Fallback: Use chunked individual updates (only for normal proposals)
          console.log('[AssignmentService] Falling back to chunked updates...');
          await this.batchUpdateAccountsChunked(buildId, normalProposals);
        } else {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`[AssignmentService] ✅ Batch updated ${updatedCount} accounts in ${elapsed}s`);
        }
      }
      
      // Update Sales Tools accounts separately (set new_owner to null/'Sales Tools')
      if (salesToolsProposals.length > 0) {
        console.log(`[AssignmentService] Updating ${salesToolsProposals.length} Sales Tools accounts...`);
        const salesToolsAccountIds = salesToolsProposals.map(p => p.accountId);
        
        const { error: salesToolsError } = await supabase
          .from('accounts')
          .update({
            new_owner_id: null,
            new_owner_name: 'Sales Tools'
          })
          .eq('build_id', buildId)
          .in('sfdc_account_id', salesToolsAccountIds);
        
        if (salesToolsError) {
          console.error('[AssignmentService] Sales Tools update failed:', salesToolsError);
        } else {
          console.log(`[AssignmentService] ✅ Updated ${salesToolsProposals.length} Sales Tools accounts`);
        }
      }

      // CRITICAL: Update assignments table to mark as approved and preserve reasoning
      console.log(`[AssignmentService] Marking ${proposals.length} assignments as approved...`);
      const currentUser = await supabase.auth.getUser();
      
      // Use upsert to ensure assignment records exist with proper rationale
      // For Sales Tools accounts, use null for proposed_owner_id
      const assignmentRecords = proposals.map(proposal => {
        // Build rationale - avoid double-prefix when assignmentReason already starts with priority code
        let rationale: string;
        const alreadyHasPrefix = proposal.assignmentReason?.match(/^(P\d+|RO):\s/i);
        if (alreadyHasPrefix) {
          // assignmentReason already has "P4: Geography + Continuity → ..." - use as-is
          rationale = proposal.assignmentReason;
        } else {
          // Prefix with ruleApplied
          rationale = `${proposal.ruleApplied}: ${proposal.assignmentReason}`;
        }
        
        return {
          build_id: buildId,
          sfdc_account_id: proposal.accountId,
          proposed_owner_id: proposal.proposedOwnerId || null,  // null for Sales Tools
          proposed_owner_name: proposal.proposedOwnerName || 'Sales Tools',
          proposed_team: '',
          assignment_type: proposal.proposedOwnerId ? 'AUTO_COMMERCIAL' : 'SALES_TOOLS',
          rationale,
          is_approved: true,
          approved_by: currentUser.data.user?.id,
          approved_at: new Date().toISOString(),
          created_by: currentUser.data.user?.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      });

      // Use proper upsert with ON CONFLICT to handle existing records
      // The unique constraint is on (build_id, sfdc_account_id)
      const { error: assignmentError } = await supabase
        .from('assignments')
        .upsert(assignmentRecords, { 
          onConflict: 'build_id,sfdc_account_id',
          ignoreDuplicates: false 
        });

      if (assignmentError) {
        console.error('[AssignmentService] Assignment upsert error:', assignmentError);
        throw assignmentError;
      }

      console.log(`[AssignmentService] ✅ Successfully marked ${proposals.length} assignments as approved with reasoning`);
      
      // Cascade assignments to child accounts and their opportunities (only for normal assignments)
      // Sales Tools accounts don't cascade - they have no owner
      if (normalProposals.length > 0) {
        await this.cascadeToChildAccounts(buildId, normalProposals);
        await this.cascadeToOpportunities(buildId, normalProposals);
      }
      
      // Log assignments to audit trail
      const auditEntries = proposals.map(proposal => ({
        build_id: buildId,
        table_name: 'accounts',
        record_id: proposal.accountId,
        action: proposal.proposedOwnerId ? 'ASSIGNMENT_EXECUTED' : 'SALES_TOOLS_ROUTED',
        new_values: {
          new_owner_id: proposal.proposedOwnerId || null,
          new_owner_name: proposal.proposedOwnerName || 'Sales Tools'
        },
        rationale: proposal.proposedOwnerId 
          ? `${proposal.assignmentReason} (executed with child cascade)`
          : `${proposal.assignmentReason} (routed to Sales Tools - no owner)`,
        created_by: currentUser.data.user?.id
      }));
      
      await supabase.from('audit_log').insert(auditEntries);
      
      console.log(`[AssignmentService] Successfully executed assignments with child cascade and preserved reasoning`);
      
    } catch (error) {
      console.error('[AssignmentService] Error executing assignments:', error);
      throw error;
    }
  }

  /**
   * Fallback: Batch update accounts in chunks with error handling
   */
  private async batchUpdateAccountsChunked(buildId: string, proposals: AssignmentProposal[]): Promise<void> {
    const CHUNK_SIZE = 100;
    let successCount = 0;
    let failureCount = 0;
    
    for (let i = 0; i < proposals.length; i += CHUNK_SIZE) {
      const chunk = proposals.slice(i, i + CHUNK_SIZE);
      const batchNum = Math.floor(i / CHUNK_SIZE) + 1;
      const totalBatches = Math.ceil(proposals.length / CHUNK_SIZE);
      
      console.log(`[AssignmentService] Processing batch ${batchNum}/${totalBatches} (${chunk.length} accounts)`);
      
      const updatePromises = chunk.map(async (proposal) => {
        try {
          const { error } = await supabase
            .from('accounts')
            .update({
              new_owner_id: proposal.proposedOwnerId,
              new_owner_name: proposal.proposedOwnerName
            })
            .eq('sfdc_account_id', proposal.accountId)
            .eq('build_id', buildId);
          
          if (error) {
            console.error(`[AssignmentService] Failed to update ${proposal.accountId}:`, error);
            failureCount++;
            return false;
          }
          successCount++;
          return true;
        } catch (error) {
          console.error(`[AssignmentService] Exception updating ${proposal.accountId}:`, error);
          failureCount++;
          return false;
        }
      });
      
      await Promise.all(updatePromises);
      
      // Small delay between batches to avoid overwhelming the database
      if (i + CHUNK_SIZE < proposals.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`[AssignmentService] ✅ Chunked updates complete: ${successCount} succeeded, ${failureCount} failed`);
    
    // Only throw if failure rate is significant (>10%)
    // Small number of failures can happen due to accounts being deleted, RLS, etc.
    const failureRate = failureCount / (successCount + failureCount);
    if (failureRate > 0.1) {
      throw new Error(`Too many failures: ${failureCount}/${successCount + failureCount} accounts failed to update (${(failureRate * 100).toFixed(1)}%). Please review logs and retry.`);
    } else if (failureCount > 0) {
      console.warn(`[AssignmentService] ⚠️ ${failureCount} accounts could not be updated (${(failureRate * 100).toFixed(1)}% failure rate). This is within acceptable limits.`);
    }
  }

  /**
   * Cascade parent account assignments to all child accounts
   */
  private async cascadeToChildAccounts(buildId: string, proposals: AssignmentProposal[]): Promise<void> {
    const cascadePromises = proposals.map(async (proposal) => {
      try {
        // Update all child accounts to match their parent's assignment (new_owner_* only)
        // Skip locked children (exclude_from_reassignment = true) to preserve split ownership
        const { error } = await supabase
          .from('accounts')
          .update({
            new_owner_id: proposal.proposedOwnerId,
            new_owner_name: proposal.proposedOwnerName
          })
          .eq('ultimate_parent_id', proposal.accountId)
          .eq('build_id', buildId)
          .neq('is_parent', true) // Only update child accounts
          .or('exclude_from_reassignment.is.null,exclude_from_reassignment.eq.false'); // Skip locked children

        if (error) {
          console.warn(`[AssignmentService] Warning cascading to children of ${proposal.accountId}:`, error);
          // Don't throw - log warning but continue with other accounts
        } else {
          console.log(`[AssignmentService] Successfully cascaded children for ${proposal.accountId}`);
        }
      } catch (error) {
        console.warn(`[AssignmentService] Warning cascading to children of ${proposal.accountId}:`, error);
        // Continue with other accounts even if this one fails
      }
    });

    // Wait for all cascade attempts to complete (but don't fail on individual errors)
    await Promise.allSettled(cascadePromises);
    console.log(`[AssignmentService] Completed cascade attempt for child accounts`);
  }

  /**
   * Cascade parent account assignments to all their opportunities
   */
  private async cascadeToOpportunities(buildId: string, proposals: AssignmentProposal[]): Promise<void> {
    try {
      // First, get all child account IDs for all proposals
      const parentAccountIds = proposals.map(p => p.accountId);
      
      const { data: childAccounts, error: childError } = await supabase
        .from('accounts')
        .select('sfdc_account_id, ultimate_parent_id')
        .eq('build_id', buildId)
        .in('ultimate_parent_id', parentAccountIds);

      if (childError) {
        console.warn('[AssignmentService] Warning fetching child accounts:', childError);
        // Continue without child accounts if query fails
      }

      // Create a map of parent -> child account IDs
      const parentToChildMap = new Map<string, string[]>();
      proposals.forEach(p => {
        parentToChildMap.set(p.accountId, [p.accountId]); // Include parent itself
      });

      childAccounts?.forEach(child => {
        if (child.ultimate_parent_id && parentToChildMap.has(child.ultimate_parent_id)) {
          parentToChildMap.get(child.ultimate_parent_id)!.push(child.sfdc_account_id);
        }
      });

      // Now update opportunities for each proposal with individual error handling
      const cascadePromises = proposals.map(async (proposal) => {
        try {
          const accountIds = parentToChildMap.get(proposal.accountId) || [proposal.accountId];
          
          const { error } = await supabase
            .from('opportunities')
            .update({
              new_owner_id: proposal.proposedOwnerId,
              new_owner_name: proposal.proposedOwnerName
            })
            .eq('build_id', buildId)
            .in('sfdc_account_id', accountIds);

          if (error) {
            console.warn(`[AssignmentService] Warning cascading opportunities for account ${proposal.accountId}:`, error);
          } else {
            console.log(`[AssignmentService] Successfully cascaded opportunities for ${proposal.accountId}`);
          }
        } catch (error) {
          console.warn(`[AssignmentService] Warning cascading opportunities for account ${proposal.accountId}:`, error);
          // Continue with other accounts
        }
      });

      await Promise.allSettled(cascadePromises);
      console.log(`[AssignmentService] Completed cascade attempt for opportunities`);
    } catch (error) {
      console.warn('[AssignmentService] Warning in cascadeToOpportunities:', error);
      // Don't throw - this shouldn't stop the main assignment process
    }
  }

  /**
   * Extract minimum thresholds from assignment rules
   */
  private extractMinimumThresholds(rules: any[]): {
    minParentAccounts?: number;
    minCustomerARR?: number;
    maxVariancePercent?: number;
  } {
    const thresholdRule = rules.find(rule => 
      rule.rule_type === 'MIN_THRESHOLDS' && rule.enabled
    );
    
    return {
      minParentAccounts: thresholdRule?.conditions?.minParentAccounts,
      minCustomerARR: thresholdRule?.conditions?.minCustomerARR,
      maxVariancePercent: thresholdRule?.conditions?.maxVariancePercent || 15
    };
  }

  /**
   * Enforce minimum thresholds by rebalancing assignments
   */
  private async enforceMinimumThresholds(
    accounts: Account[],
    salesReps: SalesRep[],
    workloadTracker: Map<string, any>,
    thresholds: {
      minParentAccounts?: number;
      minCustomerARR?: number;
      maxVariancePercent?: number;
    }
  ): Promise<AssignmentProposal[]> {
    const proposals: AssignmentProposal[] = [];
    
    // Calculate current distribution
    const currentDistribution = new Map<string, {
      accountCount: number;
      customerARR: number;
      accounts: Account[];
    }>();
    
    // Initialize distribution tracking
    salesReps.forEach(rep => {
      currentDistribution.set(rep.rep_id, {
        accountCount: 0,
        customerARR: 0,
        accounts: []
      });
    });
    
    // Count current assignments
    accounts.forEach(account => {
      if (account.owner_id && currentDistribution.has(account.owner_id)) {
        const dist = currentDistribution.get(account.owner_id)!;
        dist.accountCount += 1;
        dist.customerARR += getAccountARR(account);
        dist.accounts.push(account);
      }
    });
    
    // Find reps below minimum thresholds
    const belowThresholds: string[] = [];
    const aboveThresholds: string[] = [];
    
    salesReps.forEach(rep => {
      const dist = currentDistribution.get(rep.rep_id);
      if (!dist) return;
      
      const accountsBelowMin = thresholds.minParentAccounts && 
        dist.accountCount < thresholds.minParentAccounts;
      const arrBelowMin = thresholds.minCustomerARR && 
        dist.customerARR < thresholds.minCustomerARR;
      
      if (accountsBelowMin || arrBelowMin) {
        belowThresholds.push(rep.rep_id);
      } else {
        aboveThresholds.push(rep.rep_id);
      }
    });
    
    console.log(`[ThresholdEnforcement] ${belowThresholds.length} reps below thresholds, ${aboveThresholds.length} reps available for rebalancing`);
    
    // Rebalance from over-allocated reps to under-allocated reps
    for (const underAllocatedRepId of belowThresholds) {
      const underDist = currentDistribution.get(underAllocatedRepId)!;
      const rep = salesReps.find(r => r.rep_id === underAllocatedRepId)!;
      
      // Find accounts to move from over-allocated reps
      for (const overAllocatedRepId of aboveThresholds) {
        const overDist = currentDistribution.get(overAllocatedRepId)!;
        
        // Check if this rep has excess capacity
        const accountsNeeded = Math.max(
          (thresholds.minParentAccounts || 0) - underDist.accountCount,
          0
        );
        const arrNeeded = Math.max(
          (thresholds.minCustomerARR || 0) - underDist.customerARR,
          0
        );
        
        if (accountsNeeded <= 0 && arrNeeded <= 0) continue;
        
        // Find suitable accounts to move
        const candidateAccounts = overDist.accounts
          .filter(account => {
            // Prefer accounts with good ARR for ARR-based moves
            const accountARR = getAccountARR(account);
            return arrNeeded > 0 ? accountARR > 0 : true;
          })
          .sort((a, b) => {
            // Sort by ARR descending for efficient moves
            const aARR = getAccountARR(a);
            const bARR = getAccountARR(b);
            return bARR - aARR;
          })
          .slice(0, Math.min(accountsNeeded, 3)); // Limit moves per iteration
        
        for (const account of candidateAccounts) {
          proposals.push({
            accountId: account.sfdc_account_id,
            accountName: account.account_name,
            currentOwnerId: account.owner_id,
            currentOwnerName: account.owner_name,
            proposedOwnerId: rep.rep_id,
            proposedOwnerName: rep.name,
            assignmentReason: `Threshold enforcement: ensuring ${rep.name} meets minimum thresholds`,
            ruleApplied: 'MIN_THRESHOLDS',
            confidence: 'MEDIUM' as const
          });
          
          // Update tracking
          underDist.accountCount += 1;
          underDist.customerARR += getAccountARR(account);
          overDist.accountCount -= 1;
          overDist.customerARR -= getAccountARR(account);
          
          console.log(`[ThresholdEnforcement] Moving ${account.account_name} from ${overAllocatedRepId} to ${underAllocatedRepId} for threshold compliance`);
        }
      }
    }
    
    console.log(`[ThresholdEnforcement] Generated ${proposals.length} threshold enforcement proposals`);
    return proposals;
  }

  /**
   * Helper methods for data fetching
   */
  private async getBuildConfiguration(buildId: string): Promise<BuildConfig> {
    const { data, error } = await supabase
      .from('builds')
      .select('enterprise_threshold, apply_50k_rule, geo_emea_mappings, holdover_policy')
      .eq('id', buildId)
      .single();
      
    if (error) throw error;
    
    return data as BuildConfig;
  }

  /**
   * Get only parent accounts for assignment (children will inherit) with proper pagination and filtering
   * Uses SSOT constants from @/_domain for pagination settings.
   */
  private async getParentAccounts(buildId: string, tier?: string, accountType?: 'customers' | 'prospects' | 'all'): Promise<Account[]> {
    console.log(`[AssignmentService] Fetching parent accounts for build ${buildId}, tier: ${tier}, type: ${accountType}`);
    
    const allAccounts: Account[] = [];
    let rangeStart = 0;
    const pageSize = SUPABASE_LIMITS.FETCH_PAGE_SIZE;

    while (true) {
      let query = supabase
        .from('accounts')
        .select('*')
        .eq('build_id', buildId)
        .eq('is_parent', true)
        .range(rangeStart, rangeStart + pageSize - 1)
        .order('account_name');

      if (tier && tier !== 'All') {
        query = query.eq('enterprise_vs_commercial', tier);
      }

      const { data, error } = await query;
      if (error) {
        console.error(`[AssignmentService] Error fetching accounts (range ${rangeStart}-${rangeStart + pageSize - 1}):`, error);
        throw error;
      }

      if (!data || data.length === 0) break;

      allAccounts.push(...(data as Account[]));
      
      if (data.length < pageSize) break;
      rangeStart += pageSize;
    }

    console.log(`[AssignmentService] Fetched ${allAccounts.length} total parent accounts`);

    // Filter by account type if specified
    if (accountType && accountType !== 'all') {
      const filtered = allAccounts.filter(account => {
        const hasARRIndicators = (account.hierarchy_bookings_arr_converted && account.hierarchy_bookings_arr_converted > 0) ||
                                (account.arr && account.arr > 0) ||
                                (account.calculated_arr && account.calculated_arr > 0);
        
        if (accountType === 'customers') {
          return hasARRIndicators;
        } else if (accountType === 'prospects') {
          return !hasARRIndicators;
        }
        return true;
      });
      
      console.log(`[AssignmentService] Filtered to ${filtered.length} ${accountType} accounts`);
      return filtered;
    }

    return allAccounts;
  }

  /**
   * Classify accounts into customers, prospects, and tier 1 based on hierarchy ARR (not bookings)
   */
  private classifyAccounts(accounts: Account[], config: BuildConfig) {
    const customers: Account[] = [];
    const prospects: Account[] = [];
    const tier1Accounts: Account[] = [];

    accounts.forEach(account => {
      // Classify as customer based on hierarchy ARR (prioritize over bookings)
      const hierarchyARR = account.hierarchy_bookings_arr_converted && account.hierarchy_bookings_arr_converted > 0;
      const regularARR = account.arr && account.arr > 0;
      const calculatedARR = account.calculated_arr && account.calculated_arr > 0;
      
      const hasRevenue = hierarchyARR || regularARR || calculatedARR;
      
      if (hasRevenue) {
        customers.push(account);
      } else {
        prospects.push(account);
      }

      // Classify as tier 1 based on ARR threshold
      const primaryARR = getAccountARR(account);
      const isEnterprise = account.enterprise_vs_commercial === 'Enterprise';
      const hasLargeEmployeeCount = account.employees && account.employees > config.enterprise_threshold;
      const isHighValue = primaryARR > HIGH_VALUE_ARR_THRESHOLD; // Use hierarchy ARR for tier 1 classification
      
      if (isEnterprise || hasLargeEmployeeCount || isHighValue) {
        tier1Accounts.push(account);
      }
    });

    return { customers, prospects, tier1Accounts };
  }

  private async getSalesReps(buildId: string): Promise<SalesRep[]> {
    const { data, error } = await supabase
      .from('sales_reps')
      .select('*')
      .eq('build_id', buildId);
      
    if (error) throw error;
    
    // Filter for assignment-eligible reps only
    const allReps = (data as SalesRep[]) || [];
    const eligibleReps = allReps.filter(rep => {
      // Use the include_in_assignments field if available, otherwise use backward-compatible logic
      if (rep.include_in_assignments !== undefined) {
        return rep.include_in_assignments;
      }
      
      // Backward compatibility: filter out obvious inactive/manager patterns
      const name = (rep.name || '').toLowerCase();
      const isInactive = name.includes('inactive') || name.includes('former') || name.includes('ex-');
      const isManager = name.includes('manager') || name.includes('director') || name.includes('vp');
      
      return !isInactive && !isManager;
    });
    
    console.log(`[AssignmentService] Filtered ${allReps.length} total reps to ${eligibleReps.length} assignment-eligible reps`);
    
    return eligibleReps;
  }

  /**
   * Enhanced validation for both account count and ARR distribution variance
   */
  private validateDistributionVariance(
    proposals: AssignmentProposal[],
    accounts: Account[],
    salesReps: SalesRep[],
    targetAccountsPerRep: number
  ): void {
    const finalAccountDistribution = new Map<string, number>();
    const finalARRDistribution = new Map<string, number>();
    
    // Initialize with current assignments
    // Use getAccountARR from @/_domain for SSOT compliance
    accounts.forEach(account => {
      if (account.owner_id) {
        const currentAccounts = finalAccountDistribution.get(account.owner_id) || 0;
        const currentARR = finalARRDistribution.get(account.owner_id) || 0;
        const accountARR = getAccountARR(account);
        
        finalAccountDistribution.set(account.owner_id, currentAccounts + 1);
        finalARRDistribution.set(account.owner_id, currentARR + accountARR);
      }
    });
    
    // Apply proposed changes
    proposals.forEach(proposal => {
      const account = accounts.find(acc => acc.sfdc_account_id === proposal.accountId);
      if (!account) return;
      
      const accountARR = getAccountARR(account);
      
      // Remove from old owner if exists
      if (account.owner_id && account.owner_id !== proposal.proposedOwnerId) {
        const oldAccountCount = finalAccountDistribution.get(account.owner_id) || 0;
        const oldARR = finalARRDistribution.get(account.owner_id) || 0;
        finalAccountDistribution.set(account.owner_id, Math.max(0, oldAccountCount - 1));
        finalARRDistribution.set(account.owner_id, Math.max(0, oldARR - accountARR));
      }
      
      // Add to new owner
      const newAccountCount = finalAccountDistribution.get(proposal.proposedOwnerId) || 0;
      const newARR = finalARRDistribution.get(proposal.proposedOwnerId) || 0;
      finalAccountDistribution.set(proposal.proposedOwnerId, newAccountCount + 1);
      finalARRDistribution.set(proposal.proposedOwnerId, newARR + accountARR);
    });
    
    // Calculate ARR targets using getAccountARR from @/_domain for SSOT compliance
    const totalARR = accounts.reduce((sum, acc) => sum + getAccountARR(acc), 0);
    const targetARRPerRep = totalARR / salesReps.length;
    
    // Check variance compliance for both metrics
    const accountVariance = Math.floor(targetAccountsPerRep * 0.15);
    const arrVariance = targetARRPerRep * 0.15;
    
    const minAccountTarget = targetAccountsPerRep - accountVariance;
    const maxAccountTarget = targetAccountsPerRep + accountVariance;
    const minARRTarget = targetARRPerRep - arrVariance;
    const maxARRTarget = targetARRPerRep + arrVariance;
    
    let accountViolations = 0;
    let arrViolations = 0;
    
    salesReps.forEach(rep => {
      const finalAccounts = finalAccountDistribution.get(rep.rep_id) || 0;
      const finalARR = finalARRDistribution.get(rep.rep_id) || 0;
      
      if (finalAccounts < minAccountTarget || finalAccounts > maxAccountTarget) {
        console.warn(`[BALANCE_VALIDATION] ⚠️ Account variance violation: ${rep.name} will have ${finalAccounts} accounts (target: ${minAccountTarget}-${maxAccountTarget})`);
        accountViolations++;
      }
      
      if (finalARR < minARRTarget || finalARR > maxARRTarget) {
        console.warn(`[BALANCE_VALIDATION] ⚠️ ARR variance violation: ${rep.name} will have $${(finalARR/1000000).toFixed(1)}M ARR (target: $${(minARRTarget/1000000).toFixed(1)}M-$${(maxARRTarget/1000000).toFixed(1)}M)`);
        arrViolations++;
      }
    });
    
    if (accountViolations === 0 && arrViolations === 0) {
      console.log(`[BALANCE_VALIDATION] ✅ All reps within 15% variance tolerance (Accounts: ${minAccountTarget}-${maxAccountTarget}, ARR: $${(minARRTarget/1000000).toFixed(1)}M-$${(maxARRTarget/1000000).toFixed(1)}M)`);
    } else {
      console.warn(`[BALANCE_VALIDATION] ⚠️ Variance violations: ${accountViolations}/${salesReps.length} account violations, ${arrViolations}/${salesReps.length} ARR violations`);
    }
  }

  /**
   * Filter reps by tier (Commercial vs Enterprise)
   * Updated in v1.4.1: Now uses team_tier field instead of deprecated team field
   */
  private filterRepsByTier(reps: SalesRep[], tier: string): SalesRep[] {
    return reps.filter(rep => {
      if (!rep.team_tier) return true; // Include reps with no tier specified
      
      const tierValue = rep.team_tier;
      
      if (tier === 'Enterprise') {
        return tierValue === 'ENT' || tierValue === 'MM';
      } else {
        // Commercial tier includes SMB and Growth
        return tierValue === 'SMB' || tierValue === 'Growth';
      }
    });
  }

  /**
   * Select rep based on current workload (round robin)
   */
  private selectRepByWorkload(reps: SalesRep[], workloadMap: Map<string, number>): SalesRep {
    // Sort reps by current workload (ascending) and select the one with least load
    return reps.reduce((minRep, currentRep) => {
      const minLoad = workloadMap.get(minRep.rep_id) || 0;
      const currentLoad = workloadMap.get(currentRep.rep_id) || 0;
      return currentLoad < minLoad ? currentRep : minRep;
    });
  }

  /**
   * Apply continuity bias for existing customer relationships (preserve if rep still exists)
   */
  private async applyContinuityBias(
    customerAccounts: Account[],
    salesReps: SalesRep[],
    workloadMap: Map<string, number>
  ): Promise<AssignmentProposal[]> {
    const continuityProposals: AssignmentProposal[] = [];
    
    // Find customer accounts with existing owners that should be preserved
    const customersWithOwners = customerAccounts.filter(acc => acc.owner_id);
    
    for (const account of customersWithOwners) {
      const currentRep = salesReps.find(rep => rep.rep_id === account.owner_id);
      
      // Only preserve if the current rep still exists in the team
      if (currentRep) {
        continuityProposals.push({
          accountId: account.sfdc_account_id,
          accountName: account.account_name,
          currentOwnerId: account.owner_id,
          currentOwnerName: account.owner_name,
          proposedOwnerId: account.owner_id!,
          proposedOwnerName: account.owner_name!,
          assignmentReason: 'Continuity preserved - existing customer relationship',
          ruleApplied: 'CONTINUITY',
          confidence: 'HIGH'
        });
        
        // Update workload tracking
        AssignmentServiceHelpers.updateWorkloadTracking(workloadMap, account.owner_id!);
      }
    }
    
    console.log(`[AssignmentService] Applied continuity bias to ${continuityProposals.length} customer accounts`);
    return continuityProposals;
  }

  /**
   * Optimize load balancing across reps
   */
  private optimizeLoadBalancing(
    proposals: AssignmentProposal[],
    workloadMap: Map<string, number>
  ): AssignmentProposal[] {
    // Calculate average workload
    const totalWorkload = Array.from(workloadMap.values()).reduce((sum, load) => sum + load, 0);
    const avgWorkload = totalWorkload / workloadMap.size;
    
    // Identify overloaded reps (more than 20% above average)
    // Use APPROACHING_CAPACITY_THRESHOLD from @/_domain for SSOT compliance
    const overloadThreshold = avgWorkload * APPROACHING_CAPACITY_THRESHOLD;
    const overloadedReps = new Set(
      Array.from(workloadMap.entries())
        .filter(([_, load]) => load > overloadThreshold)
        .map(([repId, _]) => repId)
    );
    
    // Mark proposals from overloaded reps for potential redistribution
    return proposals.map(proposal => {
      if (overloadedReps.has(proposal.proposedOwnerId)) {
        return {
          ...proposal,
          assignmentReason: `${proposal.assignmentReason} (load balanced)`,
          // Downgrade confidence for overloaded rep assignments
          confidence: proposal.confidence === 'HIGH' ? 'MEDIUM' : proposal.confidence
        };
      }
      return proposal;
    });
  }

  /**
   * Assess confidence for an assignment (inverted from old "risk" logic)
   * @see MASTER_LOGIC.mdc §13.4.1
   */
  private assessConfidence(account: Account, proposedRep: SalesRep): AssignmentConfidence {
    // Low confidence if changing customer account owner
    if (account.is_customer && account.owner_id && account.owner_id !== proposedRep.rep_id) {
      return 'LOW';
    }
    
    // Medium confidence if account has risk flag
    if (account.risk_flag) {
      return 'MEDIUM';
    }
    
    // Medium confidence if high ARR account
    const arr = getAccountARR(account);
    if (arr > HIGH_VALUE_ARR_THRESHOLD) {
      return 'MEDIUM';
    }
    
    return 'HIGH';
  }

  /**
   * Group reps by US regions
   */
  private groupRepsByUSRegion(salesReps: SalesRep[]): Map<string, SalesRep[]> {
    const repsByRegion = new Map<string, SalesRep[]>();
    
    salesReps.forEach(rep => {
      const region = rep.region || 'Central'; // Default to Central
      if (!repsByRegion.has(region)) {
        repsByRegion.set(region, []);
      }
      repsByRegion.get(region)!.push(rep);
    });
    
    return repsByRegion;
  }

  /**
   * Calculate renewal counts by quarter from opportunities
   */
  private async calculateRenewalsByQuarter(buildId: string, repId: string): Promise<{ q1: number; q2: number; q3: number; q4: number }> {
    try {
      const { data: opportunities, error } = await supabase
        .from('opportunities')
        .select('close_date, owner_id')
        .eq('build_id', buildId)
        .eq('owner_id', repId)
        .not('close_date', 'is', null);

      if (error) {
        console.warn(`[AssignmentService] Warning fetching opportunities for ${repId}:`, error);
        return { q1: 0, q2: 0, q3: 0, q4: 0 };
      }

      const renewals = { q1: 0, q2: 0, q3: 0, q4: 0 };
      const currentYear = new Date().getFullYear();

      opportunities?.forEach(opp => {
        if (!opp.close_date) return;

        const closeDate = new Date(opp.close_date);
        const month = closeDate.getMonth() + 1; // 1-12
        const year = closeDate.getFullYear();

        // Only count renewals for current calendar year
        if (year !== currentYear) return;

        if (month >= 1 && month <= 3) renewals.q1++;
        else if (month >= 4 && month <= 6) renewals.q2++;
        else if (month >= 7 && month <= 9) renewals.q3++;
        else if (month >= 10 && month <= 12) renewals.q4++;
      });

      return renewals;
    } catch (error) {
      console.warn(`[AssignmentService] Error calculating renewals for ${repId}:`, error);
      return { q1: 0, q2: 0, q3: 0, q4: 0 };
    }
  }

  /**
   * Initialize enhanced workload tracker (maintains existing assignments for continuity)
   */
  private async initializeWorkloadTracker(buildId: string, salesReps: SalesRep[], accounts: Account[]): Promise<Map<string, any>> {
    const tracker = new Map<string, any>();

    // Fetch renewals for all reps in parallel
    const renewalPromises = salesReps.map(rep =>
      this.calculateRenewalsByQuarter(buildId, rep.rep_id)
    );
    const renewalResults = await Promise.all(renewalPromises);

    salesReps.forEach((rep, index) => {
      // Count existing assignments
      const existingAccounts = accounts.filter(acc => acc.owner_id === rep.rep_id);
      const tier1Count = existingAccounts.filter(acc => {
        const arr = getAccountARR(acc);
        return arr > HIGH_VALUE_ARR_THRESHOLD || acc.enterprise_vs_commercial === 'Enterprise';
      }).length;

      const totalARR = existingAccounts.reduce((sum, acc) => {
        return sum + getAccountARR(acc);
      }, 0);

      const renewals = renewalResults[index];
      tracker.set(rep.rep_id, {
        accountCount: existingAccounts.length,
        tier1Count,
        totalARR,
        renewalsQ1: renewals.q1,
        renewalsQ2: renewals.q2,
        renewalsQ3: renewals.q3,
        renewalsQ4: renewals.q4
      });
    });

    console.log(`[AssignmentService] 📅 Renewal tracking initialized for ${salesReps.length} reps`);
    return tracker;
  }

  /**
   * Initialize ENHANCED workload tracker with ARR-weighted balancing
   */
  private async initializeEnhancedWorkloadTracker(buildId: string, salesReps: SalesRep[], accounts: Account[]): Promise<Map<string, any>> {
    const tracker = new Map<string, any>();

    // Fetch renewals for all reps in parallel
    const renewalPromises = salesReps.map(rep =>
      this.calculateRenewalsByQuarter(buildId, rep.rep_id)
    );
    const renewalResults = await Promise.all(renewalPromises);

    salesReps.forEach((rep, index) => {
      // Initialize with current account counts and ARR for baseline
      const currentAccounts = accounts.filter(acc => acc.owner_id === rep.rep_id);
      const totalARR = currentAccounts.reduce((sum, acc) => sum + getAccountARR(acc), 0);
      const tier1Count = currentAccounts.filter(acc => {
        const arr = getAccountARR(acc);
        return arr > HIGH_VALUE_ARR_THRESHOLD || acc.enterprise_vs_commercial === 'Enterprise';
      }).length;

      const renewals = renewalResults[index];
      tracker.set(rep.rep_id, {
        accountCount: 0, // Start assignments from 0 for new balance calculation
        currentAccountCount: currentAccounts.length, // Track existing baseline
        tier1Count: 0, // New tier 1 assignments
        currentTier1Count: tier1Count, // Existing tier 1 baseline
        totalARR: 0, // New ARR assignments
        currentARR: totalARR, // Existing ARR baseline
        workloadScore: 0, // Composite score for assignment prioritization
        renewalsQ1: renewals.q1,
        renewalsQ2: renewals.q2,
        renewalsQ3: renewals.q3,
        renewalsQ4: renewals.q4
      });
    });

    console.log(`[AssignmentService] 🔄 Enhanced ARR-weighted workload tracker initialized for ${salesReps.length} reps`);
    return tracker;
  }

  /**
   * Update enhanced workload tracker with multi-factor tracking
   */
  private updateEnhancedWorkloadTracker(
    tracker: Map<string, any>, 
    repId: string, 
    accountId: string, 
    accounts: Account[]
  ): void {
    const current = tracker.get(repId) || { 
      accountCount: 0, currentAccountCount: 0, tier1Count: 0, currentTier1Count: 0, 
      totalARR: 0, currentARR: 0, workloadScore: 0 
    };
    const account = accounts.find(acc => acc.sfdc_account_id === accountId);
    
    if (account) {
      const arr = getAccountARR(account);
      const isTier1 = arr > HIGH_VALUE_ARR_THRESHOLD || account.enterprise_vs_commercial === 'Enterprise';
      
      // Update assignment tracking
      current.accountCount += 1;
      current.totalARR += arr;
      if (isTier1) current.tier1Count += 1;
      
      // Calculate composite workload score (ARR-weighted)
      const totalAccounts = current.accountCount + current.currentAccountCount;
      const totalARRValue = current.totalARR + current.currentARR;
      const totalTier1 = current.tier1Count + current.currentTier1Count;
      
      // Composite score: prioritize ARR balance, then account balance, then tier balance
      // @see MASTER_LOGIC.mdc - WORKLOAD_SCORE_WEIGHTS in constants.ts
      current.workloadScore = (totalARRValue * 0.6) + (totalAccounts * WORKLOAD_SCORE_WEIGHTS.ACCOUNT_WEIGHT * 0.3) + (totalTier1 * WORKLOAD_SCORE_WEIGHTS.TIER1_WEIGHT * 0.1);
      
      tracker.set(repId, current);
      
      console.log(`[AssignmentService] 📈 Enhanced tracker updated for ${repId}: +1 account, +$${(arr/1000).toFixed(0)}K ARR, new score: ${current.workloadScore.toFixed(0)}`);
    }
  }
  private initializeResetWorkloadTracker(salesReps: SalesRep[]): Map<string, any> {
    const tracker = new Map<string, any>();
    
    salesReps.forEach(rep => {
      // Start from ZERO for true load balancing
      tracker.set(rep.rep_id, {
        accountCount: 0,
        tier1Count: 0,
        totalARR: 0,
        renewalsQ1: 0,
        renewalsQ2: 0,
        renewalsQ3: 0,
        renewalsQ4: 0
      });
    });
    
    console.log(`[AssignmentService] 🔄 Reset-based workload tracker initialized for ${salesReps.length} reps`);
    return tracker;
  }

  /**
   * Update workload tracker when assignment is made
   */
  private updateWorkloadTracker(
    tracker: Map<string, any>, 
    repId: string, 
    accountId: string, 
    accounts: Account[]
  ): void {
    const current = tracker.get(repId) || { accountCount: 0, tier1Count: 0, totalARR: 0 };
    const account = accounts.find(acc => acc.sfdc_account_id === accountId);
    
    if (account) {
      const arr = getAccountARR(account);
      const isTier1 = arr > HIGH_VALUE_ARR_THRESHOLD || account.enterprise_vs_commercial === 'Enterprise';
      
      tracker.set(repId, {
        ...current,
        accountCount: current.accountCount + 1,
        tier1Count: current.tier1Count + (isTier1 ? 1 : 0),
        totalARR: current.totalARR + arr
      });
    }
  }

  /**
   * Select rep based on multi-factor workload balancing
   */
  private selectRepByMultiFactorWorkload(reps: SalesRep[], workloadTracker: Map<string, any>): SalesRep {
    return reps.reduce((bestRep, currentRep) => {
      const bestWorkload = workloadTracker.get(bestRep.rep_id) || { accountCount: 0, tier1Count: 0, totalARR: 0 };
      const currentWorkload = workloadTracker.get(currentRep.rep_id) || { accountCount: 0, tier1Count: 0, totalARR: 0 };
      
      // Multi-factor scoring (lower is better)
      const bestScore = bestWorkload.accountCount + (bestWorkload.tier1Count * 2) + (bestWorkload.totalARR / 100000);
      const currentScore = currentWorkload.accountCount + (currentWorkload.tier1Count * 2) + (currentWorkload.totalARR / 100000);
      
      return currentScore < bestScore ? currentRep : bestRep;
    });
  }

  /**
   * Generate enhanced statistics with geography-focused analysis
   */
  private generateEnhancedStatistics(
    proposals: AssignmentProposal[],
    accounts: Account[],
    salesReps: SalesRep[],
    workloadTracker: Map<string, any>
  ) {
    const byGeo: { [key: string]: { 
      repCount: number; 
      customerAccounts: number; 
      prospectAccounts: number; 
      totalARR: number; 
      tier1Accounts: number; 
    } } = {};
    
    const byTier: { [key: string]: number } = {};
    const byRep: { [key: string]: { 
      parentAccounts: number; 
      customerAccounts: number; 
      prospectAccounts: number; 
      totalARR: number; 
      customerARR: number; 
      tier1Count: number;
      tier1CustomerCount: number;
      tier1ProspectCount: number;
    } } = {};
    
    // Map rep regions to proper geography names
    const regionToGeoMap: { [key: string]: string } = {
      'West': 'West',
      'North East': 'North East', 
      'South East': 'South East',
      'Central': 'Central',
      'AMER': 'Americas',
      'EMEA': 'EMEA',
      'APAC': 'APAC'
    };
    
    // Initialize geography and rep statistics
    const geoRepCounts: { [key: string]: Set<string> } = {};
    
    // Initialize rep statistics with current workload (final state calculation)
    salesReps.forEach(rep => {
      const geo = regionToGeoMap[rep.region || 'Central'] || rep.region || 'Central';
      
      // Track unique reps per geography
      if (!geoRepCounts[geo]) {
        geoRepCounts[geo] = new Set();
      }
      geoRepCounts[geo].add(rep.rep_id);
      
      // Get parent accounts owned by this rep
      const parentAccounts = accounts.filter(acc => acc.owner_id === rep.rep_id && acc.is_parent === true);
      
      // For each parent account, get all accounts in its hierarchy (parent + children)
      let allHierarchyAccounts: any[] = [];
      let totalHierarchyARR = 0;
      let customerAccountCount = 0;
      let prospectAccountCount = 0;
      let tier1CustomerCount = 0;
      let tier1ProspectCount = 0;
      
      parentAccounts.forEach(parent => {
        // Find all accounts in this parent's hierarchy
        const hierarchyAccounts = accounts.filter(acc => 
          acc.sfdc_account_id === parent.sfdc_account_id || 
          acc.parent_id === parent.sfdc_account_id ||
          acc.ultimate_parent_id === parent.sfdc_account_id
        );
        
        allHierarchyAccounts.push(...hierarchyAccounts);
        
        // Sum up ARR for the entire hierarchy
        const hierarchyARR = hierarchyAccounts.reduce((sum, acc) => sum + getAccountARR(acc), 0);
        totalHierarchyARR += hierarchyARR;
        
        // Classify as customer if ANY account in hierarchy has ARR > 0
        const hasCustomerARR = hierarchyAccounts.some(acc => getAccountARR(acc) > 0);
        if (hasCustomerARR) {
          customerAccountCount++;
        } else {
          prospectAccountCount++;
        }
        
        // Count Tier 1 accounts in hierarchy
        hierarchyAccounts.forEach(acc => {
          if (hasCustomerARR && acc.expansion_tier === 'Tier 1') {
            tier1CustomerCount++;
          } else if (!hasCustomerARR && acc.initial_sale_tier === 'Tier 1') {
            tier1ProspectCount++;
          }
        });
      });
      
      byRep[rep.name] = {
        parentAccounts: parentAccounts.length,
        customerAccounts: customerAccountCount,
        prospectAccounts: prospectAccountCount,
        totalARR: totalHierarchyARR,
        customerARR: totalHierarchyARR, // For customers, this is the same as total hierarchy ARR
        tier1Count: tier1CustomerCount + tier1ProspectCount,
        tier1CustomerCount: tier1CustomerCount,
        tier1ProspectCount: tier1ProspectCount
      };
    });
    
    // Initialize geography statistics
    Object.keys(geoRepCounts).forEach(geo => {
      const reps = salesReps.filter(rep => {
        const mappedGeo = regionToGeoMap[rep.region || 'Central'] || rep.region || 'Central';
        return mappedGeo === geo;
      });
      
      byGeo[geo] = {
        repCount: geoRepCounts[geo].size,
        customerAccounts: reps.reduce((sum, rep) => sum + (byRep[rep.name]?.customerAccounts || 0), 0),
        prospectAccounts: reps.reduce((sum, rep) => sum + (byRep[rep.name]?.prospectAccounts || 0), 0),
        totalARR: reps.reduce((sum, rep) => sum + (byRep[rep.name]?.customerARR || 0), 0),
        tier1Accounts: reps.reduce((sum, rep) => sum + (byRep[rep.name]?.tier1Count || 0), 0)
      };
    });
    
    // Process ALL accounts for tier distribution (not just proposals)
    accounts.forEach(account => {
      const hierarchyARR = getAccountARR(account);
      const isCustomer = hierarchyARR > 0;
      
      // Use database tier fields instead of ARR calculation
      let tier: string;
      if (isCustomer && account.expansion_tier) {
        tier = account.expansion_tier;
      } else if (!isCustomer && account.initial_sale_tier) {
        tier = account.initial_sale_tier;
      } else {
        tier = 'Tier 4'; // Default for accounts without tier classification
      }
      
      byTier[tier] = (byTier[tier] || 0) + 1;
    });
    
    // Apply proposed changes to get FINAL state
    proposals.forEach(proposal => {
      const account = accounts.find(acc => acc.sfdc_account_id === proposal.accountId);
      const newRep = salesReps.find(rep => rep.rep_id === proposal.proposedOwnerId);
      const oldRep = salesReps.find(rep => rep.rep_id === account?.owner_id);
      
      if (account && newRep) {
        const hierarchyARR = getAccountARR(account);
        const regularARR = account.arr || 0;
        const totalAccountARR = Math.max(hierarchyARR, regularARR);
        const isCustomer = hierarchyARR > 0;
        
        // Remove from old rep statistics
        if (oldRep && byRep[oldRep.name]) {
          byRep[oldRep.name].parentAccounts -= 1;
          if (isCustomer) {
            byRep[oldRep.name].customerAccounts -= 1;
            byRep[oldRep.name].customerARR -= hierarchyARR;
            if (account.expansion_tier === 'Tier 1') {
              byRep[oldRep.name].tier1CustomerCount -= 1;
              byRep[oldRep.name].tier1Count -= 1;
            }
          } else {
            byRep[oldRep.name].prospectAccounts -= 1;
            if (account.initial_sale_tier === 'Tier 1') {
              byRep[oldRep.name].tier1ProspectCount -= 1;
              byRep[oldRep.name].tier1Count -= 1;
            }
          }
          byRep[oldRep.name].totalARR -= totalAccountARR;
        }
        
        // Add to new rep statistics
        if (byRep[newRep.name]) {
          byRep[newRep.name].parentAccounts += 1;
          if (isCustomer) {
            byRep[newRep.name].customerAccounts += 1;
            byRep[newRep.name].customerARR += hierarchyARR;
            if (account.expansion_tier === 'Tier 1') {
              byRep[newRep.name].tier1CustomerCount += 1;
              byRep[newRep.name].tier1Count += 1;
            }
          } else {
            byRep[newRep.name].prospectAccounts += 1;
            if (account.initial_sale_tier === 'Tier 1') {
              byRep[newRep.name].tier1ProspectCount += 1;
              byRep[newRep.name].tier1Count += 1;
            }
          }
          byRep[newRep.name].totalARR += totalAccountARR;
        }
        
        // Update geography statistics
        const newGeo = regionToGeoMap[newRep.region || 'Central'] || newRep.region || 'Central';
        const oldGeo = oldRep ? (regionToGeoMap[oldRep.region || 'Central'] || oldRep.region || 'Central') : null;
        
        if (oldGeo && byGeo[oldGeo]) {
          if (isCustomer) {
            byGeo[oldGeo].customerAccounts -= 1;
            byGeo[oldGeo].totalARR -= hierarchyARR;
          } else {
            byGeo[oldGeo].prospectAccounts -= 1;
          }
          
          if ((isCustomer && account.expansion_tier === 'Tier 1') || (!isCustomer && account.initial_sale_tier === 'Tier 1')) {
            byGeo[oldGeo].tier1Accounts -= 1;
          }
        }
        
        if (byGeo[newGeo]) {
          if (isCustomer) {
            byGeo[newGeo].customerAccounts += 1;
            byGeo[newGeo].totalARR += hierarchyARR;
          } else {
            byGeo[newGeo].prospectAccounts += 1;
          }
          
          if ((isCustomer && account.expansion_tier === 'Tier 1') || (!isCustomer && account.initial_sale_tier === 'Tier 1')) {
            byGeo[newGeo].tier1Accounts += 1;
          }
        }
      }
    });
    
    return { byGeo, byTier, byRep };
  }

    /**
     * Determine US region for account based on sales_territory with comprehensive mapping
     */
    private determineUSRegion(account: Account): string {
      const territory = (account.sales_territory || '').toLowerCase().trim();
      
      // West Region mappings (expanded and more precise)
      if (territory.includes('pac nw') || 
          territory.includes('pacific northwest') ||
          territory.includes('nor cal') || 
          territory.includes('northern california') ||
          territory.includes('so cal') ||
          territory.includes('southern california') ||
          territory.includes('san francisco') ||
          territory.includes('los angeles') ||
          territory.includes('mountain') ||
          territory.includes('southwest') ||
          territory.includes('pacific') ||
          territory.includes('west coast') ||
          territory.includes('california') ||
          territory.includes('oregon') ||
          territory.includes('washington') ||
          territory.includes('nevada') ||
          territory.includes('utah') ||
          territory.includes('colorado') ||
          territory.includes('arizona') ||
          territory.includes('new mexico') ||
          territory.includes('west')) {
        return 'West';
      }
      
      // North East Region mappings (expanded)
      if (territory.includes('boston') ||
          territory.includes('new england') ||
          territory.includes('ny e') ||
          territory.includes('ny s') ||
          territory.includes('new york') ||
          territory.includes('mid-atlantic') ||
          territory.includes('northeast') ||
          territory.includes('north east') ||
          territory.includes('maine') ||
          territory.includes('vermont') ||
          territory.includes('new hampshire') ||
          territory.includes('massachusetts') ||
          territory.includes('rhode island') ||
          territory.includes('connecticut') ||
          territory.includes('pennsylvania') ||
          territory.includes('new jersey') ||
          territory.includes('delaware') ||
          territory.includes('maryland')) {
        return 'North East';
      }
      
      // South East Region mappings (expanded)
      if (territory.includes('south east') ||
          territory.includes('southeast') ||
          territory.includes('gulf coast') ||
          territory.includes('chesapeake') ||
          territory.includes('florida') ||
          territory.includes('georgia') ||
          territory.includes('south carolina') ||
          territory.includes('north carolina') ||
          territory.includes('virginia') ||
          territory.includes('west virginia') ||
          territory.includes('kentucky') ||
          territory.includes('tennessee') ||
          territory.includes('alabama') ||
          territory.includes('mississippi') ||
          territory.includes('louisiana') ||
          territory.includes('arkansas') ||
          territory.includes('south')) {
        return 'South East';
      }
      
      // Central Region mappings (expanded and includes Texas)
      if (territory.includes('austin-houston') ||
          territory.includes('austin - houston') ||
          territory.includes('texas') ||
          territory.includes('chicago') ||
          territory.includes('mid-west') ||
          territory.includes('midwest') ||
          territory.includes('great lakes') ||
          territory.includes('central') ||
          territory.includes('illinois') ||
          territory.includes('indiana') ||
          territory.includes('ohio') ||
          territory.includes('michigan') ||
          territory.includes('wisconsin') ||
          territory.includes('minnesota') ||
          territory.includes('iowa') ||
          territory.includes('missouri') ||
          territory.includes('north dakota') ||
          territory.includes('south dakota') ||
          territory.includes('nebraska') ||
          territory.includes('kansas') ||
          territory.includes('oklahoma')) {
        return 'Central';
      }
      
      // If no territory match found, use round-robin distribution
      // Target roughly equal distribution across all 4 regions
      const regions = ['West', 'North East', 'South East', 'Central'];
      const hash = account.sfdc_account_id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return regions[hash % regions.length];
    }

  /**
   * Check if rep is in same region as account
   */
  private isRepInAccountRegion(account: Account, rep: SalesRep): boolean {
    const accountRegion = this.determineUSRegion(account);
    const repRegion = rep.region || 'Central';
    return accountRegion === repRegion;
  }

  /**
   * Helper to determine if account is Tier 1
   */
  private isTier1Account(account: Account): boolean {
    const arr = getAccountARR(account);
    return account.expansion_tier === 'Tier 1' || 
           account.initial_sale_tier === 'Tier 1' ||
           account.enterprise_vs_commercial === 'Enterprise' ||
           (account.employees && account.employees > TIER_1_PRIORITY_EMPLOYEE_THRESHOLD) ||
           arr > HIGH_VALUE_ARR_THRESHOLD;
  }
}

export const assignmentService = AssignmentService.getInstance();
export type { AssignmentProposal, AssignmentResult };
