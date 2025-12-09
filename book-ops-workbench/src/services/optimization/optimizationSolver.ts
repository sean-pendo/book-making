/**
 * Optimization Solver using HiGHS WebAssembly
 * 
 * Formulates the account-to-rep assignment as a Mixed Integer Linear Program (MILP)
 * and solves it to find optimal assignments based on weighted objectives.
 */

// Type definitions for the highs package
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
  Rows: Array<{
    Index: number;
    Name: string;
    Status: string;
    Lower: number;
    Upper: number;
    Primal: number;
    Dual: number;
  }>;
}

interface HighsInstance {
  solve: (problem: string, options?: Record<string, any>) => HighsSolution;
}

export interface SandboxAccount {
  sfdc_account_id: string;
  account_name: string;
  calculated_arr: number;
  cre_count: number;
  sales_territory: string;
  geo: string;
  owner_id: string | null;
  owner_name: string | null;
  is_strategic?: boolean;
}

export interface SandboxRep {
  rep_id: string;
  name: string;
  region: string;
  is_strategic_rep: boolean;
  is_active: boolean;
  include_in_assignments: boolean;
}

export interface SandboxConfig {
  target_arr: number;
  variance_pct: number;  // 0.05 to 0.30 (5% to 30%)
  max_arr: number;
  max_cre_per_rep: number;
  geo_weight: number;    // 0-100
  continuity_weight: number; // 0-100
  balance_weight: number;  // 0-100
  p4_only_overflow: boolean;  // Toggle for P4-only overflow fix
  territory_mappings: Record<string, string>;
}

export interface OptimizedAssignment {
  sfdc_account_id: string;
  account_name: string;
  assigned_rep_id: string;
  assigned_rep_name: string;
  account_arr: number;
  geo_match: boolean;
  continuity_maintained: boolean;
  rationale: string;
}

export interface OptimizationResult {
  status: 'optimal' | 'infeasible' | 'error';
  assignments: OptimizedAssignment[];
  solve_time_ms: number;
  objective_value: number;
  error_message?: string;
}

// Singleton promise for HiGHS instance
let highsInstance: HighsInstance | null = null;
let highsLoadPromise: Promise<HighsInstance> | null = null;

/**
 * Load and initialize HiGHS solver (singleton pattern)
 */
async function getHighsInstance(): Promise<HighsInstance> {
  if (highsInstance) {
    return highsInstance;
  }
  
  if (highsLoadPromise) {
    return highsLoadPromise;
  }

  highsLoadPromise = (async () => {
    try {
      // Dynamic import of highs module
      const highsLoader = (await import('highs')).default;
      
      // Initialize HiGHS - in browser, may need locateFile for WASM
      const highs = await highsLoader({
        // Node.js doesn't need locateFile, browser may need it
        locateFile: (file: string) => {
          // Try to load from node_modules path or CDN
          if (typeof window !== 'undefined') {
            return `https://lovasoa.github.io/highs-js/${file}`;
          }
          return file;
        }
      });
      
      highsInstance = highs;
      console.log('[OptimizationSolver] HiGHS loaded successfully');
      return highs;
    } catch (error) {
      console.error('[OptimizationSolver] Failed to load HiGHS:', error);
      throw error;
    }
  })();

  return highsLoadPromise;
}

/**
 * Build the LP problem in CPLEX format
 */
function buildLPProblem(
  accounts: SandboxAccount[],
  reps: SandboxRep[],
  config: SandboxConfig
): string {
  const lines: string[] = [];
  const objectiveTerms: string[] = [];
  const constraints: string[] = [];
  const bounds: string[] = [];
  const binaries: string[] = [];
  
  // Filter to active reps only
  const activeReps = reps.filter(r => r.is_active && r.include_in_assignments);
  
  if (activeReps.length === 0) {
    throw new Error('No active reps available for assignment');
  }
  
  // Calculate derived values
  const minARR = config.target_arr * (1 - config.variance_pct);
  const maxPreferredARR = config.target_arr * (1 + config.variance_pct);
  
  // Normalize weights to sum to 1
  const totalWeight = config.geo_weight + config.continuity_weight + config.balance_weight;
  const geoW = totalWeight > 0 ? config.geo_weight / totalWeight : 0.33;
  const contW = totalWeight > 0 ? config.continuity_weight / totalWeight : 0.33;
  const balW = totalWeight > 0 ? config.balance_weight / totalWeight : 0.34;
  
  // Build objective function (maximize assignment quality)
  // Variables: x_a_r = 1 if account a is assigned to rep r
  lines.push('Maximize');
  lines.push(' obj:');
  
  for (const account of accounts) {
    const targetRegion = config.territory_mappings[account.sales_territory] || account.geo;
    
    for (const rep of activeReps) {
      // Skip strategic constraint violations
      const isStrategicAccount = account.is_strategic || false;
      if (isStrategicAccount && !rep.is_strategic_rep) continue;
      if (!isStrategicAccount && rep.is_strategic_rep) continue;
      
      const varName = `x_${sanitizeVarName(account.sfdc_account_id)}_${sanitizeVarName(rep.rep_id)}`;
      
      // Calculate coefficient based on:
      // 1. Geographic match bonus
      const geoBonus = rep.region === targetRegion ? 100 * geoW : 0;
      
      // 2. Continuity bonus (keeping with current owner)
      const continuityBonus = account.owner_id === rep.rep_id ? 80 * contW : 0;
      
      // 3. Base assignment value (scaled by ARR for balance consideration)
      const baseValue = 10 + (balW * 20);
      
      const coefficient = geoBonus + continuityBonus + baseValue;
      
      if (coefficient > 0) {
        objectiveTerms.push(`${coefficient.toFixed(2)} ${varName}`);
      }
      
      binaries.push(varName);
    }
  }
  
  lines.push('    ' + objectiveTerms.join(' + '));
  
  // Constraints
  lines.push('Subject To');
  
  // Constraint 1: Each account assigned to exactly one rep
  for (const account of accounts) {
    const assignmentVars: string[] = [];
    for (const rep of activeReps) {
      const isStrategicAccount = account.is_strategic || false;
      if (isStrategicAccount && !rep.is_strategic_rep) continue;
      if (!isStrategicAccount && rep.is_strategic_rep) continue;
      
      const varName = `x_${sanitizeVarName(account.sfdc_account_id)}_${sanitizeVarName(rep.rep_id)}`;
      assignmentVars.push(varName);
    }
    
    if (assignmentVars.length > 0) {
      constraints.push(` assign_${sanitizeVarName(account.sfdc_account_id)}: ${assignmentVars.join(' + ')} = 1`);
    }
  }
  
  // Constraint 2: Rep ARR within bounds
  for (const rep of activeReps) {
    const arrTerms: string[] = [];
    
    for (const account of accounts) {
      const isStrategicAccount = account.is_strategic || false;
      if (isStrategicAccount && !rep.is_strategic_rep) continue;
      if (!isStrategicAccount && rep.is_strategic_rep) continue;
      
      const varName = `x_${sanitizeVarName(account.sfdc_account_id)}_${sanitizeVarName(rep.rep_id)}`;
      const arr = account.calculated_arr || 0;
      
      if (arr > 0) {
        arrTerms.push(`${arr} ${varName}`);
      }
    }
    
    if (arrTerms.length > 0) {
      const arrExpr = arrTerms.join(' + ');
      // Min ARR constraint (can be soft - we use a slack approach in simpler version)
      constraints.push(` arr_min_${sanitizeVarName(rep.rep_id)}: ${arrExpr} >= ${Math.max(0, minARR * 0.5)}`);
      // Max ARR constraint (hard cap)
      constraints.push(` arr_max_${sanitizeVarName(rep.rep_id)}: ${arrExpr} <= ${config.max_arr}`);
    }
  }
  
  // Constraint 3: CRE count per rep
  for (const rep of activeReps) {
    const creTerms: string[] = [];
    
    for (const account of accounts) {
      const isStrategicAccount = account.is_strategic || false;
      if (isStrategicAccount && !rep.is_strategic_rep) continue;
      if (!isStrategicAccount && rep.is_strategic_rep) continue;
      
      const cre = account.cre_count || 0;
      if (cre > 0) {
        const varName = `x_${sanitizeVarName(account.sfdc_account_id)}_${sanitizeVarName(rep.rep_id)}`;
        creTerms.push(`${cre} ${varName}`);
      }
    }
    
    if (creTerms.length > 0) {
      const creExpr = creTerms.join(' + ');
      constraints.push(` cre_max_${sanitizeVarName(rep.rep_id)}: ${creExpr} <= ${config.max_cre_per_rep}`);
    }
  }
  
  lines.push(...constraints);
  
  // Bounds section (all binary variables are 0-1)
  lines.push('Bounds');
  for (const varName of binaries) {
    bounds.push(` 0 <= ${varName} <= 1`);
  }
  lines.push(...bounds);
  
  // Binary variables section
  lines.push('Binary');
  lines.push(' ' + binaries.join(' '));
  
  lines.push('End');
  
  return lines.join('\n');
}

/**
 * Sanitize variable names for LP format (no special chars)
 */
function sanitizeVarName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
}

/**
 * Parse HiGHS solution back into assignment results
 */
function parseSolution(
  solution: HighsSolution,
  accounts: SandboxAccount[],
  reps: SandboxRep[],
  config: SandboxConfig
): OptimizedAssignment[] {
  const assignments: OptimizedAssignment[] = [];
  
  if (solution.Status !== 'Optimal') {
    return assignments;
  }
  
  // Build lookup maps
  const accountMap = new Map(accounts.map(a => [sanitizeVarName(a.sfdc_account_id), a]));
  const repMap = new Map(reps.map(r => [sanitizeVarName(r.rep_id), r]));
  
  // Parse solution columns
  for (const [varName, varData] of Object.entries(solution.Columns)) {
    // Variable format: x_accountId_repId
    if (!varName.startsWith('x_')) continue;
    
    // Only consider assigned variables (value ~= 1)
    if (varData.Primal < 0.5) continue;
    
    const parts = varName.substring(2).split('_');
    if (parts.length < 2) continue;
    
    // Find the split point between account ID and rep ID
    // Try to match against known account and rep IDs
    let matchedAccount: SandboxAccount | undefined;
    let matchedRep: SandboxRep | undefined;
    
    for (const account of accounts) {
      const sanitizedAccountId = sanitizeVarName(account.sfdc_account_id);
      if (varName.startsWith(`x_${sanitizedAccountId}_`)) {
        const repPart = varName.substring(`x_${sanitizedAccountId}_`.length);
        const rep = repMap.get(repPart);
        if (rep) {
          matchedAccount = account;
          matchedRep = rep;
          break;
        }
      }
    }
    
    if (!matchedAccount || !matchedRep) continue;
    
    const targetRegion = config.territory_mappings[matchedAccount.sales_territory] || matchedAccount.geo;
    const geoMatch = matchedRep.region === targetRegion;
    const continuityMaintained = matchedAccount.owner_id === matchedRep.rep_id;
    
    // Build rationale
    const rationaleReasons: string[] = [];
    if (geoMatch) rationaleReasons.push('Geographic match');
    if (continuityMaintained) rationaleReasons.push('Continuity maintained');
    if (!geoMatch && !continuityMaintained) rationaleReasons.push('Balanced assignment');
    
    assignments.push({
      sfdc_account_id: matchedAccount.sfdc_account_id,
      account_name: matchedAccount.account_name,
      assigned_rep_id: matchedRep.rep_id,
      assigned_rep_name: matchedRep.name,
      account_arr: matchedAccount.calculated_arr || 0,
      geo_match: geoMatch,
      continuity_maintained: continuityMaintained,
      rationale: `Optimized: ${rationaleReasons.join(', ')}`
    });
  }
  
  return assignments;
}

/**
 * Main optimization function
 */
export async function runOptimization(
  accounts: SandboxAccount[],
  reps: SandboxRep[],
  config: SandboxConfig
): Promise<OptimizationResult> {
  const startTime = performance.now();
  
  try {
    console.log(`[OptimizationSolver] Starting optimization for ${accounts.length} accounts, ${reps.length} reps`);
    
    // Get HiGHS instance
    const highs = await getHighsInstance();
    
    // Build LP problem
    const lpProblem = buildLPProblem(accounts, reps, config);
    console.log(`[OptimizationSolver] LP problem built, ${lpProblem.length} chars`);
    
    // Solve
    const solution = highs.solve(lpProblem, {
      presolve: 'on',
      time_limit: 30.0, // 30 second timeout
      mip_rel_gap: 0.01, // 1% optimality gap acceptable
    });
    
    const solveTime = performance.now() - startTime;
    console.log(`[OptimizationSolver] Solve completed in ${solveTime.toFixed(0)}ms, status: ${solution.Status}`);
    
    if (solution.Status === 'Optimal') {
      const assignments = parseSolution(solution, accounts, reps, config);
      
      return {
        status: 'optimal',
        assignments,
        solve_time_ms: Math.round(solveTime),
        objective_value: solution.ObjectiveValue
      };
    } else if (solution.Status === 'Infeasible') {
      return {
        status: 'infeasible',
        assignments: [],
        solve_time_ms: Math.round(solveTime),
        objective_value: 0,
        error_message: 'No feasible solution exists with current constraints. Try increasing variance % or max ARR.'
      };
    } else {
      return {
        status: 'error',
        assignments: [],
        solve_time_ms: Math.round(solveTime),
        objective_value: 0,
        error_message: `Solver returned status: ${solution.Status}`
      };
    }
  } catch (error) {
    const solveTime = performance.now() - startTime;
    console.error('[OptimizationSolver] Error:', error);
    
    return {
      status: 'error',
      assignments: [],
      solve_time_ms: Math.round(solveTime),
      objective_value: 0,
      error_message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get default sandbox configuration
 */
export function getDefaultSandboxConfig(): SandboxConfig {
  return {
    target_arr: 1400000,  // $1.4M
    variance_pct: 0.10,   // 10%
    max_arr: 2400000,     // $2.4M
    max_cre_per_rep: 3,
    geo_weight: 40,
    continuity_weight: 30,
    balance_weight: 30,
    p4_only_overflow: true,
    territory_mappings: {}
  };
}

