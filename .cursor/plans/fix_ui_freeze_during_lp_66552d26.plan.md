---
name: Fix UI Freeze During LP
overview: Add periodic UI yields during LP string building and solution parsing loops to prevent browser freezing on large datasets (8,000+ accounts).
todos:
  - id: lp-build-yield
    content: Add yieldToUI() every 10 reps in balance constraint building loop
    status: pending
  - id: solution-parse-refactor
    content: Refactor solution parsing to use pre-built Map for O(1) variable lookups
    status: pending
    dependencies:
      - lp-build-yield
---

# Fix UI Freezing During Large Dataset Optimization

## Root Cause

The solver itself uses cloud mode (non-blocking) for large datasets, but **two synchronous loops** still block the main thread:

1. **LP String Building** (~lines 1199-1250): Nested loop `O(reps x accounts)` building balance constraints
2. **Solution Parsing** (~lines 1346-1387): Nested loop matching variable names to accounts/reps

For 8,051 accounts x 48 reps = ~387,000 iterations, each taking microseconds, this blocks the UI for several seconds.

## Solution

Add periodic `yieldToUI()` calls inside the heavy loops to allow the browser to repaint and handle user input.

## Changes to `simplifiedAssignmentEngine.ts`

### 1. LP Building Loop (Balance Constraints)

Around line 1199, add a yield every 10 reps:

```typescript
let repIterCount = 0;
for (const [repId, rep] of allEligibleReps) {
  // ... existing constraint building code ...
  
  repIterCount++;
  if (repIterCount % 10 === 0) {
    await yieldToUI();
  }
}
```

### 2. Solution Parsing Loop

Around line 1346, refactor to use a pre-built lookup map instead of nested loops:

**Before** (O(variables x accounts x reps)):
```typescript
for (const [varName, varData] of Object.entries(solution.columns || {})) {
  for (const account of accounts) {
    for (const rep of eligibleReps) {
      // match varName to account+rep
    }
  }
}
```

**After** (O(variables) with O(1) lookup):
```typescript
// Build lookup map once
const varToAccountRep = new Map<string, { account: Account, rep: SalesRep }>();
for (const account of accounts) {
  const eligibleReps = eligibleRepsPerAccount.get(account.sfdc_account_id) || [];
  for (const rep of eligibleReps) {
    const varName = `x_${sanitizeVarName(account.sfdc_account_id)}_${sanitizeVarName(rep.rep_id)}`;
    varToAccountRep.set(varName, { account, rep });
  }
}

// Parse solution with O(1) lookups
for (const [varName, varData] of Object.entries(solution.columns || {})) {
  if (!varName.startsWith('x_')) continue;
  if ((varData as any).Primal < 0.5) continue;
  
  const match = varToAccountRep.get(varName);
  if (match) {
    // ... create proposal ...
  }
}
```

This changes O(n^3) to O(n) and eliminates the need for yields in this section.

## Files Changed

- [`src/services/simplifiedAssignmentEngine.ts`](book-ops-workbench/src/services/simplifiedAssignmentEngine.ts) - Add yields in LP building, refactor solution parsing to use Map lookup