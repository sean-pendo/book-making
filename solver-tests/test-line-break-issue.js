/**
 * Test: Does LP line continuation cause problems?
 */

import highsLoader from 'highs';

async function runTest() {
  console.log('Loading HiGHS...');
  const highs = await highsLoader();
  console.log('HiGHS loaded');

  // Test 1: Single line objective
  console.log('\n=== Test 1: Single line objective ===');
  const lp1 = `Maximize
 obj: + 0.5 x0 + 0.5 x1 + 0.5 x2 + 0.5 x3 + 0.5 x4 + 0.5 x5 - 0.001 slack
Subject To
 assign0: x0 + x1 + x2 + x3 + x4 + x5 = 1
 balance: 100000 x0 + 110000 x1 + 120000 x2 + 130000 x3 + 140000 x4 + 150000 x5 + slack = 125000
Bounds
 slack >= 0
Binary
 x0
 x1
 x2
 x3
 x4
 x5
End`;

  try {
    const result = highs.solve(lp1);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 2: Multi-line objective (with continuation starting with +)
  console.log('\n=== Test 2: Multi-line objective (continuation with +) ===');
  const lp2 = `Maximize
 obj: + 0.5 x0 + 0.5 x1 + 0.5 x2
 + 0.5 x3 + 0.5 x4 + 0.5 x5 - 0.001 slack
Subject To
 assign0: x0 + x1 + x2 + x3 + x4 + x5 = 1
 balance: 100000 x0 + 110000 x1 + 120000 x2 + 130000 x3 + 140000 x4 + 150000 x5 + slack = 125000
Bounds
 slack >= 0
Binary
 x0
 x1
 x2
 x3
 x4
 x5
End`;

  try {
    const result = highs.solve(lp2);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 3: Multi-line constraint (with continuation starting with +)
  console.log('\n=== Test 3: Multi-line constraint (continuation with +) ===');
  const lp3 = `Maximize
 obj: + 0.5 x0 + 0.5 x1 + 0.5 x2 + 0.5 x3 + 0.5 x4 + 0.5 x5 - 0.001 slack
Subject To
 assign0: x0 + x1 + x2 + x3 + x4 + x5 = 1
 balance: 100000 x0 + 110000 x1 + 120000 x2
 + 130000 x3 + 140000 x4 + 150000 x5 + slack = 125000
Bounds
 slack >= 0
Binary
 x0
 x1
 x2
 x3
 x4
 x5
End`;

  try {
    const result = highs.solve(lp3);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 4: Multi-line objective with space indent continuation
  console.log('\n=== Test 4: Multi-line constraint with space-indent continuation ===');
  const lp4 = `Maximize
 obj: + 0.5 x0 + 0.5 x1 + 0.5 x2 + 0.5 x3 + 0.5 x4 + 0.5 x5 - 0.001 slack
Subject To
 assign0: x0 + x1 + x2 + x3 + x4 + x5 = 1
 balance: 100000 x0 + 110000 x1 + 120000 x2
  130000 x3 + 140000 x4 + 150000 x5 + slack = 125000
Bounds
 slack >= 0
Binary
 x0
 x1
 x2
 x3
 x4
 x5
End`;

  try {
    const result = highs.solve(lp4);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 5: Exactly like the generated failing.lp format
  console.log('\n=== Test 5: Exact failing.lp continuation format ===');
  const lp5 = `Maximize
 obj: + 0.8923 x0_0 + 0.6263 x0_1 + 0.5096 x0_2 + 0.5176 x0_3 + 0.9417 x0_4 + 0.8656 x1_0 + 0.7267 x1_1 + 0.7367 x1_2 + 0.6257 x1_3 + 0.6459 x1_4 + 0.6380 x2_0 + 0.6258 x2_1 + 0.5548 x2_2
 + 0.7241 x2_3 + 0.7450 x2_4 + 0.8238 x3_0 + 0.8632 x3_1 + 0.6900 x3_2 + 0.9469 x3_3 + 0.9111 x3_4 + 0.5965 x4_0 + 0.7785 x4_1 + 0.6302 x4_2 + 0.6434 x4_3 + 0.7442 x4_4 + 0.9001 x5_0 + 0.8616 x5_1
 + 0.5759 x5_2 + 0.9534 x5_3 + 0.7733 x5_4 + 0.6168 x6_0 + 0.6402 x6_1 + 0.7687 x6_2 + 0.5918 x6_3 + 0.5382 x6_4 + 0.6008 x7_0 + 0.8923 x7_1 + 0.9367 x7_2 + 0.5567 x7_3 + 0.5600 x7_4 + 0.6439 x8_0
 + 0.8223 x8_1 + 0.9516 x8_2 + 0.6219 x8_3 + 0.7078 x8_4 + 0.9108 x9_0 + 0.9915 x9_1 + 0.8470 x9_2 + 0.9833 x9_3 + 0.9376 x9_4 - 0.0000000333 ao0 - 0.0000000333 au0 - 0.0000033333 bo0
 - 0.0000033333 bu0 - 0.0033333333 mo0 - 0.0033333333 mu0 - 0.0000000333 ao1 - 0.0000000333 au1 - 0.0000033333 bo1 - 0.0000033333 bu1 - 0.0033333333 mo1 - 0.0033333333 mu1 - 0.0000000333 ao2
 - 0.0000000333 au2 - 0.0000033333 bo2 - 0.0000033333 bu2 - 0.0033333333 mo2 - 0.0033333333 mu2 - 0.0000000333 ao3 - 0.0000000333 au3 - 0.0000033333 bo3 - 0.0000033333 bu3 - 0.0033333333 mo3
 - 0.0033333333 mu3 - 0.0000000333 ao4 - 0.0000000333 au4 - 0.0000033333 bo4 - 0.0000033333 bu4 - 0.0033333333 mo4 - 0.0033333333 mu4
Subject To
 a0: + 1 x0_0 + 1 x0_1 + 1 x0_2 + 1 x0_3 + 1 x0_4 = 1
 a1: + 1 x1_0 + 1 x1_1 + 1 x1_2 + 1 x1_3 + 1 x1_4 = 1
 a2: + 1 x2_0 + 1 x2_1 + 1 x2_2 + 1 x2_3 + 1 x2_4 = 1
 a3: + 1 x3_0 + 1 x3_1 + 1 x3_2 + 1 x3_3 + 1 x3_4 = 1
 a4: + 1 x4_0 + 1 x4_1 + 1 x4_2 + 1 x4_3 + 1 x4_4 = 1
 a5: + 1 x5_0 + 1 x5_1 + 1 x5_2 + 1 x5_3 + 1 x5_4 = 1
 a6: + 1 x6_0 + 1 x6_1 + 1 x6_2 + 1 x6_3 + 1 x6_4 = 1
 a7: + 1 x7_0 + 1 x7_1 + 1 x7_2 + 1 x7_3 + 1 x7_4 = 1
 a8: + 1 x8_0 + 1 x8_1 + 1 x8_2 + 1 x8_3 + 1 x8_4 = 1
 a9: + 1 x9_0 + 1 x9_1 + 1 x9_2 + 1 x9_3 + 1 x9_4 = 1
 bal0: + 118717 x0_0 + 101574 x1_0 + 103582 x2_0 + 227262 x3_0 + 205193 x4_0 + 179432 x5_0 + 164999 x6_0 + 213489 x7_0 + 87010 x8_0 + 135213 x9_0 - 1 ao0 + 1 au0 - 1 bo0 + 1 bu0 - 1 mo0 + 1 mu0 = 150000
 bal1: + 156814 x0_1 + 111497 x1_1 + 123890 x2_1 + 210875 x3_1 + 107117 x4_1 + 174210 x5_1 + 58118 x6_1 + 244091 x7_1 + 171499 x8_1 + 135750 x9_1 - 1 ao1 + 1 au1 - 1 bo1 + 1 bu1 - 1 mo1 + 1 mu1 = 150000
 bal2: + 130000 x0_2 + 145000 x1_2 + 160000 x2_2 + 155000 x3_2 + 140000 x4_2 + 135000 x5_2 + 145000 x6_2 + 165000 x7_2 + 150000 x8_2 + 125000 x9_2 - 1 ao2 + 1 au2 - 1 bo2 + 1 bu2 - 1 mo2 + 1 mu2 = 150000
 bal3: + 130000 x0_3 + 145000 x1_3 + 160000 x2_3 + 155000 x3_3 + 140000 x4_3 + 135000 x5_3 + 145000 x6_3 + 165000 x7_3 + 150000 x8_3 + 125000 x9_3 - 1 ao3 + 1 au3 - 1 bo3 + 1 bu3 - 1 mo3 + 1 mu3 = 150000
 bal4: + 130000 x0_4 + 145000 x1_4 + 160000 x2_4 + 155000 x3_4 + 140000 x4_4 + 135000 x5_4 + 145000 x6_4 + 165000 x7_4 + 150000 x8_4 + 125000 x9_4 - 1 ao4 + 1 au4 - 1 bo4 + 1 bu4 - 1 mo4 + 1 mu4 = 150000
Bounds
 0 <= ao0 <= 15000
 0 <= au0 <= 15000
 0 <= bo0 <= 75000
 0 <= bu0 <= 75000
 mo0 >= 0
 mu0 >= 0
 0 <= ao1 <= 15000
 0 <= au1 <= 15000
 0 <= bo1 <= 75000
 0 <= bu1 <= 75000
 mo1 >= 0
 mu1 >= 0
 0 <= ao2 <= 15000
 0 <= au2 <= 15000
 0 <= bo2 <= 75000
 0 <= bu2 <= 75000
 mo2 >= 0
 mu2 >= 0
 0 <= ao3 <= 15000
 0 <= au3 <= 15000
 0 <= bo3 <= 75000
 0 <= bu3 <= 75000
 mo3 >= 0
 mu3 >= 0
 0 <= ao4 <= 15000
 0 <= au4 <= 15000
 0 <= bo4 <= 75000
 0 <= bu4 <= 75000
 mo4 >= 0
 mu4 >= 0
Binary
 x0_0
 x0_1
 x0_2
 x0_3
 x0_4
 x1_0
 x1_1
 x1_2
 x1_3
 x1_4
 x2_0
 x2_1
 x2_2
 x2_3
 x2_4
 x3_0
 x3_1
 x3_2
 x3_3
 x3_4
 x4_0
 x4_1
 x4_2
 x4_3
 x4_4
 x5_0
 x5_1
 x5_2
 x5_3
 x5_4
 x6_0
 x6_1
 x6_2
 x6_3
 x6_4
 x7_0
 x7_1
 x7_2
 x7_3
 x7_4
 x8_0
 x8_1
 x8_2
 x8_3
 x8_4
 x9_0
 x9_1
 x9_2
 x9_3
 x9_4
End`;

  console.log('LP length:', lp5.length);
  console.log('Lines:', lp5.split('\n').length);

  try {
    const result = highs.solve(lp5);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Test 6: Read the actual file and try again
  console.log('\n=== Test 6: Read failing.lp from file system ===');
  const fs = await import('fs');
  try {
    const failingLP = fs.readFileSync('failing.lp', 'utf-8');
    console.log('File read, length:', failingLP.length);

    // Try to solve it
    const result = highs.solve(failingLP);
    console.log('Status:', result.Status, '- PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }
}

runTest().catch(console.error);
