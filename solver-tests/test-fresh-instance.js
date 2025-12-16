/**
 * Test: Fresh HiGHS instance for each solve
 *
 * KEY FINDING: The HiGHS WASM module may get corrupted GLOBALLY
 * if ANY solve fails (even on a different instance).
 */

import highsLoader from 'highs';

async function runTest() {
  // Test 1: Create fresh instance for EACH solve
  console.log('=== Test: Fresh instance for each complex solve ===');
  for (let i = 0; i < 10; i++) {
    try {
      const highs = await highsLoader();
      const lp = buildComplexLP(10, 5);
      const result = highs.solve(lp);
      console.log(`Solve ${i + 1}: Status ${result.Status}`);
    } catch (err) {
      console.error(`Solve ${i + 1}: FAILED - ${err.message}`);
      break;
    }
  }

  // Test 2: Reuse single instance for all solves
  console.log('\n=== Test: Single instance for all complex solves ===');
  try {
    const highs = await highsLoader();
    for (let i = 0; i < 10; i++) {
      try {
        const lp = buildComplexLP(10, 5);
        const result = highs.solve(lp);
        console.log(`Solve ${i + 1}: Status ${result.Status}`);
      } catch (err) {
        console.error(`Solve ${i + 1}: FAILED - ${err.message}`);
        break;
      }
    }
  } catch (err) {
    console.error('Failed to load HiGHS:', err.message);
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
