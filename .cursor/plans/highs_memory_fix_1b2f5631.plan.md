---
name: HiGHS Memory Fix
overview: Fix HiGHS WASM memory crashes for large LP problems by implementing problem size limits, automatic GLPK fallback, and better error diagnostics.
todos:
  - id: add-size-constants
    content: Add HIGHS_MAX_VARIABLES and HIGHS_MAX_LP_STRING_BYTES constants to highsWrapper.ts
    status: pending
  - id: add-precheck
    content: Add problem size pre-check in solveProblem() to skip HiGHS for large problems
    status: pending
    dependencies:
      - add-size-constants
  - id: add-lp-size-check
    content: Add LP string size check in solveWithHiGHS() before calling solver
    status: pending
    dependencies:
      - add-size-constants
  - id: add-memory-fallback
    content: Add try/catch with GLPK fallback on memory errors
    status: pending
    dependencies:
      - add-precheck
  - id: enhance-logging
    content: Add detailed LP stats logging including estimated memory usage
    status: pending
  - id: improve-error-messages
    content: Improve user-facing error messages for memory errors in pureOptimizationEngine.ts
    status: pending
    dependencies:
      - add-memory-fallback
---

# Fix HiGHS WASM Memory Crashes

## Problem

HiGHS WebAssembly crashes with "memory access out of bounds" when solving large LP problems. The error message suggests building with `-sASSERTIONS`, but this requires recompiling the WASM module which is not practical since we use the pre-built npm package.

**Your problem size:**
- 2,019 prospect accounts x N reps = potentially 50,000+ binary variables
- Plus ~37 slack variables per rep (Big-M 3-tier system)
- LP string can be megabytes, exceeding WASM heap

## Root Cause

The `highs` npm package (v1.8.0) uses a pre-compiled WASM module with fixed memory limits (~256MB typical). Large LP problems either:
1. Exceed the memory during LP string parsing
2. Exceed memory during the solve phase
3. Cause memory fragmentation from repeated solves

## Solution: Multi-Layer Defense

### Layer 1: Problem Size Limits and Automatic GLPK Fallback

Add size check before solving. If problem is too large for WASM, use GLPK.js (pure JavaScript, no memory limits but slower).

**File:** [`highsWrapper.ts`](book-ops-workbench/src/services/optimization/solver/highsWrapper.ts)

```typescript
// Add at top of file
const HIGHS_MAX_VARIABLES = 30000;  // ~30K binary vars is safe limit
const HIGHS_MAX_LP_STRING_BYTES = 5_000_000;  // 5MB LP string limit

// In solveProblem():
export async function solveProblem(
  problem: LPProblem,
  params: LPSolverParams
): Promise<SolverSolution> {
  const numVars = problem.assignmentVars.length;
  
  // Pre-check: If problem is likely too large, go straight to GLPK
  if (numVars > HIGHS_MAX_VARIABLES) {
    console.log(`[HiGHS] Problem too large (${numVars} vars > ${HIGHS_MAX_VARIABLES}), using GLPK`);
    return solveWithGLPK(problem, params);
  }
  
  await getHiGHS();
  
  if (usingGLPK) {
    return solveWithGLPK(problem, params);
  }
  
  // Try HiGHS first, fall back to GLPK on memory error
  try {
    return await solveWithHiGHS(problem, params);
  } catch (error: any) {
    if (error.message?.includes('memory') || error.message?.includes('Aborted')) {
      console.warn('[HiGHS] Memory error, falling back to GLPK');
      resetHiGHSInstance();
      return solveWithGLPK(problem, params);
    }
    throw error;
  }
}
```

### Layer 2: LP String Size Check

Before passing to HiGHS, check LP string size:

```typescript
// In solveWithHiGHS(), after problemToLPFormat():
const { lpString, varMapping } = problemToLPFormat(problem);

if (lpString.length > HIGHS_MAX_LP_STRING_BYTES) {
  console.warn(`[HiGHS] LP string too large (${(lpString.length / 1e6).toFixed(1)}MB), using GLPK`);
  return solveWithGLPK(problem, params);
}
```

### Layer 3: Enhanced Logging for Debugging

Add detailed problem size logging:

```typescript
// In problemToLPFormat(), at the end:
console.log(`[HiGHS] LP stats: ${lines.length} lines, ${lpString.length} bytes, ` +
  `${accountIdx} accounts, ${repIdx} reps, ${problem.slackBounds?.length || 0} slack bounds`);

// Estimate memory requirement
const estimatedMB = (lpString.length * 3 + numVars * 100) / 1e6;
console.log(`[HiGHS] Estimated memory: ${estimatedMB.toFixed(1)}MB`);
```

### Layer 4: Graceful Error Messages

Improve error messages for users:

```typescript
// In pureOptimizationEngine.ts, when solver returns error:
if (solution.status === 'error') {
  const isMemoryError = solution.error?.includes('memory') || 
                        solution.error?.includes('Aborted');
  
  return {
    success: false,
    proposals: [],
    repLoads: [],
    metrics: this.emptyMetrics(solution.solveTimeMs),
    solverStatus: 'error',
    objectiveValue: 0,
    warnings: isMemoryError 
      ? ['Problem too large for optimizer. Try reducing the number of accounts or reps.']
      : [],
    error: isMemoryError 
      ? 'Optimization problem exceeded memory limits. Consider batching accounts.'
      : solution.error
  };
}
```

## Why Not -sASSERTIONS?

The `-sASSERTIONS` flag is an **Emscripten compiler flag** used when building the WASM module from C++ source. Options:

1. **Use the pre-built npm package** (current approach) - No control over build flags
2. **Build HiGHS from source** - Would need to clone github.com/ERGO-Code/HiGHS, install Emscripten, compile with custom flags. Adds significant build complexity.
3. **Request debug build** - Could open issue on lovasoa/highs-js asking for a debug variant

For now, the automatic GLPK fallback is the pragmatic solution.

## Files Modified

1. [`book-ops-workbench/src/services/optimization/solver/highsWrapper.ts`](book-ops-workbench/src/services/optimization/solver/highsWrapper.ts)
   - Add size constants
   - Add pre-check in `solveProblem()`
   - Add LP string size check
   - Add memory error fallback
   - Enhance logging

2. [`book-ops-workbench/src/services/optimization/pureOptimizationEngine.ts`](book-ops-workbench/src/services/optimization/pureOptimizationEngine.ts)
   - Improve error messages for memory errors

## Testing

After implementation:
1. Run customer optimization (34 accounts) - should use HiGHS
2. Run prospect optimization (2,019 accounts) - should fall back to GLPK if too large
3. Check console for size logging
4. Verify GLPK produces valid assignments
