---
name: Simplify Continuity Metric
overview: "Simplify the continuity analytics metric from a filtered formula (eligible accounts only) to a simple ratio: accounts with same owner / total accounts. Keep LP solver scoring unchanged. Update UI to show Retained/Changed/Total (remove Excluded)."
todos:
  - id: update-master-logic
    content: Update MASTER_LOGIC.mdc Section 13.7 with simplified continuity formula
    status: pending
  - id: deprecate-eligibility
    content: Deprecate getValidRepIdsForContinuity and isEligibleForContinuityTracking in calculations.ts
    status: pending
  - id: update-types
    content: Update ContinuityMetrics interface - replace eligibleCount with totalCount, remove excludedCount
    status: pending
  - id: simplify-calculation
    content: Rewrite calculateContinuityMetrics() in buildDataService.ts with simple formula
    status: pending
  - id: update-ui
    content: Update BalancingSuccessMetrics.tsx to show Retained/Changed/Total (no Excluded)
    status: pending
---

# Simplify Continuity Analytics Metric

## Current State

The current continuity calculation in [`buildDataService.ts`](book-ops-workbench/src/services/buildDataService.ts) has two nuances:

1. **Parent-only filter**: Only counts parent accounts (ignores children)
2. **Eligibility filter**: Excludes accounts whose owner:
   - Is not in the current reps list (left company)
   - Is a backfill source (leaving)

**Current Formula:**
```
continuity = eligible_accounts_with_same_owner / eligible_accounts
where eligible = parent AND owner_id IN valid_rep_ids
```

## Proposed State

**New Formula:**
```
continuity = accounts_with_same_owner / total_accounts
```

No filters. Simple ratio across ALL accounts.

---

## Changes Required

### 1. Update MASTER_LOGIC.mdc (Documentation First - SSOT)

Update Section 13.7 (Continuity Eligibility) to reflect the simplified formula:
- Remove eligibility criteria documentation
- Update formula to simple ratio
- Update example table
- Remove references to `excludedCount`

### 2. Update Domain Layer

**File: [`_domain/calculations.ts`](book-ops-workbench/src/_domain/calculations.ts)**

Mark as deprecated or remove:
- `getValidRepIdsForContinuity()` 
- `isEligibleForContinuityTracking()`

These functions will no longer be needed for analytics. Note: They may still be imported elsewhere - we'll check for other usages and leave as deprecated if needed.

### 3. Update ContinuityMetrics Type

**File: [`types/analytics.ts`](book-ops-workbench/src/types/analytics.ts)**

Remove `excludedCount` from the interface:

```typescript
export interface ContinuityMetrics {
  score: number;
  retainedCount: number;
  changedCount: number;
  totalCount: number;  // renamed from eligibleCount
  // excludedCount removed
}
```

### 4. Simplify calculateContinuityMetrics()

**File: [`buildDataService.ts`](book-ops-workbench/src/services/buildDataService.ts)**

Rewrite the function (lines 850-899):

```typescript
private calculateContinuityMetrics(accounts: any[], salesReps: any[], useProposed: boolean): ContinuityMetrics {
  // Simple: all accounts, no filtering
  const allAccounts = accounts;
  
  if (allAccounts.length === 0) {
    return { score: 0, retainedCount: 0, changedCount: 0, totalCount: 0 };
  }
  
  if (!useProposed) {
    // Before state: all accounts with original owner = 100%
    return {
      score: 1,
      retainedCount: allAccounts.length,
      changedCount: 0,
      totalCount: allAccounts.length
    };
  }
  
  // After state: count accounts where new_owner_id matches owner_id
  const retainedCount = allAccounts.filter(a => {
    if (!a.new_owner_id) return true; // No change = retained
    return a.new_owner_id === a.owner_id;
  }).length;
  
  const changedCount = allAccounts.length - retainedCount;
  const score = retainedCount / allAccounts.length;
  
  return { score, retainedCount, changedCount, totalCount: allAccounts.length };
}
```

### 5. Update UI Components

**File: [`BalancingSuccessMetrics.tsx`](book-ops-workbench/src/components/balancing/BalancingSuccessMetrics.tsx)**

Update tooltip/display to show:
- Retained: X
- Changed: Y  
- Total: Z

Remove any reference to "Excluded" accounts.

### 6. Check Other Usages

Verify these files still work after the change:
- [`simplifiedAssignmentEngine.ts`](book-ops-workbench/src/services/simplifiedAssignmentEngine.ts) - uses continuity for telemetry
- [`metricsCalculator.ts`](book-ops-workbench/src/services/optimization/postprocessing/metricsCalculator.ts) - LP post-processing

---

## Files to Modify

| File | Change |
|------|--------|
| `_domain/MASTER_LOGIC.mdc` | Update Section 13.7 with simplified formula |
| `_domain/calculations.ts` | Deprecate eligibility functions |
| `types/analytics.ts` | Update `ContinuityMetrics` interface |
| `services/buildDataService.ts` | Simplify `calculateContinuityMetrics()` |
| `components/balancing/BalancingSuccessMetrics.tsx` | Update UI tooltip |
