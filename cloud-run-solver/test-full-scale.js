// Test with FULL production size
// ~366K binary variables (7619 accounts × 48 reps)

async function testFullScale() {
  console.log('Testing HiGHS with FULL production-scale problem...\n');
  
  const ACCOUNTS = 7619;  // Your actual prospect count
  const REPS = 48;
  
  console.log(`Building LP: ${ACCOUNTS} accounts × ${REPS} reps = ${ACCOUNTS * REPS} binary variables`);
  console.log('This may take a moment to build...\n');
  
  const buildStart = Date.now();
  
  // Build LP string
  let lp = 'Maximize\nobj:';
  
  // Objective: random weights for each assignment
  const vars = [];
  for (let a = 0; a < ACCOUNTS; a++) {
    for (let r = 0; r < REPS; r++) {
      const varName = `x${a}_${r}`;
      vars.push(varName);
      const weight = (Math.random() * 0.5 + 0.1).toFixed(4);
      lp += ` + ${weight} ${varName}`;
    }
  }
  
  lp += '\n\nSubject To\n';
  
  // Each account assigned to exactly one rep
  for (let a = 0; a < ACCOUNTS; a++) {
    lp += `assign${a}:`;
    for (let r = 0; r < REPS; r++) {
      lp += ` + x${a}_${r}`;
    }
    lp += ' = 1\n';
  }
  
  // Rep capacity constraints
  const maxPerRep = Math.ceil(ACCOUNTS / REPS) + 10;
  for (let r = 0; r < REPS; r++) {
    lp += `cap${r}:`;
    for (let a = 0; a < ACCOUNTS; a++) {
      lp += ` + x${a}_${r}`;
    }
    lp += ` <= ${maxPerRep}\n`;
  }
  
  // Binary variables
  lp += '\nBinary\n';
  lp += vars.join(' ');
  lp += '\n\nEnd';
  
  const buildTime = Date.now() - buildStart;
  
  console.log(`LP built in ${(buildTime / 1000).toFixed(2)} seconds`);
  console.log(`LP size: ${(lp.length / 1024 / 1024).toFixed(2)} MB, ${lp.split('\n').length} lines`);
  console.log(`Variables: ${vars.length}, Constraints: ${ACCOUNTS + REPS}`);
  
  // Solve
  console.log('\nSolving (this may take 1-2 minutes)...');
  const solveStart = Date.now();
  
  try {
    const highsModule = await import('highs');
    const highs = await highsModule.default();
    
    console.log('HiGHS loaded, starting solve...');
    
    const solution = highs.solve(lp, {
      mip_rel_gap: 0.01,
      time_limit: 300
    });
    
    const solveTime = Date.now() - solveStart;
    
    console.log(`\n✅ Solved in ${(solveTime / 1000).toFixed(2)} seconds`);
    console.log(`Status: ${solution.Status}`);
    console.log(`Objective: ${solution.ObjectiveValue?.toFixed(4)}`);
    
    // Count assignments
    let assigned = 0;
    for (const [name, data] of Object.entries(solution.Columns || {})) {
      if (data.Primal > 0.5) assigned++;
    }
    console.log(`Assignments made: ${assigned} (expected: ${ACCOUNTS})`);
    
    if (solution.Status === 'Optimal') {
      console.log('\n🎉 SUCCESS! HiGHS can handle your FULL problem size.');
      console.log('Cloud Run will easily handle this.');
    }
    
  } catch (error) {
    console.error('\n❌ Solve failed:', error.message);
    console.log('\nNote: This is running in Node.js (WASM), Cloud Run with native HiGHS will be faster.');
    process.exit(1);
  }
}

testFullScale();




