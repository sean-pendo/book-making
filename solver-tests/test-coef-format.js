/**
 * Test: Coefficient FORMAT issues
 *
 * The failing tests used:
 * - toFixed(10) for slack coefficients
 * - Some had "-" at line start
 */

import highsLoader from 'highs';

async function runTest() {
  console.log('Loading HiGHS...');
  const highs = await highsLoader();
  console.log('HiGHS loaded');

  // Test 1: toFixed(10) format - like the failing LP
  console.log('\n=== Test 1: toFixed(10) coefficients ===');
  const lp1 = `Maximize
 obj: 0.5 x0 + 0.5 x1 - 0.0100000000 ao - 0.0100000000 au - 0.1000000000 bo - 0.1000000000 bu - 1.0000000000 mo - 1.0000000000 mu
Subject To
 assign: x0 + x1 = 1
 balance: 100000 x0 + 120000 x1 - ao + au - bo + bu - mo + mu = 110000
Bounds
 0 <= ao <= 11000
 0 <= au <= 11000
 0 <= bo <= 55000
 0 <= bu <= 55000
 mo >= 0
 mu >= 0
Binary
 x0
 x1
End`;

  console.log('LP:', lp1.substring(0, 200));
  try {
    const result = highs.solve(lp1);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 2: Actual failing format with very small toFixed(10)
  console.log('\n=== Test 2: Very small toFixed(10) ===');
  const coefs = {
    ao: (0.01 * 0.5 / 150000).toFixed(10),
    au: (0.01 * 0.5 / 150000).toFixed(10),
    bo: (1.0 * 0.5 / 150000).toFixed(10),
    bu: (1.0 * 0.5 / 150000).toFixed(10),
    mo: (1000 * 0.5 / 150000).toFixed(10),
    mu: (1000 * 0.5 / 150000).toFixed(10),
  };
  console.log('Coefficients:', coefs);

  const lp2 = `Maximize
 obj: 0.5 x0 + 0.5 x1 - ${coefs.ao} ao - ${coefs.au} au - ${coefs.bo} bo - ${coefs.bu} bu - ${coefs.mo} mo - ${coefs.mu} mu
Subject To
 assign: x0 + x1 = 1
 balance: 100000 x0 + 120000 x1 - 1 ao + 1 au - 1 bo + 1 bu - 1 mo + 1 mu = 110000
Bounds
 0 <= ao <= 11000
 0 <= au <= 11000
 0 <= bo <= 55000
 0 <= bu <= 55000
 mo >= 0
 mu >= 0
Binary
 x0
 x1
End`;

  console.log('LP obj line:', lp2.split('\n')[1]);
  try {
    const result = highs.solve(lp2);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 3: The EXACT failing format from generated files
  console.log('\n=== Test 3: Exact failing.lp objective format ===');
  const lp3 = `Maximize
 obj: + 0.8923 x0_0 + 0.6263 x0_1 - 0.0000000333 ao0 - 0.0000000333 au0 - 0.0000033333 bo0 - 0.0000033333 bu0 - 0.0033333333 mo0 - 0.0033333333 mu0 - 0.0000000333 ao1 - 0.0000000333 au1 - 0.0000033333 bo1 - 0.0000033333 bu1 - 0.0033333333 mo1 - 0.0033333333 mu1
Subject To
 a0: + 1 x0_0 + 1 x0_1 = 1
 bal0: + 118717 x0_0 - 1 ao0 + 1 au0 - 1 bo0 + 1 bu0 - 1 mo0 + 1 mu0 = 150000
 bal1: + 156814 x0_1 - 1 ao1 + 1 au1 - 1 bo1 + 1 bu1 - 1 mo1 + 1 mu1 = 150000
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
End`;

  try {
    const result = highs.solve(lp3);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 4: Now run the EXACT failing LP from buildWithLineBreaks function
  console.log('\n=== Test 4: buildWithLineBreaks identical to test-isolate-crash ===');
  const lp4 = buildWithLineBreaksExact(10, 5, 200);
  console.log('LP length:', lp4.length);
  console.log('Lines:', lp4.split('\n').length);
  console.log('First line after Maximize:', lp4.split('\n')[1].substring(0, 100));

  try {
    const result = highs.solve(lp4);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 5: Different random seed
  console.log('\n=== Test 5: Same function, different execution ===');
  const lp5 = buildWithLineBreaksExact(10, 5, 200);
  console.log('LP length:', lp5.length);
  try {
    const result = highs.solve(lp5);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 6: Multiple solves in sequence
  console.log('\n=== Test 6: Multiple solves in sequence ===');
  for (let i = 0; i < 5; i++) {
    const lpSeq = buildWithLineBreaksExact(10, 5, 200);
    try {
      const result = highs.solve(lpSeq);
      console.log(`Solve ${i + 1}: Status ${result.Status} - PASSED`);
    } catch (err) {
      console.error(`Solve ${i + 1}: FAILED - ${err.message}`);
    }
  }
}

function buildWithLineBreaksExact(accounts, reps, maxLine) {
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

  // Slack penalties - THE EXACT FORMAT from test-compare-failing.js
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

runTest().catch(console.error);
