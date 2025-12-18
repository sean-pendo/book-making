#!/usr/bin/env node
/**
 * Simple Cloud Run Benchmark - Minimal version for debugging
 */

const CLOUD_RUN_URL = 'https://highs-solver-710441294184.us-central1.run.app';

function buildSimpleLP(numAccounts, numReps) {
  const lines = [];
  
  // Simple objective
  lines.push('Maximize');
  lines.push('obj:');
  for (let a = 0; a < numAccounts; a++) {
    let line = '';
    for (let r = 0; r < numReps; r++) {
      line += ` + 0.5 x${a}_${r}`;
    }
    lines.push(line);
  }
  
  // Assignment constraints
  lines.push('Subject To');
  for (let a = 0; a < numAccounts; a++) {
    let c = `a${a}:`;
    for (let r = 0; r < numReps; r++) c += ` + 1 x${a}_${r}`;
    lines.push(c + ' = 1');
  }
  
  // Binary
  lines.push('Binary');
  for (let a = 0; a < numAccounts; a++) {
    for (let r = 0; r < numReps; r++) {
      lines.push(` x${a}_${r}`);
    }
  }
  
  lines.push('End');
  return lines.join('\n');
}

async function testSize(accounts, reps) {
  console.log(`\nTesting ${accounts}x${reps} = ${accounts * reps} vars...`);
  
  const lp = buildSimpleLP(accounts, reps);
  console.log(`  LP size: ${(lp.length / 1024).toFixed(1)}KB`);
  
  console.log('  Sending to Cloud Run...');
  const start = Date.now();
  
  try {
    const response = await fetch(`${CLOUD_RUN_URL}/solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: lp
    });
    
    const result = await response.json();
    const total = Date.now() - start;
    
    console.log(`  ✅ ${result.status} in ${total}ms (server: ${result.solveTimeMs}ms)`);
    return { success: true, total, server: result.solveTimeMs };
  } catch (err) {
    console.log(`  ❌ Error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log('=== Cloud Run Simple Benchmark ===');
  console.log(`URL: ${CLOUD_RUN_URL}`);
  
  // Health check
  console.log('\nHealth check...');
  try {
    const resp = await fetch(`${CLOUD_RUN_URL}/health`);
    const data = await resp.json();
    console.log('  Status:', data.status);
  } catch (e) {
    console.log('  FAILED:', e.message);
    process.exit(1);
  }
  
  // Test different sizes
  const sizes = [
    [10, 5],
    [50, 10],
    [100, 20],
    [200, 30],
    [432, 48],  // Customer-like
  ];
  
  const results = [];
  for (const [a, r] of sizes) {
    const result = await testSize(a, r);
    results.push({ accounts: a, reps: r, ...result });
    
    // Small delay
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Summary
  console.log('\n=== Summary ===');
  for (const r of results) {
    if (r.success) {
      console.log(`${r.accounts}x${r.reps}: ${r.total}ms total, ${r.server}ms server`);
    } else {
      console.log(`${r.accounts}x${r.reps}: FAILED - ${r.error}`);
    }
  }
}

main().catch(console.error);

