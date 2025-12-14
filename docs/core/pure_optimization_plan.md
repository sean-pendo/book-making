# Pure Optimization LP Engine - Implementation Plan v2

*Complete mathematical formulation and implementation guide for the weighted LP assignment model.*

*Last updated: 2024-12-12 (v2 - incorporates all review fixes)*

---

## Executive Summary

This document specifies a **Pure Optimization** assignment model that replaces the cascading priority waterfall with a single global LP solve. All objectives compete via configurable weights, enabling true trade-off optimization.

**Key differences from Waterfall:**
- Single solve vs sequential priority execution
- Soft penalties vs binary eligibility gates
- Explicit ATR/Pipeline balance vs implicit composite score
- Global optimization vs local per-priority optimization

**Key fixes in v2:**
- Separate customer vs prospect modes with different weights
- Relative balance penalties (0-1 scale) instead of per-dollar
- Parent-child aggregation pre-solve (not linking constraints)
- Backfill target migration handling
- Complete data loading specifications

---

## Mathematical Formulation

### Sets and Indices

| Symbol | Definition |
|--------|------------|
| $\mathcal{A}$ | Set of **parent** accounts to assign (children aggregated) |
| $\mathcal{R}$ | Set of eligible reps (active, include_in_assignments, not manager) |
| $\mathcal{S}$ | Stability-locked accounts (CRE, renewal, PE, recent change, backfill migration) |
| $\mathcal{L}$ | Manually locked accounts (exclude_from_reassignment = true) |
| $\mathcal{B}$ | Backfill migration accounts (current owner is backfill_source with valid target) |

### Decision Variables

**Primary (binary):**
$$x_{a,r} \in \{0,1\} \quad \forall a \in \mathcal{A}, r \in \mathcal{R}$$

**Balance deviation slacks (continuous, non-negative):**
$$\text{over}_r^m, \text{under}_r^m \geq 0 \quad \forall r \in \mathcal{R}, m \in \{\text{ARR}, \text{ATR}, \text{Pipeline}\}$$

**Feasibility slacks (if needed):**
$$s_r \geq 0 \quad \forall r \in \mathcal{R}$$

---

### Objective Function

$$\max \sum_{a \in \mathcal{A}} \sum_{r \in \mathcal{R}} c_{a,r} \cdot x_{a,r} - \sum_{m} \lambda_m \sum_r \left(\frac{\text{over}_r^m + \text{under}_r^m}{\text{target}^m}\right) - M \sum_r s_r$$

**Per-assignment coefficient (3 scoring components):**

$$c_{a,r} = w_C \cdot S^{\text{cont}}_{a,r} + w_G \cdot S^{\text{geo}}_{a,r} + w_T \cdot S^{\text{team}}_{a,r} + \epsilon \cdot \text{rank}_a$$

Where:
- $w_C + w_G + w_T = 1$ (auto-normalized)
- $\epsilon = 0.001$ (tie-breaker)
- $\text{rank}_a = 1 - \frac{\text{position of } a \text{ when sorted by ARR desc}}{|\mathcal{A}|}$

**Balance penalty weights (relative scale 0-1):**
- $\lambda_{\text{ARR}}$: Penalty for ARR deviation (default 0.5)
- $\lambda_{\text{ATR}}$: Penalty for ATR deviation (default 0.3) — customers only
- $\lambda_{\text{Pipeline}}$: Penalty for Pipeline deviation (default 0.4) — prospects only

**Why relative penalties?**
Deviation is normalized by target: $\frac{\text{over} + \text{under}}{\text{target}}$ gives a 0-1 scale.
A penalty of 1.0 means balance matters as much as assignment quality.

**Feasibility penalty:**
- $M = 1000$ (large penalty for capacity violation)

---

### Hard Constraints

**1. Single Assignment** — Each account assigned to exactly one rep:
$$\sum_{r \in \mathcal{R}} x_{a,r} = 1 \quad \forall a \in \mathcal{A}$$

**2. Capacity Limit** — No rep exceeds hard cap (with feasibility slack):
$$\sum_{a \in \mathcal{A}} \text{ARR}_a \cdot x_{a,r} \leq \text{HardCap}_r + s_r \quad \forall r \in \mathcal{R}$$

**3. Locked Accounts** — Respect exclude_from_reassignment flag:
$$x_{a, \text{owner}(a)} = 1 \quad \forall a \in \mathcal{L} \text{ where owner}(a) \text{ is eligible}$$

**4. Stability Locks** — CRE risk, renewal soon, PE firm, recent change:
$$x_{a, \text{owner}(a)} = 1 \quad \forall a \in \mathcal{S} \text{ where owner}(a) \text{ is eligible}$$

**5. Backfill Migration** — Accounts with leaving owner go to replacement:
$$x_{a, \text{backfill\_target}(a)} = 1 \quad \forall a \in \mathcal{B} \text{ where target is eligible}$$

**6. Strategic Pool** — Strategic accounts only to strategic reps:
$$x_{a,r} = 0 \quad \forall (a,r) : \text{IsStrategic}_a \land \neg\text{IsStrategicRep}_r$$

**Note on Parent-Child:** Children are aggregated into parent pre-solve. No linking constraints needed.
Children inherit parent's assignment post-solve.

---

### Balance Deviation Constraints

These constraints link slack variables to actual load deviation (relative scale).

**ARR Balance (customers and prospects):**
$$\sum_{a} \text{ARR}_a \cdot x_{a,r} - \text{ARR\_target}_r \leq \text{over}_r^{\text{ARR}} \quad \forall r$$
$$\text{ARR\_target}_r - \sum_{a} \text{ARR}_a \cdot x_{a,r} \leq \text{under}_r^{\text{ARR}} \quad \forall r$$

**ATR Balance (customers only):**
$$\sum_{a} \text{ATR}_a \cdot x_{a,r} - \text{ATR\_target}_r \leq \text{over}_r^{\text{ATR}} \quad \forall r$$
$$\text{ATR\_target}_r - \sum_{a} \text{ATR}_a \cdot x_{a,r} \leq \text{under}_r^{\text{ATR}} \quad \forall r$$

**Pipeline Balance (prospects only):**
$$\sum_{a} \text{Pipeline}_a \cdot x_{a,r} - \text{Pipe\_target}_r \leq \text{over}_r^{\text{Pipe}} \quad \forall r$$
$$\text{Pipe\_target}_r - \sum_{a} \text{Pipeline}_a \cdot x_{a,r} \leq \text{under}_r^{\text{Pipe}} \quad \forall r$$

**Target Calculation:**
- $\text{ARR\_target}_r = \frac{\sum_a \text{ARR}_a}{|\mathcal{R}|}$ (equal distribution)
- $\text{ATR\_target}_r = \frac{\sum_a \text{ATR}_a}{|\mathcal{R}|}$
- $\text{Pipe\_target}_r = \frac{\sum_a \text{Pipeline}_a}{|\mathcal{R}|}$

---

## Customer vs Prospect Mode

The engine accepts an `assignmentType` parameter and applies different logic:

| Aspect | Customer Mode | Prospect Mode |
|--------|---------------|---------------|
| Balance Metrics | ARR + ATR | ARR (from pipeline) only |
| ATR Constraints | ✅ Enabled | ❌ Disabled |
| Pipeline Constraints | ❌ Disabled | ✅ Enabled |
| Continuity Weight | Higher (0.35 default) | Lower (0.20 default) |
| ARR Source | `hierarchy_bookings_arr_converted` | `pipeline_value` (sum of opportunity net_arr) |

**Execution Order:**
1. Run customer solve first
2. Update rep capacity state with customer assignments
3. Run prospect solve with remaining capacity
4. Combine results

---

## Data Loading (Preprocessing)

### 1. Accounts

```typescript
const { data: accounts } = await supabase
  .from('accounts')
  .select('*')
  .eq('build_id', buildId)
  .eq('is_parent', true);

// ARR source priority:
const getARR = (a: Account) => 
  a.hierarchy_bookings_arr_converted ?? a.calculated_arr ?? a.arr ?? 0;
```

### 2. Sales Reps

```typescript
const { data: allReps } = await supabase
  .from('sales_reps')
  .select('*')
  .eq('build_id', buildId);

// Filter eligible reps
const eligibleReps = allReps.filter(r => 
  r.is_active !== false &&
  r.include_in_assignments !== false &&
  r.is_manager !== true
);

// Separate strategic reps
const strategicReps = eligibleReps.filter(r => r.is_strategic_rep);
const regularReps = eligibleReps.filter(r => !r.is_strategic_rep);
```

### 3. Opportunities (Prospects Only)

```typescript
const { data: opportunities } = await supabase
  .from('opportunities')
  .select('sfdc_account_id, net_arr')
  .eq('build_id', buildId)
  .gt('net_arr', 0);

// Build pipeline map
const pipelineMap = new Map<string, number>();
opportunities.forEach(opp => {
  const current = pipelineMap.get(opp.sfdc_account_id) || 0;
  pipelineMap.set(opp.sfdc_account_id, current + (opp.net_arr || 0));
});
```

### 4. Territory Mappings

```typescript
const { data: config } = await supabase
  .from('assignment_configuration')
  .select('territory_mappings')
  .eq('build_id', buildId)
  .single();

const territoryMap = config.territory_mappings as Record<string, string>;

// Fallback for unmapped territories
import { autoMapTerritoryToRegion } from '@/utils/territoryAutoMapping';
```

### 5. Parent-Child Aggregation

```typescript
interface AggregatedAccount extends Account {
  child_ids: string[];
  aggregated_arr: number;
  aggregated_atr: number;
}

function aggregateParentChild(accounts: Account[]): AggregatedAccount[] {
  const parents = accounts.filter(a => a.is_parent);
  const children = accounts.filter(a => !a.is_parent);
  
  const parentMap = new Map<string, AggregatedAccount>();
  
  for (const p of parents) {
    parentMap.set(p.sfdc_account_id, {
      ...p,
      child_ids: [],
      // hierarchy_bookings_arr_converted already includes children
      aggregated_arr: p.hierarchy_bookings_arr_converted ?? p.arr ?? 0,
      aggregated_atr: p.atr ?? 0
    });
  }
  
  for (const c of children) {
    if (c.parent_id && parentMap.has(c.parent_id)) {
      const parent = parentMap.get(c.parent_id)!;
      parent.child_ids.push(c.sfdc_account_id);
      // ATR needs to be aggregated (not included in hierarchy field)
      parent.aggregated_atr += c.atr ?? 0;
    }
  }
  
  return Array.from(parentMap.values());
}
```

### 6. Strategic Pool Pre-Assignment

```typescript
function assignStrategicPool(
  accounts: AggregatedAccount[],
  strategicReps: SalesRep[]
): { fixed: Assignment[], remaining: AggregatedAccount[] } {
  const strategicAccounts = accounts.filter(a => 
    a.is_strategic || 
    strategicReps.some(r => r.rep_id === a.owner_id)
  );
  
  const regularAccounts = accounts.filter(a => 
    !strategicAccounts.includes(a)
  );
  
  if (strategicReps.length === 0) {
    console.warn('No strategic reps available for strategic accounts');
    return { fixed: [], remaining: accounts };
  }
  
  // Sort accounts by ARR descending for fair distribution
  strategicAccounts.sort((a, b) => b.aggregated_arr - a.aggregated_arr);
  
  // Round-robin assignment to least loaded rep
  const repLoads = new Map<string, number>();
  strategicReps.forEach(r => repLoads.set(r.rep_id, 0));
  
  const fixed: Assignment[] = [];
  
  for (const account of strategicAccounts) {
    // Find least loaded strategic rep
    let minRep = strategicReps[0];
    let minLoad = repLoads.get(minRep.rep_id) || 0;
    
    for (const rep of strategicReps) {
      const load = repLoads.get(rep.rep_id) || 0;
      if (load < minLoad) {
        minLoad = load;
        minRep = rep;
      }
    }
    
    fixed.push({
      accountId: account.sfdc_account_id,
      repId: minRep.rep_id,
      rationale: 'Strategic account → strategic rep (pre-assigned)'
    });
    
    repLoads.set(minRep.rep_id, minLoad + account.aggregated_arr);
  }
  
  return { fixed, remaining: regularAccounts };
}
```

---

## Scoring Sub-Functions

All functions return values in $[0, 1]$.

### Continuity Score: $S^{\text{cont}}_{a,r}$

```typescript
interface ContinuityParams {
  tenure_weight: number;      // 0.35
  tenure_max_days: number;    // 730 (2 years)
  stability_weight: number;   // 0.30
  stability_max_owners: number; // 5
  value_weight: number;       // 0.25
  value_threshold: number;    // 2000000
  base_continuity: number;    // 0.10
}

function continuityScore(
  account: Account,
  rep: SalesRep,
  params: ContinuityParams
): number {
  // Not current owner → 0
  if (rep.rep_id !== account.owner_id) return 0;
  
  // Backfill source rep → 0 (relationship is ending)
  if (rep.is_backfill_source) return 0;
  
  // Tenure: days with current owner / max days
  const tenureDays = account.owner_change_date
    ? Math.floor((Date.now() - new Date(account.owner_change_date).getTime()) / 86400000)
    : 0;
  const T = Math.min(1, tenureDays / params.tenure_max_days);
  
  // Stability: fewer lifetime owners = more stable
  const ownerCount = account.owners_lifetime_count ?? 1;
  const B = Math.max(0, 1 - (ownerCount - 1) / (params.stability_max_owners - 1));
  
  // Value: higher ARR = more valuable continuity
  const arr = account.hierarchy_bookings_arr_converted ?? account.arr ?? 0;
  const V = Math.min(1, arr / params.value_threshold);
  
  return Math.min(1, 
    params.base_continuity + 
    params.tenure_weight * T + 
    params.stability_weight * B + 
    params.value_weight * V
  );
}
```

### Geography Score: $S^{\text{geo}}_{a,r}$

```typescript
interface GeographyParams {
  exact_match_score: number;      // 1.0
  sibling_score: number;          // 0.65
  parent_score: number;           // 0.40
  global_score: number;           // 0.20
  unknown_territory_score: number; // 0.50
}

const REGION_HIERARCHY = {
  AMER: ['North East', 'South East', 'Central', 'West'],
  EMEA: ['UK', 'DACH', 'France', 'Nordics', 'Benelux'],
  APAC: ['ANZ', 'Japan', 'Singapore']
};

const REGION_SIBLINGS: Record<string, string[]> = {
  'North East': ['South East', 'Central'],
  'South East': ['North East', 'Central'],
  'Central': ['West', 'North East', 'South East'],
  'West': ['Central'],
  'UK': ['DACH', 'France'],
  'DACH': ['UK', 'France', 'Nordics'],
  'France': ['UK', 'DACH', 'Benelux'],
  'Nordics': ['DACH', 'Benelux'],
  'Benelux': ['France', 'Nordics'],
  'ANZ': ['Singapore'],
  'Japan': ['Singapore'],
  'Singapore': ['ANZ', 'Japan']
};

function getParentRegion(region: string): string | null {
  for (const [parent, children] of Object.entries(REGION_HIERARCHY)) {
    if (children.includes(region)) return parent;
  }
  return null;
}

function geographyScore(
  account: Account,
  rep: SalesRep,
  territoryMap: Record<string, string>,
  params: GeographyParams
): number {
  const territory = account.sales_territory;
  const repRegion = rep.region;
  
  if (!territory || !repRegion) {
    return params.unknown_territory_score;
  }
  
  // Map territory to region
  let accountRegion = territoryMap[territory];
  if (!accountRegion) {
    // Fallback to auto-mapping
    accountRegion = autoMapTerritoryToRegion(territory);
  }
  
  if (!accountRegion) {
    return params.unknown_territory_score;
  }
  
  // Exact match
  if (accountRegion === repRegion) {
    return params.exact_match_score;
  }
  
  // Sibling regions
  const siblings = REGION_SIBLINGS[accountRegion] || [];
  if (siblings.includes(repRegion)) {
    return params.sibling_score;
  }
  
  // Same parent region
  const accountParent = getParentRegion(accountRegion);
  const repParent = getParentRegion(repRegion);
  if (accountParent && accountParent === repParent) {
    return params.parent_score;
  }
  
  // Different macro-regions
  return params.global_score;
}
```

### Team Alignment Score: $S^{\text{team}}_{a,r}$

```typescript
interface TeamParams {
  exact_match_score: number;    // 1.0
  one_level_score: number;      // 0.60
  two_level_score: number;      // 0.25
  three_level_score: number;    // 0.05
  reaching_down_penalty: number; // 0.15 per level
  unknown_tier_score: number;   // 0.50
}

const TIER_ORDER = ['SMB', 'Growth', 'MM', 'ENT'];

function getTierIndex(tier: string | null): number {
  if (!tier) return -1;
  const idx = TIER_ORDER.indexOf(tier);
  return idx >= 0 ? idx : -1;
}

function classifyAccountTier(employees: number | null): string | null {
  if (employees === null || employees === undefined) return null;
  if (employees < 100) return 'SMB';
  if (employees < 500) return 'Growth';
  if (employees < 2500) return 'MM';
  return 'ENT';
}

function teamAlignmentScore(
  account: Account,
  rep: SalesRep,
  params: TeamParams
): number {
  const accountTier = classifyAccountTier(account.employees);
  const repTier = rep.team_tier || rep.team;
  
  const accountIdx = getTierIndex(accountTier);
  const repIdx = getTierIndex(repTier);
  
  // Unknown tier for either → neutral score
  if (accountIdx === -1 || repIdx === -1) {
    return params.unknown_tier_score;
  }
  
  const distance = Math.abs(accountIdx - repIdx);
  
  // Base score by distance
  let baseScore: number;
  switch (distance) {
    case 0: baseScore = params.exact_match_score; break;
    case 1: baseScore = params.one_level_score; break;
    case 2: baseScore = params.two_level_score; break;
    default: baseScore = params.three_level_score;
  }
  
  // Penalty if rep is reaching down (higher tier rep for lower tier account)
  if (repIdx > accountIdx) {
    const penalty = params.reaching_down_penalty * distance;
    baseScore = Math.max(0, baseScore - penalty);
  }
  
  return baseScore;
}
```

---

## Stability Lock Identification

```typescript
interface StabilityConfig {
  cre_risk_locked: boolean;
  renewal_soon_locked: boolean;
  renewal_soon_days: number;
  pe_firm_locked: boolean;
  recent_change_locked: boolean;
  recent_change_days: number;
  backfill_migration_enabled: boolean;
}

interface LockResult {
  isLocked: boolean;
  lockType: string | null;
  targetRepId: string | null;
}

function checkStabilityLock(
  account: Account,
  reps: SalesRep[],
  config: StabilityConfig
): LockResult {
  const currentOwner = reps.find(r => r.rep_id === account.owner_id);
  const noResult = { isLocked: false, lockType: null, targetRepId: null };
  
  // Must have current owner who is eligible
  if (!currentOwner) return noResult;
  if (currentOwner.is_active === false) return noResult;
  if (currentOwner.include_in_assignments === false) return noResult;
  
  // Check backfill migration FIRST (takes precedence)
  if (config.backfill_migration_enabled && currentOwner.is_backfill_source) {
    const targetRep = reps.find(r => r.rep_id === currentOwner.backfill_target_rep_id);
    if (targetRep && targetRep.is_active !== false && targetRep.include_in_assignments !== false) {
      return {
        isLocked: true,
        lockType: 'backfill_migration',
        targetRepId: targetRep.rep_id
      };
    }
    // No valid target → account is NOT locked, enters normal optimization
    return noResult;
  }
  
  // CRE Risk
  if (config.cre_risk_locked && account.cre_risk) {
    return { isLocked: true, lockType: 'cre_risk', targetRepId: currentOwner.rep_id };
  }
  
  // Renewal Soon
  if (config.renewal_soon_locked && account.renewal_date) {
    const renewalDate = new Date(account.renewal_date);
    const daysUntilRenewal = Math.floor((renewalDate.getTime() - Date.now()) / 86400000);
    if (daysUntilRenewal >= 0 && daysUntilRenewal <= config.renewal_soon_days) {
      return { isLocked: true, lockType: 'renewal_soon', targetRepId: currentOwner.rep_id };
    }
  }
  
  // PE Firm
  if (config.pe_firm_locked && account.pe_firm) {
    return { isLocked: true, lockType: 'pe_firm', targetRepId: currentOwner.rep_id };
  }
  
  // Recent Change
  if (config.recent_change_locked && account.owner_change_date) {
    const changeDate = new Date(account.owner_change_date);
    const daysSinceChange = Math.floor((Date.now() - changeDate.getTime()) / 86400000);
    if (daysSinceChange <= config.recent_change_days) {
      return { isLocked: true, lockType: 'recent_change', targetRepId: currentOwner.rep_id };
    }
  }
  
  return noResult;
}
```

---

## Database Schema

```sql
-- Migration: 20241212_add_pure_optimization.sql

ALTER TABLE assignment_configuration 

-- Model selection
ADD COLUMN optimization_model TEXT DEFAULT 'waterfall' 
    CHECK (optimization_model IN ('waterfall', 'pure_optimization')),

-- Objective enables and weights (CUSTOMER)
ADD COLUMN lp_objectives_customer JSONB DEFAULT '{
    "continuity_enabled": true,
    "continuity_weight": 0.35,
    "geography_enabled": true,
    "geography_weight": 0.35,
    "team_alignment_enabled": true,
    "team_alignment_weight": 0.30
}'::jsonb,

-- Objective enables and weights (PROSPECT - lower continuity)
ADD COLUMN lp_objectives_prospect JSONB DEFAULT '{
    "continuity_enabled": true,
    "continuity_weight": 0.20,
    "geography_enabled": true,
    "geography_weight": 0.45,
    "team_alignment_enabled": true,
    "team_alignment_weight": 0.35
}'::jsonb,

-- Balance metric enables and penalties (RELATIVE scale 0-1)
ADD COLUMN lp_balance_config JSONB DEFAULT '{
    "arr_balance_enabled": true,
    "arr_penalty": 0.5,
    "atr_balance_enabled": true,
    "atr_penalty": 0.3,
    "pipeline_balance_enabled": true,
    "pipeline_penalty": 0.4
}'::jsonb,

-- Constraint enables
ADD COLUMN lp_constraints JSONB DEFAULT '{
    "strategic_pool_enabled": true,
    "locked_accounts_enabled": true,
    "parent_child_linking_enabled": true,
    "capacity_hard_cap_enabled": true
}'::jsonb,

-- Stability lock enables and parameters
ADD COLUMN lp_stability_config JSONB DEFAULT '{
    "cre_risk_locked": true,
    "renewal_soon_locked": true,
    "renewal_soon_days": 90,
    "pe_firm_locked": true,
    "recent_change_locked": true,
    "recent_change_days": 90,
    "backfill_migration_enabled": true
}'::jsonb,

-- Continuity score parameters
ADD COLUMN lp_continuity_params JSONB DEFAULT '{
    "tenure_weight": 0.35,
    "tenure_max_days": 730,
    "stability_weight": 0.30,
    "stability_max_owners": 5,
    "value_weight": 0.25,
    "value_threshold": 2000000,
    "base_continuity": 0.10
}'::jsonb,

-- Geography score parameters
ADD COLUMN lp_geography_params JSONB DEFAULT '{
    "exact_match_score": 1.0,
    "sibling_score": 0.65,
    "parent_score": 0.40,
    "global_score": 0.20,
    "unknown_territory_score": 0.50
}'::jsonb,

-- Team alignment score parameters
ADD COLUMN lp_team_params JSONB DEFAULT '{
    "exact_match_score": 1.0,
    "one_level_score": 0.60,
    "two_level_score": 0.25,
    "three_level_score": 0.05,
    "reaching_down_penalty": 0.15,
    "unknown_tier_score": 0.50
}'::jsonb,

-- Solver configuration
ADD COLUMN lp_solver_params JSONB DEFAULT '{
    "timeout_seconds": 60,
    "tie_break_method": "rank_based",
    "feasibility_penalty": 1000,
    "log_level": "info"
}'::jsonb;

-- Documentation
COMMENT ON COLUMN assignment_configuration.optimization_model IS 
    'Assignment model: "waterfall" (priority cascade) or "pure_optimization" (single LP solve)';

COMMENT ON COLUMN assignment_configuration.lp_balance_config IS 
    'Balance penalties are RELATIVE (0-1 scale). Penalty of 1.0 means balance matters as much as assignment quality.';
```

---

## UI Configuration

When Pure Optimization is selected, the priority list is replaced with this configuration:

```
┌─────────────────────────────────────────────────────────────────────┐
│  OPTIMIZATION MODEL                                                  │
│  ○ Waterfall    ● Pure Optimization                                 │
├─────────────────────────────────────────────────────────────────────┤
│  MODE: ○ Customer ○ Prospect ● Both (sequential)                    │
├─────────────────────────────────────────────────────────────────────┤
│  HARD CONSTRAINTS (toggleable)                                       │
│                                                                      │
│  ☑ Strategic Pool      Strategic accounts → strategic reps only    │
│  ☑ Locked Accounts     Respect exclude_from_reassignment flag      │
│  ☑ Parent-Child        Children follow parent assignment           │
│  ☑ Capacity Cap        Enforce hard ARR maximum per rep            │
│                                                                      │
│  STABILITY LOCKS (toggleable)                                        │
│  ☑ CRE Risk            At-risk accounts stay with owner            │
│  ☑ Renewal Soon        Renewals within [90▾] days stay             │
│  ☑ PE Firm             PE-owned accounts stay with majority owner  │
│  ☑ Recent Change       Changed within [90▾] days stay              │
│  ☑ Backfill Migration  Accounts migrate to replacement rep         │
├─────────────────────────────────────────────────────────────────────┤
│  SCORING OBJECTIVES — Customer                                       │
│                                                                      │
│  ☑ Continuity     [████████████░░░░] 35%   [▸ Advanced]            │
│  ☑ Geography      [████████████░░░░] 35%   [▸ Advanced]            │
│  ☑ Team Alignment [████████░░░░░░░░] 30%   [▸ Advanced]            │
│                                                                      │
│  SCORING OBJECTIVES — Prospect                                       │
│                                                                      │
│  ☑ Continuity     [██████░░░░░░░░░░] 20%   [▸ Advanced]            │
│  ☑ Geography      [███████████████░] 45%   [▸ Advanced]            │
│  ☑ Team Alignment [███████████░░░░░] 35%   [▸ Advanced]            │
│                                                                      │
│  (Weights auto-normalize to 100% across enabled objectives)         │
├─────────────────────────────────────────────────────────────────────┤
│  BALANCE OPTIMIZATION (relative penalty weights)                     │
│                                                                      │
│  ☑ ARR Balance    [████████████░░░░] 0.5   (all accounts)          │
│  ☑ ATR Balance    [████████░░░░░░░░] 0.3   (customers only)        │
│  ☑ Pipeline       [██████████░░░░░░] 0.4   (prospects only)        │
│                                                                      │
│  Higher penalty = solver tries harder to balance that metric        │
│  1.0 = balance matters as much as assignment quality                │
├─────────────────────────────────────────────────────────────────────┤
│  SOLVER SETTINGS                                                     │
│                                                                      │
│  Timeout: [60] seconds                                              │
│  ☑ Enable tie-breaking (deterministic solutions)                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Success Metrics

After running Pure Optimization, report:

| Metric | Formula | Target |
|--------|---------|--------|
| ARR Variance | CV of ARR across reps | < 10% |
| ATR Variance | CV of ATR across reps | < 15% |
| Pipeline Variance | CV of Pipeline across reps | < 15% |
| Continuity Rate | % accounts same owner | > 75% |
| High-Value Continuity | % of >$500K accounts stayed | > 85% |
| Geo Match Rate | % accounts in exact/sibling region | > 85% |
| Tier Match Rate | % accounts in exact/1-level tier | > 80% |
| Max Overload | Highest rep utilization | < 115% |
| Feasibility Slack | Total capacity overflow | $0 (ideal) |

```typescript
interface AssignmentMetrics {
  // Balance
  arr_variance_percent: number;
  atr_variance_percent: number;
  pipeline_variance_percent: number;
  max_overload_percent: number;
  
  // Continuity
  continuity_rate: number;
  high_value_continuity_rate: number;
  arr_stayed_percent: number;
  
  // Geography
  exact_geo_match_rate: number;
  sibling_geo_match_rate: number;
  cross_region_rate: number;
  
  // Team
  exact_tier_match_rate: number;
  one_level_mismatch_rate: number;
  
  // Feasibility
  feasibility_slack_total: number;
  reps_over_capacity: number;
  
  // Comparison (if both models run)
  waterfall_comparison?: {
    balance_improvement: number;
    continuity_delta: number;
    geo_match_delta: number;
  };
}

function calculateMetrics(
  proposals: AssignmentProposal[],
  reps: SalesRep[],
  originalOwners: Map<string, string>
): AssignmentMetrics {
  // Implementation...
}
```

---

## Rationale Generation

Generate human-readable explanations for each assignment:

```typescript
function generateRationale(
  account: Account,
  assignedRep: SalesRep,
  scores: { continuity: number; geography: number; team: number },
  lockResult: LockResult | null,
  weights: { wC: number; wG: number; wT: number }
): string {
  // Locked accounts
  if (lockResult?.isLocked) {
    switch (lockResult.lockType) {
      case 'backfill_migration':
        return `Migrated to ${assignedRep.name} (backfill replacement)`;
      case 'cre_risk':
        return `Stayed with ${assignedRep.name} (CRE risk - relationship stability)`;
      case 'renewal_soon':
        return `Stayed with ${assignedRep.name} (renewal within 90 days)`;
      case 'pe_firm':
        return `Stayed with ${assignedRep.name} (PE firm alignment)`;
      case 'recent_change':
        return `Stayed with ${assignedRep.name} (recent owner change)`;
    }
  }
  
  // Calculate weighted contributions
  const contributions = [
    { name: 'Continuity', value: scores.continuity * weights.wC, raw: scores.continuity },
    { name: 'Geography', value: scores.geography * weights.wG, raw: scores.geography },
    { name: 'Team Match', value: scores.team * weights.wT, raw: scores.team },
  ].sort((a, b) => b.value - a.value);
  
  const totalScore = contributions.reduce((s, c) => s + c.value, 0);
  const top = contributions[0];
  
  // Generate based on dominant factor
  if (top.name === 'Continuity' && top.raw > 0.7) {
    return `Stayed with ${assignedRep.name} (long-term relationship, score ${totalScore.toFixed(2)})`;
  }
  
  if (top.name === 'Geography' && top.raw >= 1.0) {
    return `Assigned to ${assignedRep.name} (${assignedRep.region} - exact geo match, score ${totalScore.toFixed(2)})`;
  }
  
  if (top.name === 'Geography' && top.raw >= 0.65) {
    return `Assigned to ${assignedRep.name} (${assignedRep.region} - sibling region, score ${totalScore.toFixed(2)})`;
  }
  
  if (top.name === 'Team Match' && top.raw >= 1.0) {
    return `Assigned to ${assignedRep.name} (exact tier match, score ${totalScore.toFixed(2)})`;
  }
  
  // Generic optimized
  return `Optimized to ${assignedRep.name} (${top.name} was primary factor, score ${totalScore.toFixed(2)})`;
}
```

---

## File Structure

```
src/services/optimization/
├── index.ts                      # Public API exports
├── types.ts                      # All TypeScript interfaces
├── pureOptimizationEngine.ts     # Main engine class
├── preprocessing/
│   ├── dataLoader.ts             # Load accounts, reps, opps, mappings
│   ├── parentChildAggregator.ts  # Aggregate children into parent
│   ├── strategicPoolHandler.ts   # Pre-assign strategic accounts
│   └── repEligibilityFilter.ts   # Filter active, assignable reps
├── scoring/
│   ├── continuityScore.ts        # Tenure + stability + value
│   ├── geographyScore.ts         # Region hierarchy + mapping
│   └── teamAlignmentScore.ts     # Tier matching
├── constraints/
│   ├── lpProblemBuilder.ts       # Build HiGHS problem
│   ├── stabilityLocks.ts         # Identify locked accounts
│   └── balanceConstraints.ts     # Deviation constraints
├── solver/
│   ├── highsWrapper.ts           # HiGHS integration
│   └── feasibilityHandler.ts     # Slack variable management
├── postprocessing/
│   ├── childCascader.ts          # Cascade to children
│   ├── rationaleGenerator.ts     # Human-readable explanations
│   └── metricsCalculator.ts      # Success metrics
└── utils/
    ├── weightNormalizer.ts       # Ensure weights sum to 1
    └── arrSource.ts              # ARR field priority helper

src/components/optimization/
├── ModelSelector.tsx             # Waterfall vs Pure Optimization toggle
├── ConstraintToggles.tsx         # Hard constraint and stability toggles
├── ObjectiveWeights.tsx          # Customer/Prospect weight tabs
├── BalanceConfig.tsx             # Balance metric enables and penalties
├── AdvancedParams.tsx            # Collapsible sub-parameters
├── SolverSettings.tsx            # Timeout, tie-breaking
└── MetricsDashboard.tsx          # Post-solve metrics display
```

---

## Implementation Tasks

### Phase 1: Database & Types (Day 1)
- [ ] Create migration: `20241212_add_pure_optimization.sql`
- [ ] Regenerate Supabase types: `npx supabase gen types typescript`
- [ ] Create `src/services/optimization/types.ts` with all interfaces
- [ ] Update CURSOR.mdc with new model info

### Phase 2: Preprocessing (Day 2)
- [ ] Implement `dataLoader.ts` (accounts, reps, opportunities, territory mappings)
- [ ] Implement `parentChildAggregator.ts` (aggregate children, cascade post-solve)
- [ ] Implement `repEligibilityFilter.ts` (is_active, include_in_assignments, is_manager)
- [ ] Implement `strategicPoolHandler.ts` (pre-assign strategic accounts)

### Phase 3: Scoring Functions (Day 3)
- [ ] Implement `continuityScore.ts` with tenure/stability/value/backfill
- [ ] Implement `geographyScore.ts` with region hierarchy
- [ ] Implement `teamAlignmentScore.ts` with unknown handling
- [ ] Implement `weightNormalizer.ts`

### Phase 4: Constraints (Day 4)
- [ ] Implement `stabilityLocks.ts` (all 6 lock types)
- [ ] Implement `lpProblemBuilder.ts` (assignment, capacity, stability, balance)
- [ ] Implement `balanceConstraints.ts` (ARR/ATR/Pipeline deviation)
- [ ] Implement `feasibilityHandler.ts` (slack variables)

### Phase 5: Engine Core (Day 5)
- [ ] Implement `pureOptimizationEngine.ts` main class
- [ ] Implement `highsWrapper.ts` for solver integration
- [ ] Add customer vs prospect mode routing
- [ ] Add timeout handling and progress callbacks

### Phase 6: Post-Processing (Day 6)
- [ ] Implement `childCascader.ts`
- [ ] Implement `rationaleGenerator.ts` with score breakdown
- [ ] Implement `metricsCalculator.ts` (all success metrics)

### Phase 7: UI (Days 7-8)
- [ ] Add `ModelSelector` to FullAssignmentConfig
- [ ] Add `ConstraintToggles` for hard constraints and stability
- [ ] Add `ObjectiveWeights` with customer/prospect tabs and linked sliders
- [ ] Add `BalanceConfig` with relative penalty sliders
- [ ] Add `AdvancedParams` accordion for sub-parameters
- [ ] Add `MetricsDashboard` component

### Phase 8: Integration (Day 9)
- [ ] Modify `useAssignmentEngine.ts` to route based on `optimization_model`
- [ ] Update `AssignmentGenerationDialog.tsx` with LP progress stages
- [ ] Transform LP results to existing `AssignmentResult` interface
- [ ] Add model comparison view (optional)

### Phase 9: Testing (Day 10)
- [ ] Unit tests for each scoring function
- [ ] Integration test: waterfall vs LP on same data
- [ ] Performance test with 5000+ accounts
- [ ] Edge case tests: infeasibility, missing data, empty pools

### Phase 10: Documentation
- [ ] Update CHANGELOG.md with feature entry
- [ ] Add weight tuning guidelines to docs/core/
- [ ] Document expected metrics targets for QA

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Balance penalty scale mismatch | Use relative penalties (deviation/target), not per-dollar |
| Customer vs prospect confusion | Explicit mode parameter, separate weight columns |
| Parent-child constraint explosion | Aggregate pre-solve, cascade post-solve (no linking constraints) |
| Orphaned stability locks (no owner) | Pre-filter: only lock if owner is eligible rep |
| Strategic pool exceeds capacity | Pre-solve validation with warning (no caps for strategic) |
| Unknown employee tier | Default score 0.5, log count for data quality |
| Non-deterministic solutions | Rank-based tie-breaker + timeout |
| Slow UI for large problems | Profile problem-building, consider Web Worker |
| Infeasibility (demand > supply) | Feasibility slacks with large penalty, return warnings |
| Backfill target ineligible | Falls through to normal optimization |

---

*Document version: 2.0*
*Last updated: 2024-12-12*
*Related files: simplifiedAssignmentEngine.ts, useAssignmentEngine.ts, priorityRegistry.ts*
