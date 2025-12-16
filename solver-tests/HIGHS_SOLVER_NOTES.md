# HiGHS Solver Notes

This document captures what we've learned about using the HiGHS solver (WebAssembly version) for LP/MIP problems.

## Package Information

- **NPM Package**: `highs` (https://www.npmjs.com/package/highs)
- **Version Tested**: 1.8.0
- **GitHub**: https://github.com/lovasoa/highs-js (JS wrapper)
- **Upstream**: https://github.com/ERGO-Code/HiGHS (C++ solver)

## Loading HiGHS

```javascript
import highsLoader from 'highs';

const highs = await highsLoader();
const result = highs.solve(lpString);
```

## LP Format Requirements (CPLEX/LP format)

### Basic Structure
```
Maximize
 obj: + 1 x1 + 2 x2
Subject To
 c1: + 1 x1 + 1 x2 <= 10
Bounds
 x1 >= 0
Binary
 x1
End
```

### Critical Findings (December 2025)

#### 1. LINE LENGTH IS NOT THE ISSUE
~~LINE LENGTH LIMIT (~255 characters)~~ **DEBUNKED!**

Testing showed that lines up to 1275 characters work fine:
```javascript
// Test result: 10x5 with 1275-char lines: Status Optimal - PASSED
```

The crashes are NOT caused by line length. Long single lines work perfectly.

#### 2. THE REAL ISSUE: Non-Deterministic HiGHS WASM Failures

HiGHS WASM has **inherent instability** that manifests as:
- Crashes that appear after N successful solves
- Different error messages for the same LP
- Errors like `RuntimeError: Aborted()`, `null function or function signature mismatch`, `memory access out of bounds`

**Key observations from testing:**
- Same LP solving 10 times in a fresh process: WORKS
- Same LP after another test file corrupted WASM state: FAILS
- Failures are non-deterministic and depend on execution history

#### 3. Line Continuation IS Valid
When breaking lines, continuation is supported:
```javascript
// Continuation lines start with space + term
const lines = [];
lines.push(" obj: + 0.5 x1 + 0.5 x2");
lines.push(" + 0.5 x3 + 0.5 x4");      // Works fine
```

#### 2. Variable Names
- Must start with a letter (not a number)
- Can contain letters, numbers, underscores
- Case sensitive

```javascript
// BAD - Starts with number
"001abc123" // Invalid

// GOOD - Starts with letter
"x_001abc123" // Valid
```

#### 3. Coefficient Format
- Can be positive or negative
- Scientific notation is OK: `1.6666666667e-9`
- Fixed notation is OK: `0.0000000017`
- No spaces between sign and number: `- 0.1` not `- 0.1`

```javascript
// OK formats
"+ 0.5 x1"
"- 0.1 x1"
"+ 1.5e-9 x1"
"- 0.0000000017 x1"

// Also OK (plus before negative)
"+ -0.1 x1"
```

#### 4. Section Order
Must be in this order:
1. `Maximize` or `Minimize`
2. `Subject To`
3. `Bounds` (optional but recommended)
4. `Binary` (for MIP, optional)
5. `End`

#### 5. Constraint Format
```
constraint_name: terms comparator rhs
```

Where:
- `comparator` is `<=`, `>=`, or `=`
- Example: `c1: + 1 x1 + 2 x2 <= 10`

## Working Example

```javascript
const lp = `
Maximize
 obj: + 0.5 x0 + 0.5 x1 - 0.1 slack_over - 0.1 slack_under
Subject To
 assign: + 1 x0 + 1 x1 = 1
 balance: + 100000 x0 + 200000 x1 - 1 slack_over + 1 slack_under = 150000
Bounds
 0 <= slack_over <= 15000
 0 <= slack_under <= 15000
Binary
 x0
 x1
End
`;

const result = highs.solve(lp);
console.log(result.Status);        // "Optimal", "Infeasible", etc.
console.log(result.ObjectiveValue); // The objective value
console.log(result.Columns.x0.Primal); // Value of x0
```

## Common Errors

### 1. "RuntimeError: Aborted()"
**Cause**: Usually line length > 255 characters
**Fix**: Break long lines, continue with leading space

### 2. "Unable to read LP model"
**Cause**: Invalid LP format
**Fix**: Check:
- Variable names start with letter
- Proper section order
- No missing `End`
- Constraint format correct

### 3. "memory access out of bounds"
**Cause**: WASM memory limit exceeded
**Fix**:
- Reduce problem size
- Fall back to GLPK for large problems
- Pre-check: if > 30,000 variables, use GLPK

## Performance Characteristics

| Problem Size | Binary Vars | Expected Time |
|-------------|-------------|---------------|
| Small       | < 100       | < 50ms        |
| Medium      | 100-1000    | 50-500ms      |
| Large       | 1000-5000   | 500ms-5s      |
| Very Large  | > 5000      | May crash WASM|

## Fallback Strategy

For browser-based solving, use this hierarchy:
1. **Pre-check**: If problem > 30K vars or LP > 5MB, skip to GLPK
2. **Try HiGHS**: Fast, optimal solutions
3. **On crash**: Reset WASM instance, retry with GLPK
4. **GLPK**: Slower but more memory-tolerant

## Coefficient Scaling

HiGHS handles a wide range of coefficient magnitudes, but extreme ranges can cause numerical issues:

- Coefficients as small as 1e-10 work fine
- Mix of 1.0 and 1e-10 works
- But 10^9 range between coefficients may slow solve

## Big-M Penalty Pattern

For soft constraints with three-tier penalties:

```
Maximize
 obj: [assignment scores] - [alpha penalties] - [beta penalties] - [bigM penalties]
Subject To
 balance_rep1: [arr terms] - 1 alpha_over + 1 alpha_under - 1 beta_over + 1 beta_under - 1 bigM_over + 1 bigM_under = target
Bounds
 0 <= alpha_over <= variance_bound
 0 <= alpha_under <= variance_bound
 0 <= beta_over <= buffer_bound
 0 <= beta_under <= buffer_bound
 bigM_over >= 0
 bigM_under >= 0
```

This decomposes deviation into zones:
1. Alpha: deviation within variance band (small penalty)
2. Beta: deviation in buffer zone (medium penalty)
3. BigM: deviation beyond limits (huge penalty)

## Testing

Always test LP format generation separately before integrating with the solver:

```javascript
// Validate before solving
const hasObjective = lp.includes('Maximize') || lp.includes('Minimize');
const hasSubjectTo = lp.includes('Subject To');
const hasEnd = lp.includes('End');

const lines = lp.split('\n');
const longLines = lines.filter(l => l.length > 255).length;

if (!hasObjective || !hasSubjectTo || !hasEnd) {
  throw new Error('Invalid LP format');
}
if (longLines > 0) {
  throw new Error(`${longLines} lines exceed 255 char limit`);
}
```

## Key Learnings (December 2025)

### Root Cause Analysis

After extensive testing, the HiGHS WASM crashes are **NOT caused by**:
- Line length (tested 1275+ char lines - works)
- Coefficient format (scientific and fixed notation work)
- Small coefficients (1e-10 range works)
- Line continuation (properly formatted continues work)
- Number of variables (50+ binary vars work fine)

The crashes **ARE caused by**:
- **WASM module state corruption**: HiGHS WASM can get into a corrupted state after certain operations
- **Non-deterministic failures**: Same LP can succeed or fail depending on execution history
- **Global state pollution**: Even creating a new `highsLoader()` instance may not fully reset state

### Recommended Architecture

Given the inherent instability of HiGHS WASM, the production architecture should be:

```javascript
// 1. Always have a fallback
async function solve(lp) {
  try {
    // Try HiGHS first - it's fast when it works
    const result = await solveWithHiGHS(lp);
    if (result.success) return result;
  } catch (e) {
    console.warn('[HiGHS] Failed, trying fallback');
  }

  // Fallback to more stable solution
  return solveWithGLPK(lp);  // or waterfall assignment
}

// 2. Add solver options for better control
highs.solve(lp, {
  presolve: 'on',
  time_limit: 30.0,      // Don't let it hang
  mip_rel_gap: 0.01,     // 1% gap is good enough
});

// 3. Validate LP before solving
function validateLP(lp) {
  if (!lp.includes('End')) throw new Error('Missing End');
  if (!lp.includes('Subject To')) throw new Error('Missing Subject To');
  // etc.
}
```

### Test Files Reference

The following test files document the investigation:

| File | Purpose | Key Finding |
|------|---------|-------------|
| `test-exact-minimal.js` | Minimal LP tests | All pass, even 1275-char lines |
| `test-coefficient-size.js` | Small coefficient testing | Works with 1e-10 coefficients |
| `test-state-corruption.js` | State corruption hypothesis | Simple LP works 20+ times |
| `test-fresh-instance.js` | Fresh instance testing | Failures are non-deterministic |
| `test-deterministic.js` | Seeded random testing | Same LP can fail after state corruption |

### Conclusion

HiGHS WASM is **fast but unreliable in both browser AND edge functions**. The LP format is correct; the crashes are WASM runtime issues.

**Production recommendation:**
1. **Browser HiGHS** for problems up to ~5000 binary vars
2. **GLPK fallback** for larger problems or when HiGHS crashes
3. **Waterfall assignment fallback** in `useAssignmentEngine.ts` as final defense
4. Log warnings but don't treat HiGHS failures as bugs

---

## Edge Function Investigation (December 2025)

### Initial Hypothesis
We created an edge function to get fresh WASM context per request, avoiding browser state corruption.

### Findings

**Two issues discovered:**

1. **Options object breaks parsing** - Calling `highs.solve(lpString, {presolve: 'on', ...})` in Deno causes `"Unable to parse solution. Too few lines."` error. **Fix:** Call without options: `highs.solve(lpString)`

2. **Deno has WORSE memory limits than browser** - Edge function WASM crashes at ~160 binary vars, while browser HiGHS handles ~5000 vars.

### Test Results (December 15, 2025)

| Problem Size | Binary Vars | Edge Function | Browser HiGHS |
|--------------|-------------|---------------|---------------|
| 10 acc × 5 reps | 50 | ✅ Works | ✅ Works |
| 20 acc × 8 reps | 160 | ❌ Crash | ✅ Works |
| 50 acc × 10 reps | 500 | ❌ Crash | ✅ Works |
| 100 acc × 15 reps | 1500 | ❌ Crash | ✅ Works |

### Root Cause
Supabase Edge Functions (Deno) have stricter WASM memory constraints than browsers. The `npm:highs` package allocates a fixed heap that cannot grow, and Deno's V8 isolate limits are more restrictive.

### Current Status
**Edge function is DISABLED** (`USE_EDGE_FUNCTION_SOLVER = false`) - browser HiGHS with GLPK fallback is more reliable for production workloads.

The edge function code remains deployed for potential future use with very small problems where fresh WASM context matters more than capacity.

### Testing the Edge Function (for small problems)
```bash
curl -X POST "https://lolnbotrdamhukdrrsmh.supabase.co/functions/v1/lp-solver" \
  -H "Content-Type: application/json" \
  -d '{
    "lpString": "Maximize\n obj: + 1 x + 2 y\nSubject To\n c1: x + y <= 10\nBounds\n x >= 0\n y >= 0\nEnd",
    "timeoutSeconds": 30
  }'
```

### Multi-Layer Defense (Current)
1. **Layer 1: Pre-check** (skip HiGHS if > 30K vars)
2. **Layer 2: Browser HiGHS** (fast, ~5000 var limit)
3. **Layer 3: GLPK** (slower but more stable)
4. **Layer 4: Waterfall Assignment** (final fallback if LP fails)

---

## Numerical Stability Fix (December 2025)

### Root Cause: Coefficient Magnitude Mismatch

The global optimization LP was crashing while waterfall LP worked fine. Investigation revealed:

**Waterfall (works):**
- Simple LP with only binary assignment variables
- All coefficients in 1-100 range
- No Big-M penalty slacks

**Global optimization (crashed):**
- Complex LP with Big-M penalty slacks
- Penalty coefficients divided by `targetARR` (~500,000)
- Resulted in extremely small coefficients: `1e-8` to `1e-6`

### The Problem

```javascript
// OLD (broken): Penalties divided by target ARR
const alphaPenalty = 0.01 * weight / normFactor;  // ~8e-9 when normFactor=500k
const betaPenalty = 1.0 * weight / normFactor;    // ~8e-7
const bigMPenalty = 1000 * weight / normFactor;   // ~8e-4
```

This created a coefficient magnitude range of **10^9** (from 8e-9 to 1.0), which causes numerical instability in the HiGHS WASM solver.

### The Fix

**Normalize everything to 0-1 scale:**

1. **Penalty coefficients**: Keep in 0.001-0.1 range (no division)
   ```javascript
   const alphaPenalty = 0.001 * weight;  // ~0.0005
   const betaPenalty = 0.01 * weight;    // ~0.005
   const bigMPenalty = 0.1 * weight;     // ~0.05
   ```

2. **Balance constraints**: Normalize by target
   ```javascript
   // OLD: coefficient = account.aggregated_arr (50000-250000 range)
   // NEW: coefficient = account.aggregated_arr / arrTarget (~0.1-0.5 range)
   ```

3. **Slack bounds**: Normalize by target
   ```javascript
   // OLD: 0 <= alphaOver <= 50000
   // NEW: 0 <= alphaOver <= 0.1 (variance)
   ```

4. **RHS values**: Normalize to 1
   ```javascript
   // OLD: rhs = arrTarget (500000)
   // NEW: rhs = 1 (target/target)
   ```

### Test Results

| Problem Size | Binary Vars | OLD Style | NORMALIZED |
|--------------|-------------|-----------|------------|
| 10×5 | 50 | ✅ | ✅ |
| 20×8 | 160 | ✅ | ✅ |
| 34×8 | 272 | ✅ | ✅ |
| 50×10 | 500 | ❌ CRASHED | ✅ |

### Files Changed

- `lpProblemBuilder.ts`: 
  - Updated `PENALTY` constants (0.001, 0.01, 0.1 instead of 0.01, 1.0, 1000)
  - Updated `buildMetricPenaltyTerms()` to normalize bounds
  - Updated all balance decomposition constraints to normalize by target

### Why This Works

HiGHS (and most LP solvers) perform better when:
1. All coefficients are in similar magnitude range (ideally 1-10)
2. No coefficients smaller than ~1e-6
3. No coefficient ratio larger than ~1e6

The normalized approach keeps all coefficients in the 0.001-2.0 range, well within solver tolerance.

---

## CRITICAL FIX: mip_rel_gap Required for Complex LPs (December 2025)

### The Discovery

Extensive testing revealed a **deterministic pattern** for HiGHS WASM crashes:

**Simple LPs** (only binary vars, no Big-M slacks):
- Work with or without options

**Complex LPs** (1728+ slack variables, Big-M penalty structure):

| Options | Result |
|---------|--------|
| NO options | ❌ CRASHED: `RuntimeError: Aborted()` |
| `presolve: 'on'` only | ❌ CRASHED |
| `time_limit: 60` only | ❌ CRASHED |
| `mip_rel_gap: 0.01` only | ✅ **Optimal 499ms** |
| ALL options | ✅ **Optimal 465ms** |

### Root Cause

The `mip_rel_gap` option changes HiGHS's MIP solving strategy. Without it, HiGHS WASM crashes when processing complex LP structures with many slack variables (like the Big-M penalty system used for balance constraints).

The crash happens during the branch-and-bound process, not during parsing. Setting `mip_rel_gap` allows HiGHS to terminate early when a "good enough" solution is found, avoiding the problematic code path.

### The Fix

**MUST use `mip_rel_gap` for complex LPs:**

```javascript
// CORRECT - Works for complex LPs with Big-M slacks!
highs.solve(lpString, {
  mip_rel_gap: 0.01,  // 1% gap - required for stability
});
```

```javascript
// BROKEN - Crashes on complex LPs!
highs.solve(lpString);  // No options
highs.solve(lpString, { presolve: 'on' });  // presolve alone crashes
highs.solve(lpString, { time_limit: 60 });  // time_limit alone crashes
```

### File Changed

- `highsWrapper.ts`: Changed to use `{ mip_rel_gap: 0.01 }` option

### Test Files

- `solver-tests/test-presolve-only.html` - Proves mip_rel_gap is the key option
- `solver-tests/test-full-production-slacks.html` - Tests with full 1728 slack structure

### Why This Works

1. `mip_rel_gap: 0.01` tells HiGHS to stop when solution is within 1% of optimal
2. This changes the branch-and-bound termination criteria
3. Avoids a code path in HiGHS WASM that crashes on complex constraint matrices
4. 1% gap is acceptable for assignment problems (we don't need perfect optimality)

### Production Impact

This fix enables HiGHS to reliably solve the full global optimization problem:
- 20,736 binary variables
- 1,728 slack variables (ARR + ATR + 4 Tiers × 6 slacks × 48 reps)
- 672 constraints
- ~2.5 MB LP string

All solved in ~465ms in the browser!
