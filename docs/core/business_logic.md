# Business Logic Reference

> **Single Source of Truth** for all business terminology, calculations, and rules in Book Builder.
> 
> 📚 **Code Implementation**: [`src/domain/`](../../book-ops-workbench/src/domain/)

---

## 1. Glossary

### Revenue Metrics

| Term | Full Name | Applies To | Definition |
|------|-----------|------------|------------|
| **ARR** | Annual Recurring Revenue | Customers only | Actual recurring revenue from existing customers. This is real, contracted revenue. |
| **ATR** | Available To Renew | Customers only | Revenue coming up for renewal. Calculated from renewal opportunities only. **Not related to churn risk.** |
| **Pipeline Value** | Prospect Pipeline | Prospects only | Sum of `net_arr` from open opportunities. Potential revenue that hasn't closed yet. |
| **CRE** | Customer Renewal at Risk | Customers only | Accounts flagged as at-risk for churn. This is a **risk indicator**, not a revenue metric. |

### Important Distinctions

- **ARR vs Pipeline**: ARR is actual revenue (customers). Pipeline is potential revenue (prospects). Never mix these.
- **ATR vs CRE**: ATR is about timing (when revenue renews). CRE is about risk (might churn). They are independent.
- **`net_arr` in opportunities**: This is the source field for Pipeline Value. Don't confuse with customer ARR.

### Account Types

| Term | Definition | Identifying Logic |
|------|------------|-------------------|
| **Customer** | Account with existing revenue | `hierarchy_bookings_arr_converted > 0` OR `arr > 0` OR `calculated_arr > 0` |
| **Prospect** | Account without existing revenue | No positive ARR values |
| **Parent Account** | Top-level account in hierarchy | `is_parent = true` OR no `ultimate_parent_id` |
| **Child Account** | Subsidiary of a parent | Has `ultimate_parent_id` pointing to parent |

### Team Tiers (Employee-Based)

| Tier | Employee Count | Rep Specialization |
|------|----------------|-------------------|
| **SMB** | < 100 employees | Small Business reps |
| **Growth** | 100-499 employees | Growth reps |
| **MM** | 500-1,499 employees | Mid-Market reps |
| **ENT** | 1,500+ employees | Enterprise reps |

### Expansion Tiers (Scoring-Based)

| Tier | Meaning | Used For |
|------|---------|----------|
| **Tier 1** | Highest priority / value | Customers with high expansion potential |
| **Tier 2** | Medium priority | Standard accounts |
| **Tier 3** | Lower priority | Smaller opportunity accounts |
| **Tier 4** | Lowest priority | Minimal expansion potential |

---

## 2. Calculation Rules

### ARR Calculation

**Purpose**: Get the correct ARR value for display and balancing.

**Priority Order**:
1. For **Parent accounts**: `calculated_arr` → `hierarchy_bookings_arr_converted` → `arr` → 0
2. For **Child accounts**: `calculated_arr` → `arr` → 0

**Code**: [`src/domain/calculations.ts#getAccountARR`](../../book-ops-workbench/src/domain/calculations.ts)

```typescript
function getAccountARR(account): number {
  if (account.is_parent) {
    return account.calculated_arr || account.hierarchy_bookings_arr_converted || account.arr || 0;
  }
  return account.calculated_arr || account.arr || 0;
}
```

**Special Case - Split Ownership**:
When a child account has a different owner than its parent, the child's ARR is counted separately for that owner (not rolled into the parent's total for the parent's owner).

---

### ATR Calculation

**Purpose**: Sum of revenue available to renew for a rep's book.

**Rule**: 
```
ATR = SUM(opportunities.available_to_renew) 
      WHERE opportunity_type = 'Renewals'
```

**Priority Order**:
1. `calculated_atr` (pre-computed from DB function)
2. `atr` field (raw import value)
3. 0

**Code**: [`src/domain/calculations.ts#getAccountATR`](../../book-ops-workbench/src/domain/calculations.ts)

**Important Notes**:
- Only includes opportunities where `opportunity_type = 'Renewals'` (case-insensitive)
- ATR is about timing, NOT risk. CRE is the risk metric.
- `calculated_atr` includes hierarchy roll-up for parent accounts

---

### Pipeline Value Calculation

**Purpose**: Total potential revenue from prospect accounts.

**Rule**:
```
Pipeline Value = SUM(opportunities.net_arr)
                 WHERE account.is_customer = false
```

**Fallback**: If `net_arr` is null, use `amount` field.

**Code**: [`src/domain/calculations.ts#getPipelineValue`](../../book-ops-workbench/src/domain/calculations.ts)

---

### Rep Metrics Calculation

**Per-Rep Totals** (for balancing):

| Metric | Formula |
|--------|---------|
| **Total ARR** | Sum of ARR from all parent accounts owned + ARR from split-ownership children |
| **Total ATR** | Sum of `available_to_renew` from renewal opportunities for owned accounts |
| **Pipeline** | Sum of `net_arr` from opportunities for owned prospect accounts |
| **Account Count** | Number of parent accounts owned |

**Code**: [`src/utils/salesRepCalculations.ts`](../../book-ops-workbench/src/utils/salesRepCalculations.ts)

---

### Tier Classification

**Team Tier** (from employee count):
```typescript
function classifyAccountTeamTier(employees: number | null): TeamTier {
  if (employees === null || employees < 100) return 'SMB';
  if (employees < 500) return 'Growth';
  if (employees < 1500) return 'MM';
  return 'ENT';
}
```

**Code**: [`src/domain/tiers.ts`](../../book-ops-workbench/src/domain/tiers.ts)

**Enterprise Classification** (legacy):
An account is "Enterprise" if:
- `enterprise_vs_commercial = 'Enterprise'`, OR
- `employees > enterprise_threshold` (configurable, typically 1500), OR
- `ARR > $100,000`

---

## 3. Geography & Territory Mapping

### Region Hierarchy

```
AMER (Americas)
├── North East (ME, NH, VT, MA, RI, CT, NY, NJ, PA, DE + major cities)
├── South East (MD, DC, VA, NC, SC, GA, FL, TX, etc. + major cities)
├── Central (ND, SD, NE, KS, MO, IA, MN, WI, IL, IN, OH, MI, CO, etc.)
└── West (WA, OR, CA, NV, UT, AZ, AK, HI, NM + major cities)

EMEA (Europe, Middle East, Africa)
├── UK
├── DACH (Germany, Austria, Switzerland)
├── France
├── Nordics
└── Southern Europe

APAC (Asia-Pacific)
├── ANZ (Australia, New Zealand)
├── Japan
├── Southeast Asia
└── India
```

### Territory Mapping Logic

**Priority Order**:
1. **Configured mappings**: Check `assignment_configuration.territory_mappings`
2. **Auto-mapping**: Match territory string against known patterns (states, cities, keywords)
3. **Direct match**: Compare `account.sales_territory` to `rep.region` directly
4. **Owner fallback**: Use current owner's region if no other match

**Code**: [`src/utils/territoryAutoMapping.ts`](../../book-ops-workbench/src/utils/territoryAutoMapping.ts)

**Auto-Mapping Patterns**:
```typescript
// Keywords (highest priority)
'NORTHEAST', 'SOUTHEAST', 'MIDWEST', 'PAC NW' → respective region

// State codes
'CA', 'WA', 'OR' → West
'NY', 'MA', 'PA' → North East
'TX', 'FL', 'GA' → South East

// City names
'SAN FRANCISCO', 'LOS ANGELES' → West
'BOSTON', 'NEW YORK' → North East
```

### Geo Match Score (for optimization)

| Match Type | Score |
|------------|-------|
| Exact match | 1.0 |
| Sibling region (e.g., North East ↔ South East) | 0.65 |
| Same parent region | 0.40 |
| Cross-region (AMER ↔ EMEA) | 0.20 |
| Unknown | 0.50 |

**Code**: [`src/services/optimization/scoring/geographyScore.ts`](../../book-ops-workbench/src/services/optimization/scoring/geographyScore.ts)

---

## 4. Assignment Engine Rules

### Holdover Rules

Accounts that should stay with their current owner:

| Rule | Description |
|------|-------------|
| **Continuity** | Rep has owned account for > X days |
| **Lock** | Account explicitly marked as locked (`exclude_from_reassignment = true`) |
| **Strategic** | Strategic accounts stay with strategic reps |

### Balance Constraints

The optimizer tries to balance these metrics across reps:

| Metric | Target | Variance Allowed |
|--------|--------|-----------------|
| **ARR** | Total ARR / # reps | Configurable (default ±25%) |
| **ATR** | Total ATR / # reps | Configurable |
| **Pipeline** | Total Pipeline / # reps | Configurable |
| **Account Count** | Total accounts / # reps | ±10-15% |
| **Tier Distribution** | Equal Tier 1-4 per rep | Soft constraint |

### Priority System (Waterfall)

Assignments are processed in priority order:
1. **P1**: Protected/Holdover accounts (locked assignments)
2. **P2**: Parent-child alignment (keep families together)
3. **P3**: Strategic pool (strategic accounts → strategic reps)
4. **P4**: Geographic match (territory → region alignment)
5. **P5**: Balance optimization (ARR, ATR, Pipeline fairness)

---

## 5. Data Normalization (Typo Handling)

Imported data often contains typos, variations, and non-standard values. The normalization module handles these automatically.

**Code**: [`src/domain/normalization.ts`](../../book-ops-workbench/src/domain/normalization.ts)

### Region/Territory Normalization

| Raw Import Value | Normalized To | Reason |
|------------------|---------------|--------|
| `Global`, `Worldwide`, `All` | `UNMAPPED` | Requires manual mapping |
| `NYC`, `New York`, `NY` | `North East` | City → Region |
| `California`, `CA`, `SF`, `Bay Area` | `West` | State → Region |
| `Texas`, `TX`, `Dallas`, `Houston` | `South East` | State → Region |
| `Chicago`, `IL`, `Midwest` | `Central` | State → Region |

**Full alias list in code**: `REGION_ALIASES` constant

**Usage**:
```typescript
import { normalizeRegion } from '@/domain';

normalizeRegion('NYC');        // → 'North East'
normalizeRegion('California'); // → 'West'
normalizeRegion('Global');     // → 'UNMAPPED'
```

### PE Firm Normalization

| Raw Import Value | Normalized To |
|------------------|---------------|
| `JMI`, `JMI Equity`, `JMI PE` | `JMI Private Equity` |
| `PSG`, `PSG Equity` | `PSG Private Equity` |
| `TPG`, `TPG Capital Private Equity` | `TPG Capital` |
| `Bregal`, `Bregal Sagemount Private Equity` | `Bregal Sagemount` |
| `LLR`, `LLR Equity` | `LLR Partners` |
| `Vista`, `Vista Equity` | `Vista Equity Partners` |

**Full alias list in code**: `PE_FIRM_ALIASES` constant

**Usage**:
```typescript
import { normalizePEFirm } from '@/domain';

normalizePEFirm('JMI');                    // → 'JMI Private Equity'
normalizePEFirm('tpg capital private equity'); // → 'TPG Capital'
```

### Team Tier Normalization

| Raw Import Value | Normalized To |
|------------------|---------------|
| `smb`, `small`, `small business` | `SMB` |
| `growth`, `grwth` (typo) | `Growth` |
| `mm`, `mid market`, `mid-market` | `MM` |
| `ent`, `enterprise`, `large`, `strategic` | `ENT` |

### Adding New Aliases

When you encounter new typos or variations:

1. Add to the appropriate `*_ALIASES` constant in `src/domain/normalization.ts`
2. Update this document with the new mapping
3. Re-import the data to apply normalization

---

## 6. Data Quality Rules

### Orphaned Data

| Type | Definition | Fix |
|------|------------|-----|
| **Orphaned Account** | Account with `owner_id` not in `sales_reps` table | Reassign to valid rep |
| **Orphaned Opportunity** | Opportunity with `sfdc_account_id` not in `accounts` table | Flag as `is_orphaned = true` |

### Validation Rules

- Parent accounts should not reference themselves as `ultimate_parent_id`
- Child accounts must have valid `ultimate_parent_id` pointing to existing parent
- All accounts in a build should have valid `build_id`

---

## 7. Quick Reference

### Customer vs Prospect
```
Is Customer = (hierarchy_bookings_arr_converted > 0) OR (arr > 0) OR (calculated_arr > 0)
Is Prospect = NOT Is Customer
```

### ATR Source
```
ATR = SUM(available_to_renew) FROM opportunities WHERE opportunity_type = 'Renewals'
```

### Team Tier
```
SMB = employees < 100
Growth = 100 ≤ employees < 500
MM = 500 ≤ employees < 1500
ENT = employees ≥ 1500
```

### Balance Target
```
Target per Rep = Total Metric Value / Number of Active Reps
```

---

## 8. Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-12-12 | Initial creation | AI Assistant |

---

> **Maintainer Note**: When modifying any calculation logic, update this document first, then update the code. The code in `src/domain/` should reference this doc via JSDoc `@see` tags.

