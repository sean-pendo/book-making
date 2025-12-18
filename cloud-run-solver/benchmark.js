#!/usr/bin/env node
/**
 * Cloud Run HiGHS Solver Benchmark
 * 
 * Completely isolated benchmarking tool - no dependencies on the main app.
 * Tests Cloud Run solver performance with realistic LP problems.
 * 
 * Usage:
 *   node benchmark.js              # Run full benchmark
 *   node benchmark.js --quick      # Quick test (1 iteration each)
 *   node benchmark.js --size=500   # Test specific account count
 */

const CLOUD_RUN_URL = 'https://highs-solver-710441294184.us-central1.run.app';

// Parse CLI args
const args = process.argv.slice(2);
const isQuick = args.includes('--quick');
const sizeArg = args.find(a => a.startsWith('--size='));
const customSize = sizeArg ? parseInt(sizeArg.split('=')[1]) : null;

// Test configurations
const CONFIGS = customSize 
  ? [{ name: `Custom (${customSize})`, accounts: customSize, reps: 48 }]
  : [
      { name: 'Tiny', accounts: 50, reps: 10 },
      { name: 'Small', accounts: 100, reps: 20 },
      { name: 'Medium', accounts: 300, reps: 30 },
      { name: 'Customer-like', accounts: 432, reps: 48 },
      { name: 'Large', accounts: 1000, reps: 48 },
      { name: 'Prospect-small', accounts: 2000, reps: 48 },
      // Uncomment for full-scale tests (may take several minutes):
      // { name: 'Prospect-full', accounts: 7619, reps: 48 },
    ];

const ITERATIONS = isQuick ? 1 : 3;

/**
 * Build a realistic LP problem matching production structure
 * Uses three-tier Big-M penalty system like the real solver
 */
function buildRealisticLP(numAccounts, numReps) {
  const lines = [];
  
  // Realistic ARR distribution
  const accountARRs = [];
  for (let a = 0; a < numAccounts; a++) {
    // Log-normal distribution for realistic ARR spread
    const base = 25000 + Math.random() * 200000;
    accountARRs.push(Math.round(base));
  }
  
  const totalARR = accountARRs.reduce((s, v) => s + v, 0);
  const targetARR = totalARR / numReps;
  
  // Objective: maximize assignment scores with penalty slacks
  lines.push('Maximize');
  let objTerms = [];
  
  for (let a = 0; a < numAccounts; a++) {
    for (let r = 0; r < numReps; r++) {
      // Realistic score composition:
      // - 30% have continuity (current owner)
      // - Geography varies by region match
      // - Team alignment varies by tier match
      const contScore = Math.random() > 0.7 ? 0.85 : 0.05;
      const geoScore = 0.3 + Math.random() * 0.7;
      const teamScore = 0.4 + Math.random() * 0.6;
      const tieBreaker = 0.001 * (1 - a / numAccounts);
      
      const coef = (0.35 * contScore + 0.35 * geoScore + 0.30 * teamScore + tieBreaker).toFixed(6);
      objTerms.push(`+ ${coef} x${a}_${r}`);
    }
  }
  
  // Add three-tier penalty slacks (Alpha, Beta, BigM)
  for (let r = 0; r < numReps; r++) {
    // Alpha: small penalty for variance band deviation
    objTerms.push(`- 0.001 ao${r}`);
    objTerms.push(`- 0.001 au${r}`);
    // Beta: medium penalty for buffer zone
    objTerms.push(`- 0.01 bo${r}`);
    objTerms.push(`- 0.01 bu${r}`);
    // BigM: large penalty for hard limit violations
    objTerms.push(`- 0.1 mo${r}`);
    objTerms.push(`- 0.1 mu${r}`);
  }
  
  // Write objective with line breaks (LP format allows continuation)
  lines.push('obj:');
  const TERMS_PER_LINE = 20;
  for (let i = 0; i < objTerms.length; i += TERMS_PER_LINE) {
    lines.push(' ' + objTerms.slice(i, i + TERMS_PER_LINE).join(' '));
  }
  
  // Constraints
  lines.push('Subject To');
  
  // Each account assigned to exactly one rep
  for (let a = 0; a < numAccounts; a++) {
    let terms = [];
    for (let r = 0; r < numReps; r++) {
      terms.push(`+ 1 x${a}_${r}`);
    }
    lines.push(`a${a}: ${terms.join(' ')} = 1`);
  }
  
  // ARR balance constraints with three-tier slacks
  for (let r = 0; r < numReps; r++) {
    let terms = [];
    for (let a = 0; a < numAccounts; a++) {
      terms.push(`+ ${accountARRs[a]} x${a}_${r}`);
    }
    // Slack variables: actual = target + over - under
    terms.push(`- 1 ao${r}`);
    terms.push(`+ 1 au${r}`);
    terms.push(`- 1 bo${r}`);
    terms.push(`+ 1 bu${r}`);
    terms.push(`- 1 mo${r}`);
    terms.push(`+ 1 mu${r}`);
    
    // Write constraint - all on one logical line (LP format)
    lines.push(`bal${r}: ${terms.join(' ')} = ${Math.round(targetARR)}`);
  }
  
  // Bounds for slack variables
  lines.push('Bounds');
  const variance = Math.round(targetARR * 0.10);  // 10% variance band
  const buffer = Math.round(targetARR * 0.40);    // 40% buffer zone
  
  for (let r = 0; r < numReps; r++) {
    // Alpha slacks: bounded by variance band
    lines.push(` 0 <= ao${r} <= ${variance}`);
    lines.push(` 0 <= au${r} <= ${variance}`);
    // Beta slacks: bounded by buffer zone
    lines.push(` 0 <= bo${r} <= ${buffer}`);
    lines.push(` 0 <= bu${r} <= ${buffer}`);
    // BigM slacks: unbounded (but heavily penalized)
    lines.push(` mo${r} >= 0`);
    lines.push(` mu${r} >= 0`);
  }
  
  // Binary variables
  lines.push('Binary');
  for (let a = 0; a < numAccounts; a++) {
    let varLine = '';
    for (let r = 0; r < numReps; r++) {
      varLine += ` x${a}_${r}`;
      // Line break every 20 vars
      if ((r + 1) % 20 === 0) {
        lines.push(varLine);
        varLine = '';
      }
    }
    if (varLine) lines.push(varLine);
  }
  
  lines.push('End');
  
  return {
    lp: lines.join('\n'),
    stats: {
      numVars: numAccounts * numReps,
      numConstraints: numAccounts + numReps,
      numSlacks: numReps * 6,
      totalARR,
      targetARR
    }
  };
}

/**
 * Send LP to Cloud Run and measure timing
 */
async function solveLP(lp) {
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);  // 5 min timeout
    
    const response = await fetch(`${CLOUD_RUN_URL}/solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: lp,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    const totalTime = Date.now() - startTime;
    
    return {
      status: result.status,
      objective: result.objectiveValue,
      serverTimeMs: result.solveTimeMs || 0,
      totalTimeMs: totalTime,
      networkTimeMs: totalTime - (result.solveTimeMs || 0),
      numAssignments: Object.keys(result.columns || {}).filter(k => 
        k.startsWith('x') && result.columns[k].Primal > 0.5
      ).length
    };
  } catch (err) {
    throw new Error(`Fetch failed: ${err.message}`);
  }
}

/**
 * Run benchmark for a single configuration
 */
async function benchmarkConfig(config, iterations) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📊 ${config.name}`);
  console.log(`   ${config.accounts} accounts × ${config.reps} reps = ${config.accounts * config.reps} binary vars`);
  console.log(`${'─'.repeat(60)}`);
  
  // Build LP
  const buildStart = Date.now();
  const { lp, stats } = buildRealisticLP(config.accounts, config.reps);
  const buildTime = Date.now() - buildStart;
  
  const lpSizeKB = Math.round(lp.length / 1024);
  const lpSizeMB = (lp.length / 1024 / 1024).toFixed(2);
  
  console.log(`   LP built in ${buildTime}ms`);
  console.log(`   Size: ${lpSizeKB > 1024 ? lpSizeMB + 'MB' : lpSizeKB + 'KB'}, ${lp.split('\n').length} lines`);
  console.log(`   Constraints: ${stats.numConstraints}, Slacks: ${stats.numSlacks}`);
  console.log(`   Target ARR/rep: $${Math.round(stats.targetARR).toLocaleString()}`);
  
  const results = [];
  
  for (let i = 0; i < iterations; i++) {
    process.stdout.write(`   Iteration ${i + 1}/${iterations}: `);
    
    try {
      const result = await solveLP(lp);
      
      const statusEmoji = result.status === 'Optimal' ? '✅' : 
                          result.status === 'Time limit' ? '⏱️' : '⚠️';
      
      console.log(`${statusEmoji} ${result.status} in ${result.totalTimeMs}ms (server: ${result.serverTimeMs}ms, network: ${result.networkTimeMs}ms)`);
      
      results.push(result);
      
    } catch (err) {
      console.log(`❌ ERROR: ${err.message}`);
      results.push({ error: err.message });
    }
    
    // Small delay between iterations to avoid rate limiting
    if (i < iterations - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  // Calculate stats
  const successful = results.filter(r => !r.error);
  
  if (successful.length > 0) {
    const avgTotal = Math.round(successful.reduce((s, r) => s + r.totalTimeMs, 0) / successful.length);
    const avgServer = Math.round(successful.reduce((s, r) => s + r.serverTimeMs, 0) / successful.length);
    const avgNetwork = Math.round(successful.reduce((s, r) => s + r.networkTimeMs, 0) / successful.length);
    const minTotal = Math.min(...successful.map(r => r.totalTimeMs));
    const maxTotal = Math.max(...successful.map(r => r.totalTimeMs));
    
    return {
      config,
      lpSizeKB,
      stats,
      avgTotalMs: avgTotal,
      avgServerMs: avgServer,
      avgNetworkMs: avgNetwork,
      minMs: minTotal,
      maxMs: maxTotal,
      successRate: `${successful.length}/${iterations}`,
      results
    };
  }
  
  return {
    config,
    lpSizeKB,
    stats,
    error: 'All iterations failed',
    results
  };
}

/**
 * Check if Cloud Run is healthy
 */
async function checkHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(`${CLOUD_RUN_URL}/health`, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    const data = await response.json();
    return data.status === 'healthy';
  } catch {
    return false;
  }
}

/**
 * Main benchmark runner
 */
async function runBenchmark() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Cloud Run HiGHS Solver Benchmark                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nTarget: ${CLOUD_RUN_URL}`);
  console.log(`Mode: ${isQuick ? 'Quick (1 iteration)' : `Full (${ITERATIONS} iterations)`}`);
  console.log(`Configs: ${CONFIGS.length}`);
  
  // Health check
  console.log('\n🔍 Checking Cloud Run health...');
  const healthy = await checkHealth();
  
  if (!healthy) {
    console.log('❌ Cloud Run service not responding. Is it deployed?');
    console.log('   Try: curl ' + CLOUD_RUN_URL + '/health');
    process.exit(1);
  }
  console.log('✅ Service is healthy');
  
  // Warm up (trigger cold start if needed)
  console.log('\n🔥 Warming up (triggering cold start if needed)...');
  const warmupStart = Date.now();
  await checkHealth();
  const warmupTime = Date.now() - warmupStart;
  console.log(`   Warmup response: ${warmupTime}ms ${warmupTime > 5000 ? '(cold start detected)' : ''}`);
  
  // Wait a moment for instance to stabilize
  await new Promise(r => setTimeout(r, 2000));
  
  // Run benchmarks
  const allResults = [];
  
  for (const config of CONFIGS) {
    const result = await benchmarkConfig(config, ITERATIONS);
    allResults.push(result);
  }
  
  // Print summary
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                      SUMMARY                               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Config               Variables    LP Size    Avg Time   Server    Network   Success');
  console.log('─'.repeat(90));
  
  for (const r of allResults) {
    if (r.error) {
      console.log(`${r.config.name.padEnd(20)} ${'-'.padStart(10)} ${'-'.padStart(10)} FAILED`);
    } else {
      const vars = (r.config.accounts * r.config.reps).toLocaleString().padStart(10);
      const size = (r.lpSizeKB > 1024 ? (r.lpSizeKB/1024).toFixed(1) + 'MB' : r.lpSizeKB + 'KB').padStart(10);
      const avg = (r.avgTotalMs + 'ms').padStart(10);
      const server = (r.avgServerMs + 'ms').padStart(10);
      const network = (r.avgNetworkMs + 'ms').padStart(10);
      
      console.log(`${r.config.name.padEnd(20)} ${vars} ${size} ${avg} ${server} ${network}   ${r.successRate}`);
    }
  }
  
  console.log('─'.repeat(90));
  
  // Performance insights
  console.log('\n📈 Performance Insights:');
  
  const successful = allResults.filter(r => !r.error);
  if (successful.length >= 2) {
    // Calculate scaling factor
    const small = successful[0];
    const large = successful[successful.length - 1];
    const varRatio = (large.config.accounts * large.config.reps) / (small.config.accounts * small.config.reps);
    const timeRatio = large.avgTotalMs / small.avgTotalMs;
    
    console.log(`   • Scaling: ${varRatio.toFixed(1)}x more variables → ${timeRatio.toFixed(1)}x more time`);
    
    // Network overhead
    const avgNetworkPct = successful.reduce((s, r) => s + (r.avgNetworkMs / r.avgTotalMs * 100), 0) / successful.length;
    console.log(`   • Network overhead: ~${avgNetworkPct.toFixed(0)}% of total time`);
    
    // Estimate for full prospect
    if (!CONFIGS.find(c => c.accounts === 7619)) {
      const largestResult = successful[successful.length - 1];
      const scaleFactor = (7619 * 48) / (largestResult.config.accounts * largestResult.config.reps);
      const estimated = Math.round(largestResult.avgTotalMs * Math.pow(scaleFactor, 1.2));  // Slightly superlinear
      console.log(`   • Estimated time for 7619×48 (full prospect): ~${Math.round(estimated/1000)}s`);
    }
  }
  
  console.log('\n✨ Benchmark complete!\n');
}

// Run
runBenchmark().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});

