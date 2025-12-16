/**
 * Exact minimal test - find the EXACT breaking point
 */

import highsLoader from 'highs';

async function runTest() {
  console.log('Loading HiGHS...');
  const highs = await highsLoader();
  console.log('HiGHS loaded');

  // Test 1: Absolute minimal LP that must work
  console.log('\n=== Test 1: Trivial LP ===');
  const lp1 = `Maximize
 obj: x
Subject To
 c1: x <= 10
Bounds
 x >= 0
End`;

  try {
    const result = highs.solve(lp1);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 2: Simple MIP with binary
  console.log('\n=== Test 2: Binary MIP ===');
  const lp2 = `Maximize
 obj: x + y
Subject To
 c1: x + y <= 1
Binary
 x
 y
End`;

  try {
    const result = highs.solve(lp2);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 3: Balance constraint WITHOUT slack
  console.log('\n=== Test 3: Balance without slack ===');
  const lp3 = `Maximize
 obj: x0 + x1
Subject To
 assign: x0 + x1 = 1
 balance: 100000 x0 + 150000 x1 = 125000
Binary
 x0
 x1
End`;

  try {
    const result = highs.solve(lp3);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 4: Balance constraint WITH slack (simplest possible)
  console.log('\n=== Test 4: Balance with ONE slack ===');
  const lp4 = `Maximize
 obj: x0 + x1 - 0.001 slack
Subject To
 assign: x0 + x1 = 1
 balance: 100000 x0 + 150000 x1 + slack = 125000
Bounds
 slack >= 0
Binary
 x0
 x1
End`;

  try {
    const result = highs.solve(lp4);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 5: Balance with positive AND negative slack
  console.log('\n=== Test 5: Balance with +/- slack ===');
  const lp5 = `Maximize
 obj: x0 + x1 - 0.001 so - 0.001 su
Subject To
 assign: x0 + x1 = 1
 balance: 100000 x0 + 150000 x1 - so + su = 125000
Bounds
 so >= 0
 su >= 0
Binary
 x0
 x1
End`;

  try {
    const result = highs.solve(lp5);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 6: Our 3-tier slack system (alpha, beta, bigM)
  console.log('\n=== Test 6: Three-tier slack system ===');
  const lp6 = `Maximize
 obj: x0 + x1 - 0.0001 ao - 0.0001 au - 0.01 bo - 0.01 bu - 1 mo - 1 mu
Subject To
 assign: x0 + x1 = 1
 balance: 100000 x0 + 150000 x1 - ao + au - bo + bu - mo + mu = 125000
Bounds
 0 <= ao <= 12500
 0 <= au <= 12500
 0 <= bo <= 62500
 0 <= bu <= 62500
 mo >= 0
 mu >= 0
Binary
 x0
 x1
End`;

  try {
    const result = highs.solve(lp6);
    console.log('Status:', result.Status, '- PASSED');
    console.log('Objective:', result.ObjectiveValue);
    if (result.Columns) {
      console.log('Solution:', Object.entries(result.Columns)
        .filter(([k, v]) => v.Primal > 0.1)
        .map(([k, v]) => `${k}=${v.Primal}`)
        .join(', '));
    }
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 7: Multiple accounts (2 accounts x 2 reps)
  console.log('\n=== Test 7: 2x2 assignment ===');
  const lp7 = `Maximize
 obj: x0_0 + x0_1 + x1_0 + x1_1 - 0.0001 ao0 - 0.0001 au0 - 0.01 bo0 - 0.01 bu0 - 1 mo0 - 1 mu0 - 0.0001 ao1 - 0.0001 au1 - 0.01 bo1 - 0.01 bu1 - 1 mo1 - 1 mu1
Subject To
 a0: x0_0 + x0_1 = 1
 a1: x1_0 + x1_1 = 1
 bal0: 100000 x0_0 + 150000 x1_0 - ao0 + au0 - bo0 + bu0 - mo0 + mu0 = 125000
 bal1: 100000 x0_1 + 150000 x1_1 - ao1 + au1 - bo1 + bu1 - mo1 + mu1 = 125000
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

  try {
    const result = highs.solve(lp7);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 8: Scale up - 5 accounts x 3 reps
  console.log('\n=== Test 8: 5x3 assignment ===');
  const accounts = 5;
  const reps = 3;
  const arrTarget = 100000;

  let obj = ' obj:';
  for (let a = 0; a < accounts; a++) {
    for (let r = 0; r < reps; r++) {
      obj += ` + 1 x${a}_${r}`;
    }
  }
  for (let r = 0; r < reps; r++) {
    obj += ` - 0.0001 ao${r} - 0.0001 au${r} - 0.01 bo${r} - 0.01 bu${r} - 1 mo${r} - 1 mu${r}`;
  }

  let constraints = [];
  // Assignment constraints
  for (let a = 0; a < accounts; a++) {
    let terms = [];
    for (let r = 0; r < reps; r++) {
      terms.push(`x${a}_${r}`);
    }
    constraints.push(` a${a}: ${terms.join(' + ')} = 1`);
  }
  // Balance constraints
  for (let r = 0; r < reps; r++) {
    let terms = [];
    for (let a = 0; a < accounts; a++) {
      const arr = 50000 + a * 25000;
      terms.push(`${arr} x${a}_${r}`);
    }
    terms.push(`- ao${r} + au${r} - bo${r} + bu${r} - mo${r} + mu${r}`);
    constraints.push(` bal${r}: ${terms.join(' + ')} = ${arrTarget}`);
  }

  let bounds = [];
  for (let r = 0; r < reps; r++) {
    bounds.push(` 0 <= ao${r} <= ${arrTarget * 0.1}`);
    bounds.push(` 0 <= au${r} <= ${arrTarget * 0.1}`);
    bounds.push(` 0 <= bo${r} <= ${arrTarget * 0.5}`);
    bounds.push(` 0 <= bu${r} <= ${arrTarget * 0.5}`);
    bounds.push(` mo${r} >= 0`);
    bounds.push(` mu${r} >= 0`);
  }

  let binary = [];
  for (let a = 0; a < accounts; a++) {
    for (let r = 0; r < reps; r++) {
      binary.push(` x${a}_${r}`);
    }
  }

  const lp8 = [
    'Maximize',
    obj,
    'Subject To',
    ...constraints,
    'Bounds',
    ...bounds,
    'Binary',
    ...binary,
    'End'
  ].join('\n');

  console.log('LP lines:', lp8.split('\n').length);
  console.log('Longest line:', Math.max(...lp8.split('\n').map(l => l.length)));

  try {
    const result = highs.solve(lp8);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 9: 10x5 - same as failing case
  console.log('\n=== Test 9: 10x5 assignment (failing case) ===');
  const lp9 = generate10x5LP();
  console.log('LP lines:', lp9.split('\n').length);
  console.log('Longest line:', Math.max(...lp9.split('\n').map(l => l.length)));

  try {
    const result = highs.solve(lp9);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }
}

function generate10x5LP() {
  const accounts = 10;
  const reps = 5;
  const arrTarget = 150000;

  let lines = ['Maximize'];
  let obj = ' obj:';

  // Assignment scores
  for (let a = 0; a < accounts; a++) {
    for (let r = 0; r < reps; r++) {
      obj += ` + 0.5 x${a}_${r}`;
    }
  }
  // Slack penalties
  for (let r = 0; r < reps; r++) {
    obj += ` - 0.0001 ao${r} - 0.0001 au${r} - 0.01 bo${r} - 0.01 bu${r} - 1 mo${r} - 1 mu${r}`;
  }
  lines.push(obj);

  lines.push('Subject To');

  // Assignment constraints
  for (let a = 0; a < accounts; a++) {
    let terms = [];
    for (let r = 0; r < reps; r++) {
      terms.push(`x${a}_${r}`);
    }
    lines.push(` a${a}: ${terms.join(' + ')} = 1`);
  }

  // Balance constraints
  for (let r = 0; r < reps; r++) {
    let terms = [];
    for (let a = 0; a < accounts; a++) {
      const arr = 100000 + a * 10000;
      terms.push(`${arr} x${a}_${r}`);
    }
    terms.push(`- ao${r} + au${r} - bo${r} + bu${r} - mo${r} + mu${r}`);
    lines.push(` bal${r}: ${terms.join(' + ')} = ${arrTarget}`);
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
