import { supabase } from '@/integrations/supabase/client';
import type { AssignmentRule } from '@/components/AdvancedRuleBuilder';

interface Account {
  sfdc_account_id: string;
  account_name: string;
  owner_id?: string | null;
  owner_name?: string | null;
  new_owner_id?: string | null;
  new_owner_name?: string | null;
  calculated_arr?: number;
  calculated_atr?: number;
  cre_count?: number;
  hq_country?: string | null;
  sales_territory?: string | null;
  initial_sale_tier?: string | null;
  expansion_tier?: string | null;
  is_customer: boolean;
  geo?: string;
  region?: string | null;
}

interface SalesRep {
  rep_id: string;
  name: string;
  region: string;
  current_arr: number;
  current_accounts: number;
  territory?: string;
}

interface InternalProposal {
  sfdc_account_id: string;
  proposed_owner_id: string;
  proposed_owner_name: string;
  rationale: string;
  assignment_type: 'customer' | 'prospect';
  confidence_score: number;
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
  ruleApplied: string;
  conflictRisk: 'LOW' | 'MEDIUM' | 'HIGH';
}

interface RebalanceSuggestion {
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

interface RuleExecutionSummary {
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
    byGeo: Record<string, { 
      repCount: number; 
      customerAccounts: number; 
      prospectAccounts: number;
      totalARR: number; 
      totalATR: number;
    }>;
    byRep: Record<string, { 
      totalAccounts: number;
      customerAccounts: number;
      prospectAccounts: number;
      totalARR: number; 
      totalATR: number;
    }>;
    ruleUsageByRegion?: Record<string, any>;
  };
}

interface AssignmentProgress {
  stage: string;
  status: string;
  progress: number;
  rulesCompleted: number;
  totalRules: number;
  accountsProcessed: number;
  totalAccounts: number;
  assignmentsMade: number;
  conflicts: number;
}

type ProgressCallback = (progress: AssignmentProgress) => void;

let progressCallback: ProgressCallback | null = null;

export function setProgressCallback(callback: ProgressCallback | null) {
  progressCallback = callback;
}

function reportProgress(
  stage: string,
  status: string,
  rulesCompleted: number,
  totalRules: number,
  accountsProcessed: number,
  totalAccounts: number,
  assignmentsMade: number
) {
  if (progressCallback) {
    const progress = totalAccounts > 0 ? (accountsProcessed / totalAccounts) * 100 : 0;
    progressCallback({
      stage,
      status,
      progress,
      rulesCompleted,
      totalRules,
      accountsProcessed,
      totalAccounts,
      assignmentsMade,
      conflicts: 0
    });
  }
}

/**
 * Helper: Check if a rep has capacity for more accounts
 * Allows reps to go up to 150% of max capacity ($3.75M with $2.5M max)
 * The scoring system will still discourage overloading via exponential penalties
 */
function hasCapacity(rep: SalesRep, targetARR: number): boolean {
  // Allow up to 150% of the provided capacity threshold ($2.5M * 1.5 = $3.75M)
  const maxCapacity = targetARR * 1.5;
  const hasSpace = rep.current_arr < maxCapacity;
  
  if (!hasSpace) {
    console.log(`[CAPACITY CHECK] Rep ${rep.name} at capacity: $${(rep.current_arr / 1000000).toFixed(2)}M >= $${(maxCapacity / 1000000).toFixed(2)}M`);
  }
  
  return hasSpace;
}

/**
 * Score a single account-rep pairing against all active rules
 */
async function scoreAccountForRep(
  account: Account,
  rep: SalesRep,
  rules: AssignmentRule[],
  workloads: Map<string, any>,
  additionalFactors: {
    averageARR: number;
    averageAccounts: number;
    territoryMappings: Record<string, string>;
    allRepsTierCounts: Map<string, Record<string, number>>;
    maxCRE: number;
  }
): Promise<{ totalScore: number; breakdown: Record<string, number> }> {
  const workload = workloads.get(rep.rep_id);
  
  if (!workload) {
    return { totalScore: 0, breakdown: {} };
  }
  
  // Import the DynamicScoringEngine
  const { DynamicScoringEngine } = await import('@/utils/dynamicScoringEngine');
  
  const context = {
    account,
    rep,
    currentWorkload: workload,
    allRepsWorkload: workloads,
    averageARR: additionalFactors.averageARR,
    averageAccounts: additionalFactors.averageAccounts,
    territoryMappings: additionalFactors.territoryMappings
  };
  
  // Calculate LINEAR capacity multiplier (soft guardrail - ensures all accounts get assigned)
  const targetARR = 2500000; // $2.5M target capacity per rep
  const currentARR = workload.proposedARR || 0;
  const utilizationPct = currentARR / targetARR;
  
  let capacityMultiplier = 1.0;
  if (utilizationPct < 0.80) {
    // Under 80%: bonus for less-loaded reps (1.0x to 1.5x)
    capacityMultiplier = 1.0 + (0.5 * (1 - utilizationPct / 0.80));
  } else if (utilizationPct >= 0.80 && utilizationPct < 1.20) {
    // 80-120% utilization: linear decline from 1.0x to 0.5x
    // Still allows assignments, just prefers less-loaded reps
    capacityMultiplier = 1.0 - (0.5 * ((utilizationPct - 0.80) / 0.40));
  } else {
    // Over 120% utilization: minimum 0.5x multiplier
    // NEVER drops below 0.5x - ensures everyone can still get assignments
    capacityMultiplier = 0.5;
  }
  
  let totalScore = 0;
  const breakdown: Record<string, number> = {};
  
  for (const rule of rules) {
    if (!rule.enabled) continue;
    
    let ruleScore = 0;
    const weights = rule.scoring_weights || {};
    const priority = rule.priority || 1;
    
    switch (rule.rule_type) {
      case 'GEO_FIRST':
        ruleScore = DynamicScoringEngine.calculateGeoScore(context, weights);
        break;
      case 'CONTINUITY':
        ruleScore = DynamicScoringEngine.calculateContinuityScore(context, weights);
        break;
      case 'TIER_BALANCE':
        ruleScore = DynamicScoringEngine.calculateTierBalanceScore(
          context,
          weights,
          additionalFactors.allRepsTierCounts
        );
        break;
      case 'CRE_BALANCE':
        ruleScore = DynamicScoringEngine.calculateCREBalanceScore(
          context,
          weights,
          additionalFactors.maxCRE
        );
        break;
      case 'SMART_BALANCE':
        ruleScore = DynamicScoringEngine.calculateBalanceScore(context, weights);
        break;
    }
    
    // Apply capacity multiplier to all rule scores
    // Weight by rule priority (lower priority number = higher weight)
    const weightedScore = (ruleScore * capacityMultiplier) / priority;
    totalScore += weightedScore;
    breakdown[rule.rule_type] = weightedScore;
  }
  
  // Add capacity info to breakdown for debugging
  breakdown['_capacity_multiplier'] = capacityMultiplier;
  breakdown['_utilization_pct'] = Math.round(utilizationPct * 100);
  
  return { totalScore, breakdown };
}

/**
 * Generate initial proposals using multi-criteria scoring
 */
async function generateInitialProposalsViaScoring(
  accounts: Account[],
  reps: SalesRep[],
  rules: AssignmentRule[],
  targetARR: number
): Promise<{ proposals: InternalProposal[]; scoringLog: any[] }> {
  const proposals: InternalProposal[] = [];
  const scoringLog: any[] = [];
  
  // Build workload map from current rep state
  const workloadMap = new Map<string, any>();
  reps.forEach(rep => {
    workloadMap.set(rep.rep_id, {
      proposedARR: rep.current_arr,
      proposedAccounts: rep.current_accounts,
      creCount: 0
    });
  });
  
  // Calculate additional factors needed for scoring
  const totalARR = reps.reduce((sum, r) => sum + r.current_arr, 0);
  const totalAccounts = reps.reduce((sum, r) => sum + r.current_accounts, 0);
  const averageARR = totalARR / reps.length;
  const averageAccounts = totalAccounts / reps.length;
  
  // Get territory mappings from rules
  const geoRule = rules.find(r => r.rule_type === 'GEO_FIRST');
  const territoryMappings = geoRule?.conditions?.territoryMappings || {};
  
  // Build tier counts map
  const allRepsTierCounts = new Map<string, Record<string, number>>();
  reps.forEach(rep => {
    allRepsTierCounts.set(rep.rep_id, {});
  });
  
  // Get max CRE from rules
  const creRule = rules.find(r => r.rule_type === 'CRE_BALANCE');
  const maxCRE = creRule?.conditions?.maxCREPerRep || 3;
  
  const additionalFactors = {
    averageARR,
    averageAccounts,
    territoryMappings,
    allRepsTierCounts,
    maxCRE
  };
  
  let assigned = 0;
  let skippedNoEligible = 0;
  
  console.log(`[MULTI-CRITERIA SCORING] Starting with ${accounts.length} accounts, ${reps.length} reps`);
  console.log(`[MULTI-CRITERIA SCORING] Average ARR: $${(averageARR / 1000000).toFixed(2)}M, Average Accounts: ${averageAccounts.toFixed(1)}`);
  
  for (const account of accounts) {
    try {
      // All reps are eligible - scoring will naturally balance via capacity penalties
      const eligibleReps = reps;
      
      // Score each eligible rep
      const repScores: Array<{ rep: SalesRep; score: number; breakdown: Record<string, number> }> = [];
      
      for (const rep of eligibleReps) {
        const { totalScore, breakdown } = await scoreAccountForRep(
          account,
          rep,
          rules,
          workloadMap,
          additionalFactors
        );
        
        repScores.push({ rep, score: totalScore, breakdown });
      }
      
      // Safety check: ensure we have at least one rep to score
      if (repScores.length === 0) {
        console.error(`[SCORING] No reps available to score account ${account.account_name}, skipping`);
        skippedNoEligible++;
        continue;
      }
      
      // Validate that we have at least one valid score
    if (repScores.every(rs => rs.score <= 0 || !isFinite(rs.score))) {
      console.warn(`[SCORING] All reps have invalid scores for account ${account.account_name}, using round-robin fallback`);
      
      // Round-robin fallback: assign to rep with fewest accounts
      repScores.sort((a, b) => {
        const aCount = workloadMap.get(a.rep.rep_id)?.proposedAccounts || 0;
        const bCount = workloadMap.get(b.rep.rep_id)?.proposedAccounts || 0;
        return aCount - bCount;
      });
    } else {
      // Sort by score (highest first)
      repScores.sort((a, b) => b.score - a.score);
    }
    
    // Safety check: ensure sorted array has at least one entry
    if (repScores.length === 0 || !repScores[0]) {
      console.error(`[SCORING] No valid scores after sorting for account ${account.account_name}, skipping`);
      skippedNoEligible++;
      continue;
    }
    
    // Check for ties (scores within 0.01 of top score)
    const topScore = repScores[0].score;
    const tiedReps = repScores.filter(rs => Math.abs(rs.score - topScore) < 0.01);
    
    let winner;
    if (tiedReps.length > 1) {
      // TIE-BREAKER: Among tied reps, select the one with lowest current workload
      console.log(`[TIE-BREAK] ${tiedReps.length} reps tied at score ${topScore.toFixed(2)} for account ${account.account_name}`);
      
      tiedReps.sort((a, b) => {
        const aWorkload = workloadMap.get(a.rep.rep_id);
        const bWorkload = workloadMap.get(b.rep.rep_id);
        const aTotal = (aWorkload?.proposedARR || 0) + (aWorkload?.proposedAccounts || 0) * 10000;
        const bTotal = (bWorkload?.proposedARR || 0) + (bWorkload?.proposedAccounts || 0) * 10000;
        return aTotal - bTotal; // Lower workload wins
      });
      
      winner = tiedReps[0];
      console.log(`[TIE-BREAK] Winner: ${winner.rep.name} (workload: ${workloadMap.get(winner.rep.rep_id)?.proposedAccounts || 0} accounts)`);
    } else {
      winner = repScores[0];
    }
    
    // Safety check: ensure winner was selected
    if (!winner || !winner.rep) {
      console.error(`[SCORING] Failed to select winner for account ${account.account_name}, skipping`);
      skippedNoEligible++;
      continue;
    }
    
    // Log scoring details (first 10 only for performance)
    if (scoringLog.length < 10) {
      scoringLog.push({
        account: account.account_name,
        scores: repScores.slice(0, 3).map(rs => ({
          rep: rs.rep.name,
          totalScore: rs.score.toFixed(2),
          breakdown: rs.breakdown
        })),
        winner: winner.rep.name
      });
    }
    
    // Generate detailed reasoning (Fix 3: Intelligent assignment explanation)
    const winnerWorkload = workloadMap.get(winner.rep.rep_id);
    if (!winnerWorkload) {
      console.error(`[SCORING] Winner workload not found for ${winner.rep.name}, skipping account ${account.account_name}`);
      skippedNoEligible++;
      continue;
    }
    const winnerUtilization = ((winnerWorkload.proposedARR || 0) / targetARR * 100).toFixed(0);
    const newUtilization = (((winnerWorkload.proposedARR || 0) + (account.calculated_arr || 0)) / targetARR * 100).toFixed(0);
    
    // Get runner-up for comparison
    const runnerUp = repScores[1];
    const capacityMultiplier = winner.breakdown['_capacity_multiplier'] || 1.0;
    
    // Build detailed rationale
    let rationale = `Assigned to ${winner.rep.name}:\n`;
    rationale += `• Current: $${((winnerWorkload.proposedARR || 0) / 1000000).toFixed(2)}M ARR (${winnerUtilization}% utilization)`;
    
    if (capacityMultiplier > 1.0) {
      rationale += ` - has capacity ✓`;
    } else if (capacityMultiplier < 0.5) {
      rationale += ` - approaching limit ⚠️`;
    }
    
    rationale += `\n• After assignment: ${newUtilization}% utilization`;
    
    // Add geographic match info if applicable
    const geoScore = winner.breakdown['GEO_FIRST'] || 0;
    if (geoScore > 30) {
      rationale += `\n• Geographic match ✓ (${account.sales_territory || account.region})`;
    }
    
    // Add balance impact
    const balanceScore = winner.breakdown['SMART_BALANCE'] || 0;
    if (balanceScore > 50) {
      rationale += `\n• Strong balance improvement (score: ${balanceScore.toFixed(0)})`;
    }
    
    // Add alternative comparison if there is a runner-up
    if (runnerUp && runnerUp.rep) {
      const runnerUpWorkload = workloadMap.get(runnerUp.rep.rep_id);
      if (runnerUpWorkload) {
        const runnerUpUtilization = ((runnerUpWorkload.proposedARR || 0) / targetARR * 100).toFixed(0);
        rationale += `\n• Alternative (${runnerUp.rep.name}): ${runnerUpUtilization}% utilization`;
      }
    }
    
    // Create proposal
    proposals.push({
      sfdc_account_id: account.sfdc_account_id,
      proposed_owner_id: winner.rep.rep_id,
      proposed_owner_name: winner.rep.name,
      rationale: rationale,
      assignment_type: account.is_customer ? 'customer' : 'prospect',
      confidence_score: Math.min(winner.score / 100, 0.99)
    });
    
    // Update rep workload
    const workload = workloadMap.get(winner.rep.rep_id);
    if (!workload) {
      console.error(`[SCORING] Cannot update workload for ${winner.rep.name}, workload not found for account ${account.account_name}`);
      skippedNoEligible++;
      continue;
    }
    workload.proposedARR += account.calculated_arr || 0;
    workload.proposedAccounts += 1;
    
    winner.rep.current_arr += account.calculated_arr || 0;
    winner.rep.current_accounts += 1;
    
    assigned++;
    } catch (error) {
      console.error(`[SCORING] Error processing account ${account.account_name}:`, error);
      skippedNoEligible++;
      continue;
    }
  }
  
  console.log(`[MULTI-CRITERIA SCORING] ✅ Generated ${assigned} initial proposals`);
  console.log(`[MULTI-CRITERIA SCORING] Skipped ${skippedNoEligible} (no eligible reps)`);
  
  // Log sample scoring breakdown
  if (scoringLog.length > 0) {
    console.log(`[MULTI-CRITERIA SCORING] Sample scoring breakdown:`, JSON.stringify(scoringLog[0], null, 2));
  }
  
  return { proposals, scoringLog };
}

/**
 * AI reviews and arbitrates initial proposals
 */
async function aiReviewAndArbitrate(
  initialProposals: InternalProposal[],
  accounts: Account[],
  reps: SalesRep[],
  buildId: string
): Promise<{ finalProposals: InternalProposal[]; aiDecisions: any[] }> {
  console.log(`[AI ARBITER] Reviewing ${initialProposals.length} initial proposals`);
  
  const BATCH_SIZE = 50;
  const batches: InternalProposal[][] = [];
  
  for (let i = 0; i < initialProposals.length; i += BATCH_SIZE) {
    batches.push(initialProposals.slice(i, i + BATCH_SIZE));
  }
  
  const finalProposals: InternalProposal[] = [];
  const aiDecisions: any[] = [];
  let acceptedCount = 0;
  let overriddenCount = 0;
  
  // Build rep workloads map for AI
  const repWorkloads = new Map<string, { arr: number; accounts: number }>();
  reps.forEach(rep => {
    repWorkloads.set(rep.rep_id, { arr: rep.current_arr, accounts: rep.current_accounts });
  });
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    
    console.log(`[AI ARBITER] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} proposals)`);
    
    // Prepare batch data for AI
    const batchProposals = batch.map(p => {
      const account = accounts.find(a => a.sfdc_account_id === p.sfdc_account_id);
      
      return {
        accountId: p.sfdc_account_id,
        accountName: account?.account_name,
        accountARR: account?.calculated_arr || 0,
        accountATR: account?.calculated_atr || 0,
        creCount: account?.cre_count || 0,
        tier: account?.initial_sale_tier || account?.expansion_tier,
        proposedOwner: p.proposed_owner_name,
        proposedOwnerId: p.proposed_owner_id,
        currentOwner: account?.owner_name,
        rationale: p.rationale
      };
    });
    
    const repWorkloadsList = reps.map(rep => {
      const workload = repWorkloads.get(rep.rep_id) || { arr: 0, accounts: 0 };
      return {
        repId: rep.rep_id,
        repName: rep.name,
        region: rep.region,
        currentARR: workload.arr,
        currentAccounts: workload.accounts
      };
    });
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-balance-optimizer', {
        body: {
          mode: 'FINAL_ARBITER',
          proposals: batchProposals,
          repWorkloads: repWorkloadsList,
          constraints: {
            targetARR: 2500000,
            maxCREPerRep: 3
          }
        }
      });
      
      if (error) {
        console.error(`[AI ARBITER] Error in batch ${batchIndex + 1}:`, error);
        // Fall back to accepting all proposals in this batch
        finalProposals.push(...batch);
        acceptedCount += batch.length;
        continue;
      }
      
      const decisions = data.decisions || [];
      
      // Process AI decisions
      for (const decision of decisions) {
        const originalProposal = batch.find(p => p.sfdc_account_id === decision.accountId);
        
        if (!originalProposal) continue;
        
        if (decision.decision === 'ACCEPT') {
          finalProposals.push(originalProposal);
          acceptedCount++;
        } else if (decision.decision === 'OVERRIDE') {
          // AI suggests a different owner
          const newRep = reps.find(r => r.rep_id === decision.proposedOwner || r.name === decision.proposedOwner);
          
          if (newRep) {
            const account = accounts.find(a => a.sfdc_account_id === originalProposal.sfdc_account_id);
            
            finalProposals.push({
              ...originalProposal,
              proposed_owner_id: newRep.rep_id,
              proposed_owner_name: newRep.name,
              rationale: `AI OVERRIDE: ${decision.rationale}`,
              confidence_score: 0.95
            });
            
            // Update workload tracking
            const oldWorkload = repWorkloads.get(originalProposal.proposed_owner_id);
            const newWorkload = repWorkloads.get(newRep.rep_id);
            
            if (oldWorkload && newWorkload && account) {
              oldWorkload.arr -= account.calculated_arr || 0;
              oldWorkload.accounts -= 1;
              newWorkload.arr += account.calculated_arr || 0;
              newWorkload.accounts += 1;
            }
            
            overriddenCount++;
            aiDecisions.push({
              account: originalProposal.sfdc_account_id,
              originalOwner: originalProposal.proposed_owner_name,
              newOwner: newRep.name,
              reason: decision.rationale
            });
          } else {
            // Can't find new rep, keep original
            finalProposals.push(originalProposal);
            acceptedCount++;
          }
        }
      }
      
    } catch (error) {
      console.error(`[AI ARBITER] Exception in batch ${batchIndex + 1}:`, error);
      // Fall back to accepting all proposals
      finalProposals.push(...batch);
      acceptedCount += batch.length;
    }
  }
  
  const overrideRate = (overriddenCount / initialProposals.length * 100).toFixed(1);
  console.log(`[AI ARBITER] ✅ Completed review`);
  console.log(`[AI ARBITER] - ACCEPTED: ${acceptedCount} (${((acceptedCount / initialProposals.length) * 100).toFixed(1)}%)`);
  console.log(`[AI ARBITER] - OVERRIDDEN: ${overriddenCount} (${overrideRate}%)`);
  
  if (aiDecisions.length > 0) {
    console.log(`[AI ARBITER] Sample overrides:`, aiDecisions.slice(0, 3));
  }
  
  return { finalProposals, aiDecisions };
}

/**
 * Main function to execute assignment rules sequentially
 */
export async function executeAssignmentRules(
  buildId: string,
  accounts: Account[],
  reps: SalesRep[],
  rules: AssignmentRule[]
): Promise<AssignmentResult> {
  console.log('[RuleEngine] 🚀 Starting rule-based assignment execution');
  console.log(`[RuleEngine] Accounts: ${accounts.length}, Reps: ${reps.length}, Rules: ${rules.length}`);

  // Sort rules by priority (lower number = higher priority)
  const sortedRules = [...rules].filter(r => r.enabled).sort((a, b) => a.priority - b.priority);
  
  // Separate AI_BALANCER from scoring rules
  const scoringRules = sortedRules.filter(r => 
    r.rule_type !== 'AI_BALANCER' && r.enabled
  );
  const aiBalancerRule = sortedRules.find(r => 
    r.rule_type === 'AI_BALANCER' && r.enabled
  );

  let allProposals: InternalProposal[] = [];
  let scoringLog: any[] = [];
  const assignmentsByRule: Record<string, number> = {};

  // Phase 1: Multi-Criteria Scoring
  console.log(`[ASSIGNMENT ENGINE] 🚀 Phase 1: Multi-Criteria Scoring with ${scoringRules.length} rules`);
  
  reportProgress(
    'multi_criteria_scoring',
    'Generating initial proposals via multi-criteria scoring',
    0,
    scoringRules.length,
    0,
    accounts.length,
    0
  );

  // Use customer_max_arr ($2.5M) as the capacity threshold  
  const targetARR = 2500000; // $2.5M max capacity - allows up to 150% ($3.75M) via hasCapacity multiplier

  const scoringResult = await generateInitialProposalsViaScoring(
    accounts,
    reps,
    scoringRules,
    targetARR
  );

  allProposals = scoringResult.proposals;
  scoringLog = scoringResult.scoringLog;
  assignmentsByRule['MULTI_CRITERIA_SCORING'] = allProposals.length;

  console.log(`[ASSIGNMENT ENGINE] ✅ Phase 1 complete: ${allProposals.length} proposals generated`);

  // Phase 2: AI Final Arbiter (if enabled)
  let aiDecisions: any[] = [];
  let rebalancingSuggestions: RebalanceSuggestion[] = [];
  let rebalanceWarnings: string[] = [];

  if (aiBalancerRule) {
    console.log(`[ASSIGNMENT ENGINE] 🤖 Phase 2: AI Final Arbiter enabled`);
    
    reportProgress(
      'ai_arbitration',
      'AI reviewing and arbitrating proposals',
      scoringRules.length,
      scoringRules.length + 1,
      accounts.length,
      accounts.length,
      allProposals.length
    );
    
    const arbiterResult = await aiReviewAndArbitrate(
      allProposals,
      accounts,
      reps,
      buildId
    );
    
    allProposals = arbiterResult.finalProposals;
    aiDecisions = arbiterResult.aiDecisions;
    assignmentsByRule['AI_ARBITER_OVERRIDES'] = aiDecisions.length;
    
    console.log(`[ASSIGNMENT ENGINE] ✅ Phase 2 complete: ${aiDecisions.length} AI overrides applied`);
  } else {
    console.log(`[ASSIGNMENT ENGINE] Phase 2: AI Final Arbiter disabled, using scoring results`);
  }

  const rebalancedProposals = allProposals;
  
  // Calculate unassigned accounts
  const assignedIds = new Set(rebalancedProposals.map(p => p.sfdc_account_id));
  const unassignedAccounts = accounts.filter(acc => !assignedIds.has(acc.sfdc_account_id));
  
  // Transform proposals to match expected interface
  const transformedProposals: AssignmentProposal[] = rebalancedProposals.map(p => {
    const account = accounts.find(a => a.sfdc_account_id === p.sfdc_account_id);
    const rep = reps.find(r => r.rep_id === p.proposed_owner_id);
    
    return {
      accountId: p.sfdc_account_id,
      accountName: account?.account_name || 'Unknown',
      currentOwnerId: account?.owner_id || undefined,
      currentOwnerName: account?.owner_name || undefined,
      proposedOwnerId: p.proposed_owner_id,
      proposedOwnerName: p.proposed_owner_name,
      proposedOwnerRegion: rep?.region,
      assignmentReason: p.rationale,
      ruleApplied: p.rationale.split(':')[0], // Extract rule name from rationale
      conflictRisk: 'LOW' as const
    };
  });
  
  // Calculate statistics
  const byGeo: Record<string, { repCount: number; customerAccounts: number; prospectAccounts: number; totalARR: number; totalATR: number }> = {};
  const byRep: Record<string, { totalAccounts: number; customerAccounts: number; prospectAccounts: number; totalARR: number; totalATR: number }> = {};
  
  // Initialize rep stats
  reps.forEach(rep => {
    const region = rep.region || 'Unknown';
    if (!byGeo[region]) {
      byGeo[region] = { repCount: 0, customerAccounts: 0, prospectAccounts: 0, totalARR: 0, totalATR: 0 };
    }
    byGeo[region].repCount++;
    
    byRep[rep.name] = { totalAccounts: 0, customerAccounts: 0, prospectAccounts: 0, totalARR: 0, totalATR: 0 };
  });
  
  // Aggregate statistics from proposals
  transformedProposals.forEach(proposal => {
    const account = accounts.find(a => a.sfdc_account_id === proposal.accountId);
    const rep = reps.find(r => r.rep_id === proposal.proposedOwnerId);
    
    if (account && rep) {
      const region = rep.region || 'Unknown';
      const arr = account.calculated_arr || 0;
      const atr = account.calculated_atr || 0;
      const isCustomer = account.is_customer || false;
      
      // By geo
      if (byGeo[region]) {
        if (isCustomer) {
          byGeo[region].customerAccounts++;
        } else {
          byGeo[region].prospectAccounts++;
        }
        byGeo[region].totalARR += arr;
        byGeo[region].totalATR += atr;
      }
      
      // By rep
      if (byRep[rep.name]) {
        byRep[rep.name].totalAccounts++;
        if (isCustomer) {
          byRep[rep.name].customerAccounts++;
        } else {
          byRep[rep.name].prospectAccounts++;
        }
        byRep[rep.name].totalARR += arr;
        byRep[rep.name].totalATR += atr;
      }
    }
  });
  
  // Generate rule execution summary
  const ruleExecutionSummary: RuleExecutionSummary[] = Object.entries(assignmentsByRule).map(([ruleName, count]) => ({
    ruleName,
    accountsProcessed: 0, // This would need to be tracked separately
    accountsAssigned: count,
    percentOfTotal: accounts.length > 0 ? (count / accounts.length) * 100 : 0
  }));
  
  console.log(`[RuleEngine] 🎉 Assignment complete! Total: ${transformedProposals.length}, Unassigned: ${unassignedAccounts.length}`);
  console.log('[RuleEngine] Summary by rule:', assignmentsByRule);
  console.log('[RuleEngine] Statistics by geo:', byGeo);
  console.log('[RuleEngine] Statistics by rep:', byRep);
  if (rebalancingSuggestions?.length) {
    console.log('[RuleEngine] 💡 AI generated', rebalancingSuggestions.length, 'rebalancing suggestions');
  }
  if (rebalanceWarnings?.length) {
    console.log('[RuleEngine] ⚠️ Warnings:', rebalanceWarnings);
  }
  
  return {
    totalAccounts: accounts.length,
    assignedAccounts: transformedProposals.length,
    unassignedAccounts: unassignedAccounts.length,
    proposals: transformedProposals,
    conflicts: [],
    rebalancingSuggestions,
    rebalanceWarnings,
    ruleExecutionSummary,
    statistics: {
      byGeo,
      byRep
    }
  };
}

/**
 * Rule 1: Assign accounts based on geographic territory mappings
 */
async function assignByGeo(
  accounts: Account[],
  reps: SalesRep[],
  rule: AssignmentRule
): Promise<InternalProposal[]> {
  const proposals: InternalProposal[] = [];
  const territoryMappings = rule.conditions?.territoryMappings || {};
  const targetARR = rule.conditions?.customers?.targetARRThreshold || 2500000;
  
  console.log(`[GEO_FIRST] Territory mappings: ${Object.keys(territoryMappings).length} territories configured`);
  console.log(`[GEO_FIRST] Target ARR per rep: $${(targetARR / 1000000).toFixed(1)}M`);
  
  if (Object.keys(territoryMappings).length === 0) {
    console.log('[GEO_FIRST] ⚠️ No territory mappings configured, skipping');
    return proposals;
  }
  
  let assigned = 0;
  let skippedNoTerritory = 0;
  let skippedNoMapping = 0;
  let skippedCapacity = 0;
  
  for (const account of accounts) {
    // Use sales_territory instead of hq_country
    const salesTerritory = account.sales_territory?.trim();
    
    if (!salesTerritory) {
      skippedNoTerritory++;
      continue;
    }
    
    // Find region from territory mapping
    const region = territoryMappings[salesTerritory];
    
    if (!region) {
      skippedNoMapping++;
      continue;
    }
    
    // Find reps in region with capacity
    const eligibleReps = reps
      .filter(r => r.region === region && hasCapacity(r, targetARR))
      .sort((a, b) => a.current_arr - b.current_arr);
    
    if (eligibleReps.length === 0) {
      skippedCapacity++;
      console.log(`[GEO_FIRST] ⚠️ All reps in ${region} at capacity for ${account.account_name}`);
      continue;
    }
    
    const selectedRep = eligibleReps[0];
    
    proposals.push({
      sfdc_account_id: account.sfdc_account_id,
      proposed_owner_id: selectedRep.rep_id,
      proposed_owner_name: selectedRep.name,
      rationale: `GEO: Territory ${salesTerritory} → ${region} region`,
      assignment_type: account.is_customer ? 'customer' : 'prospect',
      confidence_score: 0.95
    });
    
    selectedRep.current_arr += account.calculated_arr || 0;
    selectedRep.current_accounts += 1;
    assigned++;
  }
  
  console.log(`[GEO_FIRST] ✅ Assigned ${assigned} accounts`);
  console.log(`[GEO_FIRST] Skipped: ${skippedNoTerritory} (no territory), ${skippedNoMapping} (no mapping), ${skippedCapacity} (capacity)`);
  
  return proposals;
}

/**
 * Rule 2: Maintain continuity with existing owner if they're in the correct region
 */
async function checkContinuity(
  accounts: Account[],
  reps: SalesRep[],
  rule: AssignmentRule
): Promise<InternalProposal[]> {
  const proposals: InternalProposal[] = [];
  const minOwnershipDays = rule.conditions?.minOwnershipDays || 7;
  const maxARR = rule.conditions?.maxARR || 2500000;
  const territoryMappings = rule.conditions?.territoryMappings || {};
  
  let maintained = 0;
  let skippedCapacity = 0;
  let skippedGeoMismatch = 0;
  let skippedNoOwner = 0;
  
  console.log(`[CONTINUITY] Checking continuity for ${accounts.length} accounts`);
  console.log(`[CONTINUITY] Max ARR per rep: $${(maxARR / 1000000).toFixed(1)}M`);
  
  for (const account of accounts) {
    if (!account.owner_id) {
      skippedNoOwner++;
      continue;
    }
    
    const currentOwner = reps.find(r => r.rep_id === account.owner_id);
    if (!currentOwner) {
      skippedNoOwner++;
      continue;
    }
    
    // Check capacity
    if (!hasCapacity(currentOwner, maxARR)) {
      skippedCapacity++;
      console.log(`[CONTINUITY] ⚠️ ${currentOwner.name} at capacity, cannot maintain ${account.account_name}`);
      continue;
    }
    
    // Check geographic alignment
    const accountTerritory = account.sales_territory?.trim();
    if (accountTerritory && Object.keys(territoryMappings).length > 0) {
      const accountRegion = territoryMappings[accountTerritory];
      
      if (accountRegion && currentOwner.region !== accountRegion) {
        skippedGeoMismatch++;
        console.log(`[CONTINUITY] ⚠️ Geo mismatch: ${account.account_name} (${accountTerritory}→${accountRegion}) vs ${currentOwner.name} (${currentOwner.region})`);
        continue;
      }
    }
    
    // Maintain continuity
    proposals.push({
      sfdc_account_id: account.sfdc_account_id,
      proposed_owner_id: currentOwner.rep_id,
      proposed_owner_name: currentOwner.name,
      rationale: `CONTINUITY: Maintained with ${currentOwner.name} (${minOwnershipDays}+ days, geo-aligned)`,
      assignment_type: account.is_customer ? 'customer' : 'prospect',
      confidence_score: 0.90
    });
    
    currentOwner.current_arr += account.calculated_arr || 0;
    currentOwner.current_accounts += 1;
    maintained++;
  }
  
  console.log(`[CONTINUITY] ✅ Maintained ${maintained} accounts with current owners`);
  console.log(`[CONTINUITY] Skipped: ${skippedNoOwner} (no owner), ${skippedCapacity} (capacity), ${skippedGeoMismatch} (geo mismatch)`);
  
  return proposals;
}

/**
 * Rule 3: Balance account tiers across representatives
 */
async function balanceTiers(
  accounts: Account[],
  reps: SalesRep[],
  rule: AssignmentRule
): Promise<InternalProposal[]> {
  const proposals: InternalProposal[] = [];
  
  // 🔍 CRITICAL FIX: Check if rule should process accounts
  // TIER_BALANCE should only run if:
  // 1. Account scope matches (customers/prospects/all)
  // 2. Account hasn't been assigned by higher-priority rules
  // 3. Account has a tier value that needs balancing
  
  const accountScope = rule.account_scope || 'all';
  let eligibleAccounts = accounts;
  
  // Filter by account scope (customer vs prospect)
  if (accountScope === 'customers') {
    eligibleAccounts = accounts.filter(a => a.is_customer);
  } else if (accountScope === 'prospects') {
    eligibleAccounts = accounts.filter(a => !a.is_customer);
  }
  
  console.log(`[TIER_BALANCE] Processing ${eligibleAccounts.length} accounts (scope: ${accountScope}, total: ${accounts.length})`);
  
  // If no accounts match scope, return empty
  if (eligibleAccounts.length === 0) {
    console.log('[TIER_BALANCE] No accounts match rule scope, skipping');
    return proposals;
  }
  
  const fieldMappings = rule.conditions?.fieldMappings || {};
  const tierField = fieldMappings.tierField || 'initial_sale_tier';
  const tier1Value = fieldMappings.tier1Value || 'Tier 1';
  const tier2Value = fieldMappings.tier2Value || 'Tier 2';
  const tier3Value = fieldMappings.tier3Value || 'Tier 3';
  const tier4Value = fieldMappings.tier4Value || 'Tier 4';
  const targetARR = rule.conditions?.customers?.targetARRThreshold || 2500000;
  
  console.log(`[TIER_BALANCE] Target ARR per rep: $${(targetARR / 1000000).toFixed(1)}M`);
  
  // Support both initial_sale_tier AND expansion_tier
  const getTierValue = (account: Account) => {
    const primaryValue = (account as any)[tierField];
    if (primaryValue) return primaryValue;
    
    // Fallback to expansion_tier if initial_sale_tier is null
    if (tierField === 'initial_sale_tier' && account.expansion_tier) {
      return account.expansion_tier;
    }
    return null;
  };
  
  // Separate eligible accounts by tier
  const tier1Accounts = eligibleAccounts.filter(a => getTierValue(a) === tier1Value);
  const tier2Accounts = eligibleAccounts.filter(a => getTierValue(a) === tier2Value);
  const tier3Accounts = eligibleAccounts.filter(a => getTierValue(a) === tier3Value);
  const tier4Accounts = eligibleAccounts.filter(a => getTierValue(a) === tier4Value);
  const otherAccounts = eligibleAccounts.filter(a => {
    const tier = getTierValue(a);
    return tier !== tier1Value && tier !== tier2Value && tier !== tier3Value && tier !== tier4Value;
  });
  
  console.log(`[TIER_BALANCE] Tier distribution: T1=${tier1Accounts.length}, T2=${tier2Accounts.length}, T3=${tier3Accounts.length}, T4=${tier4Accounts.length}, Other=${otherAccounts.length}`);
  
  // Helper to assign with capacity check
  const assignAccountWithCapacity = (account: Account, tierName: string): boolean => {
    const eligibleReps = reps
      .filter(r => hasCapacity(r, targetARR))
      .sort((a, b) => a.current_arr - b.current_arr);
    
    if (eligibleReps.length === 0) {
      console.log(`[TIER_BALANCE] ⚠️ All reps at capacity, cannot assign ${account.account_name}`);
      return false;
    }
    
    const selectedRep = eligibleReps[0];
    
    proposals.push({
      sfdc_account_id: account.sfdc_account_id,
      proposed_owner_id: selectedRep.rep_id,
      proposed_owner_name: selectedRep.name,
      rationale: `TIER: ${tierName} account balanced to lowest-loaded rep`,
      assignment_type: account.is_customer ? 'customer' : 'prospect',
      confidence_score: tierName === 'Tier 1' ? 0.90 : 0.85
    });
    
    selectedRep.current_arr += account.calculated_arr || 0;
    selectedRep.current_accounts += 1;
    return true;
  };
  
  // Distribute Tier 1 first (highest value)
  let tier1Assigned = 0;
  for (const account of tier1Accounts) {
    if (assignAccountWithCapacity(account, tier1Value)) tier1Assigned++;
  }
  
  // Then Tier 2
  let tier2Assigned = 0;
  for (const account of tier2Accounts) {
    if (assignAccountWithCapacity(account, tier2Value)) tier2Assigned++;
  }
  
  // Then Tier 3
  let tier3Assigned = 0;
  for (const account of tier3Accounts) {
    if (assignAccountWithCapacity(account, tier3Value)) tier3Assigned++;
  }
  
  // Then Tier 4
  let tier4Assigned = 0;
  for (const account of tier4Accounts) {
    if (assignAccountWithCapacity(account, tier4Value)) tier4Assigned++;
  }
  
  // Finally, other accounts
  let otherAssigned = 0;
  for (const account of otherAccounts) {
    if (assignAccountWithCapacity(account, 'Other')) otherAssigned++;
  }
  
  console.log(`[TIER_BALANCE] ✅ Assigned: T1=${tier1Assigned}, T2=${tier2Assigned}, T3=${tier3Assigned}, T4=${tier4Assigned}, Other=${otherAssigned}`);
  
  return proposals;
}

/**
 * Rule 4: Distribute CRE accounts to ensure no rep exceeds limit
 */
async function distributeCRE(
  accounts: Account[],
  reps: SalesRep[],
  rule: AssignmentRule
): Promise<InternalProposal[]> {
  const proposals: InternalProposal[] = [];
  const fieldMappings = rule.conditions?.fieldMappings || {};
  const creCountField = fieldMappings.creCountField || 'cre_count';
  const creThreshold = fieldMappings.creThreshold || 0;
  const maxCREPerRep = rule.conditions?.maxCREPerRep || 3;
  const targetARR = rule.conditions?.customers?.targetARRThreshold || 2500000;
  
  // Track CRE count per rep
  const repCRECount: Record<string, number> = {};
  reps.forEach(r => { repCRECount[r.rep_id] = 0; });
  
  const getCRECount = (account: Account) => {
    return (account as any)[creCountField] || 0;
  };
  
  const creAccounts = accounts.filter(a => getCRECount(a) > creThreshold);
  
  console.log(`[CRE_BALANCE] Processing ${creAccounts.length} CRE accounts (threshold: ${creThreshold}, max per rep: ${maxCREPerRep})`);
  console.log(`[CRE_BALANCE] Target ARR per rep: $${(targetARR / 1000000).toFixed(1)}M`);
  
  let assigned = 0;
  let skippedCRELimit = 0;
  let skippedCapacity = 0;
  
  for (const account of creAccounts) {
    // Find reps under BOTH CRE limit AND capacity limit
    const eligibleReps = reps
      .filter(r => {
        const underCRELimit = (repCRECount[r.rep_id] || 0) < maxCREPerRep;
        const hasCapacitySpace = hasCapacity(r, targetARR);
        
        if (!underCRELimit) {
          skippedCRELimit++;
          return false;
        }
        if (!hasCapacitySpace) {
          skippedCapacity++;
          return false;
        }
        
        return true;
      })
      .sort((a, b) => a.current_arr - b.current_arr);
    
    if (eligibleReps.length === 0) {
      console.log(`[CRE_BALANCE] ⚠️ No eligible reps for CRE account ${account.account_name}`);
      continue;
    }
    
    const selectedRep = eligibleReps[0];
    const creCount = getCRECount(account);
    
    proposals.push({
      sfdc_account_id: account.sfdc_account_id,
      proposed_owner_id: selectedRep.rep_id,
      proposed_owner_name: selectedRep.name,
      rationale: `CRE: Account has ${creCount} CRE, distributed to ensure max ${maxCREPerRep} per rep`,
      assignment_type: account.is_customer ? 'customer' : 'prospect',
      confidence_score: 0.88
    });
    
    repCRECount[selectedRep.rep_id] += 1;
    selectedRep.current_arr += account.calculated_arr || 0;
    selectedRep.current_accounts += 1;
    assigned++;
  }
  
  console.log(`[CRE_BALANCE] ✅ Assigned ${assigned} CRE accounts`);
  console.log(`[CRE_BALANCE] Skipped: ${skippedCRELimit} (CRE limit), ${skippedCapacity} (capacity)`);
  
  // Log final CRE distribution
  const distribution = Object.entries(repCRECount)
    .filter(([_, count]) => count > 0)
    .map(([repId, count]) => {
      const rep = reps.find(r => r.rep_id === repId);
      return `${rep?.name}: ${count} CRE`;
    });
  console.log(`[CRE_BALANCE] Final distribution: ${distribution.join(', ')}`);
  
  return proposals;
}

/**
 * Rule 5: Use AI to assign edge cases and complex scenarios
 */
async function finalizeWithAI(
  buildId: string,
  accounts: Account[],
  reps: SalesRep[],
  rule: AssignmentRule
): Promise<InternalProposal[]> {
  console.log(`[AI_BALANCER] Processing ${accounts.length} remaining accounts with AI`);
  
  if (accounts.length === 0) {
    return [];
  }

  // Get field mappings
  const fieldMappings = rule.conditions?.fieldMappings || {};
  const minARR = fieldMappings.minARR || rule.conditions?.customers?.minARRThreshold || 1200000;
  const maxARR = fieldMappings.maxARR || rule.conditions?.maxARRThreshold || 3000000;
  
  console.log(`[AI_BALANCER] Using ARR limits: min=${minARR}, max=${maxARR}`);
  
  // If there are too many accounts, just do simple round-robin as fallback
  if (accounts.length > 50) {
    console.log('[AI_BALANCER] Too many accounts for AI, using round-robin fallback');
    return roundRobinFallback(accounts, reps);
  }
  
  try {
    // Call AI balancer edge function
    const { data, error } = await supabase.functions.invoke('ai-balance-optimizer', {
      body: {
        buildId,
        accounts: accounts.map(a => ({
          sfdc_account_id: a.sfdc_account_id,
          account_name: a.account_name,
          calculated_arr: a.calculated_arr,
          calculated_atr: a.calculated_atr,
          cre_count: a.cre_count,
          hq_country: a.hq_country,
          expansion_tier: a.expansion_tier
        })),
        reps: reps.map(r => ({
          rep_id: r.rep_id,
          name: r.name,
          region: r.region,
          current_arr: r.current_arr,
          current_accounts: r.current_accounts
        })),
        goals: rule.conditions || {}
      }
    });
    
    if (error) {
      console.error('[AI_BALANCER] Error:', error);
      return roundRobinFallback(accounts, reps);
    }
    
    return data.proposals || [];
  } catch (error) {
    console.error('[AI_BALANCER] Exception:', error);
    return roundRobinFallback(accounts, reps);
  }
}

/**
 * Round-robin fallback for AI failures
 */
function roundRobinFallback(accounts: Account[], reps: SalesRep[]): InternalProposal[] {
  const proposals: InternalProposal[] = [];
  const sortedReps = [...reps].sort((a, b) => a.current_arr - b.current_arr);
  
  let repIndex = 0;
  for (const account of accounts) {
    const selectedRep = sortedReps[repIndex % sortedReps.length];
    proposals.push({
      sfdc_account_id: account.sfdc_account_id,
      proposed_owner_id: selectedRep.rep_id,
      proposed_owner_name: selectedRep.name,
      rationale: 'AI_FALLBACK: Round-robin distribution',
      assignment_type: account.is_customer ? 'customer' : 'prospect',
      confidence_score: 0.70
    });
    
    selectedRep.current_arr += account.calculated_arr || 0;
    repIndex++;
  }
  
  return proposals;
}

/**
 * AI-Driven Regional Rebalancing
 * Detects imbalances, flags overload, and generates AI suggestions for rebalancing
 */
async function aiDrivenRegionalRebalance(
  allAccounts: Account[],
  reps: SalesRep[],
  proposals: InternalProposal[],
  buildId: string
): Promise<{
  adjustedProposals: InternalProposal[];
  rebalancingSuggestions: RebalanceSuggestion[];
  warnings: string[];
}> {
  console.log('[REBALANCE] Starting AI-driven regional rebalancing analysis');
  
  // Calculate current ARR per rep after assignments
  const repARR: Record<string, number> = {};
  const repAccounts: Record<string, number> = {};
  const repDetails: Record<string, { name: string; region: string }> = {};
  
  reps.forEach(r => {
    repARR[r.rep_id] = 0;
    repAccounts[r.rep_id] = 0;
    repDetails[r.rep_id] = { name: r.name, region: r.region };
  });
  
  proposals.forEach(p => {
    const account = allAccounts.find(a => a.sfdc_account_id === p.sfdc_account_id);
    if (account) {
      repARR[p.proposed_owner_id] = (repARR[p.proposed_owner_id] || 0) + (account.calculated_arr || 0);
      repAccounts[p.proposed_owner_id] = (repAccounts[p.proposed_owner_id] || 0) + 1;
    }
  });
  
  // Calculate regional stats
  const regionStats: Record<string, { 
    totalARR: number; 
    repCount: number; 
    avgARR: number;
    targetARR: number;
    reps: { id: string; name: string; arr: number; variance: number }[];
  }> = {};
  
  reps.forEach(r => {
    if (!regionStats[r.region]) {
      regionStats[r.region] = { totalARR: 0, repCount: 0, avgARR: 0, targetARR: 0, reps: [] };
    }
    regionStats[r.region].totalARR += repARR[r.rep_id] || 0;
    regionStats[r.region].repCount += 1;
    regionStats[r.region].reps.push({
      id: r.rep_id,
      name: r.name,
      arr: repARR[r.rep_id] || 0,
      variance: 0
    });
  });
  
  // Calculate target ARR per region
  Object.keys(regionStats).forEach(region => {
    const stats = regionStats[region];
    stats.avgARR = stats.totalARR / stats.repCount;
    stats.targetARR = stats.avgARR;
    
    // Calculate variance for each rep
    stats.reps.forEach(rep => {
      rep.variance = stats.targetARR > 0 ? ((rep.arr - stats.targetARR) / stats.targetARR) * 100 : 0;
    });
  });
  
  console.log('[REBALANCE] Regional stats:', regionStats);
  
  // Find imbalanced regions (±10% variance)
  const VARIANCE_THRESHOLD = 10; // 10% as per user requirement
  const imbalancedRegions: string[] = [];
  const overloadedReps: { region: string; name: string; arr: number; variance: number }[] = [];
  const underloadedReps: { region: string; name: string; arr: number; variance: number }[] = [];
  
  Object.entries(regionStats).forEach(([region, stats]) => {
    const hasImbalance = stats.reps.some(rep => Math.abs(rep.variance) > VARIANCE_THRESHOLD);
    if (hasImbalance) {
      imbalancedRegions.push(region);
      
      stats.reps.forEach(rep => {
        if (rep.variance > VARIANCE_THRESHOLD) {
          overloadedReps.push({ region, name: rep.name, arr: rep.arr, variance: rep.variance });
        } else if (rep.variance < -VARIANCE_THRESHOLD) {
          underloadedReps.push({ region, name: rep.name, arr: rep.arr, variance: rep.variance });
        }
      });
    }
  });
  
  const warnings: string[] = [];
  
  // Flag systemic overload (>3 reps overloaded)
  if (overloadedReps.length > 3) {
    warnings.push(
      `⚠️ SYSTEMIC OVERLOAD: ${overloadedReps.length} reps are overloaded (>${VARIANCE_THRESHOLD}% above target). ` +
      `Consider hiring more reps or adjusting targets.`
    );
  }
  
  // If no imbalances detected, return early
  if (imbalancedRegions.length === 0) {
    console.log('[REBALANCE] ✅ No regional imbalances detected (all within ±10%)');
    return { adjustedProposals: proposals, rebalancingSuggestions: [], warnings };
  }
  
  console.log('[REBALANCE] 🔍 Detected imbalances in regions:', imbalancedRegions);
  console.log('[REBALANCE] 📈 Overloaded reps:', overloadedReps.map(r => `${r.name} (+${r.variance.toFixed(1)}%)`));
  console.log('[REBALANCE] 📉 Underloaded reps:', underloadedReps.map(r => `${r.name} (${r.variance.toFixed(1)}%)`));
  
  // Call AI to generate rebalancing suggestions
  const suggestions = await callAIForRebalancingSuggestions(
    imbalancedRegions,
    overloadedReps,
    underloadedReps,
    regionStats,
    allAccounts,
    proposals,
    buildId
  );
  
  return {
    adjustedProposals: proposals, // Don't auto-apply, return suggestions for user approval
    rebalancingSuggestions: suggestions,
    warnings
  };
}

/**
 * Call AI to generate rebalancing suggestions
 */
async function callAIForRebalancingSuggestions(
  imbalancedRegions: string[],
  overloadedReps: { region: string; name: string; arr: number; variance: number }[],
  underloadedReps: { region: string; name: string; arr: number; variance: number }[],
  regionStats: Record<string, any>,
  allAccounts: Account[],
  proposals: InternalProposal[],
  buildId: string
): Promise<RebalanceSuggestion[]> {
  try {
    console.log('[REBALANCE] 🤖 Calling AI for rebalancing suggestions');
    
    // Prepare data for AI
    const imbalanceData = imbalancedRegions.map(region => {
      const stats = regionStats[region];
      return {
        region,
        targetARR: stats.targetARR,
        overloaded: overloadedReps.filter(r => r.region === region),
        underloaded: underloadedReps.filter(r => r.region === region)
      };
    });
    
    // Get movable accounts (exclude CONTINUITY, prefer smaller accounts)
    const movableAccounts = proposals
      .filter(p => !p.rationale.includes('CONTINUITY'))
      .map(p => {
        const account = allAccounts.find(a => a.sfdc_account_id === p.sfdc_account_id);
        const rep = overloadedReps.find(r => r.name === p.proposed_owner_name);
        return {
          sfdc_account_id: p.sfdc_account_id,
          account_name: account?.account_name || 'Unknown',
          arr: account?.calculated_arr || 0,
          current_owner_id: p.proposed_owner_id,
          current_owner_name: p.proposed_owner_name,
          region: rep?.region || 'Unknown',
          is_overloaded: !!rep
        };
      })
      .filter(a => a.is_overloaded)
      .sort((a, b) => a.arr - b.arr) // Smallest first
      .slice(0, 20); // Limit to 20 movable accounts
    
    const { data, error } = await supabase.functions.invoke('ai-balance-optimizer', {
      body: {
        mode: 'rebalance',
        imbalancedRegions: imbalanceData,
        movableAccounts,
        targetUnderloadedReps: underloadedReps
      }
    });
    
    if (error) {
      console.error('[REBALANCE] AI error:', error);
      return [];
    }
    
    // Parse AI suggestions
    const aiSuggestions = data.suggestions || [];
    console.log('[REBALANCE] 💡 AI generated', aiSuggestions.length, 'suggestions');
    
    // Transform AI suggestions to our format
    return aiSuggestions.map((s: any) => ({
      accountId: s.accountId,
      accountName: s.accountName,
      accountARR: s.accountARR,
      fromRepId: s.fromRepId || '',
      fromRepName: s.fromRepName,
      toRepId: s.toRepId || '',
      toRepName: s.toRepName,
      reason: s.reason,
      estimatedImpact: s.estimatedImpact
    }));
    
  } catch (error) {
    console.error('[REBALANCE] Exception calling AI:', error);
    return [];
  }
}
