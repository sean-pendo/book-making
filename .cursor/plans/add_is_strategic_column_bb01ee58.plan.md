---
name: Add is_strategic Column
overview: ""
todos:
  - id: migration
    content: Create migration file to add is_strategic column to accounts table
    status: pending
  - id: apply
    content: Apply migration to Supabase database
    status: pending
  - id: changelog
    content: Update CHANGELOG.md with the fix
    status: pending
---

# Add `is_strategic` Boolean Field to Accounts Table

## Problem

The `is_strategic` field is already:

- Documented in `MASTER_LOGIC.mdc` (line 666)
- Defined in TypeScript interfaces
- Mapped in auto-mapping aliases
- Transformed during import
- Used by the strategic pool handler

But the **database column does not exist**, so imports silently fail to save the value.

## Solution

Add a single migration to create the column.

## Files to Change

### 1. New Migration File

Create `supabase/migrations/20251216000002_add_is_strategic_to_accounts.sql`:

```sql
-- Add is_strategic column to accounts table
-- Enables strategic accounts to be identified during import and routed to strategic reps only

ALTER TABLE public.accounts 
ADD COLUMN IF NOT EXISTS is_strategic BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.accounts.is_strategic IS 'Strategic accounts are routed only to strategic reps (is_strategic_rep = true) and bypass normal capacity limits';

-- Create index for faster strategic account lookups
CREATE INDEX IF NOT EXISTS idx_accounts_strategic ON public.accounts(is_strategic, build_id) WHERE is_strategic = true;
```

## What Already Works (No Changes Needed)

| Component | Status | File |

|-----------|--------|------|

| Auto-mapping aliases | Done | [`autoMappingUtils.ts`](book-ops-workbench/src/utils/autoMappingUtils.ts) lines 360-367 |

| Import transform | Done | [`importUtils.ts`](book-ops-workbench/src/utils/importUtils.ts) line 720 |

| Data loader fetch | Done | [`dataLoader.ts`](book-ops-workbench/src/services/optimization/preprocessing/dataLoader.ts) line 174 |

| Strategic pool handler | Done | [`strategicPoolHandler.ts`](book-ops-workbench/src/services/optimization/preprocessing/strategicPoolHandler.ts) |

| UI toggle in AccountsTable | Done | [`AccountsTable.tsx`](book-ops-workbench/src/components/data-tables/AccountsTable.tsx) lines 116-159 |

| Documentation | Done | [`MASTER_LOGIC.mdc`](book-ops-workbench/src/_domain/MASTER_LOGIC.mdc) line 666 |

## After Implementation

Users can mark accounts as strategic by either:

1. **CSV Upload**: Include a column named `Is_Strategic`, `Strategic`, or `is_strategic` with values like `true`, `yes`, or `1`
2. **Manual Toggle**: Click the strategic toggle in the Accounts Table after import