/**
 * Test: Deterministic LP (no randomness)
 *
 * If this works reliably, the issue is specific random values
 */

import highsLoader from 'highs';

async function runTest() {
  console.log('Loading HiGHS...');
  const highs = await highsLoader();
  console.log('HiGHS loaded');

  // Build ONE deterministic LP
  const lp = buildDeterministicLP(10, 5);
  console.log('LP length:', lp.length);
  console.log('LP hash:', simpleHash(lp));

  // Solve it 20 times
  console.log('\n=== Test: Same deterministic LP 20 times ===');
  for (let i = 0; i < 20; i++) {
    try {
      const result = highs.solve(lp);
      console.log(`Solve ${i + 1}: Status ${result.Status}`);
    } catch (err) {
      console.error(`Solve ${i + 1}: FAILED - ${err.message}`);
      break;
    }
  }

  // Now test DIFFERENT deterministic LPs
  console.log('\n=== Test: Different deterministic LPs ===');
  const highs2 = await highsLoader();
  for (let i = 0; i < 20; i++) {
    try {
      const lpDiff = buildDeterministicLP(10, 5, i * 100);  // Different seed
      const result = highs2.solve(lpDiff);
      console.log(`Solve ${i + 1} (seed=${i * 100}): Status ${result.Status}`);
    } catch (err) {
      console.error(`Solve ${i + 1}: FAILED - ${err.message}`);
      break;
    }
  }
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function buildDeterministicLP(accounts, reps, baseSeed = 42) {
  const arrTarget = 150000;
  const lines = [];
  let seed = baseSeed;

  // Single-line objective
  let obj = ' obj:';
  for (let a = 0; a < accounts; a++) {
    for (let r = 0; r < reps; r++) {
      const score = (0.5 + seededRandom(seed++) * 0.5).toFixed(4);
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

  // Balance constraints - deterministic ARR values
  for (let r = 0; r < reps; r++) {
    let terms = [];
    for (let a = 0; a < accounts; a++) {
      const arr = Math.floor(50000 + seededRandom(seed++) * 200000);
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
