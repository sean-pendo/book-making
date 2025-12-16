/**
 * Minimal failing case - find exact cause
 */

import highsLoader from 'highs';
import * as fs from 'fs';

async function runTest() {
  console.log('Loading HiGHS...');
  const highs = await highsLoader();
  console.log('HiGHS loaded');

  // Absolute minimal Big-M test that should work
  console.log('\n=== Manual minimal LP ===');

  const minimalLP = `Maximize
 obj: + 0.5 x0 + 0.5 x1 - 0.0000000333 ao0 - 0.0000000333 au0 - 0.0000033333 bo0
 - 0.0000033333 bu0 - 0.0033333333 mo0 - 0.0033333333 mu0
Subject To
 assign0: + 1 x0 = 1
 assign1: + 1 x1 = 1
 bal0: + 100000 x0 + 150000 x1 - 1 ao0 + 1 au0 - 1 bo0 + 1 bu0 - 1 mo0 + 1 mu0 = 125000
Bounds
 0 <= ao0 <= 12500
 0 <= au0 <= 12500
 0 <= bo0 <= 62500
 0 <= bu0 <= 62500
 mo0 >= 0
 mu0 >= 0
Binary
 x0
 x1
End`;

  console.log('LP:');
  console.log(minimalLP);

  try {
    const result = highs.solve(minimalLP);
    console.log('\nStatus:', result.Status);
    console.log('Objective:', result.ObjectiveValue);
    console.log('PASSED');
  } catch (err) {
    console.error('\nFAILED:', err.message);
  }

  // Try with 2 reps
  console.log('\n=== With 2 reps (2 balance constraints) ===');

  const twoRepLP = `Maximize
 obj: + 0.5 x0_0 + 0.5 x0_1 + 0.5 x1_0 + 0.5 x1_1
 - 0.0000000333 ao0 - 0.0000000333 au0 - 0.0000033333 bo0 - 0.0000033333 bu0
 - 0.0033333333 mo0 - 0.0033333333 mu0
 - 0.0000000333 ao1 - 0.0000000333 au1 - 0.0000033333 bo1 - 0.0000033333 bu1
 - 0.0033333333 mo1 - 0.0033333333 mu1
Subject To
 assign0: + 1 x0_0 + 1 x0_1 = 1
 assign1: + 1 x1_0 + 1 x1_1 = 1
 bal0: + 100000 x0_0 + 150000 x1_0 - 1 ao0 + 1 au0 - 1 bo0 + 1 bu0 - 1 mo0 + 1 mu0 = 125000
 bal1: + 100000 x0_1 + 150000 x1_1 - 1 ao1 + 1 au1 - 1 bo1 + 1 bu1 - 1 mo1 + 1 mu1 = 125000
Bounds
 0 <= ao0 <= 12500
 0 <= au0 <= 12500
 0 <= bo0 <= 62500
 0 <= bu0 <= 62500
 mo0 >= 0
 mu0 >= 0
 0 <= ao1 <= 12500
 0 <= au1 <= 12500
 0 <= bo1 <= 62500
 0 <= bu1 <= 62500
 mo1 >= 0
 mu1 >= 0
Binary
 x0_0
 x0_1
 x1_0
 x1_1
End`;

  console.log('LP:');
  console.log(twoRepLP);

  try {
    const result = highs.solve(twoRepLP);
    console.log('\nStatus:', result.Status);
    console.log('PASSED');
  } catch (err) {
    console.error('\nFAILED:', err.message);
  }

  // Now test the generated LP for 10a x 5r
  console.log('\n=== Generated 10a × 5r LP ===');

  const lp = generateLP(10, 5);
  fs.writeFileSync('minimal-fail.lp', lp);
  console.log(`Saved to minimal-fail.lp (${lp.length} bytes)`);

  // Check for LP format issues
  console.log('Checking format...');

  // Look for issues in bounds section
  const boundsSection = lp.substring(lp.indexOf('Bounds'), lp.indexOf('Binary'));
  console.log('Bounds section length:', boundsSection.length);

  // Check constraint format
  const constraintSection = lp.substring(lp.indexOf('Subject To'), lp.indexOf('Bounds'));
  console.log('Constraint section length:', constraintSection.length);

  try {
    const result = highs.solve(lp);
    console.log('\nStatus:', result.Status);
    console.log('PASSED');
  } catch (err) {
    console.error('\nFAILED:', err.message);
  }
}

function generateLP(accounts, reps) {
  const arrTarget = 150000;
  const MAX_LINE = 200;
  const lines = [];

  lines.push('Maximize');
  let currentLine = ' obj:';

  // Assignment scores
  for (let a = 0; a < accounts; a++) {
    for (let r = 0; r < reps; r++) {
      const term = `+ 0.5000 x${a}_${r}`;
      if (currentLine.length + term.length + 1 > MAX_LINE) {
        lines.push(currentLine);
        currentLine = ' ' + term;
      } else {
        currentLine += ' ' + term;
      }
    }
  }

  // Slack penalties
  const normFactor = arrTarget;
  for (let r = 0; r < reps; r++) {
    const coefs = [
      { name: `ao${r}`, val: 0.01 * 0.5 / normFactor },
      { name: `au${r}`, val: 0.01 * 0.5 / normFactor },
      { name: `bo${r}`, val: 1.0 * 0.5 / normFactor },
      { name: `bu${r}`, val: 1.0 * 0.5 / normFactor },
      { name: `mo${r}`, val: 1000 * 0.5 / normFactor },
      { name: `mu${r}`, val: 1000 * 0.5 / normFactor },
    ];

    for (const c of coefs) {
      const term = `- ${c.val.toFixed(10)} ${c.name}`;
      if (currentLine.length + term.length + 1 > MAX_LINE) {
        lines.push(currentLine);
        currentLine = ' ' + term;
      } else {
        currentLine += ' ' + term;
      }
    }
  }

  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  lines.push('Subject To');

  // Assignment constraints
  for (let a = 0; a < accounts; a++) {
    let terms = [];
    for (let r = 0; r < reps; r++) {
      terms.push(`+ 1 x${a}_${r}`);
    }
    lines.push(` a${a}: ${terms.join(' ')} = 1`);
  }

  // Balance constraints
  for (let r = 0; r < reps; r++) {
    let cl = ` bal${r}:`;

    for (let a = 0; a < accounts; a++) {
      const arr = 100000 + a * 10000;  // Deterministic
      const term = `+ ${arr} x${a}_${r}`;
      if (cl.length + term.length + 1 > MAX_LINE) {
        lines.push(cl);
        cl = ' ' + term;
      } else {
        cl += ' ' + term;
      }
    }

    const slackPart = `- 1 ao${r} + 1 au${r} - 1 bo${r} + 1 bu${r} - 1 mo${r} + 1 mu${r}`;
    if (cl.length + slackPart.length + 1 > MAX_LINE) {
      lines.push(cl);
      cl = ' ' + slackPart;
    } else {
      cl += ' ' + slackPart;
    }

    cl += ` = ${arrTarget}`;
    lines.push(cl);
  }

  lines.push('Bounds');
  for (let r = 0; r < reps; r++) {
    lines.push(` 0 <= ao${r} <= ${arrTarget * 0.1}`);
    lines.push(` 0 <= au${r} <= ${arrTarget * 0.1}`);
    lines.push(` 0 <= bo${r} <= ${arrTarget * 0.5}`);
    lines.push(` 0 <= bu${r} <= ${arrTarget * 0.5}`);
    lines.push(` mo${r} >= 0`);
    lines.push(` mu${r} >= 0`);
  }

  lines.push('Binary');
  for (let a = 0; a < accounts; a++) {
    for (let r = 0; r < reps; r++) {
      lines.push(` x${a}_${r}`);
    }
  }

  lines.push('End');

  return lines.join('\n');
}

runTest().catch(console.error);
