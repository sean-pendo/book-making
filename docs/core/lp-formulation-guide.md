# Linear Programming Formulation Guide for Territory Assignment

## What is Linear Programming?

LP finds the **optimal** values for decision variables that:
- **Minimize** (or maximize) an objective function
- **Subject to** constraints (equalities and inequalities)

```
MINIMIZE:    c₁x₁ + c₂x₂ + ... + cₙxₙ     (objective)
SUBJECT TO:  a₁₁x₁ + a₁₂x₂ + ... ≤ b₁    (constraints)
             a₂₁x₁ + a₂₂x₂ + ... = b₂
             ...
             xᵢ ≥ 0                        (bounds)
```

---

## Your Problem: Territory Assignment

### The Business Problem

Given:
- **N accounts** (each with ARR, CRE count, tier, current owner, territory)
- **M reps** (each with region, capacity limits)

Find:
- **Assignment of each account to exactly one rep**
- That **minimizes variance** across reps
- While **respecting capacity** and **business rules**

### Why This is Hard for Greedy Algorithms

The waterfall processes accounts one-by-one. It can't see that:
- Assigning Account A to Rep 1 now...
- ...will force Account B to Rep 2 later...
- ...creating worse overall balance than (A→Rep2, B→Rep1)

LP considers **all assignments simultaneously**.

---

## Step 1: Define Decision Variables

For each (account, rep) pair, create a binary variable:

```
x[a,r] = 1  if account a is assigned to rep r
x[a,r] = 0  otherwise
```

**Example with 3 accounts, 2 reps:**
```
Variables: x_A1_R1, x_A1_R2, x_A2_R1, x_A2_R2, x_A3_R1, x_A3_R2
```

Total variables = N × M (accounts × reps)

---

## Step 2: Define Constraints

### Constraint 1: Each Account Assigned Exactly Once

For each account a:
```
x[a,R1] + x[a,R2] + ... + x[a,Rm] = 1
```

**Example:**
```
Account A1: x_A1_R1 + x_A1_R2 = 1
Account A2: x_A2_R1 + x_A2_R2 = 1
Account A3: x_A3_R1 + x_A3_R2 = 1
```

### Constraint 2: Rep Capacity Limits

For each rep r with max ARR capacity C:
```
ARR[A1] × x[A1,r] + ARR[A2] × x[A2,r] + ... ≤ C
```

**Example (max $3M per rep):**
```
Rep R1: 500000×x_A1_R1 + 800000×x_A2_R1 + 400000×x_A3_R1 ≤ 3000000
Rep R2: 500000×x_A1_R2 + 800000×x_A2_R2 + 400000×x_A3_R2 ≤ 3000000
```

### Constraint 3: CRE Limits

For each rep r with max CRE count K:
```
CRE[A1] × x[A1,r] + CRE[A2] × x[A2,r] + ... ≤ K
```

### Constraint 4: Strategic Pool (Optional)

Strategic accounts can only go to strategic reps:
```
For strategic account a, non-strategic rep r:
  x[a,r] = 0  (or simply don't create this variable)
```

---

## Step 3: Define Objective Function

The objective is what you're optimizing. Common approaches:

### Option A: Minimize Total Weighted Cost

Assign a "cost" to each assignment based on penalties:

```
MINIMIZE: Σ cost[a,r] × x[a,r]

Where cost[a,r] = 
  + 100 × (1 if changing owner, 0 otherwise)     # continuity penalty
  + 80 × (1 if region mismatch, 0 otherwise)     # geography penalty  
  + 10 × |ARR[a] - target|                       # balance preference
```

### Option B: Minimize Max Deviation (Minimax)

```
MINIMIZE: z

Subject to:
  ARR[r] - target ≤ z   for all reps r
  target - ARR[r] ≤ z   for all reps r
```

This minimizes the worst-case deviation.

### Option C: Minimize Variance (Quadratic - More Complex)

True variance minimization is quadratic programming:
```
MINIMIZE: Σ (ARR[r] - mean)²
```

This requires QP solvers, not pure LP. The linear approximation in Option A works well in practice.

---

## Step 4: Complete Example

### Scenario

| Account | ARR | CRE | Current Owner | Territory |
|---------|-----|-----|---------------|-----------|
| A1 | $500K | 1 | R1 | West |
| A2 | $800K | 0 | R1 | East |
| A3 | $400K | 2 | R2 | West |

| Rep | Region | Max ARR | Max CRE |
|-----|--------|---------|---------|
| R1 | West | $2M | 3 |
| R2 | East | $2M | 3 |

Target ARR per rep: ($500K + $800K + $400K) / 2 = $850K

### LP Formulation

```
MINIMIZE:
  # Continuity penalties (100 pts for owner change)
  + 0×x_A1_R1 + 100×x_A1_R2      # A1 currently with R1
  + 0×x_A2_R1 + 100×x_A2_R2      # A2 currently with R1  
  + 100×x_A3_R1 + 0×x_A3_R2      # A3 currently with R2
  
  # Geography penalties (80 pts for mismatch)
  + 0×x_A1_R1 + 80×x_A1_R2       # A1 (West) matches R1 (West)
  + 80×x_A2_R1 + 0×x_A2_R2       # A2 (East) matches R2 (East)
  + 0×x_A3_R1 + 80×x_A3_R2       # A3 (West) matches R1 (West)

SUBJECT TO:
  # Assignment constraints
  x_A1_R1 + x_A1_R2 = 1
  x_A2_R1 + x_A2_R2 = 1
  x_A3_R1 + x_A3_R2 = 1
  
  # ARR capacity (max $2M)
  500000×x_A1_R1 + 800000×x_A2_R1 + 400000×x_A3_R1 ≤ 2000000
  500000×x_A1_R2 + 800000×x_A2_R2 + 400000×x_A3_R2 ≤ 2000000
  
  # CRE capacity (max 3)
  1×x_A1_R1 + 0×x_A2_R1 + 2×x_A3_R1 ≤ 3
  1×x_A1_R2 + 0×x_A2_R2 + 2×x_A3_R2 ≤ 3

BINARY:
  x_A1_R1, x_A1_R2, x_A2_R1, x_A2_R2, x_A3_R1, x_A3_R2
```

### Expected Solution

The solver would find:
```
x_A1_R1 = 1  (A1 → R1: keeps owner, matches geo)
x_A2_R2 = 1  (A2 → R2: changes owner but matches geo)
x_A3_R1 = 1  (A3 → R1: changes owner but matches geo)
```

Result:
- R1: $500K + $400K = $900K (3 CRE)
- R2: $800K (0 CRE)
- Balanced ARR, geography optimized

---

## Step 5: Using javascript-lp-solver

### Installation
```bash
npm install javascript-lp-solver
```

### Code Structure

```javascript
import Solver from 'javascript-lp-solver';

const model = {
  optimize: 'cost',           // Name of objective
  opType: 'min',              // 'min' or 'max'
  
  constraints: {
    // Constraint name: { equal: value } or { max: value } or { min: value }
    'assign_A1': { equal: 1 },
    'assign_A2': { equal: 1 },
    'arr_R1': { max: 2000000 },
    'arr_R2': { max: 2000000 },
  },
  
  variables: {
    // Variable name: { objective: coeff, constraint1: coeff, ... }
    'x_A1_R1': {
      cost: 0,           // No penalty (keeps owner + matches geo)
      assign_A1: 1,      // Contributes to assignment constraint
      arr_R1: 500000     // Contributes 500K to R1's ARR
    },
    'x_A1_R2': {
      cost: 180,         // 100 (change owner) + 80 (wrong geo)
      assign_A1: 1,
      arr_R2: 500000
    },
    // ... more variables
  },
  
  ints: {
    'x_A1_R1': 1,        // Binary constraint
    'x_A1_R2': 1,
    // ...
  }
};

const result = Solver.Solve(model);
console.log(result);
// { feasible: true, result: 180, x_A1_R1: 1, x_A2_R2: 1, x_A3_R1: 1 }
```

---

## Key Concepts to Understand

### 1. Feasibility vs Optimality

- **Feasible**: A solution that satisfies all constraints
- **Optimal**: The feasible solution with the best objective value
- **Infeasible**: No solution exists (constraints too tight)

### 2. Relaxation

If the problem is infeasible, you can:
- Increase capacity limits
- Make some constraints "soft" (add penalty to objective instead)
- Remove low-priority constraints

### 3. Problem Size Limits

| Variables | javascript-lp-solver | HiGHS | OR-Tools |
|-----------|---------------------|-------|----------|
| <1,000 | ✅ Fast | ✅ Fast | ✅ Fast |
| 1,000-10,000 | ⚠️ Slow | ✅ Fast | ✅ Fast |
| 10,000-100,000 | ❌ May fail | ✅ OK | ✅ Fast |
| >100,000 | ❌ No | ⚠️ Slow | ✅ OK |

Your problem: 500 accounts × 50 reps = 25,000 variables → Use HiGHS if js-lp-solver is too slow.

### 4. Integer vs Continuous

- **Continuous LP**: Variables can be any real number (fast)
- **Integer LP (ILP/MILP)**: Variables must be integers (slower)
- **Binary**: Variables are 0 or 1 (subset of integer)

Assignment problems require binary variables.

---

## Next Steps for Testing

1. **Start small**: 5 accounts, 3 reps
2. **Verify constraints**: Check that all accounts are assigned
3. **Compare with manual**: Verify the solution makes sense
4. **Scale up gradually**: 20 accounts, then 100, then full dataset
5. **Tune weights**: Adjust continuity vs geography vs balance

---

## Resources

- [javascript-lp-solver docs](https://github.com/JWally/jsLPSolver)
- [LP Formulation Tutorial](https://www.math.ucla.edu/~tom/LP.pdf)
- [Assignment Problem (Wikipedia)](https://en.wikipedia.org/wiki/Assignment_problem)
- [HiGHS Solver](https://highs.dev/) - For larger problems
