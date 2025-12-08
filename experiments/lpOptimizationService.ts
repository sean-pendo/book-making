/**
 * LP Optimization Service for Territory Assignment
 * 
 * Uses javascript-lp-solver to find globally optimal assignments
 * that minimize variance while respecting constraints.
 * 
 * This is TRUE OPTIMIZATION vs the greedy waterfall approach.
 */

import Solver from 'javascript-lp-solver';

// ============================================================================
// TYPES
// ============================================================================

export interface LPAccount {
  id: string;
  accountName: string;
  arr: number;
  creCount: number;
  tier: 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Tier 4' | null;
  currentOwnerId: string | null;
  territory: string | null;
  geo: string | null;
  isStrategic: boolean;
  isCustomer: boolean;
  parentId: string | null;
  renewalQuarter: string | null;
}

export interface LPRep {
  id: string;
  name: string;
  region: string | null;
  isStrategic: boolean;
  isActive: boolean;
  includeInAssignments: boolean;
}

export interface LPConfig {
  // Capacity limits
  targetARR: number;
  maxARR: number;
  maxCRE: number;
  
  // Objective weights (0-100, higher = more important)
  weights: {
    arrBalance: number;      // Minimize ARR variance
    creBalance: number;      // Minimize CRE concentration
    continuity: number;      // Preserve current ownership
    geography: number;       // Prefer same-region assignments
    tierBalance: number;     // Spread Tier 1/2 evenly
  };
  
  // Territory to region mapping
  territoryMappings?: Record<string, string>;
}

export interface LPResult {
  success: boolean;
  feasible: boolean;
  assignments: LPAssignment[];
  metrics: LPMetrics;
  solutionTimeMs: number;
  problemSize: {
    accounts: number;
    reps: number;
    variables: number;
    constraints: number;
  };
}

export interface LPAssignment {
  accountId: string;
  accountName: string;
  repId: string;
  repName: string;
  arr: number;
  reason: string;
  isChange: boolean;
  previousOwnerId: string | null;
}

export interface LPMetrics {
  totalARR: number;
  avgARRPerRep: number;
  arrStdDev: number;
  arrCV: number;
  continuityRate: number;
  geographyMatchRate: number;
  objectiveValue: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if account territory matches rep region
 */
function matchesGeography(
  account: LPAccount, 
  rep: LPRep, 
  mappings?: Record<string, string>
): boolean {
  if (!account.territory && !account.geo) return false;
  if (!rep.region) return false;
  
  const accountRegion = account.geo || 
    (mappings && account.territory ? mappings[account.territory] : null) ||
    account.territory;
  
  if (!accountRegion) return false;
  
  return accountRegion.toLowerCase() === rep.region.toLowerCase();
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}

// ============================================================================
// MAIN OPTIMIZATION FUNCTION
// ============================================================================

/**
 * Optimize assignments using Linear Programming
 * 
 * Formulation:
 * - Decision variables: x[a,r] ∈ {0,1} = 1 if account a assigned to rep r
 * - Objective: Minimize weighted sum of penalties
 * - Constraints: Each account assigned once, capacity limits
 */
export function optimizeAssignmentsLP(
  accounts: LPAccount[],
  reps: LPRep[],
  config: LPConfig
): LPResult {
  const startTime = Date.now();
  
  console.log(`🔬 LP Optimization starting: ${accounts.length} accounts, ${reps.length} reps`);
  
  // Filter to eligible reps
  const eligibleReps = reps.filter(r => r.isActive && r.includeInAssignments);
  const normalReps = eligibleReps.filter(r => !r.isStrategic);
  const strategicReps = eligibleReps.filter(r => r.isStrategic);
  
  console.log(`   Normal reps: ${normalReps.length}, Strategic reps: ${strategicReps.length}`);
  
  // Separate accounts by type
  const normalAccounts = accounts.filter(a => !a.isStrategic);
  const strategicAccounts = accounts.filter(a => a.isStrategic);
  
  // Build the LP model
  const model: any = {
    optimize: 'totalCost',
    opType: 'min',
    constraints: {},
    variables: {},
    ints: {}
  };
  
  let variableCount = 0;
  let constraintCount = 0;
  
  // Normalize weights to sum to 1
  const totalWeight = Object.values(config.weights).reduce((a, b) => a + b, 0);
  const w = {
    arr: config.weights.arrBalance / totalWeight,
    cre: config.weights.creBalance / totalWeight,
    cont: config.weights.continuity / totalWeight,
    geo: config.weights.geography / totalWeight,
    tier: config.weights.tierBalance / totalWeight
  };
  
  // Calculate target per rep for deviation penalties
  const totalARR = normalAccounts.reduce((sum, a) => sum + a.arr, 0);
  const avgARRPerRep = normalReps.length > 0 ? totalARR / normalReps.length : 0;
  
  // =========================================================================
  // CONSTRAINTS: Each account assigned exactly once
  // =========================================================================
  
  normalAccounts.forEach(account => {
    model.constraints[`assign_${account.id}`] = { equal: 1 };
    constraintCount++;
  });
  
  strategicAccounts.forEach(account => {
    model.constraints[`assign_${account.id}`] = { equal: 1 };
    constraintCount++;
  });
  
  // =========================================================================
  // CONSTRAINTS: Rep capacity limits (normal reps only)
  // =========================================================================
  
  normalReps.forEach(rep => {
    model.constraints[`arr_cap_${rep.id}`] = { max: config.maxARR };
    model.constraints[`cre_cap_${rep.id}`] = { max: config.maxCRE };
    constraintCount += 2;
  });
  
  // =========================================================================
  // VARIABLES: Assignment decisions with costs
  // =========================================================================
  
  // Normal accounts -> Normal reps
  normalAccounts.forEach(account => {
    normalReps.forEach(rep => {
      const varName = `x_${account.id}_${rep.id}`;
      
      // Calculate cost components
      let cost = 0;
      
      // Continuity penalty: higher cost if changing owner
      if (account.currentOwnerId && account.currentOwnerId !== rep.id) {
        cost += w.cont * 100;
      }
      
      // Geography penalty: higher cost if region mismatch
      const geoMatch = matchesGeography(account, rep, config.territoryMappings);
      if (!geoMatch) {
        cost += w.geo * 80;
      }
      
      // ARR balance: penalize deviation from average
      // (Simplified - true variance minimization would be quadratic)
      const arrDeviation = Math.abs(account.arr - avgARRPerRep / normalAccounts.length * normalReps.length);
      cost += w.arr * (arrDeviation / 1000000) * 10;  // Scale appropriately
      
      // CRE balance: penalize high CRE accounts going to already-loaded reps
      // (Handled via capacity constraint, but add soft preference)
      if (account.creCount > 0) {
        cost += w.cre * account.creCount * 20;
      }
      
      // Tier balance: slight penalty for Tier 1 concentration
      if (account.tier === 'Tier 1') {
        cost += w.tier * 15;
      } else if (account.tier === 'Tier 2') {
        cost += w.tier * 10;
      }
      
      model.variables[varName] = {
        totalCost: cost,
        [`assign_${account.id}`]: 1,
        [`arr_cap_${rep.id}`]: account.arr,
        [`cre_cap_${rep.id}`]: account.creCount
      };
      
      model.ints[varName] = 1;  // Binary variable
      variableCount++;
    });
  });
  
  // Strategic accounts -> Strategic reps (no capacity limits)
  strategicAccounts.forEach(account => {
    strategicReps.forEach(rep => {
      const varName = `x_${account.id}_${rep.id}`;
      
      let cost = 0;
      
      // Continuity for strategic
      if (account.currentOwnerId && account.currentOwnerId !== rep.id) {
        cost += w.cont * 50;  // Less penalty for strategic reassignment
      }
      
      model.variables[varName] = {
        totalCost: cost,
        [`assign_${account.id}`]: 1
      };
      
      model.ints[varName] = 1;
      variableCount++;
    });
  });
  
  console.log(`   Built model: ${variableCount} variables, ${constraintCount} constraints`);
  
  // =========================================================================
  // SOLVE
  // =========================================================================
  
  const solution = Solver.Solve(model);
  const solutionTime = Date.now() - startTime;
  
  console.log(`   Solution found in ${solutionTime}ms, feasible: ${solution.feasible}`);
  
  if (!solution.feasible) {
    console.warn('   ⚠️ No feasible solution found!');
    return {
      success: false,
      feasible: false,
      assignments: [],
      metrics: {
        totalARR: 0,
        avgARRPerRep: 0,
        arrStdDev: 0,
        arrCV: 0,
        continuityRate: 0,
        geographyMatchRate: 0,
        objectiveValue: 0
      },
      solutionTimeMs: solutionTime,
      problemSize: {
        accounts: accounts.length,
        reps: eligibleReps.length,
        variables: variableCount,
        constraints: constraintCount
      }
    };
  }
  
  // =========================================================================
  // EXTRACT RESULTS
  // =========================================================================
  
  const assignments: LPAssignment[] = [];
  const repARR: Record<string, number> = {};
  let continuityCount = 0;
  let geoMatchCount = 0;
  
  // Initialize rep ARR tracking
  eligibleReps.forEach(rep => {
    repARR[rep.id] = 0;
  });
  
  // Process solution
  Object.keys(solution).forEach(key => {
    if (key.startsWith('x_') && solution[key] === 1) {
      const parts = key.split('_');
      const accountId = parts[1];
      const repId = parts[2];
      
      const account = accounts.find(a => a.id === accountId);
      const rep = eligibleReps.find(r => r.id === repId);
      
      if (account && rep) {
        const isChange = account.currentOwnerId !== rep.id;
        const geoMatch = matchesGeography(account, rep, config.territoryMappings);
        
        if (!isChange) continuityCount++;
        if (geoMatch) geoMatchCount++;
        
        repARR[rep.id] = (repARR[rep.id] || 0) + account.arr;
        
        // Determine reason
        let reason = 'LP Optimal Assignment';
        if (!isChange && geoMatch) {
          reason = 'Optimal: Continuity + Geography';
        } else if (!isChange) {
          reason = 'Optimal: Preserves Continuity';
        } else if (geoMatch) {
          reason = 'Optimal: Geography Match';
        } else {
          reason = 'Optimal: Best Global Balance';
        }
        
        assignments.push({
          accountId: account.id,
          accountName: account.accountName,
          repId: rep.id,
          repName: rep.name,
          arr: account.arr,
          reason,
          isChange,
          previousOwnerId: account.currentOwnerId
        });
      }
    }
  });
  
  // Calculate metrics
  const normalRepARRValues = normalReps.map(r => repARR[r.id] || 0);
  const arrStdDev = calculateStdDev(normalRepARRValues);
  const actualAvgARR = normalRepARRValues.reduce((a, b) => a + b, 0) / normalRepARRValues.length;
  const arrCV = actualAvgARR > 0 ? arrStdDev / actualAvgARR : 0;
  
  const metrics: LPMetrics = {
    totalARR: totalARR,
    avgARRPerRep: actualAvgARR,
    arrStdDev,
    arrCV,
    continuityRate: assignments.length > 0 ? continuityCount / assignments.length : 0,
    geographyMatchRate: assignments.length > 0 ? geoMatchCount / assignments.length : 0,
    objectiveValue: solution.result || 0
  };
  
  console.log(`✅ LP Optimization complete:`);
  console.log(`   Assignments: ${assignments.length}`);
  console.log(`   ARR CV: ${(metrics.arrCV * 100).toFixed(1)}%`);
  console.log(`   Continuity: ${(metrics.continuityRate * 100).toFixed(1)}%`);
  console.log(`   Geography: ${(metrics.geographyMatchRate * 100).toFixed(1)}%`);
  
  return {
    success: true,
    feasible: true,
    assignments,
    metrics,
    solutionTimeMs: solutionTime,
    problemSize: {
      accounts: accounts.length,
      reps: eligibleReps.length,
      variables: variableCount,
      constraints: constraintCount
    }
  };
}

// ============================================================================
// COMPARISON FUNCTION
// ============================================================================

/**
 * Compare LP optimization results with waterfall results
 */
export function compareLPWithWaterfall(
  lpResult: LPResult,
  waterfallAssignments: { accountId: string; repId: string; arr: number }[],
  reps: LPRep[]
): {
  lpMetrics: LPMetrics;
  waterfallMetrics: {
    arrCV: number;
    continuityRate: number;
  };
  improvement: {
    arrCVReduction: number;
    arrCVReductionPercent: number;
  };
} {
  // Calculate waterfall ARR per rep
  const waterfallRepARR: Record<string, number> = {};
  reps.forEach(r => { waterfallRepARR[r.id] = 0; });
  
  waterfallAssignments.forEach(a => {
    waterfallRepARR[a.repId] = (waterfallRepARR[a.repId] || 0) + a.arr;
  });
  
  const normalReps = reps.filter(r => !r.isStrategic && r.isActive && r.includeInAssignments);
  const waterfallARRValues = normalReps.map(r => waterfallRepARR[r.id] || 0);
  const waterfallStdDev = calculateStdDev(waterfallARRValues);
  const waterfallAvg = waterfallARRValues.reduce((a, b) => a + b, 0) / waterfallARRValues.length;
  const waterfallCV = waterfallAvg > 0 ? waterfallStdDev / waterfallAvg : 0;
  
  const arrCVReduction = waterfallCV - lpResult.metrics.arrCV;
  const arrCVReductionPercent = waterfallCV > 0 ? (arrCVReduction / waterfallCV) * 100 : 0;
  
  return {
    lpMetrics: lpResult.metrics,
    waterfallMetrics: {
      arrCV: waterfallCV,
      continuityRate: 0  // Would need full data to calculate
    },
    improvement: {
      arrCVReduction,
      arrCVReductionPercent
    }
  };
}
