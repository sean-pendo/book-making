---
name: Sales Rep Table Consistency Fixes
overview: Fix identified inconsistencies between Sales Reps Table/Detail Dialog and Analytics Dashboard by standardizing calculations to use the canonical `@/_domain` functions as documented in MASTER_LOGIC.mdc. Revised based on code review feedback.
todos:
  - id: fix5-customer-classification
    content: Use getAccountARR() > 0 for customer classification in buildDataService (SSOT violation)
    status: completed
  - id: fix1-js-filtering
    content: Use isParentAccount() for JavaScript filtering in buildDataService and ManagerHierarchyView
    status: completed
    dependencies:
      - fix5-customer-classification
  - id: add-comment-arr-scope
    content: Add clarifying comment to salesRepCalculations.ts explaining ARR scope
    status: completed
  - id: testing
    content: Run lint/build and compare rep metrics before vs after across views
    status: completed
    dependencies:
      - fix5-customer-classification
      - fix1-js-filtering
---

# Sales Rep Table Consistency Fixes (Revised)

This plan addresses inconsistencies causing mismatched calculations between the Sales Reps Tables and Analytics Dashboard. Revised based on senior code review feedback.

---

## Review Summary: What Changed

| Original Fix | Review Verdict | Revised Action |

|--------------|----------------|----------------|

| Fix 1: Parent detection | Partial Accept | Keep `is_parent` for DB queries; use `isParentAccount()` for JS filtering only |

| Fix 2: ARR scope | Skip | Cosmetic only - add comment instead of refactoring |

| Fix 3: ATR standardization | Reject | Existing patterns are correct; no new domain function needed |

| Fix 4: Split ownership | Skip | Keep `has_split_ownership` field for DB query performance |

| Fix 5: Customer classification | Approve | Real SSOT violation - fix as planned |

---

## Fix 5: Standardize Customer Classification (HIGH PRIORITY)

**Issue**: This is the only true SSOT violation identified.

`buildDataService.ts` uses only `hierarchy_bookings_arr_converted > 0`:

```typescript
const parentCustomerAccounts = repParentAccounts.filter(a =>
  (a.hierarchy_bookings_arr_converted || 0) > 0
);
```

But MASTER_LOGIC.mdc section 3.1 defines:

```
Customer = getAccountARR() > 0
```

The `getAccountARR()` function has a priority chain:

```typescript
hierarchy_bookings_arr_converted || calculated_arr || arr || 0
```

**Why This Matters**: An account with `hierarchy_bookings_arr_converted = 0` but `calculated_arr > 0` would be misclassified as a prospect in analytics but correctly classified as a customer in the rep table drill-down.

**Files to Change**:

| File | Line(s) | Current | Target |

|------|---------|---------|--------|

| [buildDataService.ts](book-ops-workbench/src/services/buildDataService.ts) | 367-369 | `a.hierarchy_bookings_arr_converted && a.hierarchy_bookings_arr_converted > 0` | `getAccountARR(a) > 0` |

| [buildDataService.ts](book-ops-workbench/src/services/buildDataService.ts) | 1401-1412 | Same pattern | `getAccountARR(a) > 0` |

**Code Change for lines 367-369**:

```typescript
// BEFORE
const customerAccounts = parentAccounts.filter(a => a.hierarchy_bookings_arr_converted && a.hierarchy_bookings_arr_converted > 0);
const prospectAccounts = parentAccounts.filter(a => !a.hierarchy_bookings_arr_converted || a.hierarchy_bookings_arr_converted <= 0);

// AFTER
const customerAccounts = parentAccounts.filter(a => getAccountARR(a) > 0);
const prospectAccounts = parentAccounts.filter(a => getAccountARR(a) === 0);
```

**Code Change for lines 1401-1412**:

```typescript
// BEFORE
const parentCustomerAccounts = repParentAccounts.filter(a =>
  (a.hierarchy_bookings_arr_converted || 0) > 0
);
const parentProspectAccounts = repParentAccounts.filter(a =>
  (a.hierarchy_bookings_arr_converted || 0) === 0
);
const childCustomerAccounts = repChildAccounts.filter(a =>
  (a.hierarchy_bookings_arr_converted || 0) > 0
);
const childProspectAccounts = repChildAccounts.filter(a =>
  (a.hierarchy_bookings_arr_converted || 0) === 0
);

// AFTER
const parentCustomerAccounts = repParentAccounts.filter(a => getAccountARR(a) > 0);
const parentProspectAccounts = repParentAccounts.filter(a => getAccountARR(a) === 0);
const childCustomerAccounts = repChildAccounts.filter(a => getAccountARR(a) > 0);
const childProspectAccounts = repChildAccounts.filter(a => getAccountARR(a) === 0);
```

**Import Required**: Add `getAccountARR` to the imports from `@/_domain` at the top of the file.

---

## Fix 1: Use isParentAccount() for JavaScript Filtering (REVISED)

**Original Issue**: Two methods for parent detection.

**Reviewer's Valid Point**: The `is_parent` field is used in **Supabase database queries** like:

```typescript
.eq('is_parent', true)  // This CANNOT be replaced with a JS function
```

**Revised Approach**:

- Keep `is_parent` for database queries (it's a valid denormalized field)
- Use `isParentAccount()` only when filtering data that's already loaded into JavaScript

**Files to Change** (JavaScript filtering only):

| File | Line(s) | Current | Target |

|------|---------|---------|--------|

| [buildDataService.ts](book-ops-workbench/src/services/buildDataService.ts) | 367 | `accounts.filter(a => a.is_parent)` | `accounts.filter(isParentAccount)` |

| [buildDataService.ts](book-ops-workbench/src/services/buildDataService.ts) | 1369-1370 | `accounts.filter(a => a.is_parent)` | `accounts.filter(isParentAccount)` |

**Note**: `ManagerHierarchyView.tsx` line 560 already has the data loaded, but changing it would also require updating the split ownership logic. Per reviewer feedback, we skip this to avoid complexity.

**Import Required**: Add `isParentAccount` to the imports from `@/_domain`.

---

## Fix 2: ARR Scope - ADD COMMENT ONLY (REVISED)

**Original Issue**: `salesRepCalculations.ts` sums ARR from all parent accounts, while `buildDataService.ts` filters to customers first.

**Reviewer's Valid Point**: This is functionally equivalent - `getAccountARR()` returns 0 for prospects, so summing all parents gives the same result as filtering first then summing.

**Revised Action**: Add a clarifying comment instead of refactoring:

```typescript
// salesRepCalculations.ts lines 146-151
// Calculate total ARR from parent accounts using centralized logic
// Note: Prospects have ARR=0 via getAccountARR(), so filtering is unnecessary
const totalARR = parentAccounts.reduce((sum, acc) => {
  const arrValue = getAccountARR(acc);
  return sum + arrValue;
}, 0);
```

---

## Fix 3: ATR Standardization - SKIP (REJECTED)

**Original Proposal**: Add `getRepATR()` function to domain layer.

**Reviewer's Valid Points**:

1. Different views have different data available (some don't query opportunities)
2. The proposed function has O(n²) complexity
3. `calculated_atr` IS pre-computed from opportunities, so using it first is correct
4. Existing patterns already work well

**Decision**: No changes. The existing pattern in `buildDataService.ts` is appropriate:

```typescript
const atr = repParentAccounts.reduce((sum, a) => {
  const accountATR = getAccountATR(a);  // Pre-computed field
  if (accountATR > 0) return sum + accountATR;
  return sum + (atrByAccount.get(a.sfdc_account_id) || 0);  // Fallback to opp map
}, 0);
```

---

## Fix 4: Split Ownership - SKIP (REJECTED)

**Original Proposal**: Calculate split ownership dynamically instead of using `has_split_ownership` field.

**Reviewer's Valid Points**:

1. `has_split_ownership` is used in database queries for performance
2. Calculating dynamically requires loading ALL accounts first
3. The field is properly set during import

**Decision**: No changes. The `has_split_ownership` field is a valid denormalized field for query performance.

---

## Documentation Update

Add to MASTER_LOGIC.mdc section 3.2:

```markdown
**Implementation Note**: The `is_parent` and `has_split_ownership` database fields are 
denormalized copies of the logic in `isParentAccount()` and dynamic split ownership 
calculation, set during import. Use these fields for database queries (`.eq('is_parent', true)`), 
and use the domain functions for JavaScript filtering when data is already loaded.
```

---

## Files Modified Summary (Revised)

| File | Changes |

|------|---------|

| `services/buildDataService.ts` | Fix 5 (customer classification), Fix 1 (JS parent filtering) |

| `utils/salesRepCalculations.ts` | Add clarifying comment only |

| `_domain/MASTER_LOGIC.mdc` | Add implementation note about denormalized fields |

**Total**: 2 files modified, ~15 lines changed (down from original 4 files, ~30 lines)

---

## Testing Strategy

**Before changes**:

1. Pick a test build with diverse data
2. Record customer/prospect counts for 3-5 reps from SalesRepsTable
3. Record same counts from Analytics Dashboard

**After Fix 5**:

1. Run `npm run lint` and `npm run build`
2. Customer/Prospect counts should now match between views
3. If any accounts had ARR in `calculated_arr` or `arr` fields (but not `hierarchy_bookings_arr_converted`), customer counts may increase in analytics

---

## Disagreements with Reviewer

| Reviewer Point | My Response |

|----------------|-------------|

| "Fix 1 targets wrong files" | **Agree** - I conflated DB queries with JS filtering. Revised to only target JS filtering. |

| "Fix 2 should be skipped entirely" | **Agree** - It's cosmetic. Changed to comment-only. |

| "Fix 3 getRepATR() is problematic" | **Agree** - O(n²) complexity and confusing API. Removed from plan. |

| "Fix 4 keep has_split_ownership for queries" | **Agree** - DB field is valid for performance. Removed from plan. |

| "Add validation during import" | **Disagree** - Adding runtime validation adds overhead and the fields are already set correctly during import. If we suspect drift, we should fix the import logic, not add post-hoc validation. |