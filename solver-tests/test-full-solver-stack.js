/**
 * Test: Full Solver Stack
 * 
 * Tests the complete HiGHS → GLPK fallback chain
 * Simulates what happens in the browser
 * 
 * Run with: node test-full-solver-stack.js
 */

import highsLoader from 'highs';
import glpkLoader from 'glpk.js';

let highs = null;
let glpk = null;
let consecutiveHiGHSFailures = 0;
const MAX_HIGHS_FAILURES = 2;

async function initSolvers() {
  console.log('Loading solvers...');
  
  try {
    highs = await highsLoader();
    console.log('  HiGHS: loaded');
  } catch (err) {
    console.log('  HiGHS: FAILED -', err.message);
  }
  
  try {
    glpk = await glpkLoader();
    console.log('  GLPK: loaded');
  } catch (err) {
    console.log('  GLPK: FAILED -', err.message);
  }
}

async function solveWithHiGHS(lp) {
  if (!highs) throw new Error('HiGHS not loaded');
  
  try {
    const result = highs.solve(lp, {
      presolve: 'on',
      time_limit: 60,
      mip_rel_gap: 0.01
    });
    return { success: true, solver: 'highs', status: result.Status, obj: result.ObjectiveValue };
  } catch (err) {
    throw err;
  }
}

async function solveWithGLPK(accounts, reps) {
  if (!glpk) throw new Error('GLPK not loaded');
  
  const problem = buildGLPKProblem(accounts, reps);
  const result = await glpk.solve(problem, {
    msglev: glpk.GLP_MSG_OFF,
    presol: true,
    tmlim: 300
  });
  
  return {
    success: true,
    solver: 'glpk',
    status: result.result.status === 5 ? 'Optimal' : result.result.status === 2 ? 'Feasible' : 'Other',
    obj: result.result.z
  };
}

async function solveProblem(accounts, reps) {
  const lp = buildLP(accounts, reps);
  const startTime = Date.now();
  
  // Skip HiGHS if it has failed too many times
  if (consecutiveHiGHSFailures < MAX_HIGHS_FAILURES && highs) {
    try {
      const result = await solveWithHiGHS(lp);
      consecutiveHiGHSFailures = 0;
      return { ...result, time: Date.now() - startTime };
    } catch (err) {
      console.log(`    [HiGHS crashed: ${err.message.substring(0, 40)}... falling back to GLPK]`);
      consecutiveHiGHSFailures++;
      
      // Reload HiGHS for next attempt
      try {
        highs = await highsLoader();
      } catch (e) {
        highs = null;
      }
    }
  } else if (consecutiveHiGHSFailures >= MAX_HIGHS_FAILURES) {
    console.log(`    [Skipping HiGHS after ${consecutiveHiGHSFailures} failures, using GLPK directly]`);
  }
  
  // Fallback to GLPK
  try {
    const result = await solveWithGLPK(accounts, reps);
    return { ...result, time: Date.now() - startTime };
  } catch (err) {
    return { success: false, error: err.message, time: Date.now() - startTime };
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('Full Solver Stack Test');
  console.log('='.repeat(60));
  
  await initSolvers();
  console.log('');
  
  const tests = [
    [10, 5, 'Small'],
    [12, 5, 'HiGHS fails here'],
    [20, 8, 'Medium'],
    [34, 8, 'Real problem size'],
    [50, 10, 'Production-like'],
    [100, 15, 'Large'],
  ];
  
  const results = [];
  
  for (const [accounts, reps, desc] of tests) {
    console.log(`\n${desc} (${accounts}×${reps} = ${accounts * reps} vars):`);
    const result = await solveProblem(accounts, reps);
    
    if (result.success) {
      console.log(`  ✓ ${result.solver}: ${result.status} (obj=${result.obj?.toFixed(2)}, ${result.time}ms)`);
    } else {
      console.log(`  ✗ FAILED: ${result.error}`);
    }
    
    results.push({ desc, accounts, reps, ...result });
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  
  let passCount = 0;
  for (const r of results) {
    if (r.success) {
      passCount++;
      console.log(`✓ ${r.desc}: ${r.solver} → ${r.status} (${r.time}ms)`);
    } else {
      console.log(`✗ ${r.desc}: FAILED - ${r.error}`);
    }
  }
  
  console.log(`\nPassed: ${passCount}/${results.length}`);
}

function buildLP(accounts, reps) {
  const lines = [];
  const arrTarget = 150000;
  
  lines.push('Maximize');
  let obj = ' obj:';
  for (let a = 0; a < accounts; a++) {
    for (let r = 0; r < reps; r++) {
      obj += ` + 0.5 x${a}_${r}`;
    }
  }
  for (let r = 0; r < reps; r++) {
    obj += ` - 0.000001 ao${r} - 0.000001 au${r}`;
    obj += ` - 0.0001 bo${r} - 0.0001 bu${r}`;
    obj += ` - 0.01 mo${r} - 0.01 mu${r}`;
  }
  lines.push(obj);
  
  lines.push('Subject To');
  for (let a = 0; a < accounts; a++) {
    let c = ` a${a}:`;
    for (let r = 0; r < reps; r++) c += ` + 1 x${a}_${r}`;
    lines.push(c + ' = 1');
  }
  for (let r = 0; r < reps; r++) {
    let c = ` b${r}:`;
    for (let a = 0; a < accounts; a++) c += ` + 50000 x${a}_${r}`;
    c += ` - 1 ao${r} + 1 au${r} - 1 bo${r} + 1 bu${r} - 1 mo${r} + 1 mu${r} = ${arrTarget}`;
    lines.push(c);
  }
  
  lines.push('Bounds');
  for (let r = 0; r < reps; r++) {
    lines.push(` 0 <= ao${r} <= 15000`);
    lines.push(` 0 <= au${r} <= 15000`);
    lines.push(` 0 <= bo${r} <= 45000`);
    lines.push(` 0 <= bu${r} <= 45000`);
    lines.push(` mo${r} >= 0`);
    lines.push(` mu${r} >= 0`);
  }
  
  lines.push('Binary');
  for (let a = 0; a < accounts; a++) {
    for (let r = 0; r < reps; r++) lines.push(` x${a}_${r}`);
  }
  
  lines.push('End');
  return lines.join('\n');
}

function buildGLPKProblem(accounts, reps) {
  const arrTarget = 150000;
  
  const vars = [];
  for (let a = 0; a < accounts; a++) {
    for (let r = 0; r < reps; r++) {
      vars.push({ name: `x${a}_${r}`, coef: 0.5 });
    }
  }
  for (let r = 0; r < reps; r++) {
    vars.push({ name: `ao${r}`, coef: -0.000001 });
    vars.push({ name: `au${r}`, coef: -0.000001 });
    vars.push({ name: `bo${r}`, coef: -0.0001 });
    vars.push({ name: `bu${r}`, coef: -0.0001 });
    vars.push({ name: `mo${r}`, coef: -0.01 });
    vars.push({ name: `mu${r}`, coef: -0.01 });
  }
  
  const constraints = [];
  for (let a = 0; a < accounts; a++) {
    const cvars = [];
    for (let r = 0; r < reps; r++) {
      cvars.push({ name: `x${a}_${r}`, coef: 1 });
    }
    constraints.push({
      name: `a${a}`,
      vars: cvars,
      bnds: { type: glpk.GLP_FX, lb: 1, ub: 1 }
    });
  }
  for (let r = 0; r < reps; r++) {
    const cvars = [];
    for (let a = 0; a < accounts; a++) {
      cvars.push({ name: `x${a}_${r}`, coef: 50000 });
    }
    cvars.push({ name: `ao${r}`, coef: -1 });
    cvars.push({ name: `au${r}`, coef: 1 });
    cvars.push({ name: `bo${r}`, coef: -1 });
    cvars.push({ name: `bu${r}`, coef: 1 });
    cvars.push({ name: `mo${r}`, coef: -1 });
    cvars.push({ name: `mu${r}`, coef: 1 });
    constraints.push({
      name: `b${r}`,
      vars: cvars,
      bnds: { type: glpk.GLP_FX, lb: arrTarget, ub: arrTarget }
    });
  }
  
  const binaries = [];
  for (let a = 0; a < accounts; a++) {
    for (let r = 0; r < reps; r++) {
      binaries.push(`x${a}_${r}`);
    }
  }
  
  const bounds = [];
  for (let r = 0; r < reps; r++) {
    bounds.push({ name: `ao${r}`, type: glpk.GLP_DB, lb: 0, ub: 15000 });
    bounds.push({ name: `au${r}`, type: glpk.GLP_DB, lb: 0, ub: 15000 });
    bounds.push({ name: `bo${r}`, type: glpk.GLP_DB, lb: 0, ub: 45000 });
    bounds.push({ name: `bu${r}`, type: glpk.GLP_DB, lb: 0, ub: 45000 });
    bounds.push({ name: `mo${r}`, type: glpk.GLP_LO, lb: 0, ub: Infinity });
    bounds.push({ name: `mu${r}`, type: glpk.GLP_LO, lb: 0, ub: Infinity });
  }
  
  return {
    name: 'LP',
    objective: { direction: glpk.GLP_MAX, name: 'obj', vars },
    subjectTo: constraints,
    binaries,
    bounds
  };
}

runTests().catch(console.error);

