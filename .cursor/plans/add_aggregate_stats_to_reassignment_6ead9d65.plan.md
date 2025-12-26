---
name: Add Aggregate Stats to Reassignment
overview: Add before/after aggregate rep metrics (ARR, ATR, Account Count, Tier breakdown) to the HierarchyAwareReassignDialog component, leveraging the existing RepWorkloadCard component and extending it for additional metrics.
todos:
  - id: extend-workload-card
    content: Extend RepWorkloadCard with ATR, compact variant, and gaining/losing color indicators
    status: pending
  - id: rep-metrics-helper
    content: Add getRepCurrentMetrics() helper to assignmentServiceHelpers.ts
    status: pending
    dependencies:
      - extend-workload-card
  - id: integrate-dialog
    content: Integrate RepWorkloadCard into HierarchyAwareReassignDialog with rep metrics fetch
    status: pending
    dependencies:
      - rep-metrics-helper
  - id: changelog
    content: Update CHANGELOG.md with feature documentation
    status: pending
    dependencies:
      - integrate-dialog
---

# Add Aggregate Rep Stats to Reassignment Dialog

## Current State

The [`HierarchyAwareReassignDialog.tsx`](book-ops-workbench/src/components/HierarchyAwareReassignDialog.tsx) was just implemented and handles hierarchy-aware reassignments. It already shows:
- Account info (name, ARR, customer/prospect status)
- Hierarchy details (child count, locked children, parent info)
- Warning for hierarchy splits
- Summary with "Accounts affected" and "Total ARR"

However, it **does not show the impact on the reps' aggregate book stats** (before/after for both losing and gaining rep).

The [`RepWorkloadCard.tsx`](book-ops-workbench/src/components/RepWorkloadCard.tsx) component already exists and is designed for exactly this purpose:
- Shows current vs proposed ARR with delta and percentage
- Shows account count changes
- Displays gaining/losing account lists

But `RepWorkloadCard` is **not currently used anywhere** and lacks ATR and tier breakdown.

---

## Integration Plan

### 1. Extend RepWorkloadCard Props

Add optional props for ATR and tier breakdown to [`RepWorkloadCard.tsx`](book-ops-workbench/src/components/RepWorkloadCard.tsx):

```typescript
interface RepWorkloadCardProps {
  rep: any;
  currentARR: number;
  proposedARR: number;
  currentATR?: number;           // NEW
  proposedATR?: number;          // NEW
  currentAccounts: number;
  proposedAccounts: number;
  tierBreakdown?: {              // NEW (optional - for full detail view)
    current: { tier1: number; tier2: number; tier3: number; tier4: number };
    proposed: { tier1: number; tier2: number; tier3: number; tier4: number };
  };
  gainingAccounts?: string[];
  losingAccounts?: string[];
  isStrategic?: boolean;
  compact?: boolean;             // NEW - for inline display in dialog
  variant?: 'gaining' | 'losing' | 'neutral';  // NEW - color indicator
  onClick?: () => void;
}
```

Add ATR display section similar to ARR (when `currentATR` and `proposedATR` are provided).

### 2. Create Helper Function for Rep Metrics

Add a new helper function to [`assignmentServiceHelpers.ts`](book-ops-workbench/src/services/assignmentServiceHelpers.ts):

```typescript
export async function getRepCurrentMetrics(
  repId: string,
  buildId: string
): Promise<{
  totalARR: number;
  totalATR: number;
  accountCount: number;
  tierBreakdown: { tier1: number; tier2: number; tier3: number; tier4: number };
}>
```

This fetches the rep's current book metrics using `getAccountARR()` and `getAccountATR()` from `@/_domain`.

### 3. Integrate into HierarchyAwareReassignDialog

In [`HierarchyAwareReassignDialog.tsx`](book-ops-workbench/src/components/HierarchyAwareReassignDialog.tsx), add:

1. **State for rep metrics:**
```typescript
const [losingRepMetrics, setLosingRepMetrics] = useState<RepMetrics | null>(null);
const [gainingRepMetrics, setGainingRepMetrics] = useState<RepMetrics | null>(null);
```

2. **Fetch metrics when newOwnerId is selected** (using `getRepCurrentMetrics`)

3. **Display side-by-side RepWorkloadCards** after the owner selection, before the Summary section (~line 575):

```
{newOwnerId && losingRepMetrics && gainingRepMetrics && (
  <div className="grid grid-cols-2 gap-4">
    <RepWorkloadCard
      rep={{ name: account.owner_name || 'Current Owner' }}
      currentARR={losingRepMetrics.totalARR}
      proposedARR={losingRepMetrics.totalARR - accountARR}
      currentATR={losingRepMetrics.totalATR}
      proposedATR={losingRepMetrics.totalATR - accountATR}
      currentAccounts={losingRepMetrics.accountCount}
      proposedAccounts={losingRepMetrics.accountCount - accountsAffected}
      losingAccounts={[account.account_name]}
      variant="losing"
      compact
    />
    <RepWorkloadCard
      rep={{ name: selectedRepName }}
      currentARR={gainingRepMetrics.totalARR}
      proposedARR={gainingRepMetrics.totalARR + accountARR}
      currentATR={gainingRepMetrics.totalATR}
      proposedATR={gainingRepMetrics.totalATR + accountATR}
      currentAccounts={gainingRepMetrics.accountCount}
      proposedAccounts={gainingRepMetrics.accountCount + accountsAffected}
      gainingAccounts={[account.account_name]}
      variant="gaining"
      compact
    />
  </div>
)}
```

### 4. Ensure Analytics Refresh

The dialog already calls `invalidateAnalytics(buildId)` on success (line 302), so analytics will update properly.

---

## Files Changed

| File | Changes |
|------|---------|
| [`RepWorkloadCard.tsx`](book-ops-workbench/src/components/RepWorkloadCard.tsx) | Add ATR props, compact variant, tier breakdown, gaining/losing color variants |
| [`assignmentServiceHelpers.ts`](book-ops-workbench/src/services/assignmentServiceHelpers.ts) | Add `getRepCurrentMetrics()` helper |
| [`HierarchyAwareReassignDialog.tsx`](book-ops-workbench/src/components/HierarchyAwareReassignDialog.tsx) | Import RepWorkloadCard, add rep metrics state, fetch on owner selection, display side-by-side cards |
| `CHANGELOG.md` | Document the enhancement |

---

## UI Mockup

After user selects a new owner, the dialog will show:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [Account Info Card]                                                      │
│  [Hierarchy Options]                                                      │
│  [Owner Selector]                                                         │
│                                                                          │
│  ┌─────────────────────────┐   ┌─────────────────────────┐              │
│  │  Current Owner (Losing) │   │  New Owner (Gaining)    │              │
│  │  ───────────────────────│   │  ───────────────────────│              │
│  │  ARR: $1.2M → $0.9M     │   │  ARR: $800K → $1.1M     │              │
│  │       ▼ -$300K (-25%)   │   │       ▲ +$300K (+38%)   │              │
│  │  ATR: $400K → $300K     │   │  ATR: $200K → $300K     │              │
│  │  Accounts: 12 → 11      │   │  Accounts: 8 → 9        │              │
│  └─────────────────────────┘   └─────────────────────────┘              │
│                                                                          │
│  [Rationale Input]                                                       │
│  [Summary]                                                               │
│  [Cancel] [Reassign]                                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## SSOT Compliance

No new business logic is being added - this feature uses existing:
- `getAccountARR()` from `@/_domain`
- `getAccountATR()` from `@/_domain`  
- `getAccountExpansionTier()` from `@/_domain`

The metrics calculation will import from `@/_domain` as required.
