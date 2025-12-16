/**
 * Test: Edge Function LP Solver
 * 
 * This tests the Supabase Edge Function to diagnose HiGHS issues.
 * Run with: node test-edge-function.js
 */

const SUPABASE_URL = 'https://lolnbotrdamhukdrrsmh.supabase.co';
// lp-solver has verify_jwt = false, so no auth needed

const DEBUG_SERVER = 'http://127.0.0.1:7242/ingest/b5eb0315-d6dd-459e-af3e-0db61f9c8670';

async function log(location, message, data = {}, hypothesisId = 'INIT') {
  try {
    await fetch(DEBUG_SERVER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location,
        message,
        data,
        timestamp: Date.now(),
        sessionId: 'edge-func-debug',
        hypothesisId
      })
    });
  } catch (e) {
    // Silently fail if debug server not running
  }
}

// Test cases of increasing complexity
const testCases = [
  {
    name: 'Minimal LP (2 vars)',
    lp: `Maximize
 obj: + 1 x + 2 y
Subject To
 c1: + 1 x + 1 y <= 10
Bounds
 x >= 0
 y >= 0
End`
  },
  {
    name: 'Small (5 accounts, 3 reps = 15 vars)',
    lp: buildMediumLP(5, 3)
  },
  {
    name: 'Medium (10 accounts, 5 reps = 50 vars)',
    lp: buildMediumLP(10, 5)
  },
  {
    name: 'Medium-Large (20 accounts, 8 reps = 160 vars)',
    lp: buildMediumLP(20, 8)
  },
  {
    name: 'Edge Function Limit (25 accounts, 8 reps = 200 vars)',
    lp: buildMediumLP(25, 8)
  },
  {
    name: 'Beyond Limit (30 accounts, 10 reps = 300 vars)',
    lp: buildMediumLP(30, 10)
  },
  {
    name: 'Production-like (50 accounts, 10 reps = 500 vars)',
    lp: buildMediumLP(50, 10)
  },
  {
    name: 'Large (100 accounts, 15 reps = 1500 vars)',
    lp: buildMediumLP(100, 15)
  }
];

function buildMediumLP(accounts, reps) {
  const lines = [];
  lines.push('Maximize');
  
  // Objective
  let obj = ' obj:';
  for (let a = 0; a < accounts; a++) {
    for (let r = 0; r < reps; r++) {
      const score = (0.3 + Math.random() * 0.7).toFixed(4);
      obj += ` + ${score} x${a}_${r}`;
    }
  }
  // Add slack penalties
  for (let r = 0; r < reps; r++) {
    obj += ` - 0.0001 so${r} - 0.0001 su${r}`;
  }
  lines.push(obj);
  
  lines.push('Subject To');
  
  // Each account assigned once
  for (let a = 0; a < accounts; a++) {
    let constraint = ` a${a}:`;
    for (let r = 0; r < reps; r++) {
      constraint += ` + 1 x${a}_${r}`;
    }
    constraint += ' = 1';
    lines.push(constraint);
  }
  
  // Balance constraints
  const target = 150000;
  for (let r = 0; r < reps; r++) {
    let constraint = ` b${r}:`;
    for (let a = 0; a < accounts; a++) {
      const arr = Math.floor(10000 + Math.random() * 50000);
      constraint += ` + ${arr} x${a}_${r}`;
    }
    constraint += ` - 1 so${r} + 1 su${r} = ${target}`;
    lines.push(constraint);
  }
  
  lines.push('Bounds');
  for (let r = 0; r < reps; r++) {
    lines.push(` 0 <= so${r} <= ${target * 0.5}`);
    lines.push(` 0 <= su${r} <= ${target * 0.5}`);
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

async function testEdgeFunction(testCase) {
  const startTime = Date.now();
  
  await log('test-edge-function.js:start', `Testing: ${testCase.name}`, {
    lpLength: testCase.lp.length,
    lpLines: testCase.lp.split('\n').length
  }, 'H1');
  
  console.log(`\n=== ${testCase.name} ===`);
  console.log(`LP: ${testCase.lp.length} chars, ${testCase.lp.split('\n').length} lines`);
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/lp-solver`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        lpString: testCase.lp,
        timeoutSeconds: 30,
        mipGap: 0.01,
        presolve: true
      })
    });
    
    const elapsed = Date.now() - startTime;
    
    if (!response.ok) {
      const text = await response.text();
      await log('test-edge-function.js:error', `HTTP error`, {
        status: response.status,
        statusText: response.statusText,
        body: text.substring(0, 500),
        elapsed
      }, 'H2');
      console.log(`  HTTP Error: ${response.status} ${response.statusText}`);
      console.log(`  Body: ${text.substring(0, 200)}`);
      return { success: false, error: `HTTP ${response.status}` };
    }
    
    const data = await response.json();
    
    await log('test-edge-function.js:result', `Edge function response`, {
      status: data.status,
      objectiveValue: data.objectiveValue,
      variableCount: Object.keys(data.variables || {}).length,
      solveTimeMs: data.solveTimeMs,
      error: data.error,
      elapsed
    }, 'H3');
    
    // Always log debug trace if present
    if (data.debugTrace && data.debugTrace.length > 0) {
      console.log(`  --- Debug Trace (${data.debugTrace.length} entries) ---`);
      for (const entry of data.debugTrace) {
        console.log(`    ${entry}`);
      }
      console.log(`  --- End Trace ---`);
    }
    
    if (data.status === 'error') {
      console.log(`  FAILED: ${data.error}`);
      return { success: false, error: data.error, debugTrace: data.debugTrace };
    }
    
    console.log(`  Status: ${data.status}`);
    console.log(`  Objective: ${data.objectiveValue}`);
    console.log(`  Variables: ${Object.keys(data.variables || {}).length}`);
    console.log(`  Solve time: ${data.solveTimeMs}ms (total: ${elapsed}ms)`);
    
    return { success: true, data };
    
  } catch (err) {
    const elapsed = Date.now() - startTime;
    await log('test-edge-function.js:exception', `Exception`, {
      error: err.message,
      elapsed
    }, 'H4');
    console.log(`  EXCEPTION: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function runAllTests() {
  console.log('='.repeat(60));
  console.log('Edge Function LP Solver Test');
  console.log('='.repeat(60));
  
  await log('test-edge-function.js:init', 'Starting edge function tests', {
    testCount: testCases.length,
    supabaseUrl: SUPABASE_URL
  });
  
  const results = [];
  
  for (const testCase of testCases) {
    const result = await testEdgeFunction(testCase);
    results.push({ name: testCase.name, ...result });
    
    // Wait a bit between tests
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  
  for (const r of results) {
    const status = r.success ? '✓ PASS' : '✗ FAIL';
    console.log(`${status}: ${r.name}${r.error ? ` - ${r.error}` : ''}`);
  }
  
  await log('test-edge-function.js:summary', 'Test summary', {
    results: results.map(r => ({ name: r.name, success: r.success, error: r.error }))
  });
}

runAllTests().catch(console.error);

