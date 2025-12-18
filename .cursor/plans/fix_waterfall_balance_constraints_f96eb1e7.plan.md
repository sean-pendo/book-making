---
name: Fix Waterfall Balance Constraints
overview: Fix two bugs in the waterfall assignment engine where (1) it uses customer_max_arr for prospect assignments and (2) it doesn't use configured min ARR values in LP constraints, causing the solver to violate min/max boundaries.
todos:
  - id: ssot-doc
    content: Update MASTER_LOGIC.mdc with min/max ARR handling for waterfall
    status: pending
  - id: interface-update
    content: Add customer_min_arr and prospect_min_arr to AssignmentConfiguration interface
    status: pending
  - id: helper-method
    content: Add getMinimumFloor() helper method to WaterfallAssignmentEngine
    status: pending
  - id: fix-max-bug
    content: Change line 1166 to use getCapacityLimit() instead of hardcoded customer_max_arr
    status: pending
  - id: fix-min-bug
    content: Add absoluteMinARR and update slack bounds for minimum floor enforcement
    status: pending
    dependencies:
      - helper-method
  - id: changelog
    content: Update CHANGELOG.md with SSOT fix entry
    status: pending
---

# Fix Waterfall Engine Min/Max Balance Constraints

## Problem Summary

The waterfall engine (`simplifiedAssignmentEngine.ts`) has two bugs preventing proper min/max enforcement:

1. **Line 1166 uses hardcoded `customer_max_arr`** instead of calling `getCapacityLimit()` which respects assignment type
2. **No minimum floor** - the `customer_min_arr`/`prospect_min_arr` fields from the UI config are not passed to or used by the engine

The relaxed LP engine (`lpProblemBuilder.ts`) correctly handles these via `config.lp_balance_config.arr_min/arr_max`.

---

## Changes Required

### 1. Update MASTER_LOGIC.mdc (SSOT Step 1)

Document the min/max ARR handling for waterfall mode in the appropriate section (likely section 11.3).

### 2. Add min ARR fields to AssignmentConfiguration interface

In [`simplifiedAssignmentEngine.ts`](book-ops-workbench/src/services/simplifiedAssignmentEngine.ts) lines 173-197, add:

```typescript
interface AssignmentConfiguration {
  customer_target_arr: number;
  customer_max_arr: number;
  customer_min_arr?: number;  // ADD
  prospect_target_arr: number;
  prospect_max_arr: number;
  prospect_min_arr?: number;  // ADD
  // ... rest unchanged
}
```

### 3. Add getMinimumFloor() helper method

Add a new helper method near `getCapacityLimit()` (around line 350):

```typescript
private getMinimumFloor(): number {
  return this.assignmentType === 'customer'
    ? (this.config.customer_min_arr ?? this.getMinimumThreshold())
    : (this.config.prospect_min_arr ?? this.getMinimumThreshold());
}
```

### 4. Fix the hardcoded customer_max_arr (Bug 1)

Change line 1166 from:
```typescript
const absoluteMaxARR = this.config.customer_max_arr || DEFAULT_MAX_ARR_PER_REP;
```
to:
```typescript
const absoluteMaxARR = this.getCapacityLimit() || DEFAULT_MAX_ARR_PER_REP;
```

### 5. Add minimum floor to LP slack bounds (Bug 2)

After line 1166, add:
```typescript
const absoluteMinARR = this.getMinimumFloor();
```

Then update the betaRange calculation (line 1211) to account for the minimum floor:
```typescript
const betaRange = (absoluteMaxARR - preferredMaxARR) / targetARR;
const betaUnderRange = (preferredMinARR - absoluteMinARR) / targetARR;
```

And update the slack bounds to use asymmetric ranges for over/under.

### 6. Update CHANGELOG.md

Add entry documenting this SSOT fix.

---

## Verification

After implementation:
- Run waterfall with "Very Heavy" balance intensity
- Confirm reps stay within configured min/max bounds
- Check console logs for correct `absoluteMaxARR` and `absoluteMinARR` values
