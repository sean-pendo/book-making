/**
 * Compare failing vs passing LP
 */

import highsLoader from 'highs';
import * as fs from 'fs';

async function runTest() {
  console.log('Loading HiGHS...');
  const highs = await highsLoader();
  console.log('HiGHS loaded');

  const seededRandom = (seed) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  // Generate the FAILING LP (from incremental test)
  console.log('\nGenerating failing LP (with random seeded values)...');
  const failingLP = buildLP(10, 5, 150000, 200, seededRandom, true);
  fs.writeFileSync('failing.lp', failingLP);
  console.log('Saved to failing.lp');

  // Generate the PASSING LP (deterministic)
  console.log('\nGenerating passing LP (deterministic values)...');
  const passingLP = buildLP(10, 5, 150000, 200, null, false);
  fs.writeFileSync('passing.lp', passingLP);
  console.log('Saved to passing.lp');

  // Compare
  console.log('\n=== Comparing LPs ===');
  console.log(`Failing: ${failingLP.length} bytes`);
  console.log(`Passing: ${passingLP.length} bytes`);

  // Try both
  console.log('\nSolving failing LP...');
  try {
    const result = highs.solve(failingLP);
    console.log('Failing LP Status:', result.Status);
  } catch (err) {
    console.error('Failing LP error:', err.message);
  }

  console.log('\nSolving passing LP...');
  try {
    const result = highs.solve(passingLP);
    console.log('Passing LP Status:', result.Status);
  } catch (err) {
    console.error('Passing LP error:', err.message);
  }

  // Check differences
  console.log('\n=== Checking for differences ===');

  // Check line by line
  const failLines = failingLP.split('\n');
  const passLines = passingLP.split('\n');

  // Check objective coefficients
  const failObjSection = failingLP.substring(0, failingLP.indexOf('Subject To'));
  const passObjSection = passingLP.substring(0, passingLP.indexOf('Subject To'));

  // Extract coefficients
  const failCoefs = extractCoefficients(failObjSection);
  const passCoefs = extractCoefficients(passObjSection);

  console.log('Failing obj coefs (sample):', failCoefs.slice(0, 10).join(', '));
  console.log('Passing obj coefs (sample):', passCoefs.slice(0, 10).join(', '));

  // Check for NaN or Infinity
  const failBad = failCoefs.filter(c => !isFinite(parseFloat(c)));
  const passBad = passCoefs.filter(c => !isFinite(parseFloat(c)));
  console.log('Failing invalid coefs:', failBad.length);
  console.log('Passing invalid coefs:', passBad.length);

  // Check balance constraint ARR values
  const failBalSection = failingLP.substring(failingLP.indexOf('bal0:'), failingLP.indexOf('bal1:'));
  const passBalSection = passingLP.substring(passingLP.indexOf('bal0:'), passingLP.indexOf('bal1:'));

  const failARRs = extractCoefficients(failBalSection);
  const passARRs = extractCoefficients(passBalSection);

  console.log('\nFailing bal0 ARR coefs:', failARRs.filter(c => parseFloat(c) > 1000).join(', '));
  console.log('Passing bal0 ARR coefs:', passARRs.filter(c => parseFloat(c) > 1000).join(', '));
}

function buildLP(accounts, reps, arrTarget, MAX_LINE, seededRandom, useRandom) {
  const lines = [];
  let currentLine = ' obj:';

  lines.push('Maximize');

  // Assignment scores
  let seed = 42;
  for (let a = 0; a < accounts; a++) {
    for (let r = 0; r < reps; r++) {
      const score = useRandom
        ? (seededRandom(seed++) * 0.5 + 0.5).toFixed(4)
        : '0.5000';
      const term = `+ ${score} x${a}_${r}`;
      if (currentLine.length + term.length + 1 > MAX_LINE) {
        lines.push(currentLine);
        currentLine = ' ' + term;
      } else {
        currentLine += ' ' + term;
      }
    }
  }

  // Slack penalties
  const normFactor = arrTarget;
  for (let r = 0; r < reps; r++) {
    const coefs = [
      { name: `ao${r}`, val: 0.01 * 0.5 / normFactor },
      { name: `au${r}`, val: 0.01 * 0.5 / normFactor },
      { name: `bo${r}`, val: 1.0 * 0.5 / normFactor },
      { name: `bu${r}`, val: 1.0 * 0.5 / normFactor },
      { name: `mo${r}`, val: 1000 * 0.5 / normFactor },
      { name: `mu${r}`, val: 1000 * 0.5 / normFactor },
    ];

    for (const c of coefs) {
      const term = `- ${c.val.toFixed(10)} ${c.name}`;
      if (currentLine.length + term.length + 1 > MAX_LINE) {
        lines.push(currentLine);
        currentLine = ' ' + term;
      } else {
        currentLine += ' ' + term;
      }
    }
  }

  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  lines.push('Subject To');

  // Assignment constraints
  for (let a = 0; a < accounts; a++) {
    let terms = [];
    for (let r = 0; r < reps; r++) {
      terms.push(`+ 1 x${a}_${r}`);
    }
    lines.push(` a${a}: ${terms.join(' ')} = 1`);
  }

  // Balance constraints
  seed = 100;
  for (let r = 0; r < reps; r++) {
    let cl = ` bal${r}:`;

    for (let a = 0; a < accounts; a++) {
      const arr = useRandom
        ? Math.floor(seededRandom(seed++) * 200000 + 50000)
        : 100000 + a * 10000;
      const term = `+ ${arr} x${a}_${r}`;
      if (cl.length + term.length + 1 > MAX_LINE) {
        lines.push(cl);
        cl = ' ' + term;
      } else {
        cl += ' ' + term;
      }
    }

    const slackPart = `- 1 ao${r} + 1 au${r} - 1 bo${r} + 1 bu${r} - 1 mo${r} + 1 mu${r}`;
    if (cl.length + slackPart.length + 1 > MAX_LINE) {
      lines.push(cl);
      cl = ' ' + slackPart;
    } else {
      cl += ' ' + slackPart;
    }

    cl += ` = ${arrTarget}`;
    lines.push(cl);
  }

  lines.push('Bounds');
  for (let r = 0; r < reps; r++) {
    lines.push(` 0 <= ao${r} <= ${arrTarget * 0.1}`);
    lines.push(` 0 <= au${r} <= ${arrTarget * 0.1}`);
    lines.push(` 0 <= bo${r} <= ${arrTarget * 0.5}`);
    lines.push(` 0 <= bu${r} <= ${arrTarget * 0.5}`);
    lines.push(` mo${r} >= 0`);
    lines.push(` mu${r} >= 0`);
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

function extractCoefficients(text) {
  const matches = text.match(/[+-]?\s*\d+\.?\d*/g) || [];
  return matches.map(m => m.replace(/\s/g, ''));
}

runTest().catch(console.error);
