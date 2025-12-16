---
name: ""
overview: ""
todos: []
---

# Remove Dead Code from Relaxed Optimization Solver

## Summary

Delete ~2,800 lines of dead solver code across 3 files. The UI uses `pureOptimizationEngine.ts` via `highsWrapper.ts` - the old `optimizationSolver.ts`, `priorityExecutor.ts`, and `sandboxMetricsCalculator.ts` are never called.

## Verification (All Dead Code Confirmed)

| File | Lines | Evidence |

|------|-------|----------|

| `optimizationSolver.ts` | 1,525 | Only imported by `priorityExecutor.ts` which is also dead |

| `priorityExecutor.ts` | 949 | Execution functions never called; only types imported by 2 files |

| `sandboxMetricsCalculator.ts` | 364 | Never imported anywhere in codebase |

## Implementation Steps

### Step 1: Add Types to optimization/types.ts

Add `Account` and `SalesRep` interfaces to the end of [`optimization/types.ts`](book-ops-workbench/src/services/optimization/types.ts):

```typescript
// =============================================================================
// Legacy Types (moved from priorityExecutor.ts)
// Used by: parentalAlignmentService.ts, commercialPriorityHandlers.ts
// =============================================================================

export interface Account {
  sfdc_account_id: string;
  account_name: string;
  calculated_arr: number | null;
  calculated_atr: number | null;
  hierarchy_bookings_arr_converted: number | null;
  cre_count: number | null;
  cre_risk: boolean | null;
  sales_territory: string | null;
  geo: string | null;
  owner_id: string | null;
  owner_name: string | null;
  exclude_from_reassignment: boolean | null;
  pe_firm: string | null;
  is_customer: boolean | null;
  is_parent: boolean | null;
  is_strategic: boolean | null;
  hq_country: string | null;
  renewal_quarter: string | null;
  expansion_tier: string | null;
  initial_sale_tier: string | null;
  employees?: number | null;
  pipeline_value?: number | null;
  renewal_date?: string | null;
  owner_change_date?: string | null;
}

export interface SalesRep {
  rep_id: string;
  name: string;
  region: string | null;
  sub_region: string | null;
  is_renewal_specialist: boolean | null;
  is_strategic_rep: boolean;
  is_active: boolean | null;
  include_in_assignments: boolean | null;
  flm: string | null;
  slm: string | null;
  team?: string | null;
  team_tier?: 'SMB' | 'Growth' | 'MM' | 'ENT' | null;
}
```

### Step 2: Update parentalAlignmentService.ts

[`parentalAlignmentService.ts`](book-ops-workbench/src/services/parentalAlignmentService.ts) line 17:

```typescript
// Before
import { Account, SalesRep } from './priorityExecutor';

// After  
import { Account, SalesRep } from './optimization/types';
```

### Step 3: Update commercialPriorityHandlers.ts

[`commercialPriorityHandlers.ts`](book-ops-workbench/src/services/commercialPriorityHandlers.ts) line 10:

```typescript
// Before
import { Account, SalesRep } from './priorityExecutor';

// After
import { Account, SalesRep } from './optimization/types';
```

### Step 4: Delete sandboxMetricsCalculator.ts

Delete [`sandboxMetricsCalculator.ts`](book-ops-workbench/src/services/optimization/sandboxMetricsCalculator.ts) (364 lines) - Never imported.

### Step 5: Delete optimizationSolver.ts

Delete [`optimizationSolver.ts`](book-ops-workbench/src/services/optimization/optimizationSolver.ts) (1,525 lines) - Never called.

### Step 6: Delete priorityExecutor.ts

Delete [`priorityExecutor.ts`](book-ops-workbench/src/services/priorityExecutor.ts) (949 lines) - Types moved, functions never called.

### Step 7: Verify Build

```bash
cd book-ops-workbench && npm run build
```

### Step 8: Update CHANGELOG

Document the dead code removal (~2,800 lines).

## Impact

| Metric | Value |

|--------|-------|

| Files Deleted | 3 |

| Lines Removed | ~2,838 |

| New Files | 0 |

| Files Modified | 3 (types.ts + 2 import updates) |

| Net Lines Removed | ~2,788 |

| Risk | Low - all code verified dead |

## Todos

- [ ] Add Account and SalesRep interfaces to optimization/types.ts
- [ ] Update parentalAlignmentService.ts import
- [ ] Update commercialPriorityHandlers.ts import  
- [ ] Delete sandboxMetricsCalculator.ts
- [ ] Delete optimizationSolver.ts
- [ ] Delete priorityExecutor.ts
- [ ] Run build to verify
- [ ] Update CHANGELOG