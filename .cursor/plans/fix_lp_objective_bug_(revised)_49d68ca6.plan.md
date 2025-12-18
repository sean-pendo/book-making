---
name: Fix LP Objective Bug (Revised)
overview: ""
todos:
  - id: delete-line-1171
    content: Delete line 1171 (premature objectiveTerms write)
    status: pending
  - id: insert-obj-assembly
    content: Insert objective assembly at line 1270 with verification logging
    status: pending
  - id: add-lp-verification
    content: Add LP format verification after line 1340
    status: pending
  - id: update-ssot-docs
    content: Add implementation note to MASTER_LOGIC.mdc section 11.3
    status: pending
  - id: update-changelog
    content: Document fix in CHANGELOG.md
    status: pending
  - id: verify-fix
    content: Run assignment and verify CV improves
    status: pending
---

# Fix: LP Penalty Terms Missing from Objective Function (Revised)

## Root Cause (Confirmed)

The Big-M penalty terms are **never included in the LP objective function**. This is a critical bug in [`simplifiedAssignmentEngine.ts`](book-ops-workbench/src/services/simplifiedAssignmentEngine.ts).

### The Bug (Code Flow)

```
Line 1098-1100:  Write 'Maximize' and 'obj:' headers
Line 1122-1162:  Build assignment score terms, push to objectiveTerms[]
Line 1171:       Write objectiveTerms.join(' + ') to lines[]  <-- TOO EARLY!
Line 1211-1269:  Rep balance loop - push penalty terms to objectiveTerms[]
Line 1340:       Assemble final LP string from lines[]
```

The penalty terms (`- 2500.0 mo_rep1`, etc.) are pushed to `objectiveTerms` AFTER the objective has already been written to `lines`. The slack variables exist in constraints and bounds, but have **zero penalty** in the objective.

## Precise Fix Location

### Step 1: Delete Line 1171

Current line 1171:
```typescript
lines.push('    ' + objectiveTerms.join(' + '));
```

Delete this line entirely. This leaves the LP with `Maximize` and `obj:` headers but no content yet.

### Step 2: Insert Objective Assembly After Rep Balance Loop

Insert at line 1270 (after the `for (const [repId, rep] of allEligibleReps)` loop closes at line 1269, and BEFORE the team alignment block that starts at line 1271):

```typescript
// Assemble objective function AFTER all penalty terms are added
// @see fix: penalty terms must be in objective for balance constraints to work
lines.push('    ' + objectiveTerms.join(' + '));

// Verification logging
const penaltyTermCount = objectiveTerms.length - binaries.length;
console.log(`[LP Objective] ${objectiveTerms.length} terms (${binaries.length} assignment + ${penaltyTermCount} penalty)`);
```

### Step 3: Add LP Format Verification (After Line 1340)

After the LP string is assembled, add verification:
```typescript
const penaltyTermsInLP = (lpProblem.match(/- \d+\.\d+ [mab][ou]_/g) || []).length;
if (penaltyTermsInLP === 0) {
  console.error('[LP CRITICAL] No penalty terms in objective! Balance constraints will be ignored.');
}
```

## LP Format Verification

The LP file structure must remain:
```
Maximize
 obj:
    <assignment terms> + <penalty terms>   <-- Now includes penalties
Subject To
    <constraints>
Bounds
    <slack bounds>
    <binary bounds>
Binary
    <binary vars>
End
```

## SSOT Documentation

Add implementation note to MASTER_LOGIC.mdc section 11.3:

> **Implementation Note**: Penalty terms must be included in the LP objective function. The `solveWithHiGHS()` method in `simplifiedAssignmentEngine.ts` collects both assignment score terms and penalty terms in `objectiveTerms[]` before writing to the LP string. Writing the objective prematurely (before penalties are added) will result in ineffective balance constraints.

## Verification Steps

1. Check console for: `[LP Objective] X terms (Y assignment + Z penalty)` where Z > 0
2. Check console for: `[LP Verify] Penalty terms in objective: N` where N matches rep count * 6
3. Run assignment and verify CV drops from 60% to ~10-20%
4. Visual check: Red bars should cluster around the target line, not spread widely

---

## Review Response: Agreements and Disagreements

### Agreements (Incorporated Above)

1. **Ambiguity in line removal** - Correct. I've clarified exactly which line to delete and why the LP format remains valid.

2. **Insert location precision** - Correct. I've specified "line 1270, after loop ends at 1269, before team alignment at 1271".

3. **LP format verification** - Correct. Added explicit format structure verification and logging.

4. **Penalty count verification** - Correct. Added console logging to verify penalty terms are in the objective.

5. **SSOT note** - Correct. Added implementation note to prevent future regressions.

### Disagreements

**None.** The review is accurate and all suggestions improve the plan. The reviewer correctly identified that my original plan was ambiguous about:
- Which specific line to remove
- Exactly where to insert the fix
- How to verify the LP format is preserved

The "Option B: Collect Penalties Separately" approach is cleaner for long-term maintainability, but for this fix I'll use the simpler approach of moving the existing line. A future refactor could separate the arrays for clarity.
