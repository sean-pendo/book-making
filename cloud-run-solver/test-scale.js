// Test with a problem similar to your production size
// ~20K binary variables (400 accounts × 48 reps)

async function testScale() {
  console.log('Testing HiGHS with production-scale problem...\n');
  
  const ACCOUNTS = 400;  // Similar to your customer count
  const REPS = 48;
  
  console.log(`Building LP: ${ACCOUNTS} accounts × ${REPS} reps = ${ACCOUNTS * REPS} binary variables`);
  
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
  
  // Rep capacity constraints (max ~10 accounts each)
  const maxPerRep = Math.ceil(ACCOUNTS / REPS) + 2;
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
  
  console.log(`LP size: ${(lp.length / 1024).toFixed(1)} KB, ${lp.split('\n').length} lines`);
  console.log(`Variables: ${vars.length}, Constraints: ${ACCOUNTS + REPS}`);
  
  // Solve
  console.log('\nSolving...');
  const startTime = Date.now();
  
  try {
    const highsModule = await import('highs');
    const highs = await highsModule.default();
    
    const solution = highs.solve(lp, {
      mip_rel_gap: 0.01,
      time_limit: 120
    });
    
    const solveTime = Date.now() - startTime;
    
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
      console.log('\n🎉 SUCCESS! HiGHS can handle your problem size.');
      console.log('Ready to deploy to Cloud Run.');
    }
    
  } catch (error) {
    console.error('\n❌ Solve failed:', error.message);
    process.exit(1);
  }
}

testScale();




