# Stability Priority Refactor (v5 - Final)

## Summary

Simplify P1 Stability to 4 sub-conditions with capacity-based override.

**Keep:** `renewal_soon`, `recent_owner_change`, `cre_risk`, `pe_firm`

**Remove:** `top_10_arr`, `expansion_opps`

---

## Sub-condition Timeframes

| Sub-condition | Direction | Timeframe | Logic |
|---------------|-----------|-----------|-------|
| `renewal_soon` | Future | Next 90 days | `renewal_date <= today + 90 days` |
| `recent_owner_change` | Past | Last ~3 months | `owner_change_date >= today - 3 months` |
| `cre_risk` | N/A | Boolean flag | `cre_risk = true` |
| `pe_firm` | N/A | Has value | `pe_firm IS NOT NULL` |

---

## 1. Database Migrations

### Migration 1: Add owner_change_date to accounts

```sql
-- File: supabase/migrations/YYYYMMDDHHMMSS_add_owner_change_date.sql
ALTER TABLE accounts ADD COLUMN owner_change_date DATE;
```

### Migration 2: Add max account fields to assignment_configuration

```sql
-- File: supabase/migrations/YYYYMMDDHHMMSS_add_max_accounts_config.sql
-- Use NULL defaults so existing builds aren't affected until explicitly configured
ALTER TABLE assignment_configuration 
  ADD COLUMN customer_max_accounts INTEGER DEFAULT NULL,
  ADD COLUMN prospect_max_accounts INTEGER DEFAULT NULL;
```

---

## 2. Regenerate Supabase Types

```bash
npx supabase gen types typescript --project-id lolnbotrdamhukdrrsmh > src/integrations/supabase/types.ts
```

---

## 3. Update priorityRegistry.ts

File: `src/config/priorityRegistry.ts`

**Remove sub-conditions** (delete entire objects):

- `top_10_arr` (lines ~101-106)
- `expansion_opps` (lines ~113-119)

**Modify sub-conditions:**

- `recent_owner_change`: change `defaultEnabled: false` to `defaultEnabled: true`
- `renewal_soon`: change requiredFields to `[{ table: 'accounts', field: 'renewal_date' }]`

---

## 4. Update priorityExecutor.ts (Major Changes)

File: `src/services/priorityExecutor.ts`

### 4a. Account Interface (lines 45-72)

```typescript
export interface Account {
  // ... existing fields ...
  
  // DELETE this line:
  // renewal_event_date?: string | null;
  
  // ADD this line:
  renewal_date?: string | null;
  
  // KEEP this line (already exists):
  owner_change_date?: string | null;
  
  // DELETE this line:
  // has_expansion_opp?: boolean | null;
}
```

### 4b. AssignmentConfig Interface (lines 87-111)

Add new fields:

```typescript
export interface AssignmentConfig {
  // ... existing fields ...
  customer_max_accounts?: number;  // ADD
  prospect_max_accounts?: number;  // ADD
}
```

### 4c. Remove Dead Code

- **Line 34**: Remove import `calculateTop10PercentThreshold` from commercialPriorityHandlers
- **Lines 557-562**: Remove `top10Threshold` calculation
- **Lines 608-615**: Delete `top_10_arr` logic block
- **Lines 623-627**: Delete `expansion_opps` logic block

### 4d. Fix renewal_soon Check (lines 599-605)

Change:

```typescript
// OLD
if (!isProtected && isSubConditionEnabled(subConditions, 'renewal_soon') && account.renewal_event_date) {
  const renewalDate = new Date(account.renewal_event_date);

// NEW
if (!isProtected && isSubConditionEnabled(subConditions, 'renewal_soon') && account.renewal_date) {
  const renewalDate = new Date(account.renewal_date);
```

### 4e. Add Capacity Override Logic

At the START of `applyHoldovers` function (~line 541), add workload calculation with **separate customer/prospect counts**:

```typescript
// Build workload map from current account ownership (separate customer/prospect counts)
const workloadMap = new Map<string, { 
  customerCount: number; 
  prospectCount: number; 
  totalARR: number 
}>();

for (const account of accounts) {
  if (!account.owner_id) continue;
  const current = workloadMap.get(account.owner_id) || { customerCount: 0, prospectCount: 0, totalARR: 0 };
  
  if (account.is_customer) {
    current.customerCount++;
  } else {
    current.prospectCount++;
  }
  current.totalARR += account.calculated_arr || account.hierarchy_bookings_arr_converted || 0;
  workloadMap.set(account.owner_id, current);
}

// Get max limits with fallback defaults (NULL in DB = use code defaults)
const customerMaxAccounts = config.customer_max_accounts ?? 8;
const prospectMaxAccounts = config.prospect_max_accounts ?? 30;
const customerMaxARR = config.customer_max_arr;
```

**REPLACE** the existing protection block (~line 664) with:

```typescript
if (isProtected) {
  const currentRep = account.owner_id ? repMap.get(account.owner_id) : null;
  
  // Skip holdover if rep is inactive or missing - applies to ALL priorities
  if (!currentRep || !currentRep.is_active) {
    console.log(`[Holdover Skip] ${account.account_name}: No active owner - passing to optimization`);
    continue;
  }
  
  // Capacity override: ONLY applies to P1 stability_accounts, NOT P0 manual_holdover
  // Manual holdovers are explicitly excluded by users and should be respected regardless of capacity
  if (priority.id === 'stability_accounts') {
    const workload = workloadMap.get(account.owner_id);
    
    const atAccountLimit = account.is_customer 
      ? (workload && customerMaxAccounts && workload.customerCount >= customerMaxAccounts)
      : (workload && prospectMaxAccounts && workload.prospectCount >= prospectMaxAccounts);
    
    const atARRLimit = account.is_customer && workload && customerMaxARR && workload.totalARR >= customerMaxARR;
    
    if (atAccountLimit || atARRLimit) {
      const countType = account.is_customer ? 'customers' : 'prospects';
      const count = account.is_customer ? workload?.customerCount : workload?.prospectCount;
      console.log(`[Capacity Override] ${account.account_name}: ${currentRep.name} at capacity (${count} ${countType}, $${workload?.totalARR?.toLocaleString()} ARR)`);
      continue; // Don't protect - let optimization handle it
    }
  }
  
  // Normal protection - account stays with current owner
  protectedAccounts.push({
    account,
    reason,
    priority_id: priority.id,
    sub_condition_id: subConditionId,
    assigned_rep_id: account.owner_id,
    assigned_rep_name: currentRep?.name || account.owner_name
  });
  protectedIds.add(account.sfdc_account_id);
  matchCount++;
}
```

### 4f. Update loadAssignmentConfig Function (~line 811)

Add the new fields to the return object:

```typescript
return {
  // ... existing fields ...
  
  // ADD these lines:
  customer_max_accounts: data.customer_max_accounts ?? null,
  prospect_max_accounts: data.prospect_max_accounts ?? null,
};
```

---

## 5. Update batchImportService.ts

File: `src/services/batchImportService.ts`

Extend `syncRenewalQuarterFromOpportunities` (~line 796) to also populate `renewal_date`:

After the existing `renewal_quarter` update (around line 878), add:

```typescript
// Also sync renewal_date if account doesn't have one (rollup from opportunities)
const { error: dateUpdateError } = await supabase
  .from('accounts')
  .update({ renewal_date: renewalDate })
  .eq('build_id', buildId)
  .eq('sfdc_account_id', parentId)
  .is('renewal_date', null);  // Only if not already set from CSV

if (dateUpdateError) {
  console.warn(`⚠️ Failed to update renewal_date for ${parentId}:`, dateUpdateError);
}
```

---

## 6. Update Import Mapping

### autoMappingUtils.ts

Add new entry (~after line 300):

```typescript
{
  schemaField: 'owner_change_date',
  aliases: ['owner_change_date', 'owner change date', 'last_owner_change', 'edit_date', 'edit date'],
  patterns: [/.*owner.*change.*date.*/i, /^edit.?date$/i],
  required: false
}
```

### importUtils.ts

In `transformAccountData` function (~line 594), add:

```typescript
owner_change_date: toDateString(row.owner_change_date) || toDateString(row.edit_date) || null,
```

---

## 7. Update WaterfallLogicExplainer.tsx

### 7a. Remove dead icon cases in getSubConditionIcon (~lines 58-63):

```typescript
// DELETE these cases:
case 'top_10_arr':
  return <TrendingDown className={className} />;
case 'expansion_opps':
  return <Briefcase className={className} />;
```

### 7b. Update imports (line ~6):

Remove ONLY `Briefcase` from import statement.

**Keep `TrendingDown`** - it's used in the Global Constraints section.

```typescript
// BEFORE:
import { Info, Settings, CheckCircle, AlertTriangle, TrendingDown, Users, MapPin, Zap, Shield, Lock, Scale, Building2, Clock, Briefcase, RefreshCw } from 'lucide-react';

// AFTER:
import { Info, Settings, CheckCircle, AlertTriangle, TrendingDown, Users, MapPin, Zap, Shield, Lock, Scale, Building2, Clock, RefreshCw } from 'lucide-react';
```

### 7c. Update getPriorityDetails (~lines 87, 89):

Delete these two `if` statements:

```typescript
// DELETE these lines:
if (enabledSubs.includes('top_10_arr')) bullets.push('Top 10% ARR accounts (per FLM) stay');
if (enabledSubs.includes('expansion_opps')) bullets.push('Accounts with open expansions stay');
```

---

## Capacity Override Behavior

Using `>=` means: **If rep is at or over capacity, none of their stability-eligible accounts get holdover protection.** This is intentional - it forces rebalancing for overloaded reps.

**Important:** Capacity override ONLY applies to P1 stability accounts. P0 manual holdovers (accounts with `exclude_from_reassignment = true`) are **always respected** regardless of rep capacity.

---

## Workload Counting Logic

Workloads are tracked **separately** for customers and prospects:

| Rep has | Customer limit (8) | Prospect limit (30) | Stability customer protected? | Stability prospect protected? |
|---------|-------------------|---------------------|------------------------------|------------------------------|
| 5 cust, 25 pros | 5 < 8 | 25 < 30 | Yes | Yes |
| 8 cust, 25 pros | 8 >= 8 | 25 < 30 | Released | Yes |
| 5 cust, 30 pros | 5 < 8 | 30 >= 30 | Yes | Released |
| 8 cust, 30 pros | 8 >= 8 | 30 >= 30 | Released | Released |

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `supabase/migrations/xxx_add_owner_change_date.sql` | New migration |
| `supabase/migrations/xxx_add_max_accounts_config.sql` | New migration (NULL defaults) |
| `src/integrations/supabase/types.ts` | Regenerate |
| `src/config/priorityRegistry.ts` | Remove 2 sub-conditions, enable 1, update requiredFields |
| `src/services/priorityExecutor.ts` | Interface changes, capacity logic (P1 only), dead code removal, loadAssignmentConfig update |
| `src/services/batchImportService.ts` | Add renewal_date rollup with error handling |
| `src/utils/autoMappingUtils.ts` | Add owner_change_date aliases |
| `src/utils/importUtils.ts` | Add owner_change_date transform with toDateString() |
| `src/components/WaterfallLogicExplainer.tsx` | Remove Briefcase import, dead icons, dead if statements in getPriorityDetails |

---

## To-dos

- [ ] Create Supabase migration to add owner_change_date column
- [ ] Create Supabase migration to add max_accounts config fields
- [ ] Regenerate Supabase types via CLI after migrations
- [ ] Remove top_10_arr/expansion_opps, enable recent_owner_change, fix renewal_soon in priorityRegistry
- [ ] Fix interface, remove dead code, add capacity override logic (P1 only) in priorityExecutor
- [ ] Update loadAssignmentConfig to read new max_accounts fields
- [ ] Extend batchImportService to rollup renewal_date from opportunities
- [ ] Add owner_change_date to autoMappingUtils and importUtils (using toDateString)
- [ ] Update WaterfallLogicExplainer: remove Briefcase import, dead icons, dead if statements

---

## Changelog (v4 to v5)

| Change | Description |
|--------|-------------|
| Bug fix | Workload map now tracks customer/prospect counts separately (was combined) |
| Missing | Added section 4f for loadAssignmentConfig update |
| Clarification | Capacity override only applies to P1 stability, not P0 manual holdover |
| Added | Workload counting logic table for clarity |
| Fixed | importUtils transform uses toDateString() for owner_change_date |
| Clarification | Section 7c now explicitly lists the if statements to delete |
| Added | Sub-condition Timeframes table documenting 90-day logic |
