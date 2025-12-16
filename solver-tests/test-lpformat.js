/**
 * Test LP format issues
 */

import highsLoader from 'highs';

async function runTests() {
  console.log('Loading HiGHS...');
  const highs = await highsLoader();
  console.log('HiGHS loaded');

  // Minimal Big-M test
  console.log('\n=== Test: Minimal Big-M ===');
  const lp = `
Maximize
 obj: + 0.5 x0 + 0.5 x1 - 0.1 ao - 0.1 au - 0.5 bo - 0.5 bu - 100 mo - 100 mu
Subject To
 assign: + 1 x0 + 1 x1 = 1
 balance: + 100000 x0 + 200000 x1 - 1 ao + 1 au - 1 bo + 1 bu - 1 mo + 1 mu = 150000
Bounds
 0 <= ao <= 15000
 0 <= au <= 15000
 0 <= bo <= 75000
 0 <= bu <= 75000
 mo >= 0
 mu >= 0
Binary
 x0
 x1
End
`;

  console.log('LP:');
  console.log(lp);

  try {
    const result = highs.solve(lp);
    console.log('Status:', result.Status);
    console.log('Objective:', result.ObjectiveValue);
    console.log('PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test: Negative coefficients in objective
  console.log('\n=== Test: Negative coefficients format ===');
  const lp2 = `
Maximize
 obj: + 0.5 x0 + 0.5 x1 + -0.1 ao + -0.1 au
Subject To
 assign: + 1 x0 + 1 x1 = 1
Bounds
 ao >= 0
 au >= 0
Binary
 x0
 x1
End
`;

  console.log('LP:');
  console.log(lp2);

  try {
    const result = highs.solve(lp2);
    console.log('Status:', result.Status);
    console.log('PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test: Scientific notation coefficients
  console.log('\n=== Test: Scientific notation coefficients ===');
  const lp3 = `
Maximize
 obj: + 0.5 x0 + 0.5 x1 - 1.6666666667e-9 ao
Subject To
 assign: + 1 x0 + 1 x1 = 1
Bounds
 ao >= 0
Binary
 x0
 x1
End
`;

  console.log('LP:');
  console.log(lp3);

  try {
    const result = highs.solve(lp3);
    console.log('Status:', result.Status);
    console.log('PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test: Very small coefficients without scientific notation
  console.log('\n=== Test: Very small coefficients (fixed notation) ===');
  const lp4 = `
Maximize
 obj: + 0.5 x0 + 0.5 x1 - 0.0000000017 ao
Subject To
 assign: + 1 x0 + 1 x1 = 1
Bounds
 ao >= 0
Binary
 x0
 x1
End
`;

  console.log('LP:');
  console.log(lp4);

  try {
    const result = highs.solve(lp4);
    console.log('Status:', result.Status);
    console.log('PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test: Using toFixed(10) which was used in failing tests
  console.log('\n=== Test: toFixed(10) format ===');
  const coef = -(0.01 * 0.5 / 150000);
  console.log('Raw coefficient:', coef);
  console.log('toFixed(10):', coef.toFixed(10));

  const lp5 = `
Maximize
 obj: + 0.5 x0 + 0.5 x1 ${coef.toFixed(10)} ao
Subject To
 assign: + 1 x0 + 1 x1 = 1
Bounds
 ao >= 0
Binary
 x0
 x1
End
`;

  console.log('LP:');
  console.log(lp5);

  try {
    const result = highs.solve(lp5);
    console.log('Status:', result.Status);
    console.log('PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }
}

runTests().catch(console.error);
