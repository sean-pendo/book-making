---
name: Fix Continuity Tooltip Counts
overview: Fix the Account Continuity tooltip to display accurate retained/changed/excluded counts by passing actual metrics from the service instead of incorrectly deriving them from geo alignment data.
todos:
  - id: doc-master-logic
    content: Update MASTER_LOGIC.mdc section 13.7 with ContinuityMetrics structure
    status: pending
  - id: add-type
    content: Add ContinuityMetrics type to _domain/calculations.ts and export from index.ts
    status: pending
    dependencies:
      - doc-master-logic
  - id: update-service
    content: Modify buildDataService.calculateContinuityScore to return ContinuityMetrics
    status: pending
    dependencies:
      - add-type
  - id: update-types
    content: Update LPSuccessMetrics in analytics.ts to use ContinuityMetrics
    status: pending
    dependencies:
      - add-type
  - id: update-component
    content: Fix BalancingSuccessMetrics.tsx to use actual counts from metrics
    status: pending
    dependencies:
      - update-service
      - update-types
  - id: update-dashboard
    content: Pass continuityMetrics from dashboard to component
    status: pending
    dependencies:
      - update-component
---

# Fix Continuity Tooltip Counts

## Problem

The Account Continuity tooltip shows incorrect counts because it derives "Retained" and "Changed" by multiplying `continuityScore` by `geoAlignment.total`. But:
- `continuityScore` is calculated from **eligible accounts only** (owner in reps, not backfill)
- `geoAlignment.total` is **all parent accounts**

This produces nonsensical results like "Retained: 7,895 + Changed: 156 = Total: 8,051" when the actual eligible count is lower.

## SSOT Flow

Following the mandatory SSOT order:

### Step 1: Document in MASTER_LOGIC.mdc

Add to section 13.7 (Continuity Eligibility) - specify that continuity metrics should include:
- `retainedCount`: eligible accounts with same owner
- `changedCount`: eligible accounts with different owner  
- `eligibleCount`: total accounts eligible for tracking
- `excludedCount`: accounts excluded (owner not in reps)

### Step 2: Implement in _domain/calculations.ts

Add a new type and function:

```typescript
export interface ContinuityMetrics {
  score: number;           // 0-1, the percentage
  retainedCount: number;   // accounts with same owner
  changedCount: number;    // accounts with different owner
  eligibleCount: number;   // denominator for score
  excludedCount: number;   // accounts excluded from tracking
}
```

### Step 3: Update Consumers

**[buildDataService.ts](book-ops-workbench/src/services/buildDataService.ts)**: Modify `calculateContinuityScore()` to return `ContinuityMetrics` instead of just `number`. Update the return type and callers.

**[BalancingSuccessMetrics.tsx](book-ops-workbench/src/components/balancing/BalancingSuccessMetrics.tsx)**: 
- Accept `continuityMetrics?: ContinuityMetrics` prop
- Remove the incorrect geo-based derivation (lines 100-104)
- Display actual counts from the metrics object
- Show "Excluded: X (owner not in reps)" in tooltip

## Files to Change

1. `src/_domain/MASTER_LOGIC.mdc` - Document the metrics structure
2. `src/_domain/calculations.ts` - Add `ContinuityMetrics` type
3. `src/_domain/index.ts` - Export the new type
4. `src/services/buildDataService.ts` - Return full metrics object
5. `src/types/analytics.ts` - Update `LPSuccessMetrics` type if needed
6. `src/components/balancing/BalancingSuccessMetrics.tsx` - Use actual counts
7. `src/pages/TerritoryBalancingDashboard.tsx` - Pass metrics to component
