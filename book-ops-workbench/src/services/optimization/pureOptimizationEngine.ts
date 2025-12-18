/**
 * Pure Optimization Engine
 * 
 * Main orchestrator for the weighted LP assignment model.
 * Replaces the cascading priority waterfall with a single global solve.
 * 
 * Execution flow:
 * 1. Load data (accounts, reps, opportunities, config)
 * 2. Pre-assign strategic pool
 * 3. Identify stability locks
 * 4. Build LP problem
 * 5. Solve with HiGHS
 * 6. Cascade to children
 * 7. Calculate metrics
 * 8. Return results
 */

import type {
  LPConfiguration,
  LPSolveResult,
  LPAssignmentProposal,
  LPProgress,
  LPProgressCallback,
  AggregatedAccount,
  EligibleRep,
  NormalizedWeights,
  StabilityLockResult,
  AssignmentScores,
  LPMetrics,
  LPProblem
} from './types';

import { loadBuildData, LoadedBuildData } from './preprocessing/dataLoader';
import { assignStrategicPool } from './preprocessing/strategicPoolHandler';
import { cascadeToChildren } from './preprocessing/parentChildAggregator';
import { identifyLockedAccounts, checkStabilityLock } from './constraints/stabilityLocks';
import { buildLPProblem, ProblemBuildResult } from './constraints/lpProblemBuilder';
import { solveProblem, extractAssignments } from './solver/highsWrapper';
import { generateRationale } from './postprocessing/rationaleGenerator';
import { calculateRepLoads, calculateMetrics } from './postprocessing/metricsCalculator';
import { recordLPOptimizationRun } from './telemetry/optimizationTelemetry';
import { LP_SCALE_LIMITS } from '@/_domain';

/**
 * Yield to the UI event loop to keep animations smooth
 * Uses double-frame yield to ensure browser has time to render
 * and process pending timers (like setInterval for the stopwatch)
 */
async function yieldToUI(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => {
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        setTimeout(resolve, 16);
      });
    } else {
      setTimeout(resolve, 16);
    }
  });
}

export class PureOptimizationEngine {
  private buildId: string;
  private onProgress?: LPProgressCallback;
  
  constructor(buildId: string, onProgress?: LPProgressCallback) {
    this.buildId = buildId;
    this.onProgress = onProgress;
  }
  
  /**
   * Run the pure optimization engine
   */
  async run(assignmentType: 'customer' | 'prospect'): Promise<LPSolveResult> {
    const startTime = Date.now();
    
    try {
      // Phase 1: Load data
      await this.reportProgress({
        stage: 'loading',
        status: 'Loading build data...',
        progress: 5
      });
      
      const data = await loadBuildData(this.buildId);
      
      // Phase 2: Preprocess
      await this.reportProgress({
        stage: 'preprocessing',
        status: 'Processing accounts and reps...',
        progress: 15,
        accountsProcessed: 0,
        totalAccounts: data.accounts.length
      });
      
      return await this.runForType(assignmentType, data, startTime);
      
    } catch (error: any) {
      console.error('[PureOptimization] Engine error:', error);
      
      await this.reportProgress({
        stage: 'error',
        status: `Error: ${error.message}`,
        progress: 0
      });
      
      return {
        success: false,
        proposals: [],
        repLoads: [],
        metrics: this.emptyMetrics(Date.now() - startTime),
        solverStatus: 'error',
        objectiveValue: 0,
        warnings: [],
        error: error.message
      };
    }
  }
  
  /**
   * Run optimization for a specific account type
   */
  private async runForType(
    assignmentType: 'customer' | 'prospect',
    data: LoadedBuildData,
    startTime: number
  ): Promise<LPSolveResult> {
    const accounts = assignmentType === 'customer' 
      ? data.customerAccounts 
      : data.prospectAccounts;
    
    console.log(`[PureOptimization] Running ${assignmentType} optimization for ${accounts.length} accounts`);
    
    if (accounts.length === 0) {
      return {
        success: true,
        proposals: [],
        repLoads: calculateRepLoads([], accounts, data.regularReps, data.targetArr),
        metrics: this.emptyMetrics(Date.now() - startTime),
        solverStatus: 'optimal',
        objectiveValue: 0,
        warnings: [`No ${assignmentType} accounts to assign`]
      };
    }
    
    if (data.regularReps.length === 0) {
      return {
        success: false,
        proposals: [],
        repLoads: [],
        metrics: this.emptyMetrics(Date.now() - startTime),
        solverStatus: 'error',
        objectiveValue: 0,
        warnings: [],
        error: 'No eligible reps available for assignment'
      };
    }
    
    const warnings: string[] = [];
    
    // Scale guard: Check if problem is large
    // HiGHS WASM can hang on very large problems due to dense constraint matrices
    // For large problems, the solver wrapper will automatically use Cloud Run native HiGHS
    // @see _domain/constants.ts LP_SCALE_LIMITS
    if (accounts.length > LP_SCALE_LIMITS.MAX_ACCOUNTS_FOR_GLOBAL_LP) {
      console.log(`[PureOptimization] ${accounts.length} accounts exceeds WASM limit (${LP_SCALE_LIMITS.MAX_ACCOUNTS_FOR_GLOBAL_LP})`);
      console.log(`[PureOptimization] Will use Cloud Run native HiGHS solver for this large problem`);
      warnings.push(`Large problem (${accounts.length} accounts) - using Cloud Run native solver`);
    }
    
    // Performance warning for medium-sized problems
    if (accounts.length > LP_SCALE_LIMITS.WARN_ACCOUNTS_THRESHOLD) {
      console.warn(`[PureOptimization] ${accounts.length} accounts - solve may take 30+ seconds`);
      warnings.push(`Large problem size (${accounts.length} accounts) - optimization may take longer`);
    }
    
    // Phase 2a: Handle strategic pool
    await this.reportProgress({
      stage: 'preprocessing',
      status: 'Assigning strategic accounts...',
      progress: 20
    });
    
    const strategicResult = data.lpConfig.lp_constraints.strategic_pool_enabled
      ? assignStrategicPool(accounts, data.strategicReps, data.lpConfig.priority_config)
      : { fixedAssignments: [], remainingAccounts: accounts, strategicAccountCount: 0, strategicRepCount: 0 };
    
    if (strategicResult.strategicAccountCount > 0 && strategicResult.strategicRepCount === 0) {
      warnings.push(`${strategicResult.strategicAccountCount} strategic accounts but no strategic reps available`);
    }
    
    // Phase 2b: Identify stability locks
    await this.reportProgress({
      stage: 'preprocessing',
      status: 'Identifying stability locks...',
      progress: 25
    });
    
    const { lockedAccounts, unlockedAccounts, lockStats } = identifyLockedAccounts(
      strategicResult.remainingAccounts,
      data.regularReps,
      data.lpConfig.lp_stability_config
    );
    
    console.log(`[PureOptimization] Stability locks:`, lockStats);
    
    // Phase 3: Build LP problem
    await this.reportProgress({
      stage: 'building',
      status: 'Building optimization problem...',
      progress: 35
    });
    
    const { problem, accountScores, weights } = buildLPProblem({
      accounts: unlockedAccounts,
      reps: data.regularReps,
      lockedAccounts,
      config: data.lpConfig,
      assignmentType,
      territoryMappings: data.territoryMappings,
      hardCapArr: data.hardCapArr,
      targetArr: data.targetArr,
      targetPipeline: data.targetPipeline
    });
    
    await this.reportProgress({
      stage: 'building',
      status: `Problem built: ${problem.numVariables} variables, ${problem.numConstraints} constraints`,
      progress: 45,
      constraintsBuilt: problem.numConstraints,
      totalConstraints: problem.numConstraints
    });
    
    // Phase 4: Solve
    await this.reportProgress({
      stage: 'solving',
      status: 'Running HiGHS optimizer...',
      progress: 50
    });
    
    // Use cloud mode for global optimization (reliable, handles large problems)
    // @see MASTER_LOGIC.mdc §11.11 Solver Routing Strategy
    const solution = await solveProblem(problem, data.lpConfig.lp_solver_params, 'cloud');
    
    console.log(`[PureOptimization] Solver status: ${solution.status}, objective: ${solution.objectiveValue.toFixed(4)}`);
    
    if (solution.status === 'infeasible') {
      return {
        success: false,
        proposals: [],
        repLoads: [],
        metrics: this.emptyMetrics(solution.solveTimeMs),
        solverStatus: 'infeasible',
        objectiveValue: 0,
        warnings: ['Problem is infeasible - check capacity constraints'],
        error: 'No feasible assignment exists with current constraints'
      };
    }
    
    if (solution.status === 'error') {
      // Check if this was a memory-related error
      const isMemoryError = solution.error?.includes('memory') ||
                            solution.error?.includes('Aborted') ||
                            solution.error?.includes('RuntimeError');

      return {
        success: false,
        proposals: [],
        repLoads: [],
        metrics: this.emptyMetrics(solution.solveTimeMs),
        solverStatus: 'error',
        objectiveValue: 0,
        warnings: isMemoryError
          ? ['Problem may be too large for the primary optimizer. Fallback solver was attempted.']
          : [],
        error: isMemoryError
          ? 'Optimization exceeded memory limits. Try reducing the number of accounts or splitting into batches.'
          : (solution.error || 'Solver error')
      };
    }
    
    // Phase 5: Extract assignments and build proposals
    await this.reportProgress({
      stage: 'postprocessing',
      status: 'Extracting assignments...',
      progress: 70
    });
    
    const assignmentMap = extractAssignments(solution);
    const proposals = this.buildProposals(
      unlockedAccounts,
      lockedAccounts,
      data.regularReps,
      assignmentMap,
      accountScores,
      weights,
      data.lpConfig.lp_stability_config,
      data.lpConfig.priority_config
    );
    
    // Add strategic pre-assignments
    const allProposals = [...strategicResult.fixedAssignments, ...proposals];
    
    // Phase 6: Cascade to children
    await this.reportProgress({
      stage: 'postprocessing',
      status: 'Cascading to child accounts...',
      progress: 80
    });
    
    const finalProposals = data.lpConfig.lp_constraints.parent_child_linking_enabled
      ? cascadeToChildren(allProposals, data.accounts, data.lpConfig.priority_config)
      : allProposals;
    
    // Phase 7: Calculate metrics
    await this.reportProgress({
      stage: 'postprocessing',
      status: 'Calculating metrics...',
      progress: 90
    });
    
    const originalOwners = new Map(accounts.map(a => [a.sfdc_account_id, a.owner_id || '']));
    const repLoads = calculateRepLoads(finalProposals, data.accounts, data.regularReps, data.targetArr);
    const metrics = calculateMetrics(
      finalProposals,
      data.accounts,
      data.regularReps,
      repLoads,
      originalOwners,
      solution.solveTimeMs
    );
    
    // Phase 8: Complete
    await this.reportProgress({
      stage: 'complete',
      status: `Assigned ${finalProposals.length} accounts`,
      progress: 100
    });
    
    // Check for warnings
    if (solution.status === 'timeout') {
      warnings.push('Solver hit time limit - solution may not be optimal');
    }
    
    const feasSlack = solution.slackValues;
    let totalSlack = 0;
    for (const [name, value] of feasSlack) {
      if (name.startsWith('feas_') && value > 0) {
        totalSlack += value;
      }
    }
    if (totalSlack > 0) {
      warnings.push(`Capacity exceeded by $${(totalSlack / 1000000).toFixed(2)}M total`);
    }
    
    const result: LPSolveResult = {
      success: true,
      proposals: finalProposals,
      repLoads,
      metrics,
      solverStatus: solution.status === 'timeout' ? 'feasible' : solution.status,
      objectiveValue: solution.objectiveValue,
      warnings
    };
    
    // Record telemetry (fire-and-forget)
    // @see MASTER_LOGIC.mdc §14 - Optimization Telemetry
    recordLPOptimizationRun({
      buildId: this.buildId,
      assignmentType,
      config: data.lpConfig,
      weights,
      problem,
      result,
      solverType: solution.solverType,
      numLockedAccounts: lockedAccounts.length,
      numStrategicAccounts: strategicResult.strategicAccountCount
    }).catch(() => {}); // Swallow errors - telemetry is non-critical
    
    return result;
  }
  
  /**
   * Build proposals from solution
   */
  private buildProposals(
    unlockedAccounts: AggregatedAccount[],
    lockedAccounts: Array<{ account: AggregatedAccount; lock: StabilityLockResult }>,
    reps: EligibleRep[],
    assignmentMap: Map<string, string>,
    accountScores: Map<string, Map<string, AssignmentScores>>,
    weights: NormalizedWeights,
    stabilityConfig: any,
    priorityConfig?: import('@/config/priorityRegistry').PriorityConfig[]
  ): LPAssignmentProposal[] {
    const proposals: LPAssignmentProposal[] = [];
    const repMap = new Map(reps.map(r => [r.rep_id, r]));
    
    // Process unlocked accounts (from LP solution)
    for (const account of unlockedAccounts) {
      const repId = assignmentMap.get(account.sfdc_account_id);
      if (!repId) {
        console.warn(`[PureOptimization] No assignment for account ${account.account_name}`);
        continue;
      }
      
      const rep = repMap.get(repId);
      if (!rep) {
        console.warn(`[PureOptimization] Unknown rep ${repId} for account ${account.account_name}`);
        continue;
      }
      
      const scores = accountScores.get(account.sfdc_account_id)?.get(repId) || {
        continuity: 0,
        geography: 0,
        teamAlignment: null,  // N/A if not found
        tieBreaker: 0
      };

      // Calculate total score with weight redistribution for N/A team alignment
      let totalScore: number;
      if (scores.teamAlignment === null) {
        // N/A: redistribute wT proportionally to wC and wG
        const totalCG = weights.wC + weights.wG;
        const adjustedWC = totalCG > 0 ? (weights.wC + weights.wT * (weights.wC / totalCG)) : weights.wC;
        const adjustedWG = totalCG > 0 ? (weights.wG + weights.wT * (weights.wG / totalCG)) : weights.wG;
        totalScore = adjustedWC * scores.continuity + adjustedWG * scores.geography;
      } else {
        totalScore = weights.wC * scores.continuity +
                     weights.wG * scores.geography +
                     weights.wT * scores.teamAlignment;
      }
      
      proposals.push({
        accountId: account.sfdc_account_id,
        accountName: account.account_name,
        repId: rep.rep_id,
        repName: rep.name,
        repRegion: rep.region,
        scores,
        totalScore,
        lockResult: null,
        rationale: generateRationale(account, rep, scores, weights, null, priorityConfig),
        isStrategicPreAssignment: false,
        childIds: account.child_ids
      });
    }
    
    // Process locked accounts
    for (const { account, lock } of lockedAccounts) {
      const rep = repMap.get(lock.targetRepId || '');
      if (!rep) {
        console.warn(`[PureOptimization] Locked account ${account.account_name} has invalid target rep`);
        continue;
      }
      
      const scores = accountScores.get(account.sfdc_account_id)?.get(rep.rep_id) || {
        continuity: 1.0, // Locked = full continuity
        geography: 0.5,
        teamAlignment: null,  // N/A for locked accounts without score data
        tieBreaker: 0
      };
      
      proposals.push({
        accountId: account.sfdc_account_id,
        accountName: account.account_name,
        repId: rep.rep_id,
        repName: rep.name,
        repRegion: rep.region,
        scores,
        totalScore: 1.0, // Locked accounts have max score
        lockResult: lock,
        rationale: generateRationale(account, rep, scores, weights, lock, priorityConfig),
        isStrategicPreAssignment: false,
        childIds: account.child_ids
      });
    }

    return proposals;
  }
  
  /**
   * Report progress to callback and yield to UI
   * Ensures browser can update animations and run timer callbacks
   */
  private async reportProgress(progress: LPProgress): Promise<void> {
    if (this.onProgress) {
      this.onProgress(progress);
    }
    // Yield to UI to allow animations and timers to run
    await yieldToUI();
  }
  
  /**
   * Create empty metrics object
   */
  private emptyMetrics(solveTimeMs: number): LPMetrics {
    return {
      arr_variance_percent: 0,
      atr_variance_percent: 0,
      pipeline_variance_percent: 0,
      max_overload_percent: 0,
      continuity_rate: 0,
      high_value_continuity_rate: 0,
      arr_stayed_percent: 0,
      exact_geo_match_rate: 0,
      sibling_geo_match_rate: 0,
      cross_region_rate: 0,
      exact_tier_match_rate: 0,
      one_level_mismatch_rate: 0,
      feasibility_slack_total: 0,
      reps_over_capacity: 0,
      solve_time_ms: solveTimeMs,
      total_accounts: 0,
      total_reps: 0
    };
  }
}

/**
 * Convenience function for one-shot optimization
 */
export async function runPureOptimization(
  buildId: string,
  assignmentType: 'customer' | 'prospect',
  onProgress?: LPProgressCallback
): Promise<LPSolveResult> {
  const engine = new PureOptimizationEngine(buildId, onProgress);
  return engine.run(assignmentType);
}

