/**
 * Test: Realistic Global LP matching actual production structure
 * Includes: 4 tier metrics + ARR + ATR = 6 metrics × 6 slacks = 36 slacks per rep
 */

const highs = await import('highs').then(m => m.default()).catch(() => null);

if (!highs) {
  console.log('Failed to load HiGHS');
  process.exit(1);
}

console.log('HiGHS loaded successfully\n');

// Realistic Global LP with full complexity
function buildRealisticGlobalLP(numAccounts, numReps) {
  const lines = ['Maximize', ' obj:'];
  const objTerms = [];
  const binaries = [];
  const slacks = [];
  const constraints = [];
  
  // Generate accounts with realistic values
  const accounts = [];
  for (let a = 0; a < numAccounts; a++) {
    accounts.push({
      arr: Math.random() * 100000 + 5000,
      atr: Math.random() * 50000,
      tier: Math.floor(Math.random() * 4) + 1, // 1-4
      geoScore: Math.random() * 100,
      continuityScore: Math.random() > 0.7 ? 100 : 0,
      teamScore: Math.random() * 100
    });
  }
  
  // Binary assignment vars with realistic scores
  for (let a = 0; a < numAccounts; a++) {
    for (let r = 0; r < numReps; r++) {
      const varName = `x${a}r${r}`;
      // Realistic weighted score (continuity 40%, geo 35%, team 25%)
      const score = 0.4 * accounts[a].continuityScore + 
                   0.35 * accounts[a].geoScore + 
                   0.25 * accounts[a].teamScore;
      objTerms.push(`${score.toFixed(6)} ${varName}`);
      binaries.push(varName);
    }
  }
  
  // All 6 metrics: ARR, ATR, Tier1, Tier2, Tier3, Tier4
  const metrics = ['arr', 'atr', 't1', 't2', 't3', 't4'];
  const targets = {
    arr: accounts.reduce((s, a) => s + a.arr, 0) / numReps,
    atr: accounts.reduce((s, a) => s + a.atr, 0) / numReps,
    t1: accounts.filter(a => a.tier === 1).length / numReps,
    t2: accounts.filter(a => a.tier === 2).length / numReps,
    t3: accounts.filter(a => a.tier === 3).length / numReps,
    t4: accounts.filter(a => a.tier === 4).length / numReps
  };
  
  // Big-M penalty slacks (6 per rep per metric = 36 per rep)
  for (const metric of metrics) {
    for (let r = 0; r < numReps; r++) {
      const slackNames = [
        `${metric}ao${r}`, `${metric}au${r}`, // alpha over/under
        `${metric}bo${r}`, `${metric}bu${r}`, // beta over/under
        `${metric}mo${r}`, `${metric}mu${r}`  // bigM over/under
      ];
      for (const s of slackNames) {
        slacks.push(s);
        // Negative penalty in objective
        const penalty = s.includes('ao') || s.includes('au') ? 0.000001 :  // Very small alpha
                       s.includes('bo') || s.includes('bu') ? 0.0001 :     // Small beta
                       0.01;                                                // Large bigM
        objTerms.push(`- ${penalty.toFixed(8)} ${s}`);
      }
    }
  }
  
  lines.push('  ' + objTerms.slice(0, 50).join(' + ') + (objTerms.length > 50 ? ' +' : ''));
  
  // Split objective across multiple lines if needed
  for (let i = 50; i < objTerms.length; i += 50) {
    lines.push('  ' + objTerms.slice(i, i + 50).join(' + ') + (i + 50 < objTerms.length ? ' +' : ''));
  }
  
  lines.push('Subject To');
  
  // 1. Assignment constraints (each account to exactly one rep)
  for (let a = 0; a < numAccounts; a++) {
    const terms = [];
    for (let r = 0; r < numReps; r++) {
      terms.push(`x${a}r${r}`);
    }
    constraints.push(`a${a}: ${terms.join(' + ')} = 1`);
  }
  
  // 2. ARR decomposition constraints
  for (let r = 0; r < numReps; r++) {
    const loadTerms = [];
    for (let a = 0; a < numAccounts; a++) {
      loadTerms.push(`${accounts[a].arr.toFixed(2)} x${a}r${r}`);
    }
    constraints.push(`darr${r}: ${loadTerms.join(' + ')} - arrao${r} + arrau${r} - arrbo${r} + arrbu${r} - arrmo${r} + arrmu${r} = ${targets.arr.toFixed(2)}`);
  }
  
  // 3. ATR decomposition constraints
  for (let r = 0; r < numReps; r++) {
    const loadTerms = [];
    for (let a = 0; a < numAccounts; a++) {
      loadTerms.push(`${accounts[a].atr.toFixed(2)} x${a}r${r}`);
    }
    constraints.push(`datr${r}: ${loadTerms.join(' + ')} - atrao${r} + atrau${r} - atrbo${r} + atrbu${r} - atrmo${r} + atrmu${r} = ${targets.atr.toFixed(2)}`);
  }
  
  // 4. Tier decomposition constraints
  for (const tierNum of [1, 2, 3, 4]) {
    const tierKey = `t${tierNum}`;
    const tierAccounts = accounts.map((a, i) => ({ idx: i, isTier: a.tier === tierNum }));
    
    for (let r = 0; r < numReps; r++) {
      const loadTerms = tierAccounts
        .filter(a => a.isTier)
        .map(a => `x${a.idx}r${r}`);
      
      if (loadTerms.length > 0) {
        constraints.push(`d${tierKey}${r}: ${loadTerms.join(' + ')} - ${tierKey}ao${r} + ${tierKey}au${r} - ${tierKey}bo${r} + ${tierKey}bu${r} - ${tierKey}mo${r} + ${tierKey}mu${r} = ${targets[tierKey].toFixed(2)}`);
      }
    }
  }
  
  // Add all constraints
  for (const c of constraints) {
    lines.push(' ' + c);
  }
  
  lines.push('Bounds');
  for (const v of binaries) {
    lines.push(` 0 <= ${v} <= 1`);
  }
  
  // Slack bounds
  for (const s of slacks) {
    if (s.match(/ao|au/)) {
      lines.push(` 0 <= ${s} <= 100000`);
    } else if (s.match(/bo|bu/)) {
      lines.push(` 0 <= ${s} <= 500000`);
    } else {
      lines.push(` ${s} >= 0`);
    }
  }
  
  lines.push('Binary');
  for (const v of binaries) {
    lines.push(` ${v}`);
  }
  lines.push('End');
  
  return { 
    lp: lines.join('\n'), 
    numBinary: binaries.length, 
    numSlack: slacks.length,
    numConstraints: constraints.length,
    numAccounts,
    numReps
  };
}

// Test runner
async function testLP(name, lpData) {
  const startTime = Date.now();
  try {
    const solution = highs.solve(lpData.lp);
    const elapsed = Date.now() - startTime;
    console.log(`✓ ${name}: ${solution.Status} (${elapsed}ms)`);
    console.log(`  ${lpData.numAccounts}×${lpData.numReps} → Binary: ${lpData.numBinary}, Slacks: ${lpData.numSlack}, Constraints: ${lpData.numConstraints}`);
    console.log(`  LP size: ${(lpData.lp.length / 1024).toFixed(1)}KB\n`);
    return true;
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.log(`✗ ${name}: CRASHED (${elapsed}ms)`);
    console.log(`  ${lpData.numAccounts}×${lpData.numReps} → Binary: ${lpData.numBinary}, Slacks: ${lpData.numSlack}, Constraints: ${lpData.numConstraints}`);
    console.log(`  LP size: ${(lpData.lp.length / 1024).toFixed(1)}KB`);
    console.log(`  Error: ${err.message}\n`);
    return false;
  }
}

console.log('========================================');
console.log('REALISTIC GLOBAL LP (6 metrics × 6 slacks)');
console.log('========================================\n');

// Test increasingly larger problems
const testCases = [
  [10, 5],   // Small
  [20, 8],   // Medium (production-like for single build)
  [34, 8],   // Real COMM size
  [50, 10],  // Larger
  [100, 12], // Much larger
  [200, 15], // Stress test
];

let lastSuccess = null;
let firstFailure = null;

for (const [accounts, reps] of testCases) {
  const result = await testLP(`${accounts} accounts × ${reps} reps`, buildRealisticGlobalLP(accounts, reps));
  if (result) {
    lastSuccess = [accounts, reps];
  } else if (!firstFailure) {
    firstFailure = [accounts, reps];
  }
}

console.log('\n========================================');
console.log('SUMMARY');
console.log('========================================\n');
if (lastSuccess) {
  console.log(`Last success: ${lastSuccess[0]}×${lastSuccess[1]} (${lastSuccess[0] * lastSuccess[1]} binary vars)`);
}
if (firstFailure) {
  console.log(`First failure: ${firstFailure[0]}×${firstFailure[1]} (${firstFailure[0] * firstFailure[1]} binary vars)`);
  console.log(`\nNOTE: This is where HiGHS WASM crashes with the full Big-M formulation.`);
} else {
  console.log('All tests passed! HiGHS handled all problem sizes.');
}
