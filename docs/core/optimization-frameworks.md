# Free Optimization Frameworks for Territory Assignment

## Quick Recommendation

For your use case (territory assignment with ~500-1000 accounts, ~50 reps), I recommend:

| Priority | Framework | Why |
|----------|-----------|-----|
| **1st** | `javascript-lp-solver` | Pure JS, runs in browser, easy to integrate |
| **2nd** | `highs-js` | More powerful, WebAssembly, handles larger problems |
| **3rd** | Google OR-Tools (via Edge Function) | Most powerful, but requires server-side |

---

## Option 1: javascript-lp-solver (Easiest)

**Best for**: Quick integration, smaller problems (<1000 variables)

```bash
npm install javascript-lp-solver
```

```typescript
import Solver from 'javascript-lp-solver';

// Example: Minimize ARR variance across reps
const model = {
  optimize: 'variance',
  opType: 'min',
  constraints: {
    // Each account assigned exactly once
    'account_1': { equal: 1 },
    'account_2': { equal: 1 },
    // Rep capacity limits
    'rep_1_capacity': { max: 3000000 },
    'rep_2_capacity': { max: 3000000 },
  },
  variables: {
    // account_1 -> rep_1
    'a1_r1': {
      'account_1': 1,
      'rep_1_capacity': 500000,  // account ARR
      'variance': 0.1,  // contribution to variance
    },
    // account_1 -> rep_2
    'a1_r2': {
      'account_1': 1,
      'rep_2_capacity': 500000,
      'variance': 0.05,
    },
    // ... more assignment variables
  },
  binaries: ['a1_r1', 'a1_r2']  // Binary: 0 or 1
};

const result = Solver.Solve(model);
console.log(result);
// { feasible: true, a1_r2: 1, ... }
```

**Pros:**
- Zero dependencies, pure JavaScript
- Runs in browser (no server needed)
- Simple API
- Good for problems with <1000 binary variables

**Cons:**
- Slower than compiled solvers
- Limited to LP/MILP (no advanced constraints)
- May struggle with >500 accounts × 50 reps = 25,000 variables

---

## Option 2: HiGHS (More Powerful)

**Best for**: Larger problems, production use

```bash
npm install highs
```

```typescript
import highs from 'highs';

async function solveAssignment() {
  const solver = await highs();
  
  // Build problem in LP format
  const problem = `
    Minimize
      obj: variance
    Subject To
      account1: a1_r1 + a1_r2 + a1_r3 = 1
      account2: a2_r1 + a2_r2 + a2_r3 = 1
      rep1_cap: 500000 a1_r1 + 300000 a2_r1 <= 3000000
      rep2_cap: 500000 a1_r2 + 300000 a2_r2 <= 3000000
    Binary
      a1_r1 a1_r2 a1_r3 a2_r1 a2_r2 a2_r3
    End
  `;
  
  const result = solver.solve(problem);
  return result;
}
```

**Pros:**
- WebAssembly (near-native speed)
- Handles 100,000+ variables
- Active development
- Production-ready

**Cons:**
- Slightly more complex setup
- ~2MB WASM bundle size
- LP format syntax learning curve

---

## Option 3: Google OR-Tools (Most Powerful)

**Best for**: Complex constraints, largest scale

Requires server-side execution (Edge Function or Cloud Function).

```typescript
// Supabase Edge Function: optimize-assignments/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// OR-Tools doesn't have native Deno support, but you can:
// 1. Use a Python Cloud Function with OR-Tools
// 2. Use the SCIP solver via REST API
// 3. Compile OR-Tools to WASM (complex)

// Alternative: Use NEOS Server (free optimization server)
async function callNEOSServer(problem: string) {
  const response = await fetch('https://neos-server.org/neos/api/solve', {
    method: 'POST',
    body: JSON.stringify({
      solver: 'CPLEX',  // or 'Gurobi', 'SCIP'
      model: problem
    })
  });
  return response.json();
}
```

**Pros:**
- Industrial-strength solver
- Handles any size problem
- Specialized assignment algorithms
- Constraint programming support

**Cons:**
- Can't run in browser
- Requires server infrastructure
- More complex integration

---

## Practical Implementation for Territory Assignment

### The Assignment Problem Formulation

Your problem is a **Generalized Assignment Problem (GAP)**:

```
MINIMIZE:
  Σ (deviation from target ARR)² +
  Σ (deviation from target CRE)² +
  λ₁ × continuity_penalties +
  λ₂ × geography_penalties

SUBJECT TO:
  1. Each account assigned to exactly one rep
  2. Strategic accounts → strategic reps only
  3. Parent/child accounts → same rep
  4. Rep ARR ≤ max capacity
  5. Rep CRE ≤ max CRE

DECISION VARIABLES:
  x[a,r] ∈ {0,1} = 1 if account a assigned to rep r
```

### Starter Code with javascript-lp-solver

```typescript
// src/services/lpOptimizationService.ts

import Solver from 'javascript-lp-solver';

interface Account {
  id: string;
  arr: number;
  creCount: number;
  currentOwnerId: string | null;
  territory: string | null;
  isStrategic: boolean;
  parentId: string | null;
}

interface Rep {
  id: string;
  region: string | null;
  isStrategic: boolean;
  maxARR: number;
  maxCRE: number;
}

interface OptimizationResult {
  assignments: Map<string, string>;  // accountId -> repId
  objectiveValue: number;
  feasible: boolean;
  solutionTime: number;
}

export function optimizeAssignments(
  accounts: Account[],
  reps: Rep[],
  config: {
    targetARR: number;
    continuityWeight: number;    // 0-1, how much to preserve current owners
    geographyWeight: number;     // 0-1, how much to prefer same geography
  }
): OptimizationResult {
  const startTime = Date.now();
  
  const model: any = {
    optimize: 'cost',
    opType: 'min',
    constraints: {},
    variables: {},
    ints: {}
  };
  
  // Constraint: Each account assigned exactly once
  accounts.forEach(account => {
    model.constraints[`assign_${account.id}`] = { equal: 1 };
  });
  
  // Constraint: Rep capacity limits
  reps.forEach(rep => {
    model.constraints[`arr_${rep.id}`] = { max: rep.maxARR };
    model.constraints[`cre_${rep.id}`] = { max: rep.maxCRE };
  });
  
  // Variables: x[account, rep] with costs
  accounts.forEach(account => {
    // Filter eligible reps
    const eligibleReps = reps.filter(rep => {
      if (account.isStrategic && !rep.isStrategic) return false;
      if (!account.isStrategic && rep.isStrategic) return false;
      return true;
    });
    
    eligibleReps.forEach(rep => {
      const varName = `x_${account.id}_${rep.id}`;
      
      // Calculate assignment cost
      let cost = 0;
      
      // Continuity penalty (if not current owner)
      if (account.currentOwnerId && account.currentOwnerId !== rep.id) {
        cost += config.continuityWeight * 100;
      }
      
      // Geography penalty (if different region)
      const geoMatch = account.territory && rep.region && 
        account.territory.toLowerCase().includes(rep.region.toLowerCase());
      if (!geoMatch) {
        cost += config.geographyWeight * 50;
      }
      
      // ARR deviation from target (normalized)
      // This is a simplification - true variance minimization is quadratic
      const arrDeviation = Math.abs(account.arr - config.targetARR / reps.length);
      cost += arrDeviation / 1000000;  // Normalize to reasonable scale
      
      model.variables[varName] = {
        cost: cost,
        [`assign_${account.id}`]: 1,
        [`arr_${rep.id}`]: account.arr,
        [`cre_${rep.id}`]: account.creCount
      };
      
      model.ints[varName] = 1;  // Binary variable
    });
  });
  
  // Solve
  const solution = Solver.Solve(model);
  
  // Extract assignments
  const assignments = new Map<string, string>();
  Object.keys(solution).forEach(key => {
    if (key.startsWith('x_') && solution[key] === 1) {
      const [, accountId, repId] = key.split('_');
      assignments.set(accountId, repId);
    }
  });
  
  return {
    assignments,
    objectiveValue: solution.result || 0,
    feasible: solution.feasible || false,
    solutionTime: Date.now() - startTime
  };
}
```

---

## Performance Expectations

| Framework | 100 accounts × 10 reps | 500 accounts × 50 reps | 1000 accounts × 100 reps |
|-----------|------------------------|------------------------|--------------------------|
| javascript-lp-solver | <100ms | 1-5s | 10-60s (may timeout) |
| HiGHS (WASM) | <50ms | 200-500ms | 1-5s |
| OR-Tools (server) | <10ms | <100ms | <500ms |

---

## Recommendation for Your Case

1. **Start with `javascript-lp-solver`** for quick validation
2. **Move to HiGHS** if you hit performance issues
3. **Consider OR-Tools Edge Function** only if HiGHS is insufficient

The key insight: **Your problem size (~500 accounts, ~50 reps) is well within javascript-lp-solver's capability** for a well-formulated model.

---

## Next Steps

1. Install the solver: `npm install javascript-lp-solver`
2. Create `lpOptimizationService.ts` with the starter code above
3. Run side-by-side with current waterfall
4. Compare quality metrics between approaches
5. Tune weights based on business priorities
