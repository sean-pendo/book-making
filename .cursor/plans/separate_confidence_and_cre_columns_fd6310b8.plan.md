---
name: Separate Confidence and CRE Columns
overview: "Split the mixed \"Confidence\" column into two distinct columns: \"Confidence\" (assignment quality) and \"CRE Risk\" (churn probability), eliminating confusion between these unrelated metrics."
todos:
  - id: sort-field
    content: Add cre_count to SortField type and sorting logic
    status: pending
  - id: column-header
    content: Add CRE Risk column header with tooltip and sorting
    status: pending
  - id: split-cells
    content: Split mixed cell into separate Confidence and CRE Risk cells
    status: pending
  - id: docs
    content: Update MASTER_LOGIC.mdc and CHANGELOG.md
    status: pending
---

# Separate Confidence and CRE Risk Columns

## Problem

Currently the "Confidence" column in `VirtualizedAccountTable` mixes two unrelated concepts:
- **Assignment Confidence** (from proposals) - shows when a proposal exists
- **CRE Risk** (from `cre_count`) - shows as fallback when no proposal exists

This is confusing because users see "No CRE" in a column labeled "Confidence".

## Solution

Create two separate columns:

| Column | Source | When Shown | Meaning |
|--------|--------|------------|---------|
| **Confidence** | `proposal.confidence` | Only when proposal exists, else "-" | How confident is the system in this assignment? |
| **CRE Risk** | `account.cre_count` | Always | Is this customer at risk of churning? |

## Implementation

### Step 1: Add CRE Risk Column Header

In [`VirtualizedAccountTable.tsx`](book-ops-workbench/src/components/VirtualizedAccountTable.tsx), add a new sortable column header after "Confidence":

```tsx
<TableHead className="min-w-[100px] cursor-pointer" onClick={() => handleSort('cre_count')}>
  <Tooltip>
    <TooltipTrigger>
      CRE Risk {getSortIcon('cre_count')}
      <Info />
    </TooltipTrigger>
    <TooltipContent>
      Customer Renewal at Risk - churn probability based on CRE count
    </TooltipContent>
  </Tooltip>
</TableHead>
```

### Step 2: Update Sort Field Type

Add `'cre_count'` to the `SortField` type union and sorting logic.

### Step 3: Split the TableCell

Current (mixed):
```tsx
<TableCell>
  {proposal?.confidence ? getConfidenceBadge(...) : getCRERiskBadge(account)}
</TableCell>
```

After (separate):
```tsx
{/* Confidence cell */}
<TableCell>
  {proposal?.confidence ? getConfidenceBadge(...) : <span>-</span>}
</TableCell>

{/* CRE Risk cell */}
<TableCell>
  {getCRERiskBadge(account)}
</TableCell>
```

### Step 4: Update MASTER_LOGIC.mdc

Document that these are displayed as separate columns.

## Files Changed

| File | Change |
|------|--------|
| `VirtualizedAccountTable.tsx` | Add CRE Risk column header, split cells, add cre_count to sorting |
| `MASTER_LOGIC.mdc` | Document separate column display |
| `CHANGELOG.md` | Document the fix |

## No Changes Needed

- `AssignmentPreviewDialog.tsx` - Only shows proposals, so Confidence-only is correct
- `_domain/constants.ts` - CRE thresholds already defined
