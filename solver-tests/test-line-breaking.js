/**
 * Test LP with proper line breaking
 */

import highsLoader from 'highs';

async function runTest() {
  console.log('Loading HiGHS...');
  const highs = await highsLoader();
  console.log('HiGHS loaded');

  const numAccounts = 34;
  const numReps = 20;
  const arrTarget = 150000;
  const MAX_LINE = 200; // Stay well under 255

  let lines = ['Maximize'];

  // Build objective with proper line breaking
  let currentLine = ' obj:';
  const terms = [];

  // Deterministic random
  const seededRandom = (seed) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  // Assignment scores
  let seed = 42;
  for (let a = 0; a < numAccounts; a++) {
    for (let r = 0; r < numReps; r++) {
      const score = (seededRandom(seed++) * 0.5 + 0.5).toFixed(4);
      terms.push(`+ ${score} x${a}_${r}`);
    }
  }

  // Big-M penalty slacks
  const normFactor = arrTarget;
  for (let r = 0; r < numReps; r++) {
    const alphaCoef = -(0.01 * 0.5 / normFactor);
    const betaCoef = -(1.0 * 0.5 / normFactor);
    const bigMCoef = -(1000 * 0.5 / normFactor);

    terms.push(`- ${Math.abs(alphaCoef).toFixed(10)} ao${r}`);
    terms.push(`- ${Math.abs(alphaCoef).toFixed(10)} au${r}`);
    terms.push(`- ${Math.abs(betaCoef).toFixed(10)} bo${r}`);
    terms.push(`- ${Math.abs(betaCoef).toFixed(10)} bu${r}`);
    terms.push(`- ${Math.abs(bigMCoef).toFixed(10)} mo${r}`);
    terms.push(`- ${Math.abs(bigMCoef).toFixed(10)} mu${r}`);
  }

  // Add terms with line breaking
  for (const term of terms) {
    if (currentLine.length + term.length + 1 > MAX_LINE) {
      lines.push(currentLine);
      currentLine = ' ' + term; // Continuation line starts with space
    } else {
      currentLine += ' ' + term;
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  lines.push('Subject To');

  // Assignment constraints (each on own line, these should be short)
  for (let a = 0; a < numAccounts; a++) {
    let constraintLine = ` a${a}:`;
    for (let r = 0; r < numReps; r++) {
      const term = `+ 1 x${a}_${r}`;
      if (constraintLine.length + term.length + 1 > MAX_LINE) {
        lines.push(constraintLine);
        constraintLine = ' ' + term;
      } else {
        constraintLine += ' ' + term;
      }
    }
    constraintLine += ' = 1';
    lines.push(constraintLine);
  }

  // Balance decomposition constraints
  seed = 100;
  for (let r = 0; r < numReps; r++) {
    let constraintLine = ` bal${r}:`;

    for (let a = 0; a < numAccounts; a++) {
      const arr = Math.floor(seededRandom(seed++) * 200000 + 50000);
      const term = `+ ${arr} x${a}_${r}`;
      if (constraintLine.length + term.length + 1 > MAX_LINE) {
        lines.push(constraintLine);
        constraintLine = ' ' + term;
      } else {
        constraintLine += ' ' + term;
      }
    }

    // Add slack terms
    const slackTerms = `- 1 ao${r} + 1 au${r} - 1 bo${r} + 1 bu${r} - 1 mo${r} + 1 mu${r}`;
    if (constraintLine.length + slackTerms.length + 1 > MAX_LINE) {
      lines.push(constraintLine);
      constraintLine = ' ' + slackTerms;
    } else {
      constraintLine += ' ' + slackTerms;
    }

    constraintLine += ` = ${arrTarget}`;
    lines.push(constraintLine);
  }

  lines.push('Bounds');
  for (let r = 0; r < numReps; r++) {
    lines.push(` 0 <= ao${r} <= ${arrTarget * 0.1}`);
    lines.push(` 0 <= au${r} <= ${arrTarget * 0.1}`);
    lines.push(` 0 <= bo${r} <= ${arrTarget * 0.5}`);
    lines.push(` 0 <= bu${r} <= ${arrTarget * 0.5}`);
    lines.push(` mo${r} >= 0`);
    lines.push(` mu${r} >= 0`);
  }

  lines.push('Binary');
  for (let a = 0; a < numAccounts; a++) {
    for (let r = 0; r < numReps; r++) {
      lines.push(` x${a}_${r}`);
    }
  }

  lines.push('End');

  const lp = lines.join('\n');
  console.log(`LP: ${lp.length} bytes, ${lines.length} lines`);

  // Verify no long lines
  const longLines = lines.filter(l => l.length > 255);
  console.log(`Lines > 255 chars: ${longLines.length}`);

  if (longLines.length > 0) {
    console.log('Long lines:', longLines.map(l => l.length));
  }

  // Solve
  console.log('\nSolving...');
  try {
    const startTime = Date.now();
    const result = highs.solve(lp);
    const elapsed = Date.now() - startTime;

    console.log('Status:', result.Status);
    console.log('Objective:', result.ObjectiveValue?.toFixed(4));
    console.log('Solve time:', elapsed, 'ms');
    console.log('SUCCESS!');
  } catch (err) {
    console.error('FAILED:', err.message);
  }
}

runTest().catch(console.error);
