/**
 * HiGHS Wrapper
 * 
 * Wraps the HiGHS WASM solver for LP/MIP optimization.
 * Handles:
 * - Lazy loading of HiGHS module
 * - Problem conversion to HiGHS format
 * - Solution extraction
 * - Timeout handling
 */

import type { LPProblem, LPSolverParams } from '../types';

// HiGHS instance (lazy loaded)
let highsInstance: any = null;
let highsLoadPromise: Promise<any> | null = null;

/**
 * Sanitize variable names for LP format
 * - Must start with letter or underscore
 * - Only alphanumeric and underscores allowed
 * - Max 255 chars (we use 25 for safety)
 */
function sanitizeVarName(name: string): string {
  // Replace non-alphanumeric with underscore, ensure starts with letter
  let sanitized = name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 25);
  // If starts with number, prefix with 'v'
  if (/^[0-9]/.test(sanitized)) {
    sanitized = 'v' + sanitized.substring(0, 24);
  }
  return sanitized;
}

/**
 * Get or load HiGHS instance
 * Uses CDN for WASM files to avoid Vite bundling issues
 */
async function getHiGHS(): Promise<any> {
  if (highsInstance) return highsInstance;
  
  if (!highsLoadPromise) {
    highsLoadPromise = (async () => {
      try {
        console.log('[HiGHS] Loading WASM module from CDN...');
        const highsLoader = (await import('highs')).default;
        
        // Use CDN for WASM files - same approach as simplifiedAssignmentEngine
        highsInstance = await highsLoader({
          locateFile: (file: string) => {
            if (typeof window !== 'undefined') {
              return `https://lovasoa.github.io/highs-js/${file}`;
            }
            return file;
          }
        });
        
        console.log('[HiGHS] Module loaded successfully from CDN');
        return highsInstance;
      } catch (error) {
        console.error('[HiGHS] Failed to load:', error);
        highsLoadPromise = null;
        throw error;
      }
    })();
  }
  
  return highsLoadPromise;
}

export interface SolverSolution {
  status: 'optimal' | 'feasible' | 'infeasible' | 'timeout' | 'error';
  objectiveValue: number;
  assignments: Map<string, Map<string, number>>; // accountId -> repId -> value (0 or 1)
  slackValues: Map<string, number>; // slack variable name -> value
  solveTimeMs: number;
  error?: string;
}

/**
 * Convert problem to HiGHS LP format string
 * Matches the format used by simplifiedAssignmentEngine (which works)
 * 
 * Format:
 * Maximize
 *  obj:
 *     1.5 x1 + 2.0 x2 + ...
 * Subject To
 *  c1: x1 + x2 <= 10
 * Bounds
 *  0 <= x1 <= 1
 * Binary
 *  x1 x2 x3
 * End
 */
function problemToLPFormat(problem: LPProblem): string {
  const lines: string[] = [];
  const binaries: string[] = [];
  
  // Build variable name mapping (original -> sanitized)
  const varNameMap = new Map<string, string>();
  
  for (const assignVar of problem.assignmentVars) {
    const sanitized = `x_${sanitizeVarName(assignVar.accountId)}_${sanitizeVarName(assignVar.repId)}`;
    varNameMap.set(assignVar.name, sanitized);
    binaries.push(sanitized);
  }
  
  for (const slack of problem.balanceSlacks) {
    varNameMap.set(slack.overVar, sanitizeVarName(slack.overVar));
    varNameMap.set(slack.underVar, sanitizeVarName(slack.underVar));
  }
  
  for (const slack of problem.feasibilitySlacks) {
    varNameMap.set(slack.name, sanitizeVarName(slack.name));
  }
  
  // Helper to get sanitized name
  const getSanitized = (name: string) => varNameMap.get(name) || sanitizeVarName(name);
  
  // Objective: Maximize (format matches waterfall engine)
  lines.push('Maximize');
  lines.push(' obj:');
  
  // Build objective terms - format: coef var + coef var + ...
  const objTerms: string[] = [];
  for (const [varName, coef] of problem.objectiveCoefficients) {
    if (Math.abs(coef) > 1e-10 && coef > 0) {
      // Only positive coefficients (negative handled via slack penalties which are subtracted)
      const sanitizedVar = getSanitized(varName);
      objTerms.push(`${coef.toFixed(4)} ${sanitizedVar}`);
    }
  }
  
  // Handle negative coefficients (penalties) - subtract them
  for (const [varName, coef] of problem.objectiveCoefficients) {
    if (coef < -1e-10) {
      const sanitizedVar = getSanitized(varName);
      objTerms.push(`${coef.toFixed(4)} ${sanitizedVar}`); // coef is already negative
    }
  }
  
  if (objTerms.length === 0) {
    lines.push('    1 dummy');
  } else {
    // Join with + for positive terms, negative terms already have -
    lines.push('    ' + objTerms.join(' + ').replace(/\+ -/g, '- '));
  }
  
  // Constraints
  lines.push('Subject To');
  
  for (const constraint of problem.constraints) {
    const posTerms: string[] = [];
    const negTerms: string[] = [];
    
    for (const v of constraint.variables) {
      if (Math.abs(v.coefficient) < 1e-10) continue;
      
      const sanitizedVar = getSanitized(v.name);
      if (v.coefficient > 0) {
        if (Math.abs(v.coefficient - 1) < 1e-10) {
          posTerms.push(sanitizedVar);
        } else {
          posTerms.push(`${v.coefficient.toFixed(4)} ${sanitizedVar}`);
        }
      } else {
        if (Math.abs(v.coefficient + 1) < 1e-10) {
          negTerms.push(sanitizedVar);
        } else {
          negTerms.push(`${Math.abs(v.coefficient).toFixed(4)} ${sanitizedVar}`);
        }
      }
    }
    
    if (posTerms.length === 0 && negTerms.length === 0) continue;
    
    // Build constraint string
    let lhs = posTerms.join(' + ');
    if (negTerms.length > 0) {
      if (lhs.length > 0) {
        lhs += ' - ' + negTerms.join(' - ');
      } else {
        lhs = '- ' + negTerms.join(' - ');
      }
    }
    
    const op = constraint.type === 'eq' ? '=' : constraint.type === 'le' ? '<=' : '>=';
    const sanitizedConstraintName = sanitizeVarName(constraint.name);
    lines.push(` ${sanitizedConstraintName}: ${lhs} ${op} ${constraint.rhs}`);
  }
  
  // Bounds
  lines.push('Bounds');
  
  // Binary variables (assignments) are 0-1
  for (const sanitized of binaries) {
    lines.push(` 0 <= ${sanitized} <= 1`);
  }
  
  // Slack variables are non-negative (free upper bound)
  for (const slack of problem.balanceSlacks) {
    lines.push(` 0 <= ${getSanitized(slack.overVar)}`);
    lines.push(` 0 <= ${getSanitized(slack.underVar)}`);
  }
  for (const slack of problem.feasibilitySlacks) {
    lines.push(` 0 <= ${getSanitized(slack.name)}`);
  }
  
  // Binary section - all on one line (matches waterfall)
  lines.push('Binary');
  lines.push(' ' + binaries.join(' '));
  
  lines.push('End');
  
  return lines.join('\n');
}

// Store reverse mapping for solution extraction (sanitized name -> original IDs)
let lastVarMapping: Map<string, { accountId: string; repId: string }> = new Map();

/**
 * Convert problem to LP format and store variable mapping for solution extraction
 */
function buildLPAndMapping(problem: LPProblem): { lpString: string; varMapping: Map<string, { accountId: string; repId: string }> } {
  const varMapping = new Map<string, { accountId: string; repId: string }>();
  
  // Store mapping from sanitized variable name to original IDs
  for (const assignVar of problem.assignmentVars) {
    const sanitized = `x_${sanitizeVarName(assignVar.accountId)}_${sanitizeVarName(assignVar.repId)}`;
    varMapping.set(sanitized, { accountId: assignVar.accountId, repId: assignVar.repId });
  }
  
  return { lpString: problemToLPFormat(problem), varMapping };
}

/**
 * Solve the LP problem using HiGHS
 */
export async function solveProblem(
  problem: LPProblem,
  params: LPSolverParams
): Promise<SolverSolution> {
  const startTime = Date.now();
  
  try {
    const highs = await getHiGHS();
    
    // Convert problem to LP format and get variable mapping
    const { lpString, varMapping } = buildLPAndMapping(problem);
    lastVarMapping = varMapping;
    
    if (params.log_level === 'debug') {
      console.log('[HiGHS] LP Problem:\n', lpString.substring(0, 2000) + '...');
    }
    
    // Solve with options passed as second argument (same as waterfall engine)
    console.log(`[HiGHS] Solving problem (${problem.numVariables} vars, ${problem.numConstraints} constraints)...`);
    
    // Log first part of LP for debugging
    console.log(`[HiGHS] LP Preview (first 500 chars):\n${lpString.substring(0, 500)}`);
    
    const result = highs.solve(lpString, {
      presolve: 'on',
      time_limit: params.timeout_seconds || 60,
      mip_rel_gap: 0.05
    });
    
    const solveTimeMs = Date.now() - startTime;
    console.log(`[HiGHS] Solve completed in ${solveTimeMs}ms, status: ${result.Status}`);
    
    // Check status
    let status: SolverSolution['status'];
    switch (result.Status) {
      case 'Optimal':
        status = 'optimal';
        break;
      case 'Feasible':
        status = 'feasible';
        break;
      case 'Infeasible':
        status = 'infeasible';
        break;
      case 'Time limit reached':
        status = 'timeout';
        break;
      default:
        status = 'error';
    }
    
    // Extract solution using variable mapping
    const assignments = new Map<string, Map<string, number>>();
    const slackValues = new Map<string, number>();
    
    if (result.Columns) {
      for (const [varName, varData] of Object.entries(result.Columns)) {
        const value = (varData as any).Primal || 0;
        
        // Check if this is an assignment variable using our mapping
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
      objectiveValue: result.ObjectiveValue || 0,
      assignments,
      slackValues,
      solveTimeMs
    };
    
  } catch (error: any) {
    console.error('[HiGHS] Solve error:', error);
    console.error('[HiGHS] Error stack:', error.stack);
    console.error('[HiGHS] Problem size:', {
      numVars: problem.numVariables,
      numConstraints: problem.numConstraints,
      numAccounts: problem.numAccounts,
      numReps: problem.numReps
    });
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
 * Extract assignment from solution (accountId -> repId)
 */
export function extractAssignments(
  solution: SolverSolution
): Map<string, string> {
  const result = new Map<string, string>();
  
  for (const [accountId, repMap] of solution.assignments) {
    // Find the rep with value closest to 1
    let bestRep: string | null = null;
    let bestValue = 0;
    
    for (const [repId, value] of repMap) {
      if (value > bestValue && value > 0.5) {
        bestValue = value;
        bestRep = repId;
      }
    }
    
    if (bestRep) {
      result.set(accountId, bestRep);
    }
  }
  
  return result;
}

