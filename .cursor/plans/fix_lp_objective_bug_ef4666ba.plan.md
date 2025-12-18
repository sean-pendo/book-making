---
name: Fix LP Objective Bug
overview: ""
todos:
  - id: fix-obj-assembly
    content: Move objective function assembly after penalty terms are added
    status: pending
  - id: update-docs
    content: Update MASTER_LOGIC.mdc and CHANGELOG.md
    status: pending
  - id: verify-fix
    content: Run assignment and verify CV improves
    status: pending
---

# Fix: LP Penalty Terms Missing from Objective Function

## Root Cause

The Big-M penalty terms are **never included in the LP objective function**. This is a critical bug in [`simplifiedAssignmentEngine.ts`](book-ops-workbench/src/services/simplifiedAssignmentEngine.ts).

### The Bug (Code Flow)

```
Line 1098-1162:  Build assignment score terms, push to objectiveTerms[]
Line 1171:       Write objectiveTerms.join(' + ') to lines[]  <-- OBJECTIVE WRITTEN HERE
Line 1237-1245:  Push penalty terms to objectiveTerms[]       <-- THESE ARE ADDED AFTER!
Line 1340:       Assemble final LP string from lines[]
```

The penalty terms (`- 2500.0 mo_rep1`, etc.) are pushed to `objectiveTerms` AFTER the objective has already been written to `lines`. The slack variables exist in constraints and bounds, but have **zero penalty** in the objective.

### Effect

- Slack variables can take any value with no cost
- The solver sees no reason to prefer balanced assignments
- All reps can be over/under target with no penalty
- CV remains high (60%) even with "Very Heavy" balance intensity

## Fix

Move the objective function assembly to AFTER all penalty terms are added.

### Current (Broken)

```typescript
// Line 1162: All assignment terms built
objectiveTerms.push(`${coefficient.toFixed(2)} ${varName}`);

// Line 1171: OBJECTIVE WRITTEN HERE (too early!)
lines.push('    ' + objectiveTerms.join(' + '));

// Lines 1240-1245: Penalty terms added AFTER objective is written (never used!)
objectiveTerms.push(`- ${(LP_PENALTY.BIG_M * im).toFixed(6)} ${mo}`);
```

### Fixed

```typescript
// Line 1162: All assignment terms built
objectiveTerms.push(`${coefficient.toFixed(2)} ${varName}`);

// Lines 1240-1245: Penalty terms added
objectiveTerms.push(`- ${(LP_PENALTY.BIG_M * im).toFixed(6)} ${mo}`);

// NEW: Objective written AFTER all terms are added
lines.push('    ' + objectiveTerms.join(' + '));
```

## Implementation Steps

1. **Remove line 1171** (the premature `lines.push('    ' + objectiveTerms.join(' + '))`)

2. **Add objective assembly after slack loop** (around line 1270, after the `for (const [repId, rep] of allEligibleReps)` loop ends):
   ```typescript
   // Assemble objective function AFTER all penalty terms are added
   lines.push('    ' + objectiveTerms.join(' + '));
   ```

3. **Update MASTER_LOGIC.mdc** - Add a note in section 11.3 about the LP assembly order requirement

4. **Update CHANGELOG.md** - Document this critical fix

## Verification

After the fix, you should see in the console:
- `[LP Balance] ARR constraints: min=..., prefMin=..., target=..., prefMax=..., max=...`
- The LP problem string should contain penalty terms like `- 2500.000000 mo_rep1`
- CV should drop significantly (from 60% to ~10-20%)
