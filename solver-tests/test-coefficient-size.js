/**
 * Test: Do very small coefficients cause HiGHS to crash?
 */

import highsLoader from 'highs';

async function runTest() {
  console.log('Loading HiGHS...');
  const highs = await highsLoader();
  console.log('HiGHS loaded');

  // Test 1: Normal coefficients
  console.log('\n=== Test 1: Normal sized coefficients (0.01 to 1) ===');
  const lp1 = `Maximize
 obj: x0 + x1 - 0.01 slack
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
    const result = highs.solve(lp1);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 2: Small coefficients (0.0001)
  console.log('\n=== Test 2: Small coefficients (0.0001) ===');
  const lp2 = `Maximize
 obj: x0 + x1 - 0.0001 slack
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
    const result = highs.solve(lp2);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 3: Very small coefficients (1e-8)
  console.log('\n=== Test 3: Very small coefficients (0.00000001) ===');
  const lp3 = `Maximize
 obj: x0 + x1 - 0.00000001 slack
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
    const result = highs.solve(lp3);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 4: Extremely small coefficients (1e-10 - like our actual case)
  console.log('\n=== Test 4: Extremely small coefficients (0.0000000333) ===');
  const lp4 = `Maximize
 obj: x0 + x1 - 0.0000000333 slack
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

  // Test 5: Scientific notation
  console.log('\n=== Test 5: Scientific notation (1e-9) ===');
  const lp5 = `Maximize
 obj: x0 + x1 - 1e-9 slack
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
    const result = highs.solve(lp5);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 6: Multi-tier with very small coefficients (as in failing case)
  console.log('\n=== Test 6: Three-tier with very small coefficients ===');
  const lp6 = `Maximize
 obj: x0 + x1 - 0.0000000333 ao - 0.0000000333 au - 0.0000033333 bo - 0.0000033333 bu - 0.0033333333 mo - 0.0033333333 mu
Subject To
 assign: x0 + x1 = 1
 balance: 100000 x0 + 150000 x1 - 1 ao + 1 au - 1 bo + 1 bu - 1 mo + 1 mu = 125000
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
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 7: Same but with `+ 1 x0` format (explicit coefficient)
  console.log('\n=== Test 7: Explicit +1 coefficient format ===');
  const lp7 = `Maximize
 obj: + 1 x0 + 1 x1 - 0.0000000333 ao - 0.0000000333 au - 0.0000033333 bo - 0.0000033333 bu - 0.0033333333 mo - 0.0033333333 mu
Subject To
 assign: + 1 x0 + 1 x1 = 1
 balance: + 100000 x0 + 150000 x1 - 1 ao + 1 au - 1 bo + 1 bu - 1 mo + 1 mu = 125000
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
    const result = highs.solve(lp7);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 8: 2x2 with the EXACT format from failing.lp
  console.log('\n=== Test 8: Exact failing.lp format (2x2) ===');
  const lp8 = `Maximize
 obj: + 0.8923 x0_0 + 0.6263 x0_1 + 0.8656 x1_0 + 0.7267 x1_1 - 0.0000000333 ao0 - 0.0000000333 au0 - 0.0000033333 bo0 - 0.0000033333 bu0 - 0.0033333333 mo0 - 0.0033333333 mu0 - 0.0000000333 ao1 - 0.0000000333 au1 - 0.0000033333 bo1 - 0.0000033333 bu1 - 0.0033333333 mo1 - 0.0033333333 mu1
Subject To
 a0: + 1 x0_0 + 1 x0_1 = 1
 a1: + 1 x1_0 + 1 x1_1 = 1
 bal0: + 118717 x0_0 + 101574 x1_0 - 1 ao0 + 1 au0 - 1 bo0 + 1 bu0 - 1 mo0 + 1 mu0 = 110000
 bal1: + 156814 x0_1 + 111497 x1_1 - 1 ao1 + 1 au1 - 1 bo1 + 1 bu1 - 1 mo1 + 1 mu1 = 134000
Bounds
 0 <= ao0 <= 15000
 0 <= au0 <= 15000
 0 <= bo0 <= 75000
 0 <= bu0 <= 75000
 mo0 >= 0
 mu0 >= 0
 0 <= ao1 <= 15000
 0 <= au1 <= 15000
 0 <= bo1 <= 75000
 0 <= bu1 <= 75000
 mo1 >= 0
 mu1 >= 0
Binary
 x0_0
 x0_1
 x1_0
 x1_1
End`;

  try {
    const result = highs.solve(lp8);
    console.log('Status:', result.Status, '- PASSED');
    console.log('Objective:', result.ObjectiveValue);
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 9: 3x3 with exact format
  console.log('\n=== Test 9: Exact failing.lp format (3x3) ===');
  const lp9 = buildExactFormat(3, 3);
  console.log('LP length:', lp9.length);
  console.log('Lines:', lp9.split('\n').length);
  console.log('Longest line:', Math.max(...lp9.split('\n').map(l => l.length)));

  try {
    const result = highs.solve(lp9);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 10: 5x5 with exact format
  console.log('\n=== Test 10: Exact failing.lp format (5x5) ===');
  const lp10 = buildExactFormat(5, 5);
  console.log('LP length:', lp10.length);
  console.log('Lines:', lp10.split('\n').length);
  console.log('Longest line:', Math.max(...lp10.split('\n').map(l => l.length)));

  try {
    const result = highs.solve(lp10);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 11: 10x5 with exact format (same as failing)
  console.log('\n=== Test 11: Exact failing.lp format (10x5) ===');
  const lp11 = buildExactFormat(10, 5);
  console.log('LP length:', lp11.length);
  console.log('Lines:', lp11.split('\n').length);
  console.log('Longest line:', Math.max(...lp11.split('\n').map(l => l.length)));

  try {
    const result = highs.solve(lp11);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }
}

function buildExactFormat(accounts, reps) {
  const arrTarget = 150000;
  const lines = [];

  // Objective
  let obj = ' obj:';
  for (let a = 0; a < accounts; a++) {
    for (let r = 0; r < reps; r++) {
      const score = (0.5 + Math.random() * 0.5).toFixed(4);
      obj += ` + ${score} x${a}_${r}`;
    }
  }
  for (let r = 0; r < reps; r++) {
    obj += ` - 0.0000000333 ao${r} - 0.0000000333 au${r} - 0.0000033333 bo${r} - 0.0000033333 bu${r} - 0.0033333333 mo${r} - 0.0033333333 mu${r}`;
  }

  lines.push('Maximize');
  lines.push(obj);
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
    let terms = [];
    for (let a = 0; a < accounts; a++) {
      const arr = Math.floor(50000 + Math.random() * 200000);
      terms.push(`+ ${arr} x${a}_${r}`);
    }
    terms.push(`- 1 ao${r} + 1 au${r} - 1 bo${r} + 1 bu${r} - 1 mo${r} + 1 mu${r}`);
    lines.push(` bal${r}: ${terms.join(' ')} = ${arrTarget}`);
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
