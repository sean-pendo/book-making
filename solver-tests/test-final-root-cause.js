/**
 * FINAL: Find the EXACT root cause
 *
 * From previous tests:
 * - Working: Single-line LP with 1275-char lines
 * - Failing: Line-broken LP with normal slack coefficients
 *
 * Hypothesis: Something about the LINE BREAKING FORMAT breaks HiGHS WASM parser
 */

import highsLoader from 'highs';

async function runTest() {
  console.log('Loading HiGHS...');
  const highs = await highsLoader();
  console.log('HiGHS loaded');

  // Test 1: Single-line balance constraint with slacks - SHOULD WORK
  console.log('\n=== Test 1: Single-line balance constraint ===');
  const lp1 = `Maximize
 obj: 0.5 x0 + 0.5 x1 + 0.5 x2 - 0.01 ao - 0.01 au - 0.1 bo - 0.1 bu - 1 mo - 1 mu
Subject To
 assign: x0 + x1 + x2 = 1
 balance: 100000 x0 + 120000 x1 + 140000 x2 - ao + au - bo + bu - mo + mu = 120000
Bounds
 0 <= ao <= 12000
 0 <= au <= 12000
 0 <= bo <= 60000
 0 <= bu <= 60000
 mo >= 0
 mu >= 0
Binary
 x0
 x1
 x2
End`;

  try {
    const result = highs.solve(lp1);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 2: Multi-line balance constraint (break after x2)
  console.log('\n=== Test 2: Multi-line balance (break after x2) ===');
  const lp2 = `Maximize
 obj: 0.5 x0 + 0.5 x1 + 0.5 x2 - 0.01 ao - 0.01 au - 0.1 bo - 0.1 bu - 1 mo - 1 mu
Subject To
 assign: x0 + x1 + x2 = 1
 balance: 100000 x0 + 120000 x1 + 140000 x2
 - ao + au - bo + bu - mo + mu = 120000
Bounds
 0 <= ao <= 12000
 0 <= au <= 12000
 0 <= bo <= 60000
 0 <= bu <= 60000
 mo >= 0
 mu >= 0
Binary
 x0
 x1
 x2
End`;

  try {
    const result = highs.solve(lp2);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 3: Multi-line objective (break mid-objective)
  console.log('\n=== Test 3: Multi-line objective ===');
  const lp3 = `Maximize
 obj: 0.5 x0 + 0.5 x1
 + 0.5 x2 - 0.01 ao - 0.01 au - 0.1 bo - 0.1 bu - 1 mo - 1 mu
Subject To
 assign: x0 + x1 + x2 = 1
 balance: 100000 x0 + 120000 x1 + 140000 x2 - ao + au - bo + bu - mo + mu = 120000
Bounds
 0 <= ao <= 12000
 0 <= au <= 12000
 0 <= bo <= 60000
 0 <= bu <= 60000
 mo >= 0
 mu >= 0
Binary
 x0
 x1
 x2
End`;

  try {
    const result = highs.solve(lp3);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 4: Multi-line objective with - at start of new line
  console.log('\n=== Test 4: Multi-line objective with - at line start ===');
  const lp4 = `Maximize
 obj: 0.5 x0 + 0.5 x1 + 0.5 x2
 - 0.01 ao - 0.01 au - 0.1 bo - 0.1 bu - 1 mo - 1 mu
Subject To
 assign: x0 + x1 + x2 = 1
 balance: 100000 x0 + 120000 x1 + 140000 x2 - ao + au - bo + bu - mo + mu = 120000
Bounds
 0 <= ao <= 12000
 0 <= au <= 12000
 0 <= bo <= 60000
 0 <= bu <= 60000
 mo >= 0
 mu >= 0
Binary
 x0
 x1
 x2
End`;

  try {
    const result = highs.solve(lp4);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 5: Multiple line breaks in objective
  console.log('\n=== Test 5: Multiple line breaks in objective ===');
  const lp5 = `Maximize
 obj: 0.5 x0
 + 0.5 x1
 + 0.5 x2
 - 0.01 ao
 - 0.01 au
 - 0.1 bo
 - 0.1 bu
 - 1 mo
 - 1 mu
Subject To
 assign: x0 + x1 + x2 = 1
 balance: 100000 x0 + 120000 x1 + 140000 x2 - ao + au - bo + bu - mo + mu = 120000
Bounds
 0 <= ao <= 12000
 0 <= au <= 12000
 0 <= bo <= 60000
 0 <= bu <= 60000
 mo >= 0
 mu >= 0
Binary
 x0
 x1
 x2
End`;

  try {
    const result = highs.solve(lp5);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 6: Scale up but NO line breaks at all
  console.log('\n=== Test 6: 5x5 NO line breaks ===');
  const lp6 = build5x5NoBreaks();
  console.log('LP length:', lp6.length);
  console.log('Lines:', lp6.split('\n').length);

  try {
    const result = highs.solve(lp6);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 7: Same 5x5 WITH line breaks
  console.log('\n=== Test 7: 5x5 WITH line breaks ===');
  const lp7 = build5x5WithBreaks();
  console.log('LP length:', lp7.length);
  console.log('Lines:', lp7.split('\n').length);

  try {
    const result = highs.solve(lp7);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 8: Check if HiGHS state is corrupted between calls
  console.log('\n=== Test 8: Fresh highs instance ===');
  const highs2 = await highsLoader();
  const lp8 = build5x5WithBreaks();
  try {
    const result = highs2.solve(lp8);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }
}

function build5x5NoBreaks() {
  const arrTarget = 150000;
  const lines = [];

  // Single long objective line
  let obj = ' obj:';
  for (let a = 0; a < 5; a++) {
    for (let r = 0; r < 5; r++) {
      obj += ` + 0.5 x${a}_${r}`;
    }
  }
  for (let r = 0; r < 5; r++) {
    obj += ` - 0.01 ao${r} - 0.01 au${r} - 0.1 bo${r} - 0.1 bu${r} - 1 mo${r} - 1 mu${r}`;
  }

  lines.push('Maximize');
  lines.push(obj);
  lines.push('Subject To');

  // Assignment
  for (let a = 0; a < 5; a++) {
    lines.push(` a${a}: x${a}_0 + x${a}_1 + x${a}_2 + x${a}_3 + x${a}_4 = 1`);
  }

  // Balance - single line each
  for (let r = 0; r < 5; r++) {
    lines.push(` bal${r}: ${100000} x0_${r} + ${110000} x1_${r} + ${120000} x2_${r} + ${130000} x3_${r} + ${140000} x4_${r} - ao${r} + au${r} - bo${r} + bu${r} - mo${r} + mu${r} = ${arrTarget}`);
  }

  lines.push('Bounds');
  for (let r = 0; r < 5; r++) {
    lines.push(` 0 <= ao${r} <= ${arrTarget * 0.1}`);
    lines.push(` 0 <= au${r} <= ${arrTarget * 0.1}`);
    lines.push(` 0 <= bo${r} <= ${arrTarget * 0.5}`);
    lines.push(` 0 <= bu${r} <= ${arrTarget * 0.5}`);
    lines.push(` mo${r} >= 0`);
    lines.push(` mu${r} >= 0`);
  }

  lines.push('Binary');
  for (let a = 0; a < 5; a++) {
    for (let r = 0; r < 5; r++) {
      lines.push(` x${a}_${r}`);
    }
  }

  lines.push('End');
  return lines.join('\n');
}

function build5x5WithBreaks() {
  const arrTarget = 150000;
  const MAX_LINE = 100;  // Force line breaks
  const lines = [];
  let currentLine = ' obj:';

  lines.push('Maximize');

  // Objective with breaks
  for (let a = 0; a < 5; a++) {
    for (let r = 0; r < 5; r++) {
      const term = `+ 0.5 x${a}_${r}`;
      if (currentLine.length + term.length + 1 > MAX_LINE) {
        lines.push(currentLine);
        currentLine = ' ' + term;
      } else {
        currentLine += ' ' + term;
      }
    }
  }
  for (let r = 0; r < 5; r++) {
    const terms = [
      `- 0.01 ao${r}`,
      `- 0.01 au${r}`,
      `- 0.1 bo${r}`,
      `- 0.1 bu${r}`,
      `- 1 mo${r}`,
      `- 1 mu${r}`,
    ];
    for (const term of terms) {
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

  // Assignment
  for (let a = 0; a < 5; a++) {
    lines.push(` a${a}: x${a}_0 + x${a}_1 + x${a}_2 + x${a}_3 + x${a}_4 = 1`);
  }

  // Balance with breaks
  for (let r = 0; r < 5; r++) {
    let cl = ` bal${r}:`;
    const arrValues = [100000, 110000, 120000, 130000, 140000];
    for (let a = 0; a < 5; a++) {
      const term = `+ ${arrValues[a]} x${a}_${r}`;
      if (cl.length + term.length + 1 > MAX_LINE) {
        lines.push(cl);
        cl = ' ' + term;
      } else {
        cl += ' ' + term;
      }
    }
    const slackPart = `- ao${r} + au${r} - bo${r} + bu${r} - mo${r} + mu${r} = ${arrTarget}`;
    if (cl.length + slackPart.length + 1 > MAX_LINE) {
      lines.push(cl);
      cl = ' ' + slackPart;
    } else {
      cl += ' ' + slackPart;
    }
    lines.push(cl);
  }

  lines.push('Bounds');
  for (let r = 0; r < 5; r++) {
    lines.push(` 0 <= ao${r} <= ${arrTarget * 0.1}`);
    lines.push(` 0 <= au${r} <= ${arrTarget * 0.1}`);
    lines.push(` 0 <= bo${r} <= ${arrTarget * 0.5}`);
    lines.push(` 0 <= bu${r} <= ${arrTarget * 0.5}`);
    lines.push(` mo${r} >= 0`);
    lines.push(` mu${r} >= 0`);
  }

  lines.push('Binary');
  for (let a = 0; a < 5; a++) {
    for (let r = 0; r < 5; r++) {
      lines.push(` x${a}_${r}`);
    }
  }

  lines.push('End');
  return lines.join('\n');
}

runTest().catch(console.error);
