/**
 * Incremental test - add complexity step by step
 */

import highsLoader from 'highs';

async function runTests() {
  console.log('Loading HiGHS...');
  const highs = await highsLoader();
  console.log('HiGHS loaded');

  const MAX_LINE = 200;
  const seededRandom = (seed) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  // Test configs
  const configs = [
    { accounts: 10, reps: 5, balance: false, slacks: false },
    { accounts: 20, reps: 10, balance: false, slacks: false },
    { accounts: 34, reps: 20, balance: false, slacks: false },
    { accounts: 10, reps: 5, balance: true, slacks: false },
    { accounts: 10, reps: 5, balance: true, slacks: true },
    { accounts: 20, reps: 10, balance: true, slacks: true },
    { accounts: 34, reps: 20, balance: true, slacks: true },
  ];

  for (const config of configs) {
    console.log(`\n=== Test: ${config.accounts}a × ${config.reps}r, balance=${config.balance}, slacks=${config.slacks} ===`);

    try {
      const lp = buildLP(config, MAX_LINE, seededRandom);
      const longLines = lp.split('\n').filter(l => l.length > 255).length;
      console.log(`LP: ${lp.length} bytes, long lines: ${longLines}`);

      const startTime = Date.now();
      const result = highs.solve(lp);
      const elapsed = Date.now() - startTime;

      console.log(`Status: ${result.Status}, Time: ${elapsed}ms - PASSED`);
    } catch (err) {
      console.error(`FAILED: ${err.message}`);
    }
  }
}

function buildLP(config, MAX_LINE, seededRandom) {
  const { accounts, reps, balance, slacks } = config;
  const arrTarget = 150000;

  let lines = ['Maximize'];
  let currentLine = ' obj:';
  let seed = 42;

  // Assignment scores
  for (let a = 0; a < accounts; a++) {
    for (let r = 0; r < reps; r++) {
      const score = (seededRandom(seed++) * 0.5 + 0.5).toFixed(4);
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
  if (slacks) {
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
  }

  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  lines.push('Subject To');

  // Assignment constraints
  for (let a = 0; a < accounts; a++) {
    let cl = ` a${a}:`;
    for (let r = 0; r < reps; r++) {
      const term = `+ 1 x${a}_${r}`;
      if (cl.length + term.length + 1 > MAX_LINE) {
        lines.push(cl);
        cl = ' ' + term;
      } else {
        cl += ' ' + term;
      }
    }
    cl += ' = 1';
    lines.push(cl);
  }

  // Balance constraints
  if (balance) {
    seed = 100;
    for (let r = 0; r < reps; r++) {
      let cl = ` bal${r}:`;

      for (let a = 0; a < accounts; a++) {
        const arr = Math.floor(seededRandom(seed++) * 200000 + 50000);
        const term = `+ ${arr} x${a}_${r}`;
        if (cl.length + term.length + 1 > MAX_LINE) {
          lines.push(cl);
          cl = ' ' + term;
        } else {
          cl += ' ' + term;
        }
      }

      if (slacks) {
        const slackPart = `- 1 ao${r} + 1 au${r} - 1 bo${r} + 1 bu${r} - 1 mo${r} + 1 mu${r}`;
        if (cl.length + slackPart.length + 1 > MAX_LINE) {
          lines.push(cl);
          cl = ' ' + slackPart;
        } else {
          cl += ' ' + slackPart;
        }
      }

      cl += ` = ${arrTarget}`;
      lines.push(cl);
    }
  }

  lines.push('Bounds');

  if (slacks) {
    for (let r = 0; r < reps; r++) {
      lines.push(` 0 <= ao${r} <= ${arrTarget * 0.1}`);
      lines.push(` 0 <= au${r} <= ${arrTarget * 0.1}`);
      lines.push(` 0 <= bo${r} <= ${arrTarget * 0.5}`);
      lines.push(` 0 <= bu${r} <= ${arrTarget * 0.5}`);
      lines.push(` mo${r} >= 0`);
      lines.push(` mu${r} >= 0`);
    }
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

runTests().catch(console.error);
