---
name: Stability Account Reasoning
overview: Clarify stability rationales by renaming 'Stability Lock' to 'Stable Account' and separating backfill migration
todos:
  - id: doc-update
    content: Update MASTER_LOGIC.mdc sections 11.9 AND 11.9.1 with new stability rationale format
    status: completed
  - id: impl-rationale
    content: Update generateLockRationale() in rationaleGenerator.ts with new format
    status: completed
    dependencies:
      - doc-update
---

# Stability Account Reasoning Enhancement

## Overview
Add clearer stability reasoning to assignment rationales, distinguishing automatic stability (CRE, renewals, PE, recent changes) from manual locks and backfill migrations. The reasoning will appear everywhere assignment reasoning is shown.

## Current State
The rationale generator ([`rationaleGenerator.ts`](book-ops-workbench/src/services/optimization/postprocessing/rationaleGenerator.ts)) already produces detailed stability reasons, but the format uses "Stability Lock" for all types, which:
1. Can be confused with manual locking
2. Lumps backfill migration (accounts that MUST move) with stability (accounts that should NOT move)

Current format:
```
P2: Stability Lock → John Smith (CRE at-risk - relationship stability)
P2: Stability Lock → John Smith (Renewal in 45 days)
P2: Stability Lock → John Smith (PE firm: Vista Equity)
P2: Stability Lock → John Smith (backfill migration from departing rep)
```

## Proposed Changes

### 1. Update Rationale Format (SSOT Flow)

Rename "Stability Lock" to "Stable Account" for true stability cases, and use "Backfill Migration" for the backfill case. Keep the consistent `→ Rep (reason)` pattern.

| Lock Type | Current Format | New Format |
|-----------|----------------|------------|
| Manual Lock | `Excluded from reassignment → Rep (manually locked)` | **Keep as-is** (P0 - distinct from P2 stability) |
| CRE Risk | `Stability Lock → Rep (CRE at-risk...)` | `Stable Account → Rep (CRE at-risk)` |
| Renewal Soon | `Stability Lock → Rep (Renewal in X days)` | `Stable Account → Rep (Renewal in X days)` |
| PE Firm | `Stability Lock → Rep (PE firm: XYZ)` | `Stable Account → Rep (PE firm: XYZ)` |
| Recent Change | `Stability Lock → Rep (recently changed...)` | `Stable Account → Rep (recent owner change)` |
| Backfill | `Stability Lock → Rep (backfill migration...)` | `Backfill Migration → Rep (from departing owner)` |

### 2. Files to Modify

**Step 1: Update MASTER_LOGIC.mdc sections 11.9 AND 11.9.1** - Document the new format

**Step 2: Update `rationaleGenerator.ts`** - Implement the new format in `generateLockRationale()` function

### Key Implementation

In [`rationaleGenerator.ts`](book-ops-workbench/src/services/optimization/postprocessing/rationaleGenerator.ts) lines 239-268, update `generateLockRationale()`:

```typescript
// Keep the consistent → Rep (reason) pattern

case 'manual_lock':
  // Keep as-is - already clear
  return `${label}: Excluded from reassignment → ${rep.name} (manually locked)`;

case 'backfill_migration':
  // Distinct from stability - this is about MOVING accounts
  return `${label}: Backfill Migration → ${rep.name} (from departing owner)`;

case 'cre_risk':
  return `${label}: Stable Account → ${rep.name} (CRE at-risk)`;

case 'renewal_soon':
  return `${label}: Stable Account → ${rep.name} (${lock.reason || 'renewal soon'})`;

case 'pe_firm':
  return `${label}: Stable Account → ${rep.name} (${lock.reason || 'PE firm alignment'})`;

case 'recent_change':
  return `${label}: Stable Account → ${rep.name} (${lock.reason || 'recent owner change'})`;
```

This change will automatically propagate to all UI locations where `assignment_rationale` is displayed.

## Benefits
- Clear distinction between manual locks (P0) and automatic stability (P2)
- Backfill migration clearly indicates accounts are MOVING (not staying)
- Consistent `→ Rep (reason)` pattern maintained across all rationales
- No UI component changes needed - rationale flows through existing display

---

## Reviewer Feedback Response

### Accepted Changes
1. **Keep `→ Rep (reason)` pattern** - Agreed, consistency is important
2. **Separate backfill from stability** - Excellent catch, semantically different
3. **Update both §11.9 and §11.9.1** - Correct, both sections document this format

### Disagreements
None - all reviewer suggestions improve the plan while maintaining the core goal.