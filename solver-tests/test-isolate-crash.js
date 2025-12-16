/**
 * Test: Isolate exact crash cause
 */

import highsLoader from 'highs';

async function runTest() {
  console.log('Loading HiGHS...');
  const highs = await highsLoader();
  console.log('HiGHS loaded');

  // This works (from test-coefficient-size.js Test 11)
  console.log('\n=== Test: Working 10x5 (no line breaks, random) ===');
  const workingLP = buildExactFormat(10, 5);
  console.log('LP length:', workingLP.length);
  console.log('Lines:', workingLP.split('\n').length);
  console.log('Longest line:', Math.max(...workingLP.split('\n').map(l => l.length)));
  console.log('First 500 chars:', workingLP.substring(0, 500));

  try {
    const result = highs.solve(workingLP);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // This fails (from test-compare-failing.js failing.lp)
  console.log('\n=== Test: Failing 10x5 (with line breaks) ===');
  const failingLP = buildWithLineBreaks(10, 5, 200);
  console.log('LP length:', failingLP.length);
  console.log('Lines:', failingLP.split('\n').length);
  console.log('Longest line:', Math.max(...failingLP.split('\n').map(l => l.length)));
  console.log('First 500 chars:', failingLP.substring(0, 500));

  try {
    const result = highs.solve(failingLP);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test with no slacks at all
  console.log('\n=== Test: No slacks at all ===');
  const noSlackLP = buildNoSlacks(10, 5);
  console.log('LP length:', noSlackLP.length);

  try {
    const result = highs.solve(noSlackLP);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test with normal slack coefficients
  console.log('\n=== Test: Normal slack coefficients (0.01, 0.1, 1) ===');
  const normalSlackLP = buildNormalSlacks(10, 5);
  console.log('LP length:', normalSlackLP.length);

  try {
    const result = highs.solve(normalSlackLP);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test tiny slack coefs with line breaks
  console.log('\n=== Test: Tiny slack coefficients with line breaks ===');
  const tinySlackLP = buildWithLineBreaks(10, 5, 200, true);
  console.log('LP length:', tinySlackLP.length);
  console.log('Lines:', tinySlackLP.split('\n').length);

  try {
    const result = highs.solve(tinySlackLP);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Binary-by-binary check
  console.log('\n=== Test: Smaller problem with line breaks ===');
  for (const size of [[3, 3], [5, 3], [5, 5], [7, 5], [10, 5]]) {
    const [a, r] = size;
    const lp = buildWithLineBreaks(a, r, 200);
    try {
      const result = highs.solve(lp);
      console.log(`${a}x${r}: Status ${result.Status} - PASSED`);
    } catch (err) {
      console.error(`${a}x${r}: FAILED - ${err.message}`);
    }
  }
}

function buildExactFormat(accounts, reps) {
  const arrTarget = 150000;
  const lines = [];

  // Objective - single line
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

  // Balance constraints - single line each
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

function buildWithLineBreaks(accounts, reps, maxLine, useTinySlacks = false) {
  const arrTarget = 150000;
  const lines = [];
  let currentLine = ' obj:';

  lines.push('Maximize');

  // Objective - with line breaks
  for (let a = 0; a < accounts; a++) {
    for (let r = 0; r < reps; r++) {
      const score = (0.5 + Math.random() * 0.5).toFixed(4);
      const term = `+ ${score} x${a}_${r}`;
      if (currentLine.length + term.length + 1 > maxLine) {
        lines.push(currentLine);
        currentLine = ' ' + term;
      } else {
        currentLine += ' ' + term;
      }
    }
  }

  // Slack penalties
  for (let r = 0; r < reps; r++) {
    const coefs = useTinySlacks
      ? [
          { name: `ao${r}`, val: 0.0000000333 },
          { name: `au${r}`, val: 0.0000000333 },
          { name: `bo${r}`, val: 0.0000033333 },
          { name: `bu${r}`, val: 0.0000033333 },
          { name: `mo${r}`, val: 0.0033333333 },
          { name: `mu${r}`, val: 0.0033333333 },
        ]
      : [
          { name: `ao${r}`, val: 0.01 },
          { name: `au${r}`, val: 0.01 },
          { name: `bo${r}`, val: 0.1 },
          { name: `bu${r}`, val: 0.1 },
          { name: `mo${r}`, val: 1.0 },
          { name: `mu${r}`, val: 1.0 },
        ];

    for (const c of coefs) {
      const term = `- ${c.val.toFixed(10)} ${c.name}`;
      if (currentLine.length + term.length + 1 > maxLine) {
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

  // Balance constraints - with line breaks
  for (let r = 0; r < reps; r++) {
    let cl = ` bal${r}:`;

    for (let a = 0; a < accounts; a++) {
      const arr = Math.floor(50000 + Math.random() * 200000);
      const term = `+ ${arr} x${a}_${r}`;
      if (cl.length + term.length + 1 > maxLine) {
        lines.push(cl);
        cl = ' ' + term;
      } else {
        cl += ' ' + term;
      }
    }

    const slackPart = `- 1 ao${r} + 1 au${r} - 1 bo${r} + 1 bu${r} - 1 mo${r} + 1 mu${r}`;
    if (cl.length + slackPart.length + 1 > maxLine) {
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

function buildNoSlacks(accounts, reps) {
  const lines = [];

  lines.push('Maximize');
  let obj = ' obj:';
  for (let a = 0; a < accounts; a++) {
    for (let r = 0; r < reps; r++) {
      obj += ` + 0.5 x${a}_${r}`;
    }
  }
  lines.push(obj);

  lines.push('Subject To');
  for (let a = 0; a < accounts; a++) {
    let terms = [];
    for (let r = 0; r < reps; r++) {
      terms.push(`x${a}_${r}`);
    }
    lines.push(` a${a}: ${terms.join(' + ')} = 1`);
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

function buildNormalSlacks(accounts, reps) {
  const arrTarget = 150000;
  const lines = [];

  lines.push('Maximize');
  let obj = ' obj:';
  for (let a = 0; a < accounts; a++) {
    for (let r = 0; r < reps; r++) {
      obj += ` + 0.5 x${a}_${r}`;
    }
  }
  for (let r = 0; r < reps; r++) {
    obj += ` - 0.01 ao${r} - 0.01 au${r} - 0.1 bo${r} - 0.1 bu${r} - 1 mo${r} - 1 mu${r}`;
  }
  lines.push(obj);

  lines.push('Subject To');

  // Assignment
  for (let a = 0; a < accounts; a++) {
    let terms = [];
    for (let r = 0; r < reps; r++) {
      terms.push(`x${a}_${r}`);
    }
    lines.push(` a${a}: ${terms.join(' + ')} = 1`);
  }

  // Balance
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
