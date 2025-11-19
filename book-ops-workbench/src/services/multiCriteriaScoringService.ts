/**
 * Multi-Criteria Scoring Service
 * 
 * Scores accounts against ALL enabled rules simultaneously,
 * then AI acts as final arbiter to accept or override proposals.
 */

import { supabase } from '@/integrations/supabase/client';
import { DynamicScoringEngine, ScoringContext } from '@/utils/dynamicScoringEngine';

interface Account {
  sfdc_account_id: string;
  account_name: string;
  is_customer: boolean;
  calculated_arr: number;
  calculated_atr: number;
  cre_count: number;
  sales_territory: string;
  geo: string;
  owner_id: string | null;
  owner_name: string | null;
}

interface Rep {
  rep_id: string;
  name: string;
  region: string;
  team: string;
  is_strategic_rep: boolean;
}

interface Rule {
  id: string;
  name: string;
  rule_type: string;
  priority: number;
  enabled: boolean;
  scoring_weights: any;
  conditions: any;
  behavior_class?: string;
}

interface InitialProposal {
  sfdc_account_id: string;
  account_name: string;
  proposed_owner_id: string;
  proposed_owner_name: string;
  scoring_reason: string;
  total_score: number;
  rule_scores: Array<{ rule: string; score: number }>;
  top_contributing_rule: string; // NEW: Track the primary rule that won
  current_owner_id?: string;
  current_owner_name?: string;
  arr: number;
  cre_count: number;
}

interface FinalAssignment {
  sfdc_account_id: string;
  account_name: string;
  final_owner_id: string;
  final_owner_name: string;
  decision_type: 'ACCEPT' | 'OVERRIDE';
  rationale: string;
  assignment_type: string;
  rule_applied?: string; // NEW: Track which rule was applied
}

export class MultiCriteriaScoringService {
  /**
   * Phase 1: Score accounts against all rules to generate initial proposals
   */
  static async generateInitialProposals(
    accounts: Account[],
    reps: Rep[],
    rules: Rule[],
    workloads: Map<string, any>,
    config: any
  ): Promise<InitialProposal[]> {
    console.log('[MULTI-SCORING] 📊 Scoring', accounts.length, 'accounts against', rules.length, 'rules');
    
    const proposals: InitialProposal[] = [];
    const enabledRules = rules.filter(r => r.enabled && r.behavior_class !== 'FINAL_ARBITER');
    
    // Calculate averages for balance scoring
    const totalARR = Array.from(workloads.values()).reduce((sum: number, w: any) => sum + w.total_arr, 0);
    const totalAccounts = Array.from(workloads.values()).reduce((sum: number, w: any) => sum + w.account_count, 0);
    const averageARR = totalARR / reps.length;
    const averageAccounts = totalAccounts / reps.length;

    for (const account of accounts) {
      const repScores = new Map<string, { score: number; ruleScores: Array<{ rule: string; score: number }> }>();

      // Strategic rep constraint (bidirectional):
      // - Strategic accounts → only strategic reps
      // - Regular accounts → only regular (non-strategic) reps
      let eligibleReps = reps;
      if (account.owner_id) {
        const currentOwner = reps.find(r => r.rep_id === account.owner_id);
        if (currentOwner?.is_strategic_rep) {
          // Current owner is strategic → only strategic reps can be assigned
          eligibleReps = reps.filter(r => r.is_strategic_rep);
        } else {
          // Current owner is regular → only regular reps can be assigned
          eligibleReps = reps.filter(r => !r.is_strategic_rep);
        }
      }

      // Score this account for each eligible rep
      for (const rep of eligibleReps) {
        const workload = workloads.get(rep.rep_id);
        if (!workload) continue;

        let totalScore = 0;
        const ruleScores: Array<{ rule: string; score: number }> = [];

        // Score against each enabled rule
        for (const rule of enabledRules) {
          const context: ScoringContext = {
            account,
            rep,
            currentWorkload: {
              currentARR: workload.total_arr,
              currentAccounts: workload.account_count,
              proposedARR: workload.total_arr,
              proposedAccounts: workload.account_count
            },
            allRepsWorkload: workloads,
            averageARR,
            averageAccounts,
            territoryMappings: config.territory_mappings || {}
          };

          let ruleScore = 0;

          // Calculate score based on rule type
          switch (rule.rule_type) {
            case 'GEO_FIRST':
              ruleScore = DynamicScoringEngine.calculateGeoScore(context, rule.scoring_weights || {});
              break;
            case 'CONTINUITY':
              ruleScore = DynamicScoringEngine.calculateContinuityScore(context, rule.scoring_weights || {});
              break;
            case 'SMART_BALANCE':
              ruleScore = DynamicScoringEngine.calculateBalanceScore(context, rule.scoring_weights || {});
              break;
            case 'MIN_THRESHOLDS':
              ruleScore = DynamicScoringEngine.calculateThresholdScore(
                context,
                rule.scoring_weights || {},
                config.customer_min_arr || 1200000,
                rule.conditions?.minParentAccounts || 1
              );
              break;
            case 'ROUND_ROBIN':
              ruleScore = DynamicScoringEngine.calculateRoundRobinScore(
                context,
                rule.scoring_weights || {},
                workload.account_count,
                reps.length
              );
              break;
          }

          // Weight by rule priority (lower priority number = higher weight)
          const priorityWeight = 1 / (rule.priority || 1);
          const weightedScore = ruleScore * priorityWeight;
          
          totalScore += weightedScore;
          ruleScores.push({
            rule: rule.name,
            score: Math.round(weightedScore)
          });
        }

        repScores.set(rep.rep_id, { score: totalScore, ruleScores });
      }

      // Find best rep for this account
      let bestRep: Rep | null = null;
      let bestScore = -Infinity;
      let bestRuleScores: Array<{ rule: string; score: number }> = [];

      for (const rep of reps) {
        const repScore = repScores.get(rep.rep_id);
        if (!repScore) continue;

        if (repScore.score > bestScore) {
          bestScore = repScore.score;
          bestRep = rep;
          bestRuleScores = repScore.ruleScores;
        }
      }

      if (bestRep) {
        // Build scoring reason
        const scoringDetails = bestRuleScores
          .filter(rs => rs.score > 0)
          .map(rs => `${rs.rule}(${rs.score}pts)`)
          .join(' + ');

        // Identify top contributing rule (highest score)
        const topRule = bestRuleScores.length > 0
          ? bestRuleScores.reduce((max, current) => current.score > max.score ? current : max)
          : { rule: 'Unknown', score: 0 };

        proposals.push({
          sfdc_account_id: account.sfdc_account_id,
          account_name: account.account_name,
          proposed_owner_id: bestRep.rep_id,
          proposed_owner_name: bestRep.name,
          scoring_reason: scoringDetails || 'Multi-criteria scoring',
          total_score: Math.round(bestScore),
          rule_scores: bestRuleScores,
          top_contributing_rule: topRule.rule, // NEW: Track which rule won
          current_owner_id: account.owner_id || undefined,
          current_owner_name: account.owner_name || undefined,
          arr: account.calculated_arr || 0,
          cre_count: account.cre_count || 0
        });
      }
    }

    console.log('[MULTI-SCORING] ✅ Generated', proposals.length, 'initial proposals');
    return proposals;
  }

  /**
   * Phase 2: Send proposals to AI in batches (frontend batching to avoid payload size limits)
   */
  static async getFinalAssignments(
    allAccounts: Account[],
    initialProposals: InitialProposal[],
    workloads: Map<string, any>,
    config: any,
    buildId: string,
    onProgress?: (batchCurrent: number, batchTotal: number) => void
  ): Promise<FinalAssignment[]> {
    console.log('[MULTI-SCORING] 🤖 Processing', initialProposals.length, 'proposals with AI arbitration');

    // Auto-adjusting batch size based on dataset size (Phase 1: Increased from 15/25 to 35/50)
    let BATCH_SIZE = initialProposals.length > 500 ? 35 : 50; // Larger batches = fewer API calls
    const totalBatches = Math.ceil(initialProposals.length / BATCH_SIZE);
    console.log(`[MULTI-SCORING] 📦 Splitting into ${totalBatches} batches of ${BATCH_SIZE} proposals each`);
    console.log(`[MULTI-SCORING] ⏱️ Estimated total time: ${(totalBatches * 35 / 60).toFixed(1)} minutes`);

    const allFinalAssignments: FinalAssignment[] = [];
    const startTime = Date.now();
    let consecutiveSlow = 0; // Track slow batches for auto-adjustment

    // Optimize workloads and config once (shared across all batches)
    const optimizedWorkloads = Array.from(workloads.values()).map(w => ({
      rep_id: w.rep_id,
      name: w.name,
      region: w.region,
      total_arr: w.total_arr,
      account_count: w.account_count,
      cre_count: w.cre_count
    }));

    const optimizedConfig = {
      customer_target_arr: config.customer_target_arr,
      customer_max_arr: config.customer_max_arr,
      max_cre_per_rep: config.max_cre_per_rep,
      description: config.description
    };

    // Helper function to process a single batch
    const processBatch = async (batchIndex: number) => {
      const batchStart = batchIndex * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, initialProposals.length);
      const batch = initialProposals.slice(batchStart, batchEnd);
      const batchNumber = batchIndex + 1;
      const batchStartTime = Date.now();

      console.log(`[MULTI-SCORING] 📤 Sending batch ${batchNumber}/${totalBatches} (${batch.length} proposals)`);

      // Report progress
      if (onProgress) {
        onProgress(batchNumber, totalBatches);
      }

      // Invoke Edge Function with retry logic
      const MAX_RETRIES = 3;
      let attempt = 0;
      let data = null;

      while (attempt < MAX_RETRIES && !data) {
        try {
          const response = await supabase.functions.invoke('optimize-balancing', {
            body: {
              mode: 'FINAL_ARBITER',
              initialProposals: batch.map(p => ({
                accountId: p.sfdc_account_id,
                accountName: p.account_name,
                proposedRepId: p.proposed_owner_id,
                proposedRepName: p.proposed_owner_name,
                scoringReason: p.scoring_reason.substring(0, 80),
                totalScore: p.total_score,
                topRule: p.top_contributing_rule,
                currentOwnerId: p.current_owner_id,
                arr: p.arr,
                cre: p.cre_count
              })),
              repWorkloads: optimizedWorkloads,
              config: optimizedConfig,
              buildId,
              batchInfo: { current: batchNumber, total: totalBatches }
            }
          });

          if (response.error) throw response.error;
          if (!response.data?.finalAssignments) throw new Error('No assignments returned');

          data = response.data;

        } catch (err: any) {
          attempt++;

          if (attempt < MAX_RETRIES) {
            const backoffMs = 1000 * Math.pow(2, attempt);
            console.warn(`[MULTI-SCORING] ⚠️ Batch ${batchNumber} attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${backoffMs}ms...`, err.message);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          } else {
            console.error(`[MULTI-SCORING] ❌ Batch ${batchNumber} failed after ${MAX_RETRIES} attempts:`, err);
            throw new Error(`Batch ${batchNumber} failed after ${MAX_RETRIES} attempts: ${err.message}`);
          }
        }
      }

      if (!data || !data.finalAssignments) {
        throw new Error(`Batch ${batchNumber} returned no data after ${MAX_RETRIES} attempts`);
      }

      // Collect assignments from this batch
      const batchAssignments: FinalAssignment[] = data.finalAssignments.map((a: any) => ({
        sfdc_account_id: a.accountId,
        account_name: a.accountName,
        final_owner_id: a.finalRepId,
        final_owner_name: a.finalRepName,
        decision_type: a.decision_type,
        rule_applied: a.rule_applied,
        rationale: a.rationale,
        assignment_type: a.assignment_type || 'customer'
      }));

      const batchDuration = Date.now() - batchStartTime;
      console.log(`[MULTI-SCORING] ✅ Batch ${batchNumber}/${totalBatches} complete in ${(batchDuration / 1000).toFixed(1)}s: ${batchAssignments.length} assignments`);

      return { batchNumber, assignments: batchAssignments, duration: batchDuration };
    };

    try {
      // Phase 2B: Process batches in parallel (3 at a time for optimal throughput)
      const PARALLEL_BATCHES = 3;
      console.log(`[MULTI-SCORING] 🚀 Processing ${PARALLEL_BATCHES} batches in parallel`);

      for (let i = 0; i < totalBatches; i += PARALLEL_BATCHES) {
        const batchPromises = [];
        
        // Launch parallel batch processing
        for (let j = 0; j < PARALLEL_BATCHES && i + j < totalBatches; j++) {
          const batchIndex = i + j;
          batchPromises.push(processBatch(batchIndex));
        }
        
        // Wait for all parallel batches to complete
        const results = await Promise.allSettled(batchPromises);
        
        // Handle results and partial failures
        results.forEach((result, idx) => {
          if (result.status === 'fulfilled') {
            const { batchNumber, assignments } = result.value;
            allFinalAssignments.push(...assignments);
            
            // Save checkpoint after each parallel group
            try {
              localStorage.setItem(`assignment_checkpoint_${buildId}`, JSON.stringify({
                completedBatches: batchNumber,
                totalBatches,
                assignments: allFinalAssignments.length,
                timestamp: Date.now()
              }));
            } catch (e) {
              console.warn('[MULTI-SCORING] Could not save checkpoint:', e);
            }
          } else {
            console.error(`[MULTI-SCORING] ❌ Batch group failed:`, result.reason);
            // Continue processing remaining batches instead of failing completely
          }
        });
        
        // Check if we should continue despite partial failures
        const successfulBatches = results.filter(r => r.status === 'fulfilled').length;
        if (successfulBatches === 0) {
          throw new Error(`All batches in group ${i + 1}-${i + PARALLEL_BATCHES} failed`);
        }
      }
      
      // Clear checkpoint on successful completion
      try {
        localStorage.removeItem(`assignment_checkpoint_${buildId}`);
      } catch (e) {
        console.warn('[MULTI-SCORING] Could not clear checkpoint:', e);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[MULTI-SCORING] 🎉 All ${totalBatches} batches processed in ${duration}s`);
      console.log(`[MULTI-SCORING] 📊 Total assignments: ${allFinalAssignments.length}/${initialProposals.length}`);

      // Phase 2D: Dynamic completion threshold based on dataset size
      const requiredCompletionRate = initialProposals.length > 500 ? 0.90 : 0.95;
      const completionRate = allFinalAssignments.length / initialProposals.length;
      
      console.log(`[MULTI-SCORING] 📊 Completion rate: ${(completionRate * 100).toFixed(1)}% (required: ${(requiredCompletionRate * 100)}%)`);
      
      if (completionRate < requiredCompletionRate) {
        const errorMsg = `AI assignment incomplete: Only ${allFinalAssignments.length}/${initialProposals.length} accounts processed (${(completionRate * 100).toFixed(1)}%, required ${(requiredCompletionRate * 100)}%)`;
        console.error(`[MULTI-SCORING] 💥 FAIL-LOUD: ${errorMsg}`);
        throw new Error(errorMsg);
      }

      return allFinalAssignments;

    } catch (error) {
      console.error('[MULTI-SCORING] ❌ Batch processing failed:', error);
      throw error;
    }
  }
}
