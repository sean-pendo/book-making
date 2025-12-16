/**
 * Test HiGHS solver with various LP problems
 * Run: node test-highs.js
 */

import highsLoader from 'highs';

async function runTests() {
  console.log('Loading HiGHS...');

  let highs;
  try {
    highs = await highsLoader();
    console.log('HiGHS loaded successfully');
  } catch (err) {
    console.error('Failed to load HiGHS:', err);
    return;
  }

  // Test 1: Simple LP
  console.log('\n=== Test 1: Simple LP (2 vars, 2 constraints) ===');
  try {
    const simpleLp = `
Maximize
 obj: + 1 x1 + 2 x2
Subject To
 c1: + 1 x1 + 1 x2 <= 10
 c2: + 1 x1 <= 6
Bounds
 x1 >= 0
 x2 >= 0
End
`;
    const result = highs.solve(simpleLp);
    console.log('Status:', result.Status);
    console.log('Objective:', result.ObjectiveValue);
    console.log('x1 =', result.Columns.x1?.Primal);
    console.log('x2 =', result.Columns.x2?.Primal);
    console.log('Test 1: PASSED');
  } catch (err) {
    console.error('Test 1 FAILED:', err.message);
  }

  // Test 2: Binary MIP
  console.log('\n=== Test 2: Binary MIP (3 binary vars) ===');
  try {
    const binaryLp = `
Maximize
 obj: + 5 x1 + 4 x2 + 3 x3
Subject To
 c1: + 2 x1 + 3 x2 + 1 x3 <= 5
 c2: + 4 x1 + 2 x2 + 3 x3 <= 11
Binary
 x1
 x2
 x3
End
`;
    const result = highs.solve(binaryLp);
    console.log('Status:', result.Status);
    console.log('Objective:', result.ObjectiveValue);
    console.log('Test 2: PASSED');
  } catch (err) {
    console.error('Test 2 FAILED:', err.message);
  }

  // Test 3: Scaled problem (Big-M style)
  console.log('\n=== Test 3: Big-M style with small coefficients ===');
  try {
    // Simulate Big-M penalty with normalization
    // normFactor = 3000000 (typical ARR target)
    // alphaPenalty = 0.01 * 0.5 / 3000000 = 1.67e-9
    const alphaCoef = (0.01 * 0.5 / 3000000).toFixed(12);
    const betaCoef = (1.0 * 0.5 / 3000000).toFixed(12);
    const bigMCoef = (1000 * 0.5 / 3000000).toFixed(12);

    console.log('Alpha coef:', alphaCoef);
    console.log('Beta coef:', betaCoef);
    console.log('BigM coef:', bigMCoef);

    const bigMlp = `
Maximize
 obj: + 0.5 x1 + 0.5 x2 - ${alphaCoef} alpha_over - ${alphaCoef} alpha_under - ${betaCoef} beta_over - ${betaCoef} beta_under - ${bigMCoef} bigM_over - ${bigMCoef} bigM_under
Subject To
 assign: + 1 x1 + 1 x2 = 1
 balance: + 100000 x1 + 200000 x2 - 1 alpha_over + 1 alpha_under - 1 beta_over + 1 beta_under - 1 bigM_over + 1 bigM_under = 150000
Bounds
 0 <= alpha_over <= 15000
 0 <= alpha_under <= 15000
 0 <= beta_over <= 50000
 0 <= beta_under <= 50000
 bigM_over >= 0
 bigM_under >= 0
Binary
 x1
 x2
End
`;
    const result = highs.solve(bigMlp);
    console.log('Status:', result.Status);
    console.log('Objective:', result.ObjectiveValue);
    console.log('Test 3: PASSED');
  } catch (err) {
    console.error('Test 3 FAILED:', err.message);
  }

  // Test 4: Medium-sized assignment problem (simulating 34 accounts, 20 reps)
  console.log('\n=== Test 4: Medium assignment (34 accounts, 20 reps = 680 binary vars) ===');
  try {
    const numAccounts = 34;
    const numReps = 20;

    let lpLines = ['Maximize'];
    let objTerms = [];

    // Build objective: assignment scores
    for (let a = 0; a < numAccounts; a++) {
      for (let r = 0; r < numReps; r++) {
        const score = (Math.random() * 0.5 + 0.5).toFixed(4);
        objTerms.push(`+ ${score} x${a}_${r}`);
      }
    }
    lpLines.push(' obj: ' + objTerms.slice(0, 50).join(' ')); // First 50 terms
    // Continue on next lines
    for (let i = 50; i < objTerms.length; i += 100) {
      lpLines.push(' ' + objTerms.slice(i, i + 100).join(' '));
    }

    lpLines.push('Subject To');

    // Each account assigned to exactly one rep
    for (let a = 0; a < numAccounts; a++) {
      let terms = [];
      for (let r = 0; r < numReps; r++) {
        terms.push(`+ 1 x${a}_${r}`);
      }
      lpLines.push(` a${a}: ${terms.join(' ')} = 1`);
    }

    lpLines.push('Binary');
    for (let a = 0; a < numAccounts; a++) {
      for (let r = 0; r < numReps; r++) {
        lpLines.push(` x${a}_${r}`);
      }
    }

    lpLines.push('End');

    const lpString = lpLines.join('\n');
    console.log(`LP size: ${lpString.length} bytes, ${lpLines.length} lines`);

    const startTime = Date.now();
    const result = highs.solve(lpString);
    const elapsed = Date.now() - startTime;

    console.log('Status:', result.Status);
    console.log('Objective:', result.ObjectiveValue?.toFixed(4));
    console.log('Solve time:', elapsed, 'ms');
    console.log('Test 4: PASSED');
  } catch (err) {
    console.error('Test 4 FAILED:', err.message);
  }

  // Test 5: Same as Test 4 but with Big-M penalty slacks
  console.log('\n=== Test 5: Medium assignment WITH Big-M slacks ===');
  try {
    const numAccounts = 34;
    const numReps = 20;
    const arrTarget = 150000;

    let lpLines = ['Maximize'];
    let objTerms = [];

    // Build objective: assignment scores + penalty slacks
    for (let a = 0; a < numAccounts; a++) {
      for (let r = 0; r < numReps; r++) {
        const score = (Math.random() * 0.5 + 0.5).toFixed(4);
        objTerms.push(`+ ${score} x${a}_${r}`);
      }
    }

    // Add Big-M penalty slacks per rep (6 per rep)
    const normFactor = arrTarget;
    for (let r = 0; r < numReps; r++) {
      const alphaCoef = -(0.01 * 0.5 / normFactor);
      const betaCoef = -(1.0 * 0.5 / normFactor);
      const bigMCoef = -(1000 * 0.5 / normFactor);

      objTerms.push(`${alphaCoef.toFixed(10)} ao${r}`);
      objTerms.push(`${alphaCoef.toFixed(10)} au${r}`);
      objTerms.push(`${betaCoef.toFixed(10)} bo${r}`);
      objTerms.push(`${betaCoef.toFixed(10)} bu${r}`);
      objTerms.push(`${bigMCoef.toFixed(10)} mo${r}`);
      objTerms.push(`${bigMCoef.toFixed(10)} mu${r}`);
    }

    lpLines.push(' obj: ' + objTerms.slice(0, 50).join(' '));
    for (let i = 50; i < objTerms.length; i += 100) {
      lpLines.push(' ' + objTerms.slice(i, i + 100).join(' '));
    }

    lpLines.push('Subject To');

    // Assignment constraints
    for (let a = 0; a < numAccounts; a++) {
      let terms = [];
      for (let r = 0; r < numReps; r++) {
        terms.push(`+ 1 x${a}_${r}`);
      }
      lpLines.push(` a${a}: ${terms.join(' ')} = 1`);
    }

    // Balance decomposition constraints per rep
    for (let r = 0; r < numReps; r++) {
      let terms = [];
      for (let a = 0; a < numAccounts; a++) {
        const arr = Math.floor(Math.random() * 200000 + 50000);
        terms.push(`+ ${arr} x${a}_${r}`);
      }
      terms.push(`- 1 ao${r} + 1 au${r} - 1 bo${r} + 1 bu${r} - 1 mo${r} + 1 mu${r}`);
      lpLines.push(` bal${r}: ${terms.join(' ')} = ${arrTarget}`);
    }

    lpLines.push('Bounds');
    // Slack bounds
    for (let r = 0; r < numReps; r++) {
      lpLines.push(` 0 <= ao${r} <= ${arrTarget * 0.1}`);
      lpLines.push(` 0 <= au${r} <= ${arrTarget * 0.1}`);
      lpLines.push(` 0 <= bo${r} <= ${arrTarget * 0.5}`);
      lpLines.push(` 0 <= bu${r} <= ${arrTarget * 0.5}`);
      lpLines.push(` mo${r} >= 0`);
      lpLines.push(` mu${r} >= 0`);
    }

    lpLines.push('Binary');
    for (let a = 0; a < numAccounts; a++) {
      for (let r = 0; r < numReps; r++) {
        lpLines.push(` x${a}_${r}`);
      }
    }

    lpLines.push('End');

    const lpString = lpLines.join('\n');
    console.log(`LP size: ${lpString.length} bytes, ${lpLines.length} lines`);
    console.log(`Variables: ${numAccounts * numReps} binary + ${numReps * 6} continuous`);

    const startTime = Date.now();
    const result = highs.solve(lpString);
    const elapsed = Date.now() - startTime;

    console.log('Status:', result.Status);
    console.log('Objective:', result.ObjectiveValue?.toFixed(4));
    console.log('Solve time:', elapsed, 'ms');
    console.log('Test 5: PASSED');
  } catch (err) {
    console.error('Test 5 FAILED:', err.message);
    console.error('Error details:', err);
  }

  console.log('\n=== All tests complete ===');
}

runTests().catch(console.error);
