/**
 * Test solving LP files directly
 */

import highsLoader from 'highs';
import * as fs from 'fs';

async function runTest() {
  console.log('Loading HiGHS...');
  const highs = await highsLoader();
  console.log('HiGHS loaded');

  // Try solving the failing LP file
  console.log('\n=== Test: Solve failing.lp ===');
  const failingLP = fs.readFileSync('failing.lp', 'utf-8');
  console.log('File length:', failingLP.length, 'bytes');
  console.log('Lines:', failingLP.split('\n').length);

  // Check for any weird characters
  const nonPrintable = failingLP.match(/[^\x20-\x7E\n]/g);
  if (nonPrintable) {
    console.log('WARNING: Non-printable characters found:', [...new Set(nonPrintable)]);
  }

  // Check line lengths
  const lines = failingLP.split('\n');
  const longLines = lines.filter(l => l.length > 200);
  console.log('Lines > 200 chars:', longLines.length);
  if (longLines.length > 0) {
    console.log('Longest line:', Math.max(...longLines.map(l => l.length)));
  }

  try {
    const result = highs.solve(failingLP);
    console.log('Status:', result.Status);
    console.log('PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);

    // Try with options
    console.log('\nTrying with solver options...');
    try {
      const result = highs.solve(failingLP, {
        presolve: 'on',
        time_limit: 30.0,
        mip_rel_gap: 0.01
      });
      console.log('Status with options:', result.Status);
    } catch (err2) {
      console.error('Still failed:', err2.message);
    }
  }

  // Now try passing.lp
  console.log('\n=== Test: Solve passing.lp ===');
  const passingLP = fs.readFileSync('passing.lp', 'utf-8');
  console.log('File length:', passingLP.length, 'bytes');

  try {
    const result = highs.solve(passingLP);
    console.log('Status:', result.Status);
    console.log('PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }

  // Try a hand-crafted version of the same problem
  console.log('\n=== Test: Manually recreate failing LP ===');
  const manualLP = recreateLP();
  console.log('Manual LP length:', manualLP.length);

  try {
    const result = highs.solve(manualLP);
    console.log('Status:', result.Status);
    console.log('PASSED');
  } catch (err) {
    console.error('FAILED:', err.message);
  }
}

function recreateLP() {
  // Same as failing.lp but built cleanly
  return `Maximize
 obj: + 0.8923 x0_0 + 0.6263 x0_1 + 0.5096 x0_2 + 0.5176 x0_3 + 0.9417 x0_4 + 0.8656 x1_0 + 0.7267 x1_1 + 0.7367 x1_2 + 0.6257 x1_3 + 0.6459 x1_4 + 0.6380 x2_0 + 0.6258 x2_1 + 0.5548 x2_2 + 0.7241 x2_3 + 0.7450 x2_4 + 0.8238 x3_0 + 0.8632 x3_1 + 0.6900 x3_2 + 0.9469 x3_3 + 0.9111 x3_4 + 0.5965 x4_0 + 0.7785 x4_1 + 0.6302 x4_2 + 0.6434 x4_3 + 0.7442 x4_4 + 0.9001 x5_0 + 0.8616 x5_1 + 0.5759 x5_2 + 0.9534 x5_3 + 0.7733 x5_4 + 0.6168 x6_0 + 0.6402 x6_1 + 0.7687 x6_2 + 0.5918 x6_3 + 0.5382 x6_4 + 0.6008 x7_0 + 0.8923 x7_1 + 0.9367 x7_2 + 0.5567 x7_3 + 0.5600 x7_4 + 0.6439 x8_0 + 0.8223 x8_1 + 0.9516 x8_2 + 0.6219 x8_3 + 0.7078 x8_4 + 0.9108 x9_0 + 0.9915 x9_1 + 0.8470 x9_2 + 0.9833 x9_3 + 0.9376 x9_4 - 0.0001 ao0 - 0.0001 au0 - 0.01 bo0 - 0.01 bu0 - 1 mo0 - 1 mu0 - 0.0001 ao1 - 0.0001 au1 - 0.01 bo1 - 0.01 bu1 - 1 mo1 - 1 mu1 - 0.0001 ao2 - 0.0001 au2 - 0.01 bo2 - 0.01 bu2 - 1 mo2 - 1 mu2 - 0.0001 ao3 - 0.0001 au3 - 0.01 bo3 - 0.01 bu3 - 1 mo3 - 1 mu3 - 0.0001 ao4 - 0.0001 au4 - 0.01 bo4 - 0.01 bu4 - 1 mo4 - 1 mu4
Subject To
 a0: x0_0 + x0_1 + x0_2 + x0_3 + x0_4 = 1
 a1: x1_0 + x1_1 + x1_2 + x1_3 + x1_4 = 1
 a2: x2_0 + x2_1 + x2_2 + x2_3 + x2_4 = 1
 a3: x3_0 + x3_1 + x3_2 + x3_3 + x3_4 = 1
 a4: x4_0 + x4_1 + x4_2 + x4_3 + x4_4 = 1
 a5: x5_0 + x5_1 + x5_2 + x5_3 + x5_4 = 1
 a6: x6_0 + x6_1 + x6_2 + x6_3 + x6_4 = 1
 a7: x7_0 + x7_1 + x7_2 + x7_3 + x7_4 = 1
 a8: x8_0 + x8_1 + x8_2 + x8_3 + x8_4 = 1
 a9: x9_0 + x9_1 + x9_2 + x9_3 + x9_4 = 1
 bal0: 118717 x0_0 + 101574 x1_0 + 103582 x2_0 + 227262 x3_0 + 205193 x4_0 + 179432 x5_0 + 164999 x6_0 + 213489 x7_0 + 87010 x8_0 + 135213 x9_0 - ao0 + au0 - bo0 + bu0 - mo0 + mu0 = 150000
 bal1: 156814 x0_1 + 111497 x1_1 + 123890 x2_1 + 210875 x3_1 + 107117 x4_1 + 174210 x5_1 + 58118 x6_1 + 244091 x7_1 + 171499 x8_1 + 135750 x9_1 - ao1 + au1 - bo1 + bu1 - mo1 + mu1 = 150000
 bal2: 69698 x0_2 + 66946 x1_2 + 139915 x2_2 + 141789 x3_2 + 131166 x4_2 + 207584 x5_2 + 200000 x6_2 + 180000 x7_2 + 160000 x8_2 + 140000 x9_2 - ao2 + au2 - bo2 + bu2 - mo2 + mu2 = 150000
 bal3: 100000 x0_3 + 120000 x1_3 + 140000 x2_3 + 160000 x3_3 + 180000 x4_3 + 200000 x5_3 + 180000 x6_3 + 160000 x7_3 + 140000 x8_3 + 120000 x9_3 - ao3 + au3 - bo3 + bu3 - mo3 + mu3 = 150000
 bal4: 130000 x0_4 + 145000 x1_4 + 160000 x2_4 + 155000 x3_4 + 140000 x4_4 + 135000 x5_4 + 145000 x6_4 + 165000 x7_4 + 150000 x8_4 + 125000 x9_4 - ao4 + au4 - bo4 + bu4 - mo4 + mu4 = 150000
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
}

runTest().catch(console.error);
