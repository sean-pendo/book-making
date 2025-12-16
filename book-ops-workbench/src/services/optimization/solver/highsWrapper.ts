/**
 * LP Solver Wrapper using HiGHS
 *
 * Uses HiGHS WebAssembly for LP/MIP optimization.
 * Falls back to GLPK.js if HiGHS fails to load.
 * Falls back to Cloud Run native HiGHS for large problems (>3000 accounts).
 *
 * Handles:
 * - Lazy loading of solver module
 * - Problem conversion to LP format
 * - Solution extraction
 * - Cloud Run fallback for large-scale problems
 */

import type { LPProblem, LPSolverParams } from '../types';
import { LP_SCALE_LIMITS } from '@/_domain';

// Size limits for WASM safety
const HIGHS_MAX_VARIABLES = 30000;  // ~30K binary vars is safe limit
const HIGHS_MAX_LP_STRING_BYTES = 5_000_000;  // 5MB LP string limit

// Cloud Run solver configuration
// Native HiGHS can handle millions of variables - no practical limit
const CLOUD_RUN_SOLVER_URL = 'https://highs-solver-710441294184.us-central1.run.app';
const CLOUD_RUN_TIMEOUT_MS = 300000; // 5 minutes

// Feature flag: Use Cloud Run for large problems
// Cloud Run uses native HiGHS binary which can handle much larger problems than WASM
const USE_CLOUD_RUN_FOR_LARGE = true;

// Feature flag: Always use Cloud Run (bypass WASM/GLPK entirely)
// Set to true to route ALL problems to Cloud Run native solver
const ALWAYS_USE_CLOUD_RUN = true;

// Solver instances (lazy loaded)
let highsInstance: any = null;
let highsLoadPromise: Promise<any> | null = null;
let usingGLPK = false;

// Direct GLPK loader (independent of HiGHS - needed for forced fallback)
let glpkInstance: any = null;
let glpkLoadPromise: Promise<any> | null = null;

/**
 * Solve LP using Cloud Run native HiGHS service
 * 
 * This is used for large problems that exceed browser WASM limits.
 * The Cloud Run service runs native HiGHS which can handle millions of variables.
 */
async function solveWithCloudRun(
  lpString: string,
  varMapping: Map<string, { accountId: string; repId: string }>
): Promise<SolverSolution> {
  const startTime = Date.now();
  
  console.log(`[CloudRun] Sending LP to native solver (${Math.round(lpString.length / 1024)}KB)...`);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CLOUD_RUN_TIMEOUT_MS);
    
    const response = await fetch(`${CLOUD_RUN_SOLVER_URL}/solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: lpString,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Cloud Run solver error: ${errorData.error || response.statusText}`);
    }
    
    const result = await response.json();
    const solveTimeMs = Date.now() - startTime;
    
    console.log(`[CloudRun] Response:`, {
      status: result.status,
      objectiveValue: result.objectiveValue,
      variableCount: Object.keys(result.columns || {}).length,
      cloudSolveTime: result.solveTimeMs,
      totalTime: solveTimeMs
    });
    
    // Map status
    let status: SolverSolution['status'];
    switch (result.status) {
      case 'Optimal':
        status = 'optimal';
        break;
      case 'Infeasible':
        status = 'infeasible';
        break;
      case 'Time limit':
        status = 'timeout';
        break;
      default:
        // Treat other statuses as feasible if we have a solution
        status = Object.keys(result.columns || {}).length > 0 ? 'feasible' : 'error';
    }
    
    // Extract assignments from variable values
    const assignments = new Map<string, Map<string, number>>();
    const slackValues = new Map<string, number>();
    
    for (const [varName, colData] of Object.entries(result.columns || {})) {
      const value = (colData as any).Primal;
      
      // Check if this is an assignment variable
      const mapping = varMapping.get(varName);
      if (mapping) {
        const { accountId, repId } = mapping;
        if (!assignments.has(accountId)) {
          assignments.set(accountId, new Map());
        }
        assignments.get(accountId)!.set(repId, value);
      } else if (!varName.startsWith('x')) {
        // Slack variable
        slackValues.set(varName, value);
      }
    }
    
    return {
      status,
      objectiveValue: result.objectiveValue || 0,
      assignments,
      slackValues,
      solveTimeMs
    };
    
  } catch (error: any) {
    console.error('[CloudRun] Error:', error);
    
    // Check for timeout
    if (error.name === 'AbortError') {
      return {
        status: 'timeout',
        objectiveValue: 0,
        assignments: new Map(),
        slackValues: new Map(),
        solveTimeMs: Date.now() - startTime,
        error: 'Cloud Run solver timed out'
      };
    }
    
    throw error;
  }
}

/**
 * Load GLPK directly (independent of HiGHS)
 * Used for forced fallback when problem is too large for WASM
 */
async function loadGLPK(): Promise<any> {
  if (glpkInstance) return glpkInstance;
  if (!glpkLoadPromise) {
    glpkLoadPromise = (async () => {
      console.log('[GLPK] Loading GLPK.js...');
      const GLPK = await import('glpk.js');
      glpkInstance = await GLPK.default();
      console.log('[GLPK] GLPK loaded successfully');
      return glpkInstance;
    })();
  }
  return glpkLoadPromise;
}

/**
 * Reset HiGHS instance after critical error
 * This forces a fresh WASM module load on next solve
 */
function resetHiGHSInstance(): void {
  console.log('[HiGHS] Resetting HiGHS instance due to critical error');
  highsInstance = null;
  highsLoadPromise = null;
  usingGLPK = false;
}

/**
 * Track consecutive HiGHS failures to decide when to stop retrying
 */
let consecutiveHiGHSFailures = 0;
const MAX_HIGHS_FAILURES = 2;

// Edge function solver removed - Cloud Run is now used for large problems

// Type definition for HiGHS solution
interface HighsSolution {
  Status: 'Optimal' | 'Infeasible' | 'Unbounded' | 'Error' | string;
  ObjectiveValue: number;
  Columns: Record<string, {
    Index: number;
    Status: string;
    Lower: number;
    Upper: number;
    Type: string;
    Primal: number;
    Dual: number;
    Name: string;
  }>;
}

/**
 * Sanitize variable names for LP format
 * LP format requires alphanumeric + underscore, must start with letter
 */
function sanitizeVarName(name: string): string {
  let sanitized = name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 25);
  if (/^[0-9]/.test(sanitized)) {
    sanitized = 'v' + sanitized.substring(0, 24);
  }
  // Ensure non-empty
  if (!sanitized || sanitized.length === 0) {
    sanitized = 'var_unnamed';
  }
  return sanitized;
}

/**
 * Validate coefficient is a finite number
 */
function validateCoefficient(value: number, context: string): number {
  if (!Number.isFinite(value)) {
    console.warn(`[HiGHS] Invalid coefficient (${value}) in ${context}, using 0`);
    return 0;
  }
  // Clamp extremely large values that might cause numerical issues
  if (Math.abs(value) > 1e15) {
    console.warn(`[HiGHS] Very large coefficient (${value}) in ${context}, clamping`);
    return value > 0 ? 1e15 : -1e15;
  }
  return value;
}

/**
 * Get or load HiGHS instance
 *
 * HiGHS requires its WASM file to be served from a known location.
 * We configure it to use the locateFile callback to point to /highs.wasm
 * which is served from the public folder.
 */
async function getHiGHS(): Promise<any> {
  if (highsInstance) return highsInstance;

  if (!highsLoadPromise) {
    highsLoadPromise = (async () => {
      try {
        console.log('[HiGHS] Loading HiGHS WebAssembly...');
        const highsModule = await import('highs');

        // Try different import patterns
        let highsLoader: any = null;
        const mod = highsModule as any;

        if (typeof mod.default === 'function') {
          highsLoader = mod.default;
        } else if (typeof mod === 'function') {
          highsLoader = mod;
        } else if (mod.default && typeof mod.default.default === 'function') {
          highsLoader = mod.default.default;
        } else if (typeof mod.highs === 'function') {
          highsLoader = mod.highs;
        } else if (mod.default && typeof mod.default.solve === 'function') {
          // Already initialized
          highsInstance = mod.default;
          console.log('[HiGHS] HiGHS already initialized');
          return highsInstance;
        }

        if (!highsLoader) {
          throw new Error('Could not find HiGHS loader function');
        }

        // Initialize HiGHS with custom WASM location
        // The locateFile callback tells Emscripten where to find the WASM file
        highsInstance = await highsLoader({
          locateFile: (path: string) => {
            if (path.endsWith('.wasm')) {
              // Serve from public folder - works in both dev and production
              return '/highs.wasm';
            }
            return path;
          }
        });
        console.log('[HiGHS] HiGHS loaded successfully');
        return highsInstance;

      } catch (error: any) {
        console.error('[HiGHS] Failed to load HiGHS, falling back to GLPK:', error.message);
        highsLoadPromise = null;

        // Try GLPK fallback
        try {
          const GLPK = await import('glpk.js');
          highsInstance = await GLPK.default();
          usingGLPK = true;
          console.log('[HiGHS] GLPK fallback loaded');
          return highsInstance;
        } catch (glpkError) {
          console.error('[HiGHS] GLPK fallback also failed:', glpkError);
          throw error;
        }
      }
    })();
  }

  return highsLoadPromise;
}

export interface SolverSolution {
  status: 'optimal' | 'feasible' | 'infeasible' | 'timeout' | 'error';
  objectiveValue: number;
  assignments: Map<string, Map<string, number>>;
  slackValues: Map<string, number>;
  solveTimeMs: number;
  error?: string;
}

/**
 * Generate a compact, unique variable name for an assignment
 * Uses numeric indices to avoid LP format line length issues
 */
function getAssignmentVarName(accountIdx: number, repIdx: number): string {
  return `x${accountIdx}_${repIdx}`;
}

/**
 * Convert LPProblem to LP format string for HiGHS
 * Uses compact variable naming to avoid line length issues
 */
function problemToLPFormat(problem: LPProblem): {
  lpString: string;
  varMapping: Map<string, { accountId: string; repId: string }>;
} {
  const varMapping = new Map<string, { accountId: string; repId: string }>();
  const lines: string[] = [];
  let invalidCoefCount = 0;

  // Create index mappings for compact variable names
  const accountIdxMap = new Map<string, number>();
  const repIdxMap = new Map<string, number>();
  let accountIdx = 0;
  let repIdx = 0;

  // Build index maps
  for (const assignVar of problem.assignmentVars) {
    if (!accountIdxMap.has(assignVar.accountId)) {
      accountIdxMap.set(assignVar.accountId, accountIdx++);
    }
    if (!repIdxMap.has(assignVar.repId)) {
      repIdxMap.set(assignVar.repId, repIdx++);
    }
  }

  // Objective function
  lines.push('Maximize');
  lines.push(' obj:');

  // Build variable name mapping and objective terms
  // Break into multiple lines (LP format allows continuation)
  let currentLine = '';
  const MAX_LINE_LENGTH = 200;

  for (const assignVar of problem.assignmentVars) {
    const aIdx = accountIdxMap.get(assignVar.accountId)!;
    const rIdx = repIdxMap.get(assignVar.repId)!;
    const compactName = getAssignmentVarName(aIdx, rIdx);

    varMapping.set(compactName, { accountId: assignVar.accountId, repId: assignVar.repId });

    const originalKey = `x_${assignVar.accountId}_${assignVar.repId}`;
    let coef = problem.objectiveCoefficients.get(originalKey) || 0;
    coef = validateCoefficient(coef, `obj:${compactName}`);

    if (Math.abs(coef) > 1e-10) {
      const term = `${coef >= 0 ? '+' : '-'} ${Math.abs(coef).toFixed(6)} ${compactName}`;
      if (currentLine.length + term.length > MAX_LINE_LENGTH) {
        lines.push(' ' + currentLine);
        currentLine = term;
      } else {
        currentLine += ' ' + term;
      }
    }
  }

  // Add slack variable objectives (use compact names)
  let slackIdx = 0;
  const slackNameMap = new Map<string, string>(); // original name -> compact name

  for (const slack of problem.balanceSlacks) {
    const overCompact = `so${slackIdx}`;
    const underCompact = `su${slackIdx}`;
    slackNameMap.set(slack.overVar, overCompact);
    slackNameMap.set(slack.underVar, underCompact);
    slackIdx++;

    let overCoef = problem.objectiveCoefficients.get(slack.overVar) || 0;
    let underCoef = problem.objectiveCoefficients.get(slack.underVar) || 0;
    overCoef = validateCoefficient(overCoef, `slack:${overCompact}`);
    underCoef = validateCoefficient(underCoef, `slack:${underCompact}`);

    if (Math.abs(overCoef) > 1e-10) {
      const term = `${overCoef >= 0 ? '+' : '-'} ${Math.abs(overCoef).toFixed(6)} ${overCompact}`;
      if (currentLine.length + term.length > MAX_LINE_LENGTH) {
        lines.push(' ' + currentLine);
        currentLine = term;
      } else {
        currentLine += ' ' + term;
      }
    }
    if (Math.abs(underCoef) > 1e-10) {
      const term = `${underCoef >= 0 ? '+' : '-'} ${Math.abs(underCoef).toFixed(6)} ${underCompact}`;
      if (currentLine.length + term.length > MAX_LINE_LENGTH) {
        lines.push(' ' + currentLine);
        currentLine = term;
      } else {
        currentLine += ' ' + term;
      }
    }
  }

  for (const slack of problem.feasibilitySlacks) {
    const feasCompact = `sf${slackIdx}`;
    slackNameMap.set(slack.name, feasCompact);
    slackIdx++;

    let coef = problem.objectiveCoefficients.get(slack.name) || 0;
    coef = validateCoefficient(coef, `feas:${feasCompact}`);
    if (Math.abs(coef) > 1e-10) {
      const term = `${coef >= 0 ? '+' : '-'} ${Math.abs(coef).toFixed(6)} ${feasCompact}`;
      if (currentLine.length + term.length > MAX_LINE_LENGTH) {
        lines.push(' ' + currentLine);
        currentLine = term;
      } else {
        currentLine += ' ' + term;
      }
    }
  }

  // Add Big-M penalty slack objectives (beta and bigM slacks)
  // These are in slackBounds but not yet in the objective - CRITICAL FIX!
  let boundSlackIdx = slackIdx;
  if (problem.slackBounds) {
    for (const bound of problem.slackBounds) {
      if (!slackNameMap.has(bound.varName)) {
        const compactName = `sb${boundSlackIdx++}`;
        slackNameMap.set(bound.varName, compactName);

        // Add to objective if it has a coefficient
        let coef = problem.objectiveCoefficients.get(bound.varName) || 0;
        coef = validateCoefficient(coef, `bound:${compactName}`);
        if (Math.abs(coef) > 1e-10) {
          const term = `${coef >= 0 ? '+' : '-'} ${Math.abs(coef).toFixed(6)} ${compactName}`;
          if (currentLine.length + term.length > MAX_LINE_LENGTH) {
            lines.push(' ' + currentLine);
            currentLine = term;
          } else {
            currentLine += ' ' + term;
          }
        }
      }
    }
  }

  // Flush remaining objective terms
  // Track if we need a dummy variable (empty objective is invalid LP format)
  let needsDummyVar = false;
  if (currentLine.trim()) {
    lines.push(' ' + currentLine);
  } else {
    // LP format requires at least one term - use first assignment variable with 0 coefficient
    if (problem.assignmentVars.length > 0) {
      const firstVar = problem.assignmentVars[0];
      const aIdx = accountIdxMap.get(firstVar.accountId)!;
      const rIdx = repIdxMap.get(firstVar.repId)!;
      lines.push(` + 0 ${getAssignmentVarName(aIdx, rIdx)}`);
    } else {
      // Fallback: use a dummy variable that we'll declare in Bounds
      lines.push(' + 0 _dummy_');
      needsDummyVar = true;
    }
  }

  // Helper to get compact name for any variable
  const getCompactName = (originalName: string): string => {
    // Check if it's an assignment variable (x_ACCOUNT_REP)
    if (originalName.startsWith('x_')) {
      const parts = originalName.substring(2).split('_');
      if (parts.length >= 2) {
        const accountId = parts[0];
        const repId = parts.slice(1).join('_');
        const aIdx = accountIdxMap.get(accountId);
        const rIdx = repIdxMap.get(repId);
        if (aIdx !== undefined && rIdx !== undefined) {
          return getAssignmentVarName(aIdx, rIdx);
        }
      }
    }
    // Check if it's a slack variable
    const compactSlack = slackNameMap.get(originalName);
    if (compactSlack) return compactSlack;
    // Fallback: use sanitized name
    return sanitizeVarName(originalName);
  };

  // Constraints
  lines.push('Subject To');
  let constraintCount = 0;
  for (const constraint of problem.constraints) {
    // Validate RHS
    const rhs = validateCoefficient(constraint.rhs, `constraint:${constraint.name}:rhs`);

    // Build constraint line with line breaks for long constraints
    let constraintLine = ` c${constraintCount++}:`;
    let lineLength = constraintLine.length;

    for (const v of constraint.variables) {
      let coef = v.coefficient;
      if (!Number.isFinite(coef)) {
        invalidCoefCount++;
        coef = 0;
      }
      if (Math.abs(coef) < 1e-10) continue;

      const compactName = getCompactName(v.name);
      const term = ` ${coef >= 0 ? '+' : '-'} ${Math.abs(coef).toFixed(6)} ${compactName}`;

      if (lineLength + term.length > MAX_LINE_LENGTH) {
        lines.push(constraintLine);
        constraintLine = ' ' + term;
        lineLength = constraintLine.length;
      } else {
        constraintLine += term;
        lineLength += term.length;
      }
    }

    // Skip empty constraints
    if (constraintLine.trim() === `c${constraintCount - 1}:`) {
      constraintCount--; // Undo increment
      continue;
    }

    const op = constraint.type === 'eq' ? '=' : constraint.type === 'le' ? '<=' : '>=';
    constraintLine += ` ${op} ${rhs.toFixed(6)}`;
    lines.push(constraintLine);
  }

  if (invalidCoefCount > 0) {
    console.warn(`[HiGHS] Found ${invalidCoefCount} invalid coefficients (NaN/Infinity)`);
  }

  // Bounds
  lines.push('Bounds');

  // Add dummy variable bound if needed (rare edge case)
  if (needsDummyVar) {
    lines.push(' _dummy_ >= 0');
  }

  // Use slackBounds which includes all Big-M penalty slacks
  if (problem.slackBounds && problem.slackBounds.length > 0) {
    for (const bound of problem.slackBounds) {
      const compactName = slackNameMap.get(bound.varName) || sanitizeVarName(bound.varName);
      if (bound.upper !== null) {
        lines.push(` ${bound.lower} <= ${compactName} <= ${bound.upper}`);
      } else {
        lines.push(` ${compactName} >= ${bound.lower}`);
      }
    }
  }

  // Feasibility slacks (already in slackNameMap)
  for (const slack of problem.feasibilitySlacks) {
    const compactName = slackNameMap.get(slack.name) || sanitizeVarName(slack.name);
    lines.push(` ${compactName} >= 0`);
  }

  // Binary variables
  lines.push('Binary');
  for (const assignVar of problem.assignmentVars) {
    const aIdx = accountIdxMap.get(assignVar.accountId)!;
    const rIdx = repIdxMap.get(assignVar.repId)!;
    lines.push(` ${getAssignmentVarName(aIdx, rIdx)}`);
  }

  lines.push('End');

  console.log(`[HiGHS] LP format generated: ${lines.length} lines, ${accountIdx} accounts, ${repIdx} reps`);

  return { lpString: lines.join('\n'), varMapping };
}

// Store reverse mapping for solution extraction
let lastVarMapping: Map<string, { accountId: string; repId: string }> = new Map();

/**
 * Solve using HiGHS
 * @param precomputedLp - Optional pre-computed LP string and varMapping to avoid regeneration
 */
async function solveWithHiGHS(
  problem: LPProblem,
  params: LPSolverParams,
  precomputedLp?: { lpString: string; varMapping: Map<string, { accountId: string; repId: string }> }
): Promise<SolverSolution> {
  const startTime = Date.now();

  try {
    const highs = await getHiGHS();

    // Convert problem to LP format (use precomputed if available)
    const { lpString, varMapping } = precomputedLp || problemToLPFormat(problem);
    lastVarMapping = varMapping;

    // Layer 3: Check LP string size before solving
    const lpSizeBytes = lpString.length;
    const lpSizeKB = Math.round(lpSizeBytes / 1024);
    const lpLines = lpString.split('\n');

    console.log(`[HiGHS] LP format: ${lpSizeKB}KB, ${lpLines.length} lines, ${problem.numVariables} vars`);

    // Estimate memory requirement (LP string × 3 for parsing + workspace)
    const estimatedMB = (lpSizeBytes * 3 + problem.numVariables * 100) / 1e6;
    console.log(`[HiGHS] Estimated memory: ${estimatedMB.toFixed(1)}MB`);

    // If LP string is too large, fall back to GLPK before crashing
    if (lpSizeBytes > HIGHS_MAX_LP_STRING_BYTES) {
      console.warn(`[HiGHS] LP string too large (${(lpSizeBytes / 1e6).toFixed(1)}MB > ${HIGHS_MAX_LP_STRING_BYTES / 1e6}MB), using GLPK`);
      return solveWithGLPK(problem, params);
    }

    console.log(`[HiGHS] Solving problem (${problem.numVariables} vars, ${problem.numConstraints} constraints)...`);

    // Debug: Log first/last few lines of LP to verify format
    console.log(`[HiGHS] LP format preview:`);
    console.log(lpLines.slice(0, 5).join('\n'));
    console.log('...');
    console.log(lpLines.slice(-5).join('\n'));

    // Additional diagnostic: check for NaN/Infinity in objective coefficients
    let nanCount = 0;
    let infCount = 0;
    for (const [, val] of problem.objectiveCoefficients) {
      if (Number.isNaN(val)) nanCount++;
      if (!Number.isFinite(val)) infCount++;
    }
    if (nanCount > 0 || infCount > 0) {
      console.error(`[HiGHS] Invalid coefficients detected: ${nanCount} NaN, ${infCount} Infinity`);
    }

    // Validate LP format before solving
    const hasObjective = lpString.includes('Maximize') || lpString.includes('Minimize');
    const hasSubjectTo = lpString.includes('Subject To');
    const hasBinary = lpString.includes('Binary');
    const hasEnd = lpString.includes('End');

    if (!hasObjective || !hasSubjectTo || !hasEnd) {
      console.error(`[HiGHS] Invalid LP format: objective=${hasObjective}, subjectTo=${hasSubjectTo}, end=${hasEnd}`);
      throw new Error('Invalid LP format generated');
    }

    console.log(`[HiGHS] LP format validation: objective=${hasObjective}, subjectTo=${hasSubjectTo}, binary=${hasBinary}, end=${hasEnd}`);

    // DIAGNOSTIC LOGGING: Coefficient range analysis
    // This helps identify if normalization is working correctly
    // Expected: range < 10^4 (normalized), Problem: range > 10^6 (not normalized)
    const coefficients = Array.from(problem.objectiveCoefficients.values()).filter(c => c !== 0);
    const positiveCoeffs = coefficients.filter(c => c > 0);
    const negativeCoeffs = coefficients.filter(c => c < 0);
    const coeffMin = coefficients.length > 0 ? Math.min(...coefficients) : 0;
    const coeffMax = coefficients.length > 0 ? Math.max(...coefficients) : 0;
    const positiveRange = positiveCoeffs.length > 1 
      ? Math.max(...positiveCoeffs) / Math.min(...positiveCoeffs) 
      : 1;
    
    console.log('[HiGHS] Coefficient diagnostics:', {
      total: coefficients.length,
      positive: positiveCoeffs.length,
      negative: negativeCoeffs.length,
      min: coeffMin.toExponential(3),
      max: coeffMax.toExponential(3),
      positiveRange: positiveRange.toExponential(2),
      rangeOK: positiveRange < 1e4 ? '✓ Good' : '⚠️ Too wide'
    });

    // DIAGNOSTIC LOGGING: Constraint matrix density
    // Dense matrices (many non-zeros) can cause performance issues
    const numNonZeros = problem.constraints.reduce((sum, c) => sum + c.variables.length, 0);
    const matrixDensity = (numNonZeros / (problem.numConstraints * problem.numVariables)) * 100;
    
    console.log('[HiGHS] Matrix diagnostics:', {
      constraints: problem.numConstraints,
      variables: problem.numVariables,
      nonZeros: numNonZeros,
      density: `${matrixDensity.toFixed(2)}%`,
      avgTermsPerConstraint: (numNonZeros / problem.numConstraints).toFixed(1)
    });

    // Solve with HiGHS
    // CRITICAL FIX (December 2025): Complex LPs with many slacks REQUIRE mip_rel_gap option!
    // Testing revealed deterministic pattern:
    //   - NO options → CRASH on complex LPs (1728 slacks)
    //   - presolve only → CRASH
    //   - time_limit only → CRASH  
    //   - mip_rel_gap only → WORKS!
    //   - ALL options → WORKS!
    // The mip_rel_gap option changes HiGHS's solving strategy to avoid the crash.
    // See solver-tests/test-presolve-only.html for proof.
    let solution: HighsSolution;
    console.log(`[HiGHS] Calling highs.solve() with mip_rel_gap...`);
    try {
      // MUST use mip_rel_gap for complex LPs with Big-M slacks!
      solution = highs.solve(lpString, {
        mip_rel_gap: 0.01,  // 1% gap - required for stability on complex LPs
      }) as HighsSolution;
    } catch (solveError: any) {
      console.error('[HiGHS] Solve failed:', solveError.message);
      throw solveError;
    }
    console.log(`[HiGHS] highs.solve() returned`);
    
    const solveTimeMs = Date.now() - startTime;
    console.log(`[HiGHS] Solve completed in ${solveTimeMs}ms, status: ${solution.Status}`);
    
    // Map status
    let status: SolverSolution['status'];
    if (solution.Status === 'Optimal') {
      status = 'optimal';
    } else if (solution.Status === 'Infeasible') {
      status = 'infeasible';
    } else if (solution.Status === 'Error') {
      status = 'error';
    } else {
      // Treat other statuses as feasible (partial solution)
      status = 'feasible';
    }
    
    // Extract solution
    const assignments = new Map<string, Map<string, number>>();
    const slackValues = new Map<string, number>();
    
    if (solution.Columns) {
      for (const [varName, col] of Object.entries(solution.Columns)) {
        const value = col.Primal;
        
        // Check if this is an assignment variable
        const mapping = varMapping.get(varName);
        if (mapping) {
          const { accountId, repId } = mapping;
          if (!assignments.has(accountId)) {
            assignments.set(accountId, new Map());
          }
          assignments.get(accountId)!.set(repId, value);
        } else if (!varName.startsWith('x_')) {
          // Slack variable
          slackValues.set(varName, value);
        }
      }
    }
    
    return {
      status,
      objectiveValue: solution.ObjectiveValue || 0,
      assignments,
      slackValues,
      solveTimeMs
    };
    
  } catch (error: any) {
    console.error('[HiGHS] Solve error:', error);

    // Check if this is a memory-related error that should trigger GLPK fallback
    const isMemoryError = error.message?.includes('memory access') ||
                          error.message?.includes('table index') ||
                          error.message?.includes('RuntimeError') ||
                          error.message?.includes('Aborted');

    if (isMemoryError) {
      // Reset HiGHS instance and RE-THROW so solveProblem can fall back to GLPK
      resetHiGHSInstance();
      throw error;
    }

    // Non-memory errors: return as error result
    return {
      status: 'error',
      objectiveValue: 0,
      assignments: new Map(),
      slackValues: new Map(),
      solveTimeMs: Date.now() - startTime,
      error: error.message || 'Unknown solver error'
    };
  }
}

/**
 * Solve using GLPK (fallback)
 * Fixed to handle all Big-M penalty slacks from slackBounds
 */
async function solveWithGLPK(
  problem: LPProblem,
  params: LPSolverParams
): Promise<SolverSolution> {
  const startTime = Date.now();

  try {
    const glpk = await loadGLPK(); // Use direct GLPK loader

    const varMapping = new Map<string, { accountId: string; repId: string }>();
    const allVars: { name: string; coef: number; binary: boolean }[] = [];
    const addedVarNames = new Set<string>();

    // 1. Assignment variables (binary)
    for (const assignVar of problem.assignmentVars) {
      const sanitized = `x_${sanitizeVarName(assignVar.accountId)}_${sanitizeVarName(assignVar.repId)}`;
      varMapping.set(sanitized, { accountId: assignVar.accountId, repId: assignVar.repId });
      const coef = problem.objectiveCoefficients.get(`x_${assignVar.accountId}_${assignVar.repId}`) || 0;
      allVars.push({ name: sanitized, coef, binary: true });
      addedVarNames.add(sanitized);
    }

    // 2. Balance slacks (alpha over/under - these are also in slackBounds)
    for (const slack of problem.balanceSlacks) {
      const overSanitized = sanitizeVarName(slack.overVar);
      const underSanitized = sanitizeVarName(slack.underVar);
      if (!addedVarNames.has(overSanitized)) {
        allVars.push({ name: overSanitized, coef: problem.objectiveCoefficients.get(slack.overVar) || 0, binary: false });
        addedVarNames.add(overSanitized);
      }
      if (!addedVarNames.has(underSanitized)) {
        allVars.push({ name: underSanitized, coef: problem.objectiveCoefficients.get(slack.underVar) || 0, binary: false });
        addedVarNames.add(underSanitized);
      }
    }

    // 3. CRITICAL FIX: All Big-M penalty slacks from slackBounds (beta, bigM variants)
    if (problem.slackBounds) {
      for (const bound of problem.slackBounds) {
        const sanitized = sanitizeVarName(bound.varName);
        if (!addedVarNames.has(sanitized)) {
          const coef = problem.objectiveCoefficients.get(bound.varName) || 0;
          allVars.push({ name: sanitized, coef, binary: false });
          addedVarNames.add(sanitized);
        }
      }
    }

    // 4. Feasibility slacks
    for (const slack of problem.feasibilitySlacks) {
      const sanitized = sanitizeVarName(slack.name);
      if (!addedVarNames.has(sanitized)) {
        allVars.push({ name: sanitized, coef: problem.objectiveCoefficients.get(slack.name) || 0, binary: false });
        addedVarNames.add(sanitized);
      }
    }

    lastVarMapping = varMapping;

    // Build slackBounds map for proper upper/lower bounds
    const slackBoundsMap = new Map(
      (problem.slackBounds || []).map(b => [sanitizeVarName(b.varName), b])
    );

    console.log(`[GLPK] Building problem: ${allVars.length} vars (${allVars.filter(v => v.binary).length} binary, ${allVars.filter(v => !v.binary).length} continuous)`);

    const glpkProblem = {
      name: 'LP',
      objective: {
        direction: glpk.GLP_MAX,
        name: 'obj',
        vars: allVars.map(v => ({ name: v.name, coef: v.coef }))
      },
      subjectTo: [] as any[],
      binaries: allVars.filter(v => v.binary).map(v => v.name),
      bounds: allVars.filter(v => !v.binary).map(v => {
        const boundInfo = slackBoundsMap.get(v.name);
        if (boundInfo && boundInfo.upper !== null) {
          // Double-bounded: lb <= x <= ub
          return { name: v.name, type: glpk.GLP_DB, lb: boundInfo.lower, ub: boundInfo.upper };
        }
        // Lower-bounded only: x >= lb
        return { name: v.name, type: glpk.GLP_LO, lb: boundInfo?.lower ?? 0, ub: Infinity };
      })
    };

    // Convert constraints
    for (const constraint of problem.constraints) {
      const vars: { name: string; coef: number }[] = [];

      for (const v of constraint.variables) {
        if (Math.abs(v.coefficient) < 1e-10) continue;

        let sanitizedName = sanitizeVarName(v.name);
        if (v.name.startsWith('x_')) {
          const parts = v.name.split('_');
          if (parts.length >= 3) {
            sanitizedName = `x_${sanitizeVarName(parts[1])}_${sanitizeVarName(parts.slice(2).join('_'))}`;
          }
        }

        vars.push({ name: sanitizedName, coef: v.coefficient });
      }

      if (vars.length === 0) continue;

      let bnds: any;
      if (constraint.type === 'eq') {
        bnds = { type: glpk.GLP_FX, lb: constraint.rhs, ub: constraint.rhs };
      } else if (constraint.type === 'le') {
        bnds = { type: glpk.GLP_UP, lb: -Infinity, ub: constraint.rhs };
      } else {
        bnds = { type: glpk.GLP_LO, lb: constraint.rhs, ub: Infinity };
      }

      glpkProblem.subjectTo.push({
        name: sanitizeVarName(constraint.name),
        vars,
        bnds
      });
    }

    console.log(`[GLPK] Solving problem (${problem.numVariables} vars, ${problem.numConstraints} constraints)...`);

    const result = await glpk.solve(glpkProblem, {
      msglev: params.log_level === 'debug' ? glpk.GLP_MSG_ALL : glpk.GLP_MSG_OFF,
      presol: true,
      tmlim: params.timeout_seconds > 60 ? params.timeout_seconds : 300  // GLPK needs more time for MIP - 5 minutes
    });

    const solveTimeMs = Date.now() - startTime;
    console.log(`[GLPK] Solve completed in ${solveTimeMs}ms, status: ${result.result?.status}`);

    // Map GLPK status
    // GLPK status codes: 1=GLP_UNDEF, 2=GLP_FEAS, 3=GLP_INFEAS, 4=GLP_NOFEAS, 5=GLP_OPT, 6=GLP_UNBND
    let status: SolverSolution['status'];
    const glpkStatus = result.result?.status;
    console.log(`[GLPK] Raw status: ${glpkStatus}, objective: ${result.result?.z}`);

    if (glpkStatus === glpk.GLP_OPT || glpkStatus === 5) {
      status = 'optimal';
    } else if (glpkStatus === glpk.GLP_FEAS || glpkStatus === 2) {
      status = 'feasible';
    } else if (glpkStatus === 1) {
      // GLP_UNDEF - solver couldn't find solution (timeout or numerical issues)
      // Check if we have any assignments - if so, treat as feasible
      console.warn(`[GLPK] Undefined status (timeout or numerical issues)`);
      status = 'timeout';
    } else if (glpkStatus === glpk.GLP_INFEAS || glpkStatus === 3 || glpkStatus === glpk.GLP_NOFEAS || glpkStatus === 4) {
      status = 'infeasible';
    } else if (glpkStatus === 6) {
      console.warn(`[GLPK] Problem is unbounded`);
      status = 'error';
    } else {
      console.warn(`[GLPK] Unexpected status: ${glpkStatus}`);
      status = 'error';
    }

    // Extract solution
    const assignments = new Map<string, Map<string, number>>();
    const slackValues = new Map<string, number>();

    if (result.result.vars) {
      for (const [varName, value] of Object.entries(result.result.vars)) {
        const mapping = varMapping.get(varName);
        if (mapping) {
          const { accountId, repId } = mapping;
          if (!assignments.has(accountId)) {
            assignments.set(accountId, new Map());
          }
          assignments.get(accountId)!.set(repId, value as number);
        } else if (!varName.startsWith('x_')) {
          slackValues.set(varName, value as number);
        }
      }
    }

    return {
      status,
      objectiveValue: result.result.z || 0,
      assignments,
      slackValues,
      solveTimeMs
    };

  } catch (error: any) {
    console.error('[GLPK] Solve error:', error);
    return {
      status: 'error',
      objectiveValue: 0,
      assignments: new Map(),
      slackValues: new Map(),
      solveTimeMs: Date.now() - startTime,
      error: error.message || 'Unknown solver error'
    };
  }
}

/**
 * Solve the LP problem
 * Uses multi-layer defense:
 *
 * Layer 0: Cloud Run (for large problems > scale limit)
 * Layer 1: Pre-check size limits
 * Layer 2: Browser HiGHS WASM
 * Layer 3: GLPK fallback
 * Layer 4: Cloud Run fallback (on WASM memory errors)
 */
export async function solveProblem(
  problem: LPProblem,
  params: LPSolverParams
): Promise<SolverSolution> {
  const numVars = problem.assignmentVars.length;

  // Log problem size
  console.log(`[Solver] Problem: ${numVars} assignment vars, ${problem.numConstraints} constraints, ${problem.slackBounds?.length || 0} slack bounds`);

  // Pre-compute LP format (used by all solvers)
  const { lpString: preCheckLpString, varMapping: preCheckVarMapping } = problemToLPFormat(problem);
  const lpSizeBytes = preCheckLpString.length;
  
  console.log(`[Solver] LP size: ${Math.round(lpSizeBytes / 1024)}KB`);

  const numAccounts = new Set(problem.assignmentVars.map(v => v.accountId)).size;

  // ALWAYS_USE_CLOUD_RUN: Route ALL problems to Cloud Run native solver
  // This bypasses flaky WASM/GLPK entirely for maximum reliability
  if (ALWAYS_USE_CLOUD_RUN) {
    console.log(`[Solver] Using Cloud Run native solver (${numAccounts} accounts, ${numVars} vars)`);
    try {
      const result = await solveWithCloudRun(preCheckLpString, preCheckVarMapping);
      
      if (result.status === 'optimal' || result.status === 'feasible') {
        console.log('[Solver] Cloud Run succeeded');
        return result;
      }
      
      // If infeasible or timeout, return the result (don't fall back)
      if (result.status === 'infeasible' || result.status === 'timeout') {
        console.log(`[Solver] Cloud Run returned ${result.status}`);
        return result;
      }
      
      // For error status, return as-is
      return result;
    } catch (cloudError: any) {
      console.error('[Solver] Cloud Run failed:', cloudError.message);
      return {
        status: 'error',
        objectiveValue: 0,
        assignments: new Map(),
        slackValues: new Map(),
        solveTimeMs: 0,
        error: `Cloud Run solver error: ${cloudError.message}`
      };
    }
  }

  // Layer 0: Use Cloud Run for large problems (when ALWAYS_USE_CLOUD_RUN is false)
  // Browser WASM can't handle problems > ~3000 accounts due to dense constraint matrices
  const useCloudRun = USE_CLOUD_RUN_FOR_LARGE && numAccounts > LP_SCALE_LIMITS.MAX_ACCOUNTS_FOR_GLOBAL_LP;
  
  if (useCloudRun) {
    console.log(`[Solver] Large problem (${numAccounts} accounts > ${LP_SCALE_LIMITS.MAX_ACCOUNTS_FOR_GLOBAL_LP}), using Cloud Run native solver`);
    try {
      const result = await solveWithCloudRun(preCheckLpString, preCheckVarMapping);
      
      if (result.status === 'optimal' || result.status === 'feasible') {
        console.log('[Solver] Cloud Run succeeded');
        return result;
      }
      
      // If infeasible or timeout, return the result
      if (result.status === 'infeasible' || result.status === 'timeout') {
        console.log(`[Solver] Cloud Run returned ${result.status}`);
        return result;
      }
    } catch (cloudError: any) {
      console.error('[Solver] Cloud Run failed:', cloudError.message);
      // For large problems, Cloud Run is the only option - don't fall back to WASM
      return {
        status: 'error',
        objectiveValue: 0,
        assignments: new Map(),
        slackValues: new Map(),
        solveTimeMs: 0,
        error: `Cloud Run solver error: ${cloudError.message}`
      };
    }
  }

  // Layer 1: Pre-check - If problem is too large for WASM, go to GLPK
  if (numVars > HIGHS_MAX_VARIABLES) {
    console.log(`[Solver] Problem too large (${numVars} > ${HIGHS_MAX_VARIABLES}), using GLPK`);
    return solveWithGLPK(problem, params);
  }

  // Layer 1.5: Skip HiGHS if it has failed too many times consecutively
  if (consecutiveHiGHSFailures >= MAX_HIGHS_FAILURES) {
    console.log(`[Solver] HiGHS has failed ${consecutiveHiGHSFailures} times, using GLPK directly`);
    return solveWithGLPK(problem, params);
  }

  // Ensure HiGHS is loaded
  await getHiGHS();

  // If HiGHS failed to load, use GLPK
  if (usingGLPK) {
    return solveWithGLPK(problem, params);
  }

  // Layer 2: Try browser HiGHS WASM
  const precomputedLp = { lpString: preCheckLpString, varMapping: preCheckVarMapping };
  try {
    const result = await solveWithHiGHS(problem, params, precomputedLp);
    // Reset failure counter on success
    consecutiveHiGHSFailures = 0;
    return result;
  } catch (error: any) {
    const isMemoryError = error.message?.includes('memory') ||
                          error.message?.includes('Aborted') ||
                          error.message?.includes('RuntimeError');

    if (isMemoryError) {
      consecutiveHiGHSFailures++;
      console.warn(`[Solver] HiGHS memory error (failure ${consecutiveHiGHSFailures}/${MAX_HIGHS_FAILURES})`);
      resetHiGHSInstance();
      
      // Layer 3: Try GLPK
      console.log('[Solver] Falling back to GLPK...');
      try {
        return await solveWithGLPK(problem, params);
      } catch (glpkError: any) {
        console.error('[Solver] GLPK also failed:', glpkError.message);
        
        // Layer 4: Last resort - try Cloud Run even for smaller problems
        if (USE_CLOUD_RUN_FOR_LARGE) {
          console.log('[Solver] Last resort: trying Cloud Run...');
          try {
            return await solveWithCloudRun(preCheckLpString, preCheckVarMapping);
          } catch (cloudError: any) {
            console.error('[Solver] Cloud Run also failed:', cloudError.message);
          }
        }
        
        throw glpkError;
      }
    }
    throw error;
  }
}

/**
 * Get the last variable mapping (for debugging)
 */
export function getLastVarMapping(): Map<string, { accountId: string; repId: string }> {
  return lastVarMapping;
}

/**
 * Extract assignments from solver solution
 * Returns Map<accountId, repId> for accounts that were assigned
 */
export function extractAssignments(solution: SolverSolution): Map<string, string> {
  const result = new Map<string, string>();
  
  for (const [accountId, repMap] of solution.assignments) {
    let bestRepId: string | null = null;
    let bestValue = 0;
    
    for (const [repId, value] of repMap) {
      if (value > bestValue) {
        bestValue = value;
        bestRepId = repId;
      }
    }
    
    if (bestRepId && bestValue >= 0.5) {
      result.set(accountId, bestRepId);
    }
  }
  
  return result;
}
