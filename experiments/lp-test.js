/**
 * LP Assignment Experiment
 * 
 * Standalone test script to learn LP formulation for territory assignment.
 * Run with: node experiments/lp-test.js
 * 
 * Prerequisites: npm install javascript-lp-solver (already installed in book-ops-workbench)
 */

// Use the solver from book-ops-workbench
const Solver = require('../book-ops-workbench/node_modules/javascript-lp-solver');

// ============================================================================
// SAMPLE DATA - Small example to understand the formulation
// ============================================================================

const accounts = [
  { id: 'A1', name: 'Acme Corp', arr: 500000, cre: 1, owner: 'R1', territory: 'West' },
  { id: 'A2', name: 'Beta Inc', arr: 800000, cre: 0, owner: 'R1', territory: 'East' },
  { id: 'A3', name: 'Gamma LLC', arr: 400000, cre: 2, owner: 'R2', territory: 'West' },
  { id: 'A4', name: 'Delta Co', arr: 600000, cre: 1, owner: 'R2', territory: 'East' },
  { id: 'A5', name: 'Echo Ltd', arr: 700000, cre: 0, owner: 'R1', territory: 'West' },
];

const reps = [
  { id: 'R1', name: 'Alice', region: 'West', maxARR: 2000000, maxCRE: 3 },
  { id: 'R2', name: 'Bob', region: 'East', maxARR: 2000000, maxCRE: 3 },
];

// Weights for the objective function (higher = more important)
const weights = {
  continuity: 100,    // Penalty for changing owner
  geography: 80,      // Penalty for region mismatch
};

// ============================================================================
// BUILD THE LP MODEL
// ============================================================================

function buildModel(accounts, reps, weights) {
  const model = {
    optimize: 'totalCost',
    opType: 'min',
    constraints: {},
    variables: {},
    ints: {}
  };

  // Calculate totals for reference
  const totalARR = accounts.reduce((sum, a) => sum + a.arr, 0);
  const targetPerRep = totalARR / reps.length;
  
  console.log('\n📊 Problem Setup:');
  console.log(`   Accounts: ${accounts.length}`);
  console.log(`   Reps: ${reps.length}`);
  console.log(`   Total ARR: $${(totalARR/1000000).toFixed(2)}M`);
  console.log(`   Target per rep: $${(targetPerRep/1000000).toFixed(2)}M`);

  // CONSTRAINT: Each account assigned exactly once
  accounts.forEach(account => {
    model.constraints[`assign_${account.id}`] = { equal: 1 };
  });

  // CONSTRAINT: Rep capacity limits
  reps.forEach(rep => {
    model.constraints[`arr_${rep.id}`] = { max: rep.maxARR };
    model.constraints[`cre_${rep.id}`] = { max: rep.maxCRE };
  });

  // VARIABLES: One for each (account, rep) pair
  accounts.forEach(account => {
    reps.forEach(rep => {
      const varName = `x_${account.id}_${rep.id}`;
      
      // Calculate cost for this assignment
      let cost = 0;
      
      // Continuity penalty
      if (account.owner !== rep.id) {
        cost += weights.continuity;
      }
      
      // Geography penalty
      const geoMatch = account.territory.toLowerCase() === rep.region.toLowerCase();
      if (!geoMatch) {
        cost += weights.geography;
      }
      
      model.variables[varName] = {
        totalCost: cost,
        [`assign_${account.id}`]: 1,
        [`arr_${rep.id}`]: account.arr,
        [`cre_${rep.id}`]: account.cre
      };
      
      // Mark as binary (0 or 1)
      model.ints[varName] = 1;
    });
  });

  const varCount = Object.keys(model.variables).length;
  const constraintCount = Object.keys(model.constraints).length;
  
  console.log(`   Variables: ${varCount}`);
  console.log(`   Constraints: ${constraintCount}`);

  return model;
}

// ============================================================================
// SOLVE AND INTERPRET RESULTS
// ============================================================================

function solve(model, accounts, reps) {
  console.log('\n🔬 Solving...');
  const startTime = Date.now();
  
  const solution = Solver.Solve(model);
  
  const solveTime = Date.now() - startTime;
  console.log(`   Time: ${solveTime}ms`);
  console.log(`   Feasible: ${solution.feasible}`);
  console.log(`   Objective value: ${solution.result}`);

  if (!solution.feasible) {
    console.log('\n❌ No feasible solution found!');
    console.log('   Try increasing capacity limits or relaxing constraints.');
    return null;
  }

  // Extract assignments
  const assignments = [];
  const repTotals = {};
  reps.forEach(r => { repTotals[r.id] = { arr: 0, cre: 0, accounts: [] }; });

  Object.keys(solution).forEach(key => {
    if (key.startsWith('x_') && solution[key] === 1) {
      const [, accountId, repId] = key.split('_');
      const account = accounts.find(a => a.id === accountId);
      const rep = reps.find(r => r.id === repId);
      
      if (account && rep) {
        const isChange = account.owner !== rep.id;
        const geoMatch = account.territory.toLowerCase() === rep.region.toLowerCase();
        
        assignments.push({
          account: account.name,
          accountId: account.id,
          rep: rep.name,
          repId: rep.id,
          arr: account.arr,
          cre: account.cre,
          isChange,
          geoMatch,
          previousOwner: account.owner
        });
        
        repTotals[rep.id].arr += account.arr;
        repTotals[rep.id].cre += account.cre;
        repTotals[rep.id].accounts.push(account.name);
      }
    }
  });

  return { assignments, repTotals, solveTime };
}

// ============================================================================
// PRINT RESULTS
// ============================================================================

function printResults(results, accounts, reps) {
  const { assignments, repTotals } = results;
  
  console.log('\n' + '='.repeat(60));
  console.log('📋 OPTIMAL ASSIGNMENTS');
  console.log('='.repeat(60));
  
  assignments.forEach(a => {
    const changeIcon = a.isChange ? '🔄' : '✅';
    const geoIcon = a.geoMatch ? '🌍' : '⚠️';
    console.log(`${changeIcon} ${geoIcon} ${a.account} → ${a.rep} ($${(a.arr/1000).toFixed(0)}K, ${a.cre} CRE)`);
    if (a.isChange) {
      console.log(`      Changed from: ${a.previousOwner}`);
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log('📊 REP WORKLOADS');
  console.log('='.repeat(60));
  
  reps.forEach(rep => {
    const totals = repTotals[rep.id];
    const arrPercent = ((totals.arr / rep.maxARR) * 100).toFixed(0);
    const crePercent = ((totals.cre / rep.maxCRE) * 100).toFixed(0);
    
    console.log(`\n${rep.name} (${rep.region}):`);
    console.log(`   ARR: $${(totals.arr/1000000).toFixed(2)}M / $${(rep.maxARR/1000000).toFixed(2)}M (${arrPercent}%)`);
    console.log(`   CRE: ${totals.cre} / ${rep.maxCRE} (${crePercent}%)`);
    console.log(`   Accounts: ${totals.accounts.join(', ')}`);
  });

  // Calculate metrics
  const arrValues = reps.map(r => repTotals[r.id].arr);
  const mean = arrValues.reduce((a, b) => a + b, 0) / arrValues.length;
  const variance = arrValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / arrValues.length;
  const stdDev = Math.sqrt(variance);
  const cv = (stdDev / mean * 100).toFixed(1);
  
  const continuityRate = (assignments.filter(a => !a.isChange).length / assignments.length * 100).toFixed(0);
  const geoRate = (assignments.filter(a => a.geoMatch).length / assignments.length * 100).toFixed(0);

  console.log('\n' + '='.repeat(60));
  console.log('📈 QUALITY METRICS');
  console.log('='.repeat(60));
  console.log(`   ARR Coefficient of Variation: ${cv}%`);
  console.log(`   Continuity Rate: ${continuityRate}%`);
  console.log(`   Geography Match Rate: ${geoRate}%`);
}

// ============================================================================
// COMPARE WITH GREEDY (WATERFALL-LIKE)
// ============================================================================

function greedyAssignment(accounts, reps) {
  console.log('\n' + '='.repeat(60));
  console.log('🔀 GREEDY (WATERFALL-LIKE) COMPARISON');
  console.log('='.repeat(60));
  
  const repTotals = {};
  reps.forEach(r => { repTotals[r.id] = { arr: 0, cre: 0, accounts: [] }; });
  
  const assignments = [];
  
  // Sort by ARR descending (like waterfall)
  const sortedAccounts = [...accounts].sort((a, b) => b.arr - a.arr);
  
  sortedAccounts.forEach(account => {
    // Priority 1: Current owner with geo match
    let assigned = false;
    
    // Try current owner first
    const currentOwner = reps.find(r => r.id === account.owner);
    if (currentOwner) {
      const hasCapacity = 
        repTotals[currentOwner.id].arr + account.arr <= currentOwner.maxARR &&
        repTotals[currentOwner.id].cre + account.cre <= currentOwner.maxCRE;
      
      if (hasCapacity) {
        repTotals[currentOwner.id].arr += account.arr;
        repTotals[currentOwner.id].cre += account.cre;
        repTotals[currentOwner.id].accounts.push(account.name);
        assignments.push({ account: account.name, rep: currentOwner.name, isChange: false });
        assigned = true;
      }
    }
    
    // Otherwise, find any rep with capacity
    if (!assigned) {
      for (const rep of reps) {
        const hasCapacity = 
          repTotals[rep.id].arr + account.arr <= rep.maxARR &&
          repTotals[rep.id].cre + account.cre <= rep.maxCRE;
        
        if (hasCapacity) {
          repTotals[rep.id].arr += account.arr;
          repTotals[rep.id].cre += account.cre;
          repTotals[rep.id].accounts.push(account.name);
          assignments.push({ account: account.name, rep: rep.name, isChange: true });
          assigned = true;
          break;
        }
      }
    }
    
    if (!assigned) {
      console.log(`   ⚠️ Could not assign ${account.name}`);
    }
  });
  
  // Print greedy results
  reps.forEach(rep => {
    const totals = repTotals[rep.id];
    console.log(`\n${rep.name}: $${(totals.arr/1000000).toFixed(2)}M, ${totals.cre} CRE`);
    console.log(`   Accounts: ${totals.accounts.join(', ')}`);
  });
  
  // Metrics
  const arrValues = reps.map(r => repTotals[r.id].arr);
  const mean = arrValues.reduce((a, b) => a + b, 0) / arrValues.length;
  const variance = arrValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / arrValues.length;
  const stdDev = Math.sqrt(variance);
  const cv = (stdDev / mean * 100).toFixed(1);
  
  console.log(`\n   Greedy ARR CV: ${cv}%`);
  
  return { repTotals, cv: parseFloat(cv) };
}

// ============================================================================
// MAIN
// ============================================================================

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║     LP OPTIMIZATION EXPERIMENT - Territory Assignment      ║');
console.log('╚════════════════════════════════════════════════════════════╝');

// Build and solve LP
const model = buildModel(accounts, reps, weights);
const results = solve(model, accounts, reps);

if (results) {
  printResults(results, accounts, reps);
  
  // Compare with greedy
  const greedyResults = greedyAssignment(accounts, reps);
  
  console.log('\n' + '='.repeat(60));
  console.log('⚖️  LP vs GREEDY COMPARISON');
  console.log('='.repeat(60));
  
  // Calculate LP CV
  const lpArrValues = reps.map(r => results.repTotals[r.id].arr);
  const lpMean = lpArrValues.reduce((a, b) => a + b, 0) / lpArrValues.length;
  const lpVariance = lpArrValues.reduce((sum, v) => sum + Math.pow(v - lpMean, 2), 0) / lpArrValues.length;
  const lpCV = (Math.sqrt(lpVariance) / lpMean * 100).toFixed(1);
  
  console.log(`   LP ARR CV:      ${lpCV}%`);
  console.log(`   Greedy ARR CV:  ${greedyResults.cv}%`);
  
  const improvement = ((greedyResults.cv - parseFloat(lpCV)) / greedyResults.cv * 100).toFixed(0);
  if (parseFloat(improvement) > 0) {
    console.log(`   🎉 LP is ${improvement}% better balanced!`);
  } else if (parseFloat(improvement) < 0) {
    console.log(`   📝 Greedy is ${-improvement}% better (unusual - check weights)`);
  } else {
    console.log(`   📝 Both approaches equal`);
  }
}

console.log('\n✅ Experiment complete!\n');

// ============================================================================
// EXERCISES TO TRY
// ============================================================================

console.log('📝 EXERCISES TO TRY:');
console.log('1. Modify account ARR values and re-run');
console.log('2. Change weight.continuity to 0 and see what happens');
console.log('3. Add more accounts and measure solve time');
console.log('4. Reduce rep capacity and see if it becomes infeasible');
console.log('5. Add a third rep and see how distribution changes');
