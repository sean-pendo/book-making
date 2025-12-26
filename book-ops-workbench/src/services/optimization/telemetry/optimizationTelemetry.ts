/**
 * Optimization Telemetry Service
 * 
 * Records comprehensive telemetry for every optimization run.
 * Enables performance analysis, historical comparison, and AI-assisted tuning.
 * 
 * Fire-and-Forget Pattern: Recording is non-blocking. Failures are logged
 * but never prevent assignment generation from completing.
 * 
 * @see MASTER_LOGIC.mdc §14 - Optimization Telemetry
 */

import { supabase } from '@/integrations/supabase/client';
import { OPTIMIZATION_MODEL_VERSION, BALANCE_INTENSITY_PRESETS, getBalancePenaltyMultiplier, BalanceIntensity } from '@/_domain';
import type {
  LPSolveResult,
  LPConfiguration,
  LPProblem,
  OptimizationRunRecord,
  OptimizationWeightsSnapshot,
  OptimizationErrorCategory,
  NormalizedWeights
} from '../types';

/**
 * Input for recording an LP optimization run
 */
export interface LPTelemetryInput {
  buildId: string;
  configId?: string;
  assignmentType: 'customer' | 'prospect';
  config: LPConfiguration;
  weights: NormalizedWeights;
  problem?: LPProblem;
  result: LPSolveResult;
  solverType?: 'highs-wasm' | 'cloud-run' | 'glpk';
  numLockedAccounts?: number;
  numStrategicAccounts?: number;
}

/**
 * Waterfall configuration snapshot for telemetry
 * Captures the key parameters that affect assignment outcomes
 */
export interface WaterfallConfigSnapshot {
  balance_intensity?: string;
  priority_config?: unknown[];
  lp_balance_config?: {
    arr_penalty?: number;
    atr_penalty?: number;
    pipeline_penalty?: number;
  };
  intensity_multiplier?: number;
}

/**
 * Input for recording a waterfall engine run
 */
export interface WaterfallTelemetryInput {
  buildId: string;
  configId?: string;
  assignmentType: 'customer' | 'prospect';
  numAccounts: number;
  numReps: number;
  numLockedAccounts?: number;
  numStrategicAccounts?: number;
  solveTimeMs: number;
  warnings?: string[];
  error?: string;
  // Configuration snapshot - captures what params were used
  config?: WaterfallConfigSnapshot;
  // Simplified metrics that waterfall can provide
  metrics?: {
    arr_variance_percent?: number;
    continuity_rate?: number;
    exact_geo_match_rate?: number;
  };
}

/**
 * Build weights snapshot from LP configuration
 */
function buildWeightsSnapshot(
  config: LPConfiguration,
  weights: NormalizedWeights,
  assignmentType: 'customer' | 'prospect'
): OptimizationWeightsSnapshot {
  const balanceConfig = config.lp_balance_config;
  const intensityMultiplier = balanceConfig.balance_intensity
    ? getIntensityMultiplier(balanceConfig.balance_intensity)
    : 1.0;

  return {
    objectives: {
      wC: weights.wC,
      wG: weights.wG,
      wT: weights.wT
    },
    balance: {
      arr_penalty: balanceConfig.arr_penalty,
      atr_penalty: balanceConfig.atr_penalty,
      pipeline_penalty: balanceConfig.pipeline_penalty
    },
    intensity_multiplier: intensityMultiplier
  };
}

/**
 * Get intensity multiplier from preset name
 * Uses getBalancePenaltyMultiplier from @/_domain for SSOT compliance
 * @see MASTER_LOGIC.mdc §11.3.1 Balance Intensity Configuration
 * @see _domain/constants.ts - BALANCE_INTENSITY_PRESETS
 */
function getIntensityMultiplier(intensity: string): number {
  // Validate it's a known intensity, else default to NORMAL (1.0)
  if (intensity in BALANCE_INTENSITY_PRESETS) {
    return getBalancePenaltyMultiplier(intensity as BalanceIntensity);
  }
  return 1.0;
}

/**
 * Map solver status to error category
 */
function mapErrorCategory(
  solverStatus: string,
  errorMessage?: string
): OptimizationErrorCategory | undefined {
  if (solverStatus === 'optimal' || solverStatus === 'feasible' || solverStatus === 'complete') {
    return undefined;
  }
  
  if (solverStatus === 'timeout') return 'solver_timeout';
  if (solverStatus === 'infeasible') return 'solver_infeasible';
  
  if (errorMessage) {
    const lower = errorMessage.toLowerCase();
    if (lower.includes('wasm') || lower.includes('memory')) return 'solver_crash';
    if (lower.includes('network') || lower.includes('cloud run') || lower.includes('fetch')) return 'network';
    if (lower.includes('validation') || lower.includes('invalid')) return 'data_validation';
  }
  
  return solverStatus === 'error' ? 'unknown' : undefined;
}

/**
 * Record telemetry for an LP optimization run
 * 
 * Fire-and-forget: This function does not throw. Errors are logged only.
 */
export async function recordLPOptimizationRun(input: LPTelemetryInput): Promise<void> {
  try {
    const { buildId, configId, assignmentType, config, weights, problem, result, solverType, numLockedAccounts, numStrategicAccounts } = input;
    
    const weightsSnapshot = buildWeightsSnapshot(config, weights, assignmentType);
    
    const record: Omit<OptimizationRunRecord, 'id' | 'created_at' | 'created_by'> & { created_by?: string } = {
      build_id: buildId,
      config_id: configId,
      assignment_type: assignmentType,
      engine_type: 'relaxed_optimization',
      model_version: OPTIMIZATION_MODEL_VERSION,
      
      // Config snapshot
      weights_snapshot: weightsSnapshot,
      balance_intensity: config.lp_balance_config.balance_intensity,
      priority_config_snapshot: config.priority_config,
      
      // Problem size
      num_accounts: result.metrics.total_accounts || result.proposals.length,
      num_reps: result.metrics.total_reps || result.repLoads.length,
      num_locked_accounts: numLockedAccounts,
      num_strategic_accounts: numStrategicAccounts,
      num_variables: problem?.numVariables,
      num_constraints: problem?.numConstraints,
      lp_size_kb: problem ? estimateLPSizeKB(problem) : undefined,
      
      // Solver performance
      solver_type: solverType,
      solver_status: result.solverStatus,
      solve_time_ms: result.metrics.solve_time_ms,
      objective_value: result.objectiveValue,
      
      // Success metrics
      arr_variance_percent: result.metrics.arr_variance_percent,
      atr_variance_percent: result.metrics.atr_variance_percent,
      pipeline_variance_percent: result.metrics.pipeline_variance_percent,
      max_overload_percent: result.metrics.max_overload_percent,
      continuity_rate: result.metrics.continuity_rate,
      high_value_continuity_rate: result.metrics.high_value_continuity_rate,
      arr_stayed_percent: result.metrics.arr_stayed_percent,
      exact_geo_match_rate: result.metrics.exact_geo_match_rate,
      sibling_geo_match_rate: result.metrics.sibling_geo_match_rate,
      cross_region_rate: result.metrics.cross_region_rate,
      exact_tier_match_rate: result.metrics.exact_tier_match_rate,
      one_level_mismatch_rate: result.metrics.one_level_mismatch_rate,
      feasibility_slack_total: result.metrics.feasibility_slack_total,
      reps_over_capacity: result.metrics.reps_over_capacity,
      
      // Error handling
      warnings: result.warnings.length > 0 ? result.warnings : undefined,
      error_message: result.error,
      error_category: mapErrorCategory(result.solverStatus, result.error)
    };
    
    // Get current user (may be null in some contexts)
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      record.created_by = user.id;
    }
    
    const { error } = await supabase
      .from('optimization_runs')
      .insert(record as any);
    
    if (error) {
      console.warn('[Telemetry] Failed to record LP optimization run:', error.message);
    } else {
      console.log('[Telemetry] Recorded LP optimization run:', {
        engine: 'relaxed_optimization',
        accounts: record.num_accounts,
        status: record.solver_status,
        solveMs: record.solve_time_ms
      });
    }
  } catch (err: any) {
    // Fire-and-forget: never throw, just log
    console.warn('[Telemetry] Error recording LP optimization run:', err.message);
  }
}

/**
 * Record telemetry for a waterfall engine run
 * 
 * Fire-and-forget: This function does not throw. Errors are logged only.
 */
export async function recordWaterfallRun(input: WaterfallTelemetryInput): Promise<void> {
  try {
    const { buildId, configId, assignmentType, numAccounts, numReps, numLockedAccounts, numStrategicAccounts, solveTimeMs, warnings, error, config, metrics } = input;
    
    // Build weights snapshot from config if provided
    // Waterfall uses priority cascade + LP_PENALTY constants, not continuous weights
    const intensityMultiplier = config?.intensity_multiplier ?? 
      (config?.balance_intensity ? getIntensityMultiplier(config.balance_intensity) : 1.0);
    
    const weightsSnapshot: OptimizationWeightsSnapshot = {
      objectives: { wC: 0, wG: 0, wT: 0 },  // Waterfall uses priority cascade, not objective weights
      balance: {
        arr_penalty: config?.lp_balance_config?.arr_penalty ?? 0,
        atr_penalty: config?.lp_balance_config?.atr_penalty ?? 0,
        pipeline_penalty: config?.lp_balance_config?.pipeline_penalty ?? 0
      },
      intensity_multiplier: intensityMultiplier
    };
    
    const record: Omit<OptimizationRunRecord, 'id' | 'created_at' | 'created_by'> & { created_by?: string } = {
      build_id: buildId,
      config_id: configId,
      assignment_type: assignmentType,
      engine_type: 'waterfall',
      model_version: OPTIMIZATION_MODEL_VERSION,
      
      // Config snapshot - now properly captured from input
      weights_snapshot: weightsSnapshot,
      balance_intensity: config?.balance_intensity,
      priority_config_snapshot: config?.priority_config,
      
      // Problem size
      num_accounts: numAccounts,
      num_reps: numReps,
      num_locked_accounts: numLockedAccounts,
      num_strategic_accounts: numStrategicAccounts,
      // LP-specific fields are null for waterfall
      num_variables: undefined,
      num_constraints: undefined,
      lp_size_kb: undefined,
      
      // Solver performance
      solver_type: undefined,  // Waterfall doesn't use external solver
      solver_status: error ? 'error' : 'complete',
      solve_time_ms: solveTimeMs,
      objective_value: undefined,
      
      // Success metrics (simplified for waterfall)
      arr_variance_percent: metrics?.arr_variance_percent,
      continuity_rate: metrics?.continuity_rate,
      exact_geo_match_rate: metrics?.exact_geo_match_rate,
      // Other metrics undefined for waterfall
      
      // Error handling
      warnings: warnings && warnings.length > 0 ? warnings : undefined,
      error_message: error,
      error_category: error ? 'unknown' : undefined
    };
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      record.created_by = user.id;
    }
    
    const { error: insertError } = await supabase
      .from('optimization_runs')
      .insert(record as any);
    
    if (insertError) {
      console.warn('[Telemetry] Failed to record waterfall run:', insertError.message);
    } else {
      console.log('[Telemetry] Recorded waterfall run:', {
        engine: 'waterfall',
        accounts: numAccounts,
        status: record.solver_status,
        solveMs: solveTimeMs
      });
    }
  } catch (err: any) {
    // Fire-and-forget: never throw, just log
    console.warn('[Telemetry] Error recording waterfall run:', err.message);
  }
}

/**
 * Estimate LP problem size in KB
 * Rough estimate based on variable and constraint counts
 */
function estimateLPSizeKB(problem: LPProblem): number {
  // Estimate: ~100 bytes per variable, ~200 bytes per constraint
  const varBytes = problem.numVariables * 100;
  const constraintBytes = problem.numConstraints * 200;
  return (varBytes + constraintBytes) / 1024;
}


