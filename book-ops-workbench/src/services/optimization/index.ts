/**
 * Pure Optimization LP Engine - Public API
 * 
 * Exports the main engine class and all types needed for integration.
 * 
 * Usage:
 * ```typescript
 * import { 
 *   PureOptimizationEngine,
 *   runPureOptimization,
 *   type LPConfiguration,
 *   type LPSolveResult
 * } from '@/services/optimization';
 * 
 * // Run optimization
 * const result = await runPureOptimization(buildId, 'customer', (progress) => {
 *   console.log(progress.status);
 * });
 * ```
 */

// Types
export * from './types';

// Main Engine
export { PureOptimizationEngine, runPureOptimization } from './pureOptimizationEngine';

// Scoring functions
export { continuityScore, explainContinuityScore } from './scoring/continuityScore';
export { geographyScore, getParentRegion, getMappedRegion, areSiblingRegions, explainGeographyScore } from './scoring/geographyScore';
export { teamAlignmentScore, classifyAccountTier, getTierIndex, explainTeamAlignmentScore } from './scoring/teamAlignmentScore';

// Utilities
export { normalizeWeights, adjustLinkedWeights, areWeightsNormalized, formatWeights } from './utils/weightNormalizer';

// Preprocessing
export { loadBuildData, getAccountARR } from './preprocessing/dataLoader';
export { cascadeToChildren } from './preprocessing/parentChildAggregator';
export { assignStrategicPool } from './preprocessing/strategicPoolHandler';

// Constraints
export { checkStabilityLock, identifyLockedAccounts } from './constraints/stabilityLocks';
export { buildLPProblem } from './constraints/lpProblemBuilder';

// Solver
export { solveProblem, extractAssignments } from './solver/highsWrapper';

// Post-processing
export { generateRationale, generateScoreBreakdown } from './postprocessing/rationaleGenerator';
export { calculateRepLoads, calculateMetrics, formatMetricsSummary } from './postprocessing/metricsCalculator';
