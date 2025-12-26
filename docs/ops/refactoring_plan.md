# Refactoring Plan

> Generated from master_logic_1.3.6_review | 2025-12-15

---

## Overview

This document outlines refactoring work identified during the MASTER_LOGIC v1.3.7 review. These are improvements to code quality and architecture, not new features.

---

## 1. Config-Driven Thresholds

**Priority**: High  
**Status**: Not Started

### Problem
Several business thresholds are hardcoded in `_domain/constants.ts` when they should be configurable per-build in `assignment_configuration`.

### Thresholds to Move to Config
| Threshold | Current Location | Target |
|-----------|-----------------|--------|
| Max ARR per Rep | `DEFAULT_MAX_ARR_PER_REP` in constants.ts | `assignment_configuration.max_arr_per_rep` |
| Overload Variance | `DEFAULT_OVERLOAD_VARIANCE` in constants.ts | `assignment_configuration.overload_variance` |
| Strategic Variance | `optimizationSolver.ts` | `assignment_configuration.strategic_variance` |
| High Value Thresholds | `HIGH_VALUE_ARR_THRESHOLD`, `HIGH_VALUE_THRESHOLD` | `assignment_configuration.high_value_*` |

### Implementation Steps
1. Add columns to `assignment_configuration` table
2. Update UI to expose configuration options
3. Update `_domain/constants.ts` exports to be defaults only
4. Update all consumers to check config first, fall back to defaults

---

## 2. Parent-Child Priority in Optimizer

**Priority**: Medium  
**Status**: Partially Documented

### Problem
The parent-child constraint is documented in MASTER_LOGIC.mdc §11.2 but implementation verification needed.

### Current State
- LP formulation includes constraint: `∀(parent p, child c): x_pj = x_cj for all j`
- Need to verify this is enforced in both Waterfall and Relaxed modes

### Implementation Verification
1. Audit `simplifiedAssignmentEngine.ts` for parent-child handling
2. Audit `pureOptimizationEngine.ts` for parent-child constraint
3. Add unit tests to verify parent-child accounts always assigned to same rep

---

## 3. Quarterly Renewal Balancing

**Priority**: Medium  
**Status**: Not Started

### Problem
Reps should have balanced renewal workload across Q1-Q4, not concentrated in one quarter.

### Current State
- `renewal_concentration_max` exists in config
- Balance threshold calculator references Q1-Q4 metrics
- Need to verify optimizer considers quarterly distribution

### Implementation Steps
1. Define naming convention for quarterly fields (already in MASTER_LOGIC §13.5)
2. Add quarterly balance as soft constraint in LP objective
3. Add quarterly distribution chart to analytics

---

## 4. Cleanup: Remove Dead Renewal Specialist Code

**Priority**: Low  
**Status**: Not Started

### Problem
Renewal Specialist concept was deprecated but some code references may remain.

### Files to Audit
- `commercialPriorityHandlers.ts` - RS routing logic
- `modeDetectionService.ts` - RS detection
- `sales_reps` table - `is_renewal_specialist` field

### Decision Needed
- Keep `is_renewal_specialist` field for backwards compatibility?
- Or fully remove and migrate data?

---

## Tracking

| Item | Owner | Target Date | Status |
|------|-------|-------------|--------|
| Config-driven thresholds | TBD | TBD | Not Started |
| Parent-child verification | TBD | TBD | Not Started |
| Quarterly renewal balancing | TBD | TBD | Not Started |
| RS cleanup | TBD | TBD | Not Started |




