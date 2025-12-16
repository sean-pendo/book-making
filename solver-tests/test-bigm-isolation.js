/**
 * Isolate what causes HiGHS Big-M crash
 */

import highsLoader from 'highs';

async function runTests() {
  console.log('Loading HiGHS...');
  const highs = await highsLoader();
  console.log('HiGHS loaded');

  const numAccounts = 34;
  const numReps = 20;
  const arrTarget = 150000;

  // Test A: No balance constraints, no slacks (baseline)
  console.log('\n=== Test A: Assignment only (no balance) ===');
  try {
    const lp = buildLP(numAccounts, numReps, { includeBalance: false, includeSlacks: false });
    console.log(`LP size: ${lp.length} bytes`);
    const result = highs.solve(lp);
    console.log('Status:', result.Status);
    console.log('Test A: PASSED');
  } catch (err) {
    console.error('Test A FAILED:', err.message);
  }

  // Test B: Balance constraints WITHOUT slacks (just hard constraint)
  console.log('\n=== Test B: Balance without slacks ===');
  try {
    const lp = buildLP(numAccounts, numReps, { includeBalance: true, includeSlacks: false });
    console.log(`LP size: ${lp.length} bytes`);
    const result = highs.solve(lp);
    console.log('Status:', result.Status);
    console.log('Test B: PASSED');
  } catch (err) {
    console.error('Test B FAILED:', err.message);
  }

  // Test C: Balance with SIMPLE slacks (just over/under, no tiers)
  console.log('\n=== Test C: Simple slacks (2 per rep) ===');
  try {
    const lp = buildLP(numAccounts, numReps, { includeBalance: true, includeSlacks: true, simplifiedSlacks: true });
    console.log(`LP size: ${lp.length} bytes`);
    const result = highs.solve(lp);
    console.log('Status:', result.Status);
    console.log('Test C: PASSED');
  } catch (err) {
    console.error('Test C FAILED:', err.message);
  }

  // Test D: Balance with Big-M slacks (6 per rep) but LARGER coefficients
  console.log('\n=== Test D: Big-M slacks with LARGER coefficients ===');
  try {
    const lp = buildLP(numAccounts, numReps, { includeBalance: true, includeSlacks: true, simplifiedSlacks: false, largeCoefs: true });
    console.log(`LP size: ${lp.length} bytes`);
    const result = highs.solve(lp);
    console.log('Status:', result.Status);
    console.log('Test D: PASSED');
  } catch (err) {
    console.error('Test D FAILED:', err.message);
  }

  // Test E: Big-M slacks with TINY coefficients (the real issue)
  console.log('\n=== Test E: Big-M slacks with TINY coefficients ===');
  try {
    const lp = buildLP(numAccounts, numReps, { includeBalance: true, includeSlacks: true, simplifiedSlacks: false, largeCoefs: false });
    console.log(`LP size: ${lp.length} bytes`);
    const result = highs.solve(lp);
    console.log('Status:', result.Status);
    console.log('Test E: PASSED');
  } catch (err) {
    console.error('Test E FAILED:', err.message);
  }

  // Test F: Fewer reps (10 instead of 20)
  console.log('\n=== Test F: Smaller problem (10 reps) with Big-M ===');
  try {
    const lp = buildLP(numAccounts, 10, { includeBalance: true, includeSlacks: true, simplifiedSlacks: false, largeCoefs: false });
    console.log(`LP size: ${lp.length} bytes`);
    const result = highs.solve(lp);
    console.log('Status:', result.Status);
    console.log('Test F: PASSED');
  } catch (err) {
    console.error('Test F FAILED:', err.message);
  }

  // Test G: Fewer accounts (17 instead of 34)
  console.log('\n=== Test G: Smaller problem (17 accounts) with Big-M ===');
  try {
    const lp = buildLP(17, numReps, { includeBalance: true, includeSlacks: true, simplifiedSlacks: false, largeCoefs: false });
    console.log(`LP size: ${lp.length} bytes`);
    const result = highs.solve(lp);
    console.log('Status:', result.Status);
    console.log('Test G: PASSED');
  } catch (err) {
    console.error('Test G FAILED:', err.message);
  }

  console.log('\n=== Done ===');
}

function buildLP(numAccounts, numReps, options) {
  const { includeBalance, includeSlacks, simplifiedSlacks, largeCoefs } = options;
  const arrTarget = 150000;

  let lines = ['Maximize'];
  let objTerms = [];

  // Assignment scores
  for (let a = 0; a < numAccounts; a++) {
    for (let r = 0; r < numReps; r++) {
      objTerms.push(`+ ${(Math.random() * 0.5 + 0.5).toFixed(4)} x${a}_${r}`);
    }
  }

  // Slack penalties
  if (includeSlacks) {
    const normFactor = largeCoefs ? 1 : arrTarget;

    for (let r = 0; r < numReps; r++) {
      if (simplifiedSlacks) {
        // Just 2 slacks per rep
        objTerms.push(`- 0.1 so${r}`);
        objTerms.push(`- 0.1 su${r}`);
      } else {
        // Full Big-M (6 slacks per rep)
        const alphaCoef = -(0.01 * 0.5 / normFactor);
        const betaCoef = -(1.0 * 0.5 / normFactor);
        const bigMCoef = -(1000 * 0.5 / normFactor);

        objTerms.push(`${alphaCoef.toFixed(10)} ao${r}`);
        objTerms.push(`${alphaCoef.toFixed(10)} au${r}`);
        objTerms.push(`${betaCoef.toFixed(10)} bo${r}`);
        objTerms.push(`${betaCoef.toFixed(10)} bu${r}`);
        objTerms.push(`${bigMCoef.toFixed(10)} mo${r}`);
        objTerms.push(`${bigMCoef.toFixed(10)} mu${r}`);
      }
    }
  }

  // Split objective across lines
  lines.push(' obj: ' + objTerms.slice(0, 50).join(' '));
  for (let i = 50; i < objTerms.length; i += 100) {
    lines.push(' ' + objTerms.slice(i, i + 100).join(' '));
  }

  lines.push('Subject To');

  // Assignment constraints
  for (let a = 0; a < numAccounts; a++) {
    let terms = [];
    for (let r = 0; r < numReps; r++) {
      terms.push(`+ 1 x${a}_${r}`);
    }
    lines.push(` a${a}: ${terms.join(' ')} = 1`);
  }

  // Balance constraints
  if (includeBalance) {
    for (let r = 0; r < numReps; r++) {
      let terms = [];
      for (let a = 0; a < numAccounts; a++) {
        const arr = Math.floor(Math.random() * 200000 + 50000);
        terms.push(`+ ${arr} x${a}_${r}`);
      }

      if (includeSlacks) {
        if (simplifiedSlacks) {
          terms.push(`- 1 so${r} + 1 su${r}`);
        } else {
          terms.push(`- 1 ao${r} + 1 au${r} - 1 bo${r} + 1 bu${r} - 1 mo${r} + 1 mu${r}`);
        }
      }

      lines.push(` bal${r}: ${terms.join(' ')} = ${arrTarget}`);
    }
  }

  lines.push('Bounds');

  // Slack bounds
  if (includeSlacks) {
    for (let r = 0; r < numReps; r++) {
      if (simplifiedSlacks) {
        lines.push(` so${r} >= 0`);
        lines.push(` su${r} >= 0`);
      } else {
        lines.push(` 0 <= ao${r} <= ${arrTarget * 0.1}`);
        lines.push(` 0 <= au${r} <= ${arrTarget * 0.1}`);
        lines.push(` 0 <= bo${r} <= ${arrTarget * 0.5}`);
        lines.push(` 0 <= bu${r} <= ${arrTarget * 0.5}`);
        lines.push(` mo${r} >= 0`);
        lines.push(` mu${r} >= 0`);
      }
    }
  }

  lines.push('Binary');
  for (let a = 0; a < numAccounts; a++) {
    for (let r = 0; r < numReps; r++) {
      lines.push(` x${a}_${r}`);
    }
  }

  lines.push('End');
  return lines.join('\n');
}

runTests().catch(console.error);
