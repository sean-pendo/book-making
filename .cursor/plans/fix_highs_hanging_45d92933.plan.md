---
name: Fix HiGHS Hanging (Revised)
overview: Diagnose why production global optimization LP hangs despite mip_rel_gap being set. Add diagnostic logging first, then address root cause (likely constraint matrix density at scale).
todos:
  - id: add-diagnostics
    content: Add coefficient range and matrix density logging before solve
    status: completed
  - id: verify-options
    content: Confirm mip_rel_gap is being passed and logs appear before hang
    status: completed
  - id: test-scale-threshold
    content: Test with 2000 accounts to find scale threshold where hanging begins
    status: completed
  - id: implement-scale-guard
    content: Add account count check - use waterfall for >3000 accounts
    status: completed
---

# Fix HiGHS Global Optimization Hanging (Revised)

## Problem Summary

Production LP hangs for 3+ minutes despite:

- `mip_rel_gap: 0.01` being correctly set (verified in highsWrapper.ts:660-662)
- Numerical normalization already applied (lpProblemBuilder.ts)
- Similar-sized test LPs solving in ~465ms

**Key Question**: Why does the production LP hang when the same-sized test LP works?

## What's Already Working (Do NOT Change)

1. `mip_rel_gap: 0.01` - Already in place, this is the critical option
2. Coefficient normalization - Already normalizing by target ARR
3. GLPK fallback - Already exists for memory errors
4. 6 decimal precision - Fine for solver, not the issue

## Diagnosis First (Before Any Code Changes)

### Step 1: Add Diagnostic Logging

Add coefficient range logging to identify if normalization is working:

```typescript
// In highsWrapper.ts, before solve()
const coefficients = Array.from(problem.objectiveCoefficients.values()).filter(c => c !== 0);
const positiveCoeffs = coefficients.filter(c => c > 0);
console.log('[HiGHS] Coefficient diagnostics:', {
  count: coefficients.length,
  min: Math.min(...coefficients),
  max: Math.max(...coefficients),
  range: positiveCoeffs.length > 0 ? Math.max(...positiveCoeffs) / Math.min(...positiveCoeffs) : 0
});
```

**Expected**: Range should be < 10^4 if normalization is working.

**Problem indicator**: Range > 10^6 means normalization is broken.

### Step 2: Verify Solve Options Are Being Used

The console should show `[HiGHS] Calling highs.solve() with mip_rel_gap...` before hanging.

If this log appears, options ARE being used - the issue is elsewhere.

### Step 3: Check for Dense Constraint Matrix

Production LP has 8000+ accounts. Each balance constraint has 8000+ terms.

This creates a constraint matrix with ~8000 * 48 * 6 = 2.3M non-zeros.

**This density may be the actual problem** - not coefficient values.

## Potential Root Causes (Ranked by Likelihood)

### 1. Constraint Matrix Density (Most Likely)

- Test LP: 432 accounts = ~125K non-zeros per constraint set
- Production LP: 8000 accounts = ~2.3M non-zeros per constraint set
- HiGHS may be struggling with matrix operations, not coefficient values

### 2. MIP Branching Explosion

- `mip_rel_gap: 0.01` allows 1% gap, but branching may still explode
- Production data may have more ties/ambiguity than test data

### 3. Memory Pressure (Less Likely)

- 9MB estimated memory is within limits
- But WASM heap fragmentation could cause slowdown

## Recommended Actions

### Action 1: Add Diagnostic Logging (Required First)

File: [highsWrapper.ts](book-ops-workbench/src/services/optimization/solver/highsWrapper.ts)

Before any fixes, we need to understand what's happening.

### Action 2: Test with Reduced Account Count

If diagnostics show everything is correct, the issue is scale.

Test with 2000 accounts instead of 8000 to see if it's linear scaling.

### Action 3: Implement Scale Guard

For very large problems (8000+ accounts), global optimization may not be practical in browser WASM.

Add a check in pureOptimizationEngine.ts:

```typescript
const MAX_ACCOUNTS_FOR_GLOBAL_LP = 3000;
if (accounts.length > MAX_ACCOUNTS_FOR_GLOBAL_LP) {
  console.warn(`[LP] ${accounts.length} accounts exceeds global LP limit, using waterfall`);
  return this.fallbackToWaterfall(accounts, reps);
}
```

### Action 4: Consider Problem Decomposition (Future Enhancement)

For very large builds, options include:

- **Hierarchical solve**: Solve by region first, then combine
- **Iterative refinement**: Start with waterfall, then optimize locally

## What NOT To Do

1. Do NOT remove `mip_rel_gap` - it's required
2. Do NOT reduce precision to 3 decimals - could hurt solution quality
3. Do NOT add JavaScript timeout wrapper - can't interrupt synchronous WASM
4. Do NOT scale coefficients 10x - normalization already done

## Disagreements with Original Plan

| Original Todo | Status | Reason |

|---------------|--------|--------|

| Add 30-second timeout | **Rejected** | Can't interrupt synchronous WASM without Web Workers (major refactor) |

| Scale coefficients 10x | **Rejected** | Already normalized in lpProblemBuilder.ts, would duplicate effort |

| Reduce precision to 3 decimals | **Rejected** | Could hurt solution quality, not the root cause |

## Agreement with Reviewer

The reviewer correctly identified:

1. The `mip_rel_gap` fix is already in place
2. Timeout can't work without Web Workers
3. Coefficient scaling was already done
4. Diagnostic logging should come first

## Success Criteria

1. Diagnostic logging reveals the actual bottleneck
2. Production LP either solves in < 60 seconds OR gracefully falls back to waterfall
3. No regression in test LP solve times
4. Clear threshold established for when to use global LP vs waterfall