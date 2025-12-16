/**
 * Compare LP structures: Waterfall (works) vs Global Optimization (fails)
 * 
 * This test identifies what makes the global optimization LP crash HiGHS
 * while the waterfall LP works fine.
 */

import highs from 'highs';

const highsLoader = highs.default || highs;

// ==================================================================
// WATERFALL-STYLE LP (WORKS)
// - Simple objective (just assignment scores)
// - Simple constraints (assignment ≤ 1, capacity)
// - No Big-M penalty slacks
// ==================================================================
function buildWaterfallLP(numAccounts, numReps) {
  const lines = [];
  const binaries = [];
  const objectiveTerms = [];
  
  lines.push('Maximize');
  lines.push(' obj:');
  
  // Variables: x_a_r for each account-rep pair
  for (let a = 0; a < numAccounts; a++) {
    for (let r = 0; r < numReps; r++) {
      const varName = `x_a${a}_r${r}`;
      // Score: simple balance + continuity bonus
      const score = 10 + Math.random() * 90;  // 10-100
      objectiveTerms.push(`${score.toFixed(2)} ${varName}`);
      binaries.push(varName);
    }
  }
  
  lines.push('    ' + objectiveTerms.join(' + '));
  
  // Constraints
  lines.push('Subject To');
  
  // Each account assigned to at most one rep
  for (let a = 0; a < numAccounts; a++) {
    const terms = [];
    for (let r = 0; r < numReps; r++) {
      terms.push(`x_a${a}_r${r}`);
    }
    lines.push(` assign_a${a}: ${terms.join(' + ')} <= 1`);
  }
  
  // Rep capacity constraints (simplified)
  for (let r = 0; r < numReps; r++) {
    const terms = [];
    for (let a = 0; a < numAccounts; a++) {
      const arr = 10000 + Math.random() * 50000;  // 10k-60k per account
      terms.push(`${arr.toFixed(0)} x_a${a}_r${r}`);
    }
    // Max capacity ~500k per rep
    lines.push(` cap_r${r}: ${terms.join(' + ')} <= 500000`);
  }
  
  // Bounds
  lines.push('Bounds');
  for (const varName of binaries) {
    lines.push(` 0 <= ${varName} <= 1`);
  }
  
  lines.push('Binary');
  lines.push(' ' + binaries.join(' '));
  lines.push('End');
  
  return lines.join('\n');
}

// ==================================================================
// GLOBAL OPTIMIZATION-STYLE LP (FAILS)
// - Complex objective (scores + penalty slacks)
// - Complex constraints (assignment = 1, capacity, balance with slacks)
// - Big-M penalty slacks (alpha, beta, bigM)
// ==================================================================
function buildGlobalLP(numAccounts, numReps) {
  const lines = [];
  const binaries = [];
  const objectiveTerms = [];
  const slacks = [];
  
  lines.push('Maximize');
  lines.push(' obj:');
  
  // Assignment variables
  for (let a = 0; a < numAccounts; a++) {
    for (let r = 0; r < numReps; r++) {
      const varName = `x${a}_${r}`;
      const score = 10 + Math.random() * 90;
      objectiveTerms.push(`+ ${score.toFixed(6)} ${varName}`);
      binaries.push(varName);
    }
  }
  
  // Balance penalty slack variables (this is what makes it different!)
  // Three-tier penalty: alpha, beta, bigM
  const target = 500000;
  const variance = 0.1;  // 10%
  const normFactor = target;
  
  for (let r = 0; r < numReps; r++) {
    // ARR balance slacks
    const alphaOver = `so${r}`;
    const alphaUnder = `su${r}`;
    const betaOver = `bo${r}`;
    const betaUnder = `bu${r}`;
    const bigMOver = `mo${r}`;
    const bigMUnder = `mu${r}`;
    
    slacks.push(alphaOver, alphaUnder, betaOver, betaUnder, bigMOver, bigMUnder);
    
    // Penalty coefficients (negative because maximizing)
    const alphaPenalty = -0.01 / normFactor;
    const betaPenalty = -1.0 / normFactor;
    const bigMPenalty = -1000.0 / normFactor;
    
    objectiveTerms.push(`${alphaPenalty.toFixed(10)} ${alphaOver}`);
    objectiveTerms.push(`${alphaPenalty.toFixed(10)} ${alphaUnder}`);
    objectiveTerms.push(`${betaPenalty.toFixed(10)} ${betaOver}`);
    objectiveTerms.push(`${betaPenalty.toFixed(10)} ${betaUnder}`);
    objectiveTerms.push(`${bigMPenalty.toFixed(10)} ${bigMOver}`);
    objectiveTerms.push(`${bigMPenalty.toFixed(10)} ${bigMUnder}`);
  }
  
  // Join objective terms with line breaks (like highsWrapper does)
  let currentLine = '';
  for (const term of objectiveTerms) {
    if (currentLine.length + term.length > 200) {
      lines.push(' ' + currentLine);
      currentLine = term;
    } else {
      currentLine += ' ' + term;
    }
  }
  if (currentLine) lines.push(' ' + currentLine);
  
  // Constraints
  lines.push('Subject To');
  let cIdx = 0;
  
  // Each account assigned to exactly one rep (= 1, not <= 1)
  for (let a = 0; a < numAccounts; a++) {
    const terms = [];
    for (let r = 0; r < numReps; r++) {
      terms.push(`+ 1.000000 x${a}_${r}`);
    }
    lines.push(` c${cIdx++}: ${terms.join(' ')} = 1.000000`);
  }
  
  // Balance constraints with slack variables
  for (let r = 0; r < numReps; r++) {
    const terms = [];
    for (let a = 0; a < numAccounts; a++) {
      const arr = (10000 + Math.random() * 50000) / normFactor;  // Normalized
      terms.push(`+ ${arr.toFixed(6)} x${a}_${r}`);
    }
    
    // balance: sum(arr * x) - slacks = target (normalized to 1.0)
    const alphaOver = `so${r}`;
    const alphaUnder = `su${r}`;
    const betaOver = `bo${r}`;
    const betaUnder = `bu${r}`;
    const bigMOver = `mo${r}`;
    const bigMUnder = `mu${r}`;
    
    // ARR = target + alpha_over - alpha_under + beta_over - beta_under + bigM_over - bigM_under
    lines.push(` c${cIdx++}: ${terms.join(' ')} - 1.000000 ${alphaOver} + 1.000000 ${alphaUnder} - 1.000000 ${betaOver} + 1.000000 ${betaUnder} - 1.000000 ${bigMOver} + 1.000000 ${bigMUnder} = 1.000000`);
  }
  
  // Bounds
  lines.push('Bounds');
  
  // Slack bounds (alpha/beta have upper bounds, bigM is unbounded)
  for (let r = 0; r < numReps; r++) {
    const alphaOverBound = variance;  // 0.1
    const alphaUnderBound = variance;
    const betaOverBound = 0.5;  // 50% buffer
    const betaUnderBound = 0.5;
    
    lines.push(` 0 <= so${r} <= ${alphaOverBound}`);
    lines.push(` 0 <= su${r} <= ${alphaUnderBound}`);
    lines.push(` 0 <= bo${r} <= ${betaOverBound}`);
    lines.push(` 0 <= bu${r} <= ${betaUnderBound}`);
    lines.push(` mo${r} >= 0`);
    lines.push(` mu${r} >= 0`);
  }
  
  // Binary variables
  lines.push('Binary');
  for (const varName of binaries) {
    lines.push(` ${varName}`);
  }
  
  lines.push('End');
  
  return lines.join('\n');
}

// ==================================================================
// SIMPLIFIED GLOBAL LP (without Big-M, more like waterfall)
// ==================================================================
function buildSimplifiedGlobalLP(numAccounts, numReps) {
  const lines = [];
  const binaries = [];
  const objectiveTerms = [];
  
  lines.push('Maximize');
  lines.push(' obj:');
  
  // Just assignment variables, no slacks
  for (let a = 0; a < numAccounts; a++) {
    for (let r = 0; r < numReps; r++) {
      const varName = `x${a}_${r}`;
      const score = 10 + Math.random() * 90;
      objectiveTerms.push(`+ ${score.toFixed(6)} ${varName}`);
      binaries.push(varName);
    }
  }
  
  let currentLine = '';
  for (const term of objectiveTerms) {
    if (currentLine.length + term.length > 200) {
      lines.push(' ' + currentLine);
      currentLine = term;
    } else {
      currentLine += ' ' + term;
    }
  }
  if (currentLine) lines.push(' ' + currentLine);
  
  // Constraints
  lines.push('Subject To');
  let cIdx = 0;
  
  // Each account assigned to exactly one rep
  for (let a = 0; a < numAccounts; a++) {
    const terms = [];
    for (let r = 0; r < numReps; r++) {
      terms.push(`+ 1.000000 x${a}_${r}`);
    }
    lines.push(` c${cIdx++}: ${terms.join(' ')} = 1.000000`);
  }
  
  // Capacity constraints only (no balance slacks)
  for (let r = 0; r < numReps; r++) {
    const terms = [];
    for (let a = 0; a < numAccounts; a++) {
      const arr = 10000 + Math.random() * 50000;
      terms.push(`+ ${arr.toFixed(6)} x${a}_${r}`);
    }
    lines.push(` c${cIdx++}: ${terms.join(' ')} <= 500000.000000`);
  }
  
  // Bounds
  lines.push('Bounds');
  
  // Binary variables
  lines.push('Binary');
  for (const varName of binaries) {
    lines.push(` ${varName}`);
  }
  
  lines.push('End');
  
  return lines.join('\n');
}

// ==================================================================
// TEST RUNNER
// ==================================================================
async function runTests() {
  console.log('============================================================');
  console.log('LP Structure Comparison Test');
  console.log('============================================================\n');
  
  let highs;
  try {
    highs = await highsLoader();
    console.log('✓ HiGHS loaded\n');
  } catch (err) {
    console.error('✗ Failed to load HiGHS:', err.message);
    return;
  }
  
  const testCases = [
    { name: 'Small (5×3)', accounts: 5, reps: 3 },
    { name: 'Medium (10×5)', accounts: 10, reps: 5 },
    { name: 'Real-ish (20×8)', accounts: 20, reps: 8 },
    { name: 'Production-like (34×8)', accounts: 34, reps: 8 },
  ];
  
  const results = [];
  
  for (const tc of testCases) {
    console.log(`\n--- ${tc.name} (${tc.accounts}×${tc.reps} = ${tc.accounts * tc.reps} binary vars) ---`);
    
    // Test 1: Waterfall-style
    try {
      const waterfallLp = buildWaterfallLP(tc.accounts, tc.reps);
      const t1 = Date.now();
      const sol1 = highs.solve(waterfallLp);
      const time1 = Date.now() - t1;
      console.log(`  Waterfall-style: ${sol1.Status} (${time1}ms)`);
      results.push({ test: tc.name, type: 'Waterfall', status: sol1.Status, time: time1 });
    } catch (err) {
      console.log(`  Waterfall-style: CRASHED - ${err.message}`);
      results.push({ test: tc.name, type: 'Waterfall', status: 'CRASHED', error: err.message });
    }
    
    // Test 2: Global-style with Big-M slacks
    try {
      const globalLp = buildGlobalLP(tc.accounts, tc.reps);
      const t2 = Date.now();
      const sol2 = highs.solve(globalLp);
      const time2 = Date.now() - t2;
      console.log(`  Global + Big-M:  ${sol2.Status} (${time2}ms)`);
      results.push({ test: tc.name, type: 'Global+BigM', status: sol2.Status, time: time2 });
    } catch (err) {
      console.log(`  Global + Big-M:  CRASHED - ${err.message}`);
      results.push({ test: tc.name, type: 'Global+BigM', status: 'CRASHED', error: err.message });
    }
    
    // Test 3: Simplified global (no Big-M)
    try {
      const simplifiedLp = buildSimplifiedGlobalLP(tc.accounts, tc.reps);
      const t3 = Date.now();
      const sol3 = highs.solve(simplifiedLp);
      const time3 = Date.now() - t3;
      console.log(`  Simplified:      ${sol3.Status} (${time3}ms)`);
      results.push({ test: tc.name, type: 'Simplified', status: sol3.Status, time: time3 });
    } catch (err) {
      console.log(`  Simplified:      CRASHED - ${err.message}`);
      results.push({ test: tc.name, type: 'Simplified', status: 'CRASHED', error: err.message });
    }
  }
  
  // Summary
  console.log('\n============================================================');
  console.log('SUMMARY');
  console.log('============================================================');
  
  const waterfallResults = results.filter(r => r.type === 'Waterfall');
  const bigMResults = results.filter(r => r.type === 'Global+BigM');
  const simplifiedResults = results.filter(r => r.type === 'Simplified');
  
  console.log('\nWaterfall-style (no slacks):');
  for (const r of waterfallResults) {
    console.log(`  ${r.test}: ${r.status} ${r.time ? `(${r.time}ms)` : ''}`);
  }
  
  console.log('\nGlobal + Big-M slacks:');
  for (const r of bigMResults) {
    console.log(`  ${r.test}: ${r.status} ${r.time ? `(${r.time}ms)` : ''}`);
  }
  
  console.log('\nSimplified (no Big-M):');
  for (const r of simplifiedResults) {
    console.log(`  ${r.test}: ${r.status} ${r.time ? `(${r.time}ms)` : ''}`);
  }
  
  // Conclusion
  const bigMCrashes = bigMResults.filter(r => r.status === 'CRASHED').length;
  const waterfallCrashes = waterfallResults.filter(r => r.status === 'CRASHED').length;
  
  console.log('\n============================================================');
  console.log('CONCLUSION');
  console.log('============================================================');
  
  if (bigMCrashes > waterfallCrashes) {
    console.log('\n🔍 Big-M slack variables are likely causing HiGHS crashes!');
    console.log('   The penalty coefficients (e.g., -0.000002) may cause numerical issues.');
    console.log('   Consider removing Big-M penalties or using simpler balance constraints.');
  } else {
    console.log('\n🔍 Both structures seem to behave similarly.');
    console.log('   The issue may be problem size rather than structure.');
  }
}

runTests().catch(console.error);

