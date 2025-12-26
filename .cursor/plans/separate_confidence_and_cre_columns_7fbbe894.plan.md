---
name: Separate Confidence and CRE Columns
overview: "Split the mixed \"Confidence\" column into two distinct columns: \"Confidence\" (assignment quality) and \"CRE Risk\" (churn probability). Includes TypeScript fixes, SSOT compliance, and conditional rendering for customers only."
todos:
  - id: interface
    content: Add cre_count to Account interface in VirtualizedAccountTable.tsx
    status: pending
  - id: ssot-refactor
    content: Refactor getCRERiskBadge to use getCRERiskLevel from @/_domain
    status: pending
  - id: sort-field
    content: Add cre_count to SortField type and sorting logic
    status: pending
  - id: column-header
    content: Add CRE Risk column header (customers only) with tooltip and sorting
    status: pending
  - id: split-cells
    content: Split mixed cell into separate Confidence and CRE Risk cells
    status: pending
  - id: docs
    content: Update MASTER_LOGIC.mdc and CHANGELOG.md
    status: pending
---

# Separate Confidence and CRE Risk Columns (Revised)

## Problem

The "Confidence" column in `VirtualizedAccountTable` mixes two unrelated concepts:

- **Assignment Confidence** (from proposals) - shows when a proposal exists
- **CRE Risk** (from `cre_count`) - shows as fallback when no proposal exists

Users see "No CRE" in a column labeled "Confidence" - confusing.

## Solution

| Column | Source | Visibility | When Empty |

|--------|--------|------------|------------|

| **Confidence** | `proposal.confidence` | Always | Show "-" |

| **CRE Risk** | `account.cre_count` | Customers only | N/A (always has value) |

---

## Implementation Steps

### Step 1: Fix TypeScript Interface

Add `cre_count` to the Account interface in [`VirtualizedAccountTable.tsx`](book-ops-workbench/src/components/VirtualizedAccountTable.tsx) (line ~44):

```typescript
interface Account {
  // ... existing fields
  cre_count?: number | null;
}
```

This removes the `(account as any).cre_count` type cast that bypasses type safety.

### Step 2: Refactor getCRERiskBadge for SSOT Compliance

Import `getCRERiskLevel` from `@/_domain` and refactor the badge function:

```typescript
import { getCRERiskLevel } from '@/_domain';

const getCRERiskBadge = useCallback((account: Account) => {
  const creCount = account.cre_count || 0;
  const riskLevel = getCRERiskLevel(creCount);
  
  switch (riskLevel) {
    case 'none':
      return <Badge variant="outline" className="text-muted-foreground">No CRE</Badge>;
    case 'low':
    case 'medium':
      return <Badge className="bg-orange-500 text-white">{creCount} CRE</Badge>;
    case 'high':
      return <Badge variant="destructive">{creCount} CRE</Badge>;
  }
}, []);
```

### Step 3: Add cre_count to Sorting

Update `SortField` type:

```typescript
type SortField = 'account_name' | 'arr' | 'atr' | 'owner_name' | 'new_owner_name' | 'confidence' | 'cre_count';
```

Add sorting case (numeric sort on raw count):

```typescript
case 'cre_count':
  comparison = (a.cre_count || 0) - (b.cre_count || 0);
  break;
```

### Step 4: Add CRE Risk Column Header (Customers Only)

Add after the Confidence column header, conditionally rendered:

```tsx
{accountType === 'customer' && (
  <TableHead 
    className="min-w-[100px] cursor-pointer hover:bg-muted/50 select-none"
    onClick={() => handleSort('cre_count')}
  >
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 cursor-help">
          CRE Risk
          {getSortIcon('cre_count')}
          <Info className="h-3 w-3 text-muted-foreground" />
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-[280px]">
        <p className="font-semibold mb-1">CRE Risk</p>
        <p className="text-xs text-muted-foreground">
          Customer Renewal at Risk - churn probability based on CRE count.
        </p>
      </TooltipContent>
    </Tooltip>
  </TableHead>
)}
```

### Step 5: Split the TableCell

**Confidence cell** (shows "-" when no proposal):

```tsx
<TableCell>
  {proposal?.confidence 
    ? getConfidenceBadge(proposal.confidence) 
    : <span className="text-muted-foreground">-</span>
  }
</TableCell>
```

**CRE Risk cell** (customers only):

```tsx
{accountType === 'customer' && (
  <TableCell>
    {getCRERiskBadge(account)}
  </TableCell>
)}
```

### Step 6: Update Documentation

- Update `MASTER_LOGIC.mdc` §13.4 to document separate columns
- Update `CHANGELOG.md` with the fix

---

## Files Changed

| File | Changes |

|------|---------|

| `VirtualizedAccountTable.tsx` | Add cre_count to interface, add column header, split cells, add sorting, refactor badge for SSOT |

| `MASTER_LOGIC.mdc` | Document separate column display |

| `CHANGELOG.md` | Document the fix |

## No Changes Needed

- `AssignmentPreviewDialog.tsx` - Only shows proposals, Confidence-only is correct
- `_domain/constants.ts` - `getCRERiskLevel()` already exists

---

## Key Design Decisions

1. **CRE column is customers-only** - Prospects don't have CRE, so column is hidden for them
2. **Sort by raw count** - Simpler and more predictable than sorting by risk level
3. **SSOT compliance** - Use `getCRERiskLevel()` from `@/_domain` instead of hardcoded thresholds
4. **TypeScript fix** - Add `cre_count` to interface to remove unsafe type cast