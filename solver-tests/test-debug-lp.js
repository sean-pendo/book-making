/**
 * Debug the failing LP
 */

import highsLoader from 'highs';
import * as fs from 'fs';

async function runTests() {
  console.log('Loading HiGHS...');
  const highs = await highsLoader();
  console.log('HiGHS loaded');

  const numAccounts = 34;
  const numReps = 20;
  const arrTarget = 150000;

  // Build the LP that fails
  let lines = ['Maximize'];
  let objTerms = [];

  // Deterministic random seed
  const seededRandom = (seed) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  // Assignment scores
  let seed = 42;
  for (let a = 0; a < numAccounts; a++) {
    for (let r = 0; r < numReps; r++) {
      const score = (seededRandom(seed++) * 0.5 + 0.5).toFixed(4);
      objTerms.push(`+ ${score} x${a}_${r}`);
    }
  }

  // Big-M penalty slacks
  const normFactor = arrTarget;
  for (let r = 0; r < numReps; r++) {
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

  // Build objective - check for issue
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

  // Balance decomposition constraints per rep
  seed = 100;
  for (let r = 0; r < numReps; r++) {
    let terms = [];
    for (let a = 0; a < numAccounts; a++) {
      const arr = Math.floor(seededRandom(seed++) * 200000 + 50000);
      terms.push(`+ ${arr} x${a}_${r}`);
    }
    terms.push(`- 1 ao${r} + 1 au${r} - 1 bo${r} + 1 bu${r} - 1 mo${r} + 1 mu${r}`);
    lines.push(` bal${r}: ${terms.join(' ')} = ${arrTarget}`);
  }

  lines.push('Bounds');
  for (let r = 0; r < numReps; r++) {
    lines.push(` 0 <= ao${r} <= ${arrTarget * 0.1}`);
    lines.push(` 0 <= au${r} <= ${arrTarget * 0.1}`);
    lines.push(` 0 <= bo${r} <= ${arrTarget * 0.5}`);
    lines.push(` 0 <= bu${r} <= ${arrTarget * 0.5}`);
    lines.push(` mo${r} >= 0`);
    lines.push(` mu${r} >= 0`);
  }

  lines.push('Binary');
  for (let a = 0; a < numAccounts; a++) {
    for (let r = 0; r < numReps; r++) {
      lines.push(` x${a}_${r}`);
    }
  }

  lines.push('End');

  const lp = lines.join('\n');

  // Save to file for inspection
  fs.writeFileSync('debug.lp', lp);
  console.log(`Saved LP to debug.lp (${lp.length} bytes, ${lines.length} lines)`);

  // Check LP format issues
  console.log('\nChecking LP format...');

  // Check objective section
  const objSection = lp.substring(lp.indexOf('Maximize'), lp.indexOf('Subject To'));
  console.log('Objective section length:', objSection.length);

  // Check for problematic patterns
  if (objSection.includes('+ -')) {
    console.log('WARNING: Found "+ -" pattern in objective');
  }
  if (objSection.includes('  ')) {
    console.log('WARNING: Found double spaces');
  }

  // Count variables in objective
  const objVars = objSection.match(/[a-z]+\d+/gi) || [];
  console.log('Variables in objective:', objVars.length);

  // Check for lines > 255 chars
  let longLines = 0;
  for (const line of lines) {
    if (line.length > 255) {
      longLines++;
    }
  }
  console.log('Lines > 255 chars:', longLines);

  // Try to solve
  console.log('\nAttempting solve...');
  try {
    const result = highs.solve(lp);
    console.log('Status:', result.Status);
    console.log('Objective:', result.ObjectiveValue?.toFixed(4));
    console.log('PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);

    // Try a simplified version - remove balance constraints
    console.log('\nTrying without balance constraints...');
    const lpNoBalance = lp.replace(/\n bal\d+:.*/g, '').replace(/\nBounds[\s\S]*?(?=\nBinary)/, '\nBounds\n');
    fs.writeFileSync('debug-nobalance.lp', lpNoBalance);

    try {
      const result2 = highs.solve(lpNoBalance);
      console.log('Without balance - Status:', result2.Status);
    } catch (err2) {
      console.error('Without balance FAILED:', err2.message);
    }
  }
}

runTests().catch(console.error);
