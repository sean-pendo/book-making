# Feature Backlog

> Generated from master_logic_1.3.6_review | 2025-12-15

---

## Overview

These are new features identified during the MASTER_LOGIC v1.3.7 review. They should be implemented after the refactoring work is complete.

---

## 1. HITL for Geo Matching (Transparency UI)

**Priority**: High  
**Type**: UX Enhancement

### Description
Add human-in-the-loop transparency for geography matching decisions.

### Requirements
- Show why NYC matches better than Global for a given rep
- Display geo scoring breakdown in assignment rationale
- Allow manual override of geo mappings with UI feedback

### User Story
> As a RevOps user, I want to see why an account was matched to a specific rep's territory, so I can understand and trust the assignment decisions.

### Implementation Notes
- Leverage existing `calculateGeoMatchScore()` from `geography.ts`
- Add geo scoring details to assignment rationale display
- Consider adding "Geo Match Details" modal/popover

---

## 2. Capacity Utilization Metric

**Priority**: Medium  
**Type**: Analytics Enhancement

### Description
Add capacity utilization metric to analytics screens.

### Requirements
- Show "Average % of target load per rep"
- Range: 0-1+ (can exceed 100% if overloaded)
- Display on Balancing Dashboard and assignment results

### Formula
```
Capacity Utilization = Rep's Actual Load / Rep's Target Load
Average = SUM(individual utilizations) / Rep Count
```

### Current Gap
- Metric is defined in MASTER_LOGIC §13.1 but not displayed
- Need to add to analytics components

---

## 3. Coverage Metrics

**Priority**: Medium  
**Type**: Analytics Enhancement

### Description
Add coverage metrics showing percentage of accounts with assigned reps.

### Requirements
- "% accounts with assigned rep" metric
- Breakdown by:
  - Customers vs Prospects
  - By tier
  - By region
- Highlight unassigned accounts

### Use Case
Quick health check to ensure no accounts are falling through cracks.

---

## 4. ATR Secondary Fallback

**Priority**: Low  
**Type**: Data Enhancement

### Description
Use account-level ATR value as secondary option when opportunity-based ATR is unavailable.

### Current Behavior
```typescript
getAccountATR(account) = calculated_atr || atr || 0
```

### Proposed Enhancement
- If `calculated_atr` is 0 and no renewal opportunities exist
- Fall back to `atr` field on account record (if populated)
- Add data quality flag when using fallback

### Note
This may already work if `atr` field is populated during import. Verify and document.

---

## 5. ARR Double-Counting Verification

**Priority**: High  
**Type**: Data Integrity

### Description
Verify ARR formula doesn't double-sum when children exist.

### Question from Review
> "How am I sure this isn't double summing in the case of children?"

### Current Logic (MASTER_LOGIC §2.1)
```typescript
ARR = hierarchy_bookings_arr_converted || calculated_arr || arr || 0
```

### Verification Needed
1. Confirm `hierarchy_bookings_arr_converted` is the pre-aggregated parent total
2. Confirm children share parent's `hierarchy_bookings_arr_converted` value
3. Add unit test proving no double-count when summing across hierarchy

---

## Tracking

| Feature | Owner | Target Date | Status |
|---------|-------|-------------|--------|
| HITL Geo Matching | TBD | TBD | Not Started |
| Capacity Utilization | TBD | TBD | Not Started |
| Coverage Metrics | TBD | TBD | Not Started |
| ATR Secondary Fallback | TBD | TBD | Not Started |
| ARR Double-Count Verify | TBD | TBD | Not Started |




