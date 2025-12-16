/**
 * Test: Compare HiGHS stability with Big-M slacks vs simple LP
 * Hypothesis: Big-M slacks + decomposition constraints cause HiGHS WASM crashes
 */

const highs = await import('highs').then(m => m.default()).catch(() => null);

if (!highs) {
  console.log('Failed to load HiGHS');
  process.exit(1);
}

console.log('HiGHS loaded successfully\n');

// Test 1: Simple LP (like waterfall) - just binary vars + capacity constraints
function buildSimpleLP(numAccounts, numReps) {
  const lines = ['Maximize', ' obj:'];
  const objTerms = [];
  const binaries = [];
  
  for (let a = 0; a < numAccounts; a++) {
    for (let r = 0; r < numReps; r++) {
      const varName = `x_${a}_${r}`;
      const score = Math.random() * 100;
      objTerms.push(`${score.toFixed(2)} ${varName}`);
      binaries.push(varName);
    }
  }
  
  lines.push('  ' + objTerms.join(' + '));
  lines.push('Subject To');
  
  // Each account assigned to exactly one rep
  for (let a = 0; a < numAccounts; a++) {
    const terms = [];
    for (let r = 0; r < numReps; r++) {
      terms.push(`x_${a}_${r}`);
    }
    lines.push(` assign_${a}: ${terms.join(' + ')} = 1`);
  }
  
  // Capacity constraints (simple)
  const targetLoad = numAccounts / numReps;
  for (let r = 0; r < numReps; r++) {
    const terms = [];
    for (let a = 0; a < numAccounts; a++) {
      terms.push(`x_${a}_${r}`);
    }
    lines.push(` cap_${r}: ${terms.join(' + ')} <= ${Math.ceil(targetLoad * 1.5)}`);
  }
  
  lines.push('Bounds');
  for (const v of binaries) {
    lines.push(` 0 <= ${v} <= 1`);
  }
  
  lines.push('Binary');
  lines.push(' ' + binaries.join(' '));
  lines.push('End');
  
  return { 
    lp: lines.join('\n'), 
    numBinary: binaries.length, 
    numSlack: 0,
    numConstraints: numAccounts + numReps
  };
}

// Test 2: Big-M LP (like global optimizer) - binary vars + 6 slacks per rep per metric
function buildBigMLP(numAccounts, numReps) {
  const lines = ['Maximize', ' obj:'];
  const objTerms = [];
  const binaries = [];
  const slacks = [];
  
  // Binary assignment vars
  for (let a = 0; a < numAccounts; a++) {
    for (let r = 0; r < numReps; r++) {
      const varName = `x_${a}_${r}`;
      const score = Math.random() * 100;
      objTerms.push(`${score.toFixed(2)} ${varName}`);
      binaries.push(varName);
    }
  }
  
  // Big-M penalty slacks (6 per rep per metric)
  const metrics = ['arr', 'atr'];
  for (const metric of metrics) {
    for (let r = 0; r < numReps; r++) {
      const slackNames = [
        `${metric}_ao_${r}`, `${metric}_au_${r}`, // alpha over/under
        `${metric}_bo_${r}`, `${metric}_bu_${r}`, // beta over/under
        `${metric}_mo_${r}`, `${metric}_mu_${r}`  // bigM over/under
      ];
      for (const s of slackNames) {
        slacks.push(s);
        // Negative penalty in objective (penalize slack usage)
        const penalty = s.includes('_ao') || s.includes('_au') ? 0.01 :
                       s.includes('_bo') || s.includes('_bu') ? 1.0 : 1000.0;
        objTerms.push(`- ${penalty.toFixed(2)} ${s}`);
      }
    }
  }
  
  lines.push('  ' + objTerms.join(' + '));
  lines.push('Subject To');
  
  // Assignment constraints
  for (let a = 0; a < numAccounts; a++) {
    const terms = [];
    for (let r = 0; r < numReps; r++) {
      terms.push(`x_${a}_${r}`);
    }
    lines.push(` assign_${a}: ${terms.join(' + ')} = 1`);
  }
  
  // Big-M decomposition constraints (6 slacks per constraint)
  const targetLoad = numAccounts / numReps;
  for (const metric of metrics) {
    for (let r = 0; r < numReps; r++) {
      const loadTerms = [];
      for (let a = 0; a < numAccounts; a++) {
        const coef = Math.random() * 10000; // Simulated ARR/ATR
        loadTerms.push(`${coef.toFixed(2)} x_${a}_${r}`);
      }
      // Decomposition: load - ao + au - bo + bu - mo + mu = target
      const decompLine = ` decomp_${metric}_${r}: ${loadTerms.join(' + ')} ` +
        `- ${metric}_ao_${r} + ${metric}_au_${r} ` +
        `- ${metric}_bo_${r} + ${metric}_bu_${r} ` +
        `- ${metric}_mo_${r} + ${metric}_mu_${r} = ${(targetLoad * 50000).toFixed(2)}`;
      lines.push(decompLine);
    }
  }
  
  lines.push('Bounds');
  for (const v of binaries) {
    lines.push(` 0 <= ${v} <= 1`);
  }
  // Slack bounds (alpha/beta bounded, bigM unbounded)
  for (const s of slacks) {
    if (s.includes('_ao') || s.includes('_au')) {
      lines.push(` 0 <= ${s} <= 10000`);  // Alpha bounded
    } else if (s.includes('_bo') || s.includes('_bu')) {
      lines.push(` 0 <= ${s} <= 50000`);  // Beta bounded
    } else {
      lines.push(` ${s} >= 0`);  // BigM unbounded
    }
  }
  
  lines.push('Binary');
  lines.push(' ' + binaries.join(' '));
  lines.push('End');
  
  return { 
    lp: lines.join('\n'), 
    numBinary: binaries.length, 
    numSlack: slacks.length,
    numConstraints: numAccounts + numReps * metrics.length
  };
}

// Test runner
async function testLP(name, lpData) {
  const startTime = Date.now();
  try {
    const solution = highs.solve(lpData.lp);
    const elapsed = Date.now() - startTime;
    console.log(`✓ ${name}: ${solution.Status} (${elapsed}ms)`);
    console.log(`  Binary: ${lpData.numBinary}, Slacks: ${lpData.numSlack}, Constraints: ${lpData.numConstraints}`);
    console.log(`  LP size: ${(lpData.lp.length / 1024).toFixed(1)}KB\n`);
    return true;
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.log(`✗ ${name}: CRASHED (${elapsed}ms)`);
    console.log(`  Binary: ${lpData.numBinary}, Slacks: ${lpData.numSlack}, Constraints: ${lpData.numConstraints}`);
    console.log(`  LP size: ${(lpData.lp.length / 1024).toFixed(1)}KB`);
    console.log(`  Error: ${err.message}\n`);
    return false;
  }
}

console.log('========================================');
console.log('SIMPLE LP (no slacks) - like Waterfall');
console.log('========================================\n');

await testLP('10×5 Simple', buildSimpleLP(10, 5));
await testLP('20×8 Simple', buildSimpleLP(20, 8));
await testLP('50×10 Simple', buildSimpleLP(50, 10));
await testLP('100×15 Simple', buildSimpleLP(100, 15));

console.log('\n========================================');
console.log('BIG-M LP (6 slacks/rep/metric) - like Global');
console.log('========================================\n');

await testLP('10×5 Big-M', buildBigMLP(10, 5));
await testLP('20×8 Big-M', buildBigMLP(20, 8));
await testLP('50×10 Big-M', buildBigMLP(50, 10));
await testLP('100×15 Big-M', buildBigMLP(100, 15));

console.log('\n========================================');
console.log('FINDING THRESHOLD');
console.log('========================================\n');

// Find exact threshold where Big-M fails
for (const accounts of [12, 15, 18, 20, 25, 30]) {
  const reps = 5;
  const result = await testLP(`${accounts}×${reps} Big-M`, buildBigMLP(accounts, reps));
  if (!result) {
    console.log(`>>> Threshold found: fails at ${accounts}×${reps} = ${accounts * reps} binary vars <<<\n`);
    break;
  }
}
