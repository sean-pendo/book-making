/**
 * Test the NORMALIZED LP structure fix
 * 
 * This verifies that normalizing all balance constraints to 0-1 scale
 * provides numerical stability for HiGHS.
 */

import highs from 'highs';

const highsLoader = highs.default || highs;

/**
 * Build LP with NORMALIZED constraints (the fix)
 * All values are scaled so coefficients stay in 0-2 range
 */
function buildNormalizedLP(numAccounts, numReps) {
  const lines = [];
  const binaries = [];
  const objectiveTerms = [];
  
  // Simulate realistic ARR values (but we'll normalize them)
  const accountARRs = [];
  for (let a = 0; a < numAccounts; a++) {
    accountARRs.push(50000 + Math.random() * 200000);  // 50k-250k per account
  }
  const totalARR = accountARRs.reduce((s, v) => s + v, 0);
  const targetARR = totalARR / numReps;
  const variance = 0.10;
  
  console.log(`  Target ARR: ${(targetARR / 1000).toFixed(0)}k per rep`);
  
  lines.push('Maximize');
  lines.push(' obj:');
  
  // Assignment variables with normal scores (0.1-1.0)
  for (let a = 0; a < numAccounts; a++) {
    for (let r = 0; r < numReps; r++) {
      const varName = `x${a}_${r}`;
      const score = 0.1 + Math.random() * 0.9;  // 0.1-1.0
      objectiveTerms.push(`+ ${score.toFixed(6)} ${varName}`);
      binaries.push(varName);
    }
  }
  
  // NORMALIZED penalty slack variables (the fix!)
  // Penalties are in 0.001-0.1 range, not 1e-8 range
  const alphaPenalty = 0.001 * 0.5;  // ~0.0005
  const betaPenalty = 0.01 * 0.5;    // ~0.005
  const bigMPenalty = 0.1 * 0.5;     // ~0.05
  
  for (let r = 0; r < numReps; r++) {
    objectiveTerms.push(`- ${alphaPenalty.toFixed(6)} so${r}`);
    objectiveTerms.push(`- ${alphaPenalty.toFixed(6)} su${r}`);
    objectiveTerms.push(`- ${betaPenalty.toFixed(6)} bo${r}`);
    objectiveTerms.push(`- ${betaPenalty.toFixed(6)} bu${r}`);
    objectiveTerms.push(`- ${bigMPenalty.toFixed(6)} mo${r}`);
    objectiveTerms.push(`- ${bigMPenalty.toFixed(6)} mu${r}`);
  }
  
  // Format objective with line breaks
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
  
  // Assignment: each account to exactly one rep
  for (let a = 0; a < numAccounts; a++) {
    const terms = [];
    for (let r = 0; r < numReps; r++) {
      terms.push(`+ 1 x${a}_${r}`);
    }
    lines.push(` c${cIdx++}: ${terms.join(' ')} = 1`);
  }
  
  // NORMALIZED balance constraints: coefficients in 0-2 range
  for (let r = 0; r < numReps; r++) {
    const terms = [];
    for (let a = 0; a < numAccounts; a++) {
      const normalizedCoef = accountARRs[a] / targetARR;  // Typically 0.1-0.5
      terms.push(`+ ${normalizedCoef.toFixed(6)} x${a}_${r}`);
    }
    
    // Slack coefficients are always 1 (normalized scale)
    lines.push(` c${cIdx++}: ${terms.join(' ')} - 1 so${r} + 1 su${r} - 1 bo${r} + 1 bu${r} - 1 mo${r} + 1 mu${r} = 1`);
  }
  
  // Bounds (all normalized to 0-1 scale)
  lines.push('Bounds');
  for (let r = 0; r < numReps; r++) {
    lines.push(` 0 <= so${r} <= ${variance}`);    // 0.1 = 10% variance
    lines.push(` 0 <= su${r} <= ${variance}`);
    lines.push(` 0 <= bo${r} <= 0.5`);            // 50% buffer
    lines.push(` 0 <= bu${r} <= 0.5`);
    lines.push(` mo${r} >= 0`);
    lines.push(` mu${r} >= 0`);
  }
  
  lines.push('Binary');
  for (const v of binaries) {
    lines.push(` ${v}`);
  }
  
  lines.push('End');
  
  return lines.join('\n');
}

/**
 * Build LP with OLD (broken) coefficients for comparison
 * Uses tiny coefficients like 1e-8
 */
function buildOldStyleLP(numAccounts, numReps) {
  const lines = [];
  const binaries = [];
  const objectiveTerms = [];
  
  const accountARRs = [];
  for (let a = 0; a < numAccounts; a++) {
    accountARRs.push(50000 + Math.random() * 200000);
  }
  const totalARR = accountARRs.reduce((s, v) => s + v, 0);
  const targetARR = totalARR / numReps;
  const variance = 0.10;
  
  lines.push('Maximize');
  lines.push(' obj:');
  
  // Assignment variables
  for (let a = 0; a < numAccounts; a++) {
    for (let r = 0; r < numReps; r++) {
      const varName = `x${a}_${r}`;
      const score = 0.1 + Math.random() * 0.9;
      objectiveTerms.push(`+ ${score.toFixed(6)} ${varName}`);
      binaries.push(varName);
    }
  }
  
  // OLD STYLE: Tiny penalty coefficients (divided by targetARR ~500k)
  const alphaPenalty = 0.01 * 0.5 / targetARR;  // ~1e-8
  const betaPenalty = 1.0 * 0.5 / targetARR;    // ~1e-6
  const bigMPenalty = 1000 * 0.5 / targetARR;   // ~0.001
  
  console.log(`  OLD penalties: alpha=${alphaPenalty.toExponential(2)}, beta=${betaPenalty.toExponential(2)}, bigM=${bigMPenalty.toExponential(2)}`);
  
  for (let r = 0; r < numReps; r++) {
    objectiveTerms.push(`- ${alphaPenalty.toFixed(12)} so${r}`);
    objectiveTerms.push(`- ${alphaPenalty.toFixed(12)} su${r}`);
    objectiveTerms.push(`- ${betaPenalty.toFixed(12)} bo${r}`);
    objectiveTerms.push(`- ${betaPenalty.toFixed(12)} bu${r}`);
    objectiveTerms.push(`- ${bigMPenalty.toFixed(12)} mo${r}`);
    objectiveTerms.push(`- ${bigMPenalty.toFixed(12)} mu${r}`);
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
  
  lines.push('Subject To');
  let cIdx = 0;
  
  for (let a = 0; a < numAccounts; a++) {
    const terms = [];
    for (let r = 0; r < numReps; r++) {
      terms.push(`+ 1 x${a}_${r}`);
    }
    lines.push(` c${cIdx++}: ${terms.join(' ')} = 1`);
  }
  
  // OLD STYLE: Raw ARR values in constraints (500k range)
  for (let r = 0; r < numReps; r++) {
    const terms = [];
    for (let a = 0; a < numAccounts; a++) {
      terms.push(`+ ${accountARRs[a].toFixed(2)} x${a}_${r}`);
    }
    // RHS is targetARR (500k range)
    lines.push(` c${cIdx++}: ${terms.join(' ')} - 1 so${r} + 1 su${r} - 1 bo${r} + 1 bu${r} - 1 mo${r} + 1 mu${r} = ${targetARR.toFixed(2)}`);
  }
  
  lines.push('Bounds');
  const prefMin = targetARR * (1 - variance);
  const prefMax = targetARR * (1 + variance);
  
  for (let r = 0; r < numReps; r++) {
    // OLD: Bounds in raw ARR scale (50k range)
    lines.push(` 0 <= so${r} <= ${prefMax - targetARR}`);
    lines.push(` 0 <= su${r} <= ${targetARR - prefMin}`);
    lines.push(` 0 <= bo${r} <= ${1000000 - prefMax}`);
    lines.push(` 0 <= bu${r} <= ${prefMin}`);
    lines.push(` mo${r} >= 0`);
    lines.push(` mu${r} >= 0`);
  }
  
  lines.push('Binary');
  for (const v of binaries) {
    lines.push(` ${v}`);
  }
  
  lines.push('End');
  
  return lines.join('\n');
}

async function runTests() {
  console.log('============================================================');
  console.log('NORMALIZED LP Test (Numerical Stability Fix)');
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
    { name: 'Small', accounts: 10, reps: 5 },
    { name: 'Medium', accounts: 20, reps: 8 },
    { name: 'Production-like', accounts: 34, reps: 8 },
    { name: 'Large', accounts: 50, reps: 10 },
  ];
  
  const results = { normalized: [], old: [] };
  
  for (const tc of testCases) {
    console.log(`\n--- ${tc.name} (${tc.accounts}×${tc.reps} = ${tc.accounts * tc.reps} vars) ---`);
    
    // Test NORMALIZED (the fix)
    try {
      const lp = buildNormalizedLP(tc.accounts, tc.reps);
      const t = Date.now();
      const sol = highs.solve(lp);
      const time = Date.now() - t;
      console.log(`  NORMALIZED: ${sol.Status} (${time}ms, obj=${sol.ObjectiveValue?.toFixed(2)})`);
      results.normalized.push({ name: tc.name, status: sol.Status, time });
    } catch (err) {
      console.log(`  NORMALIZED: CRASHED - ${err.message.substring(0, 60)}`);
      results.normalized.push({ name: tc.name, status: 'CRASHED', error: err.message });
    }
    
    // Test OLD (for comparison)
    try {
      const lp = buildOldStyleLP(tc.accounts, tc.reps);
      const t = Date.now();
      const sol = highs.solve(lp);
      const time = Date.now() - t;
      console.log(`  OLD STYLE:  ${sol.Status} (${time}ms, obj=${sol.ObjectiveValue?.toFixed(2)})`);
      results.old.push({ name: tc.name, status: sol.Status, time });
    } catch (err) {
      console.log(`  OLD STYLE:  CRASHED - ${err.message.substring(0, 60)}`);
      results.old.push({ name: tc.name, status: 'CRASHED', error: err.message });
    }
  }
  
  // Summary
  console.log('\n============================================================');
  console.log('SUMMARY');
  console.log('============================================================');
  
  const normalizedPasses = results.normalized.filter(r => r.status === 'Optimal').length;
  const oldPasses = results.old.filter(r => r.status === 'Optimal').length;
  
  console.log(`\nNORMALIZED (fixed): ${normalizedPasses}/${testCases.length} passed`);
  console.log(`OLD STYLE:          ${oldPasses}/${testCases.length} passed`);
  
  if (normalizedPasses > oldPasses) {
    console.log('\n✅ NORMALIZED approach is more stable!');
  } else if (normalizedPasses === oldPasses) {
    console.log('\nBoth approaches perform similarly in Node.js.');
    console.log('The difference may be more pronounced in browser WASM.');
  } else {
    console.log('\n⚠️ Unexpected: OLD approach performed better.');
  }
}

runTests().catch(console.error);




