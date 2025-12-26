---
name: Rename Assignment Risk to Confidence
overview: Refactor "Assignment Risk" terminology to "Assignment Confidence" throughout the codebase, inverting the scale (LOW risk → HIGH confidence) for better UX clarity. CRE Risk remains unchanged.
todos:
  - id: types
    content: Rename conflictRisk to confidence in types/assignment.ts
    status: pending
  - id: preview-dialog
    content: Update AssignmentPreviewDialog labels, tooltip, and badge helper
    status: pending
  - id: virtualized-table
    content: Update VirtualizedAccountTable badges and rename helper function
    status: pending
  - id: hook
    content: Update useAssignmentEngine.ts warning-to-confidence mapping
    status: pending
  - id: services
    content: Update assignmentService.ts and helpers with new field name
    status: pending
  - id: engine-page
    content: Update AssignmentEngine.tsx priority mapping
    status: pending
  - id: export
    content: Update assignmentExportUtils.ts column header and values
    status: pending
  - id: docs
    content: Document Assignment Confidence in MASTER_LOGIC.mdc
    status: pending
---

# Rename Assignment Risk to Assignment Confidence

## Scope

Rename the `conflictRisk` field and all related UI labels from "Risk" to "Confidence" for assignment proposals. This affects ~10 files. **CRE Risk stays unchanged** - it's a different concept (churn probability).

## Key Changes

### 1. Type Definition
[`src/types/assignment.ts`](book-ops-workbench/src/types/assignment.ts) - Rename field and invert values:
```typescript
// Before
conflictRisk: 'LOW' | 'MEDIUM' | 'HIGH';

// After  
confidence: 'HIGH' | 'MEDIUM' | 'LOW';
```

### 2. UI Components

| File | Change |
|------|--------|
| [`AssignmentPreviewDialog.tsx`](book-ops-workbench/src/components/AssignmentPreviewDialog.tsx) | Column header "Risk" → "Confidence", tooltip text, badge labels ("High Confidence", etc.) |
| [`VirtualizedAccountTable.tsx`](book-ops-workbench/src/components/VirtualizedAccountTable.tsx) | Badge labels, `getContinuityRiskBadge` → `getConfidenceBadge` |
| [`AssignmentEngine.tsx`](book-ops-workbench/src/pages/AssignmentEngine.tsx) | Priority mapping logic (invert: HIGH confidence = priority 1) |

### 3. Services and Hooks

| File | Change |
|------|--------|
| [`useAssignmentEngine.ts`](book-ops-workbench/src/hooks/useAssignmentEngine.ts) | Map warnings to confidence (high severity warnings → LOW confidence) |
| [`assignmentService.ts`](book-ops-workbench/src/services/assignmentService.ts) | All `conflictRisk` field assignments |
| [`assignmentServiceHelpers.ts`](book-ops-workbench/src/services/assignmentServiceHelpers.ts) | Any helper functions |

### 4. Export Utils
[`assignmentExportUtils.ts`](book-ops-workbench/src/utils/assignmentExportUtils.ts) - Export column header and values

## Value Mapping (Inverted)

| Old (Risk) | New (Confidence) | Badge Color |
|------------|------------------|-------------|
| LOW Risk | HIGH Confidence | Green |
| MEDIUM Risk | MEDIUM Confidence | Orange |
| HIGH Risk | LOW Confidence | Red |

## Files NOT Changed (CRE Risk - Different Concept)

These use "Risk" for CRE churn probability and should stay as-is:
- `RepDistributionChart.tsx` - CRE risk breakdown charts
- `BeforeAfterAccountChart.tsx` - CRE risk visualization  
- `AccountsTable.tsx` - CRE/Risk flag filters
- `SalesRepDetailDialog.tsx` - CRE risk badges
- `autoMappingUtils.ts` - Import field aliases for `risk_flag`

## Documentation Update

Update [`MASTER_LOGIC.mdc`](book-ops-workbench/src/_domain/MASTER_LOGIC.mdc) to document the "Assignment Confidence" terminology and clarify the distinction from CRE Risk.
