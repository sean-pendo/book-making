/**
 * Test: HiGHS WASM State Corruption
 *
 * Hypothesis: HiGHS WASM instance gets corrupted after N solves
 */

import highsLoader from 'highs';

async function runTest() {
  console.log('Loading HiGHS...');
  const highs = await highsLoader();
  console.log('HiGHS loaded');

  // Simple LP that always works
  const simpleLP = `Maximize
 obj: x + y
Subject To
 c1: x + y <= 10
 c2: x - y <= 5
Bounds
 x >= 0
 y >= 0
End`;

  // Test: Solve the SAME simple LP multiple times
  console.log('\n=== Test: Multiple solves of simple LP ===');
  for (let i = 0; i < 20; i++) {
    try {
      const result = highs.solve(simpleLP);
      console.log(`Solve ${i + 1}: Status ${result.Status}`);
      if (result.Status !== 'Optimal') {
        console.error(`  UNEXPECTED STATUS at solve ${i + 1}`);
        break;
      }
    } catch (err) {
      console.error(`Solve ${i + 1}: FAILED - ${err.message}`);
      break;
    }
  }

  console.log('\n=== Test: Fresh instance after failure ===');
  try {
    const highs2 = await highsLoader();
    const result = highs2.solve(simpleLP);
    console.log('Fresh instance solve: Status', result.Status);
  } catch (err) {
    console.error('Fresh instance solve FAILED:', err.message);
  }
}

runTest().catch(console.error);
