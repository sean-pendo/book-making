// Test script to verify HiGHS works locally before deploying
const testLP = `
Maximize
obj: + 0.5 x1 + 0.3 x2 + 0.8 x3 + 0.2 x4

Subject To
assign1: x1 + x2 <= 1
assign2: x3 + x4 <= 1
capacity: x1 + x3 <= 1
capacity2: x2 + x4 <= 1

Binary
x1 x2 x3 x4

End
`;

async function test() {
  console.log('Testing HiGHS locally...\n');
  
  try {
    const highsModule = await import('highs');
    const highs = await highsModule.default();
    
    console.log('HiGHS loaded successfully!');
    console.log('Solving test LP...\n');
    
    const solution = highs.solve(testLP, {
      mip_rel_gap: 0.01
    });
    
    console.log('Solution:');
    console.log('  Status:', solution.Status);
    console.log('  Objective:', solution.ObjectiveValue);
    console.log('  Variables:');
    
    for (const [name, data] of Object.entries(solution.Columns || {})) {
      if (data.Primal > 0.5) {
        console.log(`    ${name} = ${data.Primal}`);
      }
    }
    
    console.log('\n✅ HiGHS is working correctly!');
    console.log('Ready to deploy to Cloud Run.');
    
  } catch (error) {
    console.error('❌ HiGHS test failed:', error.message);
    process.exit(1);
  }
}

test();





