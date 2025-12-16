/**
 * Test: Complex LP State Corruption
 *
 * Find exactly when the corruption happens
 */

import highsLoader from 'highs';

async function runTest() {
  console.log('Loading HiGHS...');
  const highs = await highsLoader();
  console.log('HiGHS loaded');

  // Try solving multiple COMPLEX LPs
  console.log('\n=== Test: Multiple complex LP solves ===');
  for (let i = 0; i < 10; i++) {
    const lp = buildComplexLP(10, 5);
    try {
      const result = highs.solve(lp);
      console.log(`Solve ${i + 1}: Status ${result.Status}`);
      if (result.Status !== 'Optimal') {
        console.error(`  UNEXPECTED STATUS at solve ${i + 1}`);
        break;
      }
    } catch (err) {
      console.error(`Solve ${i + 1}: FAILED - ${err.message}`);
      // Try fresh instance
      console.log('  Trying fresh instance...');
      try {
        const highs2 = await highsLoader();
        const result2 = highs2.solve(lp);
        console.log('  Fresh instance: Status', result2.Status);
      } catch (err2) {
        console.error('  Fresh instance ALSO FAILED:', err2.message);
      }
      break;
    }
  }

  // Test: Alternating simple and complex
  console.log('\n=== Test: Alternating simple and complex ===');
  const highs3 = await highsLoader();
  const simpleLP = `Maximize
 obj: x + y
Subject To
 c1: x + y <= 10
Bounds
 x >= 0
 y >= 0
End`;

  for (let i = 0; i < 10; i++) {
    const lp = i % 2 === 0 ? simpleLP : buildComplexLP(10, 5);
    const label = i % 2 === 0 ? 'simple' : 'complex';
    try {
      const result = highs3.solve(lp);
      console.log(`Solve ${i + 1} (${label}): Status ${result.Status}`);
    } catch (err) {
      console.error(`Solve ${i + 1} (${label}): FAILED - ${err.message}`);
      break;
    }
  }
}

function buildComplexLP(accounts, reps) {
  const arrTarget = 150000;
  const lines = [];

  // Single-line objective (works in isolation)
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

runTest().catch(console.error);
