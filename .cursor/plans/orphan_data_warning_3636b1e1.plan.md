---
name: Orphan Data Warning
overview: Add a Data Integrity Warning component to the Data Overview tab that surfaces orphan opportunity issues (child opportunities without matching parent accounts) and their ATR impact.
todos:
  - id: create-warning-component
    content: Create DataIntegrityWarnings component with orphan query
    status: pending
  - id: add-to-overview
    content: Add component to BuildDetail.tsx Data Overview tab
    status: pending
---

# Data Integrity Warning for Orphan Opportunities

## Summary

Add a collapsible warning card at the **bottom** of the Data Overview tab to alert users when orphaned opportunities exist. This shows the gap between total opportunity ATR and calculated account ATR due to child opportunities that don't have a matching parent account in the accounts table.

## Implementation

### 1. Create `DataIntegrityWarnings` Component

New file: [`src/components/DataIntegrityWarnings.tsx`](book-ops-workbench/src/components/DataIntegrityWarnings.tsx)

- Query for orphan opportunity stats:
  - Count of `is_orphaned = true` opportunities  
  - Sum of `available_to_renew` from orphaned Renewals opps
- Display as a collapsible Alert card with:
  - Warning icon + "Data Integrity Issues" header
  - Orphan count and missing ATR amount
  - Expandable details showing what this means
- Only renders if orphaned opportunities exist (>0)

```sql
-- Query pattern for orphan stats
SELECT 
  COUNT(*) as orphan_count,
  SUM(available_to_renew) FILTER (WHERE opportunity_type = 'Renewals') as missing_atr
FROM opportunities 
WHERE build_id = $buildId AND is_orphaned = true
```

### 2. Add to Data Overview Tab

Update [`src/pages/BuildDetail.tsx`](book-ops-workbench/src/pages/BuildDetail.tsx)

Insert `<DataIntegrityWarnings buildId={id!} />` at the bottom of the `TabsContent value="overview"` section, after `DataOverviewAnalytics` and before the action cards:

```tsx
{/* Balance Analytics Section */}
{buildData && buildData.accounts.total > 0 && (
  <DataOverviewAnalytics buildId={id!} />
)}

{/* Data Integrity Warnings - shows orphan issues */}
{buildData && buildData.accounts.total > 0 && (
  <DataIntegrityWarnings buildId={id!} />
)}
```

### 3. UI Design

Following the existing warning pattern from `DataPreview.tsx`:

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️ Data Integrity Issues                          [Expand] │
├─────────────────────────────────────────────────────────────┤
│ 47 orphaned opportunities ($568,234 ATR not assigned)      │
│                                                             │
│ ▼ Details (when expanded):                                  │
│   These opportunities reference child accounts that don't   │
│   exist in the accounts table. Their ATR is not included    │
│   in parent account totals.                                 │
│                                                             │
│   [View Orphaned Opportunities] (optional link to filtered  │
│    opportunities table)                                     │
└─────────────────────────────────────────────────────────────┘
```

Styling: Orange/amber warning theme consistent with other warnings in the app.
