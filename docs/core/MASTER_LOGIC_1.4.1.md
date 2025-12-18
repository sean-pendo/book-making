# Book Builder - Business Logic & System Reference

> **Version**: 1.3.10  
> **Last Updated**: 2025-12-17  
> **Status**: ACTIVE - Audited and consolidated  
> **Purpose**: Single source of truth (SSOT) for all business rules

**Why SSOT?** This document + the `_domain/*.ts` files are the authoritative source for all business logic. No magic numbers scattered across components. When you need to know "how is ARR calculated?" or "what makes an account Enterprise?" - look here first, not in random component files.

---

## Quick Reference

<details>
<summary><strong>📊 Key Formulas (click to expand)</strong></summary>

| Calculation | Formula | Source |
|-------------|---------|--------|
| ARR | `hierarchy_bookings_arr_converted ∥ calculated_arr ∥ arr ∥ 0` | §2.1 |
| ATR | `SUM(opps.available_to_renew) WHERE type='Renewals'` | §2.2 |
| Pipeline | `SUM(opps.net_arr) WHERE is_customer=false OR type='Expansion'` | §2.3 |
| Team Tier | `employees < 100 → SMB, < 500 → Growth, < 1500 → MM, else ENT` | §5.1 |
| Geo Score | `exact=1.0, sibling=0.85, parent=0.65, global=0.40, cross=0.20` | §4.3 |
| Priority Weight | `1.0 / position` (P1=1.0, P2=0.5, P3=0.33, ...) | §10.2.1 |
| Balance Target | `Total Value / Number of Active Reps` (pure average) | §12.1 |
| Balance Max | `MAX(avg × 1.5, largestAccount × 1.2)` | §12.1.1 |

</details>

<details>
<summary><strong>🔢 Key Thresholds (click to expand)</strong></summary>

| Threshold | Value | Purpose |
|-----------|-------|---------|
| Sales Tools ARR | $25,000 | Below this → Sales Tools bucket |
| High Value ARR | $100,000 | Legacy default - threshold for high-value metrics |
| High Value Continuity | $500,000 | Legacy default - threshold for continuity metrics |
| Max ARR per Rep | $2,500,000 | Default capacity cap (configurable) |
| Overload Variance | 20% | Default variance from target before rep is overloaded (configurable) |
| Stability Days | 90 | Renewal soon / recent change window |
| Strategic Variance | 20% | Balance variance for strategic accounts |

</details>

<details>
<summary><strong>📁 File Quick Reference (click to expand)</strong></summary>

| File | Purpose |
|------|---------|
| `calculations.ts` | ARR, ATR, Pipeline formulas |
| `tiers.ts` | Team tier classification |
| `geography.ts` | Region hierarchy, geo scoring |
| `normalization.ts` | Typo handling for imports |
| `constants.ts` | All thresholds and defaults |

</details>

---

## Table of Contents

### Part 1: Core Business Definitions
1. [Glossary & Terminology](#1-glossary--terminology)
2. [Revenue Metrics](#2-revenue-metrics)
3. [Account Classification](#3-account-classification)
4. [Geography & Territories](#4-geography--territories)
5. [Team Tiers](#5-team-tiers)
6. [Data Normalization](#6-data-normalization)

### Part 2: Organizational Structure
7. [Manager Hierarchy](#7-manager-hierarchy)
8. [Backfill & Open Headcount](#8-backfill--open-headcount)

### Part 3: App-Specific Logic
9. [Data Import Flow](#9-data-import-flow)
10. [Assignment Engine](#10-assignment-engine)
11. [Optimization Model](#11-optimization-model)
12. [Balancing & Thresholds](#12-balancing--thresholds)
13. [Analytics & Success Metrics](#13-analytics--success-metrics)

### Appendix
- [Code Locations](#appendix-code-locations)
- [SSOT Workflow](#ssot-workflow)
- [Maintenance Rules](#maintenance-rules)

---

# 🚨 SSOT WORKFLOW - READ THIS FIRST

> **This section explains HOW to use this document. Read before making any changes.**

## The SSOT Flow

**When adding or modifying ANY business logic, follow this exact order:**

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: MASTER_LOGIC.mdc  →  Document the rule/formula FIRST  │
│  STEP 2: _domain/*.ts      →  Implement in the appropriate file │
│  STEP 3: Consumer files    →  Import from @/_domain and use     │
└─────────────────────────────────────────────────────────────────┘
```

**This order is NON-NEGOTIABLE.** Documentation-first prevents logic drift.

## Why Documentation First?

| Problem | Without SSOT | With SSOT |
|---------|--------------|-----------|
| Where's the formula? | Scattered in 5 files | One place: MASTER_LOGIC.mdc |
| What's the threshold? | Magic number `25000` | `SALES_TOOLS_ARR_THRESHOLD` with docs |
| Why this value? | No idea, someone hardcoded it | Documented rationale in §X.X |
| Need to change it? | Hunt through codebase | Update docs → update `_domain/` → done |

## Pre-Implementation Checklist

Before writing ANY business logic code:

- [ ] **Is this business logic?** (calculations, thresholds, classification rules, display conditions)
- [ ] **What section does it belong in?** (Find the right §X.X or create new section)
- [ ] **Did I document it FIRST?** (Add to this file before coding)
- [ ] **Which `_domain/*.ts` file?** (calculations, tiers, geography, constants, normalization)
- [ ] **Added `@see MASTER_LOGIC.mdc §X.X` JSDoc?** (Cross-reference back to docs)

## Example: Adding a New Threshold

**WRONG ORDER (causes drift):**
```
1. ❌ Add `const MAX_ACCOUNTS = 3000` to lpProblemBuilder.ts
2. ❌ Later: "Oh I should document this..."
3. ❌ Docs never get updated, magic number lives forever
```

**CORRECT ORDER (SSOT flow):**
```
1. ✅ Add to MASTER_LOGIC.mdc §11.10:
   "LP_SCALE_LIMITS.MAX_ACCOUNTS_FOR_GLOBAL_LP = 8000"
   
2. ✅ Add to _domain/constants.ts:
   /** @see MASTER_LOGIC.mdc §11.10 */
   export const LP_SCALE_LIMITS = { MAX_ACCOUNTS_FOR_GLOBAL_LP: 8000 }
   
3. ✅ Import in lpProblemBuilder.ts:
   import { LP_SCALE_LIMITS } from '@/_domain';
```

## Changelog Labeling

When following SSOT flow, prefix changelog entries with `SSOT:`:

```markdown
## [2025-12-16] - SSOT: LP Scale Limits

**Changes:**
1. **Updated MASTER_LOGIC.mdc §11.10** - Documented scale limits
2. **Added LP_SCALE_LIMITS to constants.ts** - Implementation
3. **Updated pureOptimizationEngine.ts** - Now imports from @/_domain
```

## What Belongs in This Document

| Category | Examples | Where in Doc |
|----------|----------|--------------|
| **Formulas** | ARR calculation, geo scoring | §2, §4.3, §11.4 |
| **Thresholds** | $25K Sales Tools, 90 days continuity | Quick Reference, §10.8 |
| **Classification rules** | Customer vs Prospect, Team Tiers | §3, §5 |
| **Business rules** | Priority order, stability locks | §10, §11.5 |
| **Display rules** | When to show Sales Tools in analytics | §13 |
| **Solver parameters** | LP penalties, scale limits | §11.3, §11.10 |

## What Does NOT Belong Here

- Implementation details (how React renders something)
- API contracts (Supabase queries)
- UI layout decisions
- Error handling patterns
- Performance optimizations (unless they affect business logic)

---

# Part 1: Core Business Definitions

> 📋 **What's here**: Terminology, revenue formulas, account types, geography, tiers, normalization.  
> These rules exist independently of the app - they're universal business definitions.

---

## 1. Glossary & Terminology

| Term | Full Name | Definition |
|------|-----------|------------|
| **ARR** | Annual Recurring Revenue | Actual contracted revenue from existing customers |
| **ATR** | Available To Renew | Revenue coming up for renewal (timing, NOT risk) |
| **CRE** | Customer Renewal at Risk | Accounts flagged as churn risk (separate from ATR) |
| **Pipeline** | Prospect Pipeline | Potential revenue from open opportunities (not yet closed) |
| **Parent Account** | Ultimate Parent | Top-level account in a corporate hierarchy |
| **Child Account** | Subsidiary | Account that belongs to a parent hierarchy |
| **Split Ownership** | | When a child account has a different owner than its parent |
| **Strategic Account** | | High-value accounts assigned to dedicated Strategic reps. No capacity limits apply. |
| **PE Firm** | Private Equity | Accounts owned by specific PE firms may have special handling rules |
| **Rep** | Sales Representative | Individual contributor who owns accounts |
| **Strategic Rep** | | Reps who only receive strategic accounts; strategic accounts must only be assigned to strategic reps |
| **FLM** | First Line Manager | Direct manager of Reps. Approves Rep book changes. |
| **SLM** | Second Line Manager | Manager of FLMs. Reviews FLM-approved changes. |
| **RevOps** | Revenue Operations | Final approver. Executes assignments to Salesforce. |
| **Backfill Source** | | Rep who is leaving. Accounts need reassignment. |
| **Backfill Target** | | New Rep created to receive accounts from leaving Rep. |
| **Placeholder** | Open Headcount | A slot for a future hire, used for capacity planning. |

### Important Distinctions

- **ARR vs Pipeline**: ARR is real revenue (customers). Pipeline is potential (prospects). Never mix.
- **ATR vs CRE**: ATR = timing (when does revenue renew). CRE = risk (might churn). Independent metrics. Note: ATR is a subset of ARR—specifically, revenue from renewal opportunities.
- **Parent vs Child**: Business relationship, not data hierarchy. A parent can be a customer while child is prospect.
- **Parent-Child Assignment**: Implicit priority to keep parent and child accounts with the same rep to maintain relationship continuity.

---

## 2. Revenue Metrics

**Impl**: `calculations.ts` - `getAccountARR()`, `getAccountATR()`, `calculatePipelineFromOpportunities()`

### 2.1 ARR Calculation

**Rule**: Same priority chain for ALL accounts to prevent double-counting.

**Priority Order**:
1. `hierarchy_bookings_arr_converted` - FIRST (prevents double-counting from children)
2. `calculated_arr` - Fallback with adjustments
3. `arr` - Raw import value, last resort
4. `0` - Default if no data

```typescript
// Same logic for ALL accounts
function getAccountARR(account) {
  return account.hierarchy_bookings_arr_converted || account.calculated_arr || account.arr || 0;
}
```

**Why hierarchy_bookings first?**
- Children share the parent's `hierarchy_bookings_arr_converted` value
- Using `calculated_arr` first could cause double-counting when summing across a hierarchy
- This ensures consistent totals regardless of how accounts are grouped

### 2.2 ATR Calculation

**Impl**: `calculations.ts` - `getAccountATR()`, `isRenewalOpportunity()`, `calculateATRFromOpportunities()`

**Rule**: ATR = SUM of `available_to_renew` from **Renewal opportunities only**

```typescript
ATR = SUM(opportunities.available_to_renew) 
      WHERE opportunity_type = 'Renewals'
```

**Hierarchy Rollup**: 
- For **parent accounts**: ATR = direct ATR + SUM(child ATR)
- Child account ATR rolls up to the parent, similar to how `hierarchy_bookings_arr_converted` works for ARR
- This ensures parent accounts reflect the total ATR of the entire hierarchy
- Implemented in database function `recalculate_account_values_db()`

**Critical**: 
- Only include opportunities where `opportunity_type` (case-insensitive) equals "Renewals"
- Other opportunity types (New Business, Expansion, etc.) do NOT count toward ATR
- ATR is about timing, not risk
- **Constraint**: ATR ≤ ARR (ATR is a subset of existing customer revenue - renewal value cannot exceed total revenue)

### 2.2.1 Net ARR on Renewal Opportunities

**Rule**: Net ARR on Renewal opportunities is **intentionally ignored** for book balancing.

**Why it's ignored:**

| Scenario | Net ARR Value | Why We Ignore It |
|----------|---------------|------------------|
| **Expansion bundled in renewal** | +$69K | Customers are balanced on ATR, not pipeline growth |
| **Contraction/downsell** | -$299K | Risk is already tracked via CRE status |

**Business Rationale (per Nina Maswadeh, 2025-12-18):**
- "When evaluating customers, we only look at ATR. We are not looking at opp Net ARR when assessing who gets what."
- "When looking at prospects, we look at the Net ARR"
- Contraction risk is "caught with CREs" - already factored into `cre_count`

**What each opportunity type contributes:**

| Opportunity Type | ATR Calculation | Pipeline Calculation |
|------------------|-----------------|----------------------|
| **Renewals** | ✅ `available_to_renew` | ❌ Excluded (even if net_arr > 0) |
| **Expansion** | ❌ Not a renewal | ✅ `net_arr` included |
| **New Subscription** | ❌ Not a renewal | ✅ `net_arr` included |

**Key principle:** 
- **Customers** = balanced on ATR (timing of renewals)
- **Prospects** = balanced on Pipeline (potential new revenue)
- **Risk** = tracked via CRE count (separate from revenue metrics)

### 2.3 Pipeline Calculation

**Impl**: `calculations.ts` - `isPipelineOpportunity()`, `getOpportunityPipelineValue()`, `calculatePipelineWithExpansion()`

**Rule**: Pipeline = SUM of `net_arr` from:
1. **All opportunities** from prospect accounts (any opportunity_type)
2. **Expansion + New Subscription** opportunities from customer accounts

```typescript
Pipeline = SUM(opportunities.net_arr)
           WHERE account.is_customer = false
           OR opportunity_type IN ('Expansion', 'New Subscription')
```

| Opportunity Type | Prospect Account | Customer Account |
|-----------------|------------------|------------------|
| Expansion | ✅ Pipeline | ✅ Pipeline |
| New Subscription | ✅ Pipeline | ✅ Pipeline |
| Renewals | ✅ Pipeline | ❌ ATR (not pipeline) |
| (Blanks/Other) | ✅ Pipeline | ❌ Exclude |

**Why include Expansion + New Subscription from customers?** These represent real new revenue pipeline that should be balanced across reps. Renewals on customer accounts are already counted in ATR.

**Fallback**: If `net_arr` is null, use `amount` field.

---

## 3. Account Classification

**Impl**: `calculations.ts` - `isCustomer()`, `isParentCustomer()`, `hasARR()`

### 3.1 Customer vs Prospect

| Type | Definition | Identifying Logic |
|------|------------|-------------------|
| **Customer** | Account with existing revenue | `getAccountARR(account) > 0` |
| **Prospect** | Account without existing revenue | `getAccountARR(account) === 0` |

```typescript
// From _domain/calculations.ts
function isCustomer(account) {
  // First check explicit is_customer field if set
  if (account.is_customer !== undefined) {
    return account.is_customer;
  }
  // Otherwise derive from ARR
  return getAccountARR(account) > 0;
}
```

**Note**: The `isCustomer()` function uses the same ARR priority chain as `getAccountARR()`. This ensures consistent classification.

### 3.1.1 Parent Account Customer Classification

**Impl**: `calculations.ts` - `isParentCustomer()`

A **parent account** is classified as a customer if:
1. **Has direct ARR** (`hierarchy_bookings_arr_converted > 0`), OR
2. **Has customer children** (`has_customer_hierarchy = true`)

```typescript
// From _domain/calculations.ts
function isParentCustomer(account) {
  // Has direct ARR = customer
  if (getAccountARR(account) > 0) return true;
  
  // Has customer children = customer (for grouping purposes)
  if (account.has_customer_hierarchy === true) return true;
  
  return false;
}
```

**Why children matter**: A parent account may have $0 direct ARR but children who are paying customers. For grouping, rollups, and assignment purposes, this parent represents a **customer relationship** because they pay us (through their children).

**Use Cases**:
- **Customer/Prospect grouping**: Parent with customer children should be grouped with customers
- **ARR rollups**: All customer accounts (including parents with customer children) should be included
- **Assignment engine**: Customer parents get different priority handling than prospect parents

**Database Sync**: The `syncIsCustomerField()` function in `batchImportService.ts` uses this logic to set `is_customer` on parent accounts after import.

### 3.2 Parent vs Child

| Type | Definition | Identifying Logic |
|------|------------|-------------------|
| **Parent** | Top of hierarchy | `ultimate_parent_id` is null/empty |
| **Child** | Belongs to parent | `ultimate_parent_id` has a value |

```typescript
function isParentAccount(account) {
  return !account.ultimate_parent_id || account.ultimate_parent_id.trim() === '';
}
```

### 3.3 Split Ownership

When a child account has a **different owner** than its parent:
- The child's ARR is counted separately for the child's owner
- The parent's `hierarchy_bookings_arr_converted` does NOT include this child's ARR
- Both owners have the account in their book for different metrics

---

## 4. Geography & Territories

**Impl**: `geography.ts` - `REGION_HIERARCHY`, `REGION_ANCESTRY`, `calculateGeoMatchScore()`, `autoMapTerritoryToUSRegion()`

> **AI Integration Note**: Geography data is provided to the AI model to help identify territory-to-region relationships and suggest optimal mappings.

### 4.1 Region Hierarchy

**AMER** (Americas - includes Canada)
```
AMER
├── North East (NY, MA, PA, NJ, CT, etc. + Quebec, Ontario)
├── South East (TX, FL, GA, NC, VA, DC, etc.)
├── Central (IL, OH, CO, MN, MI, etc. + Alberta)
└── West (CA, WA, OR, AZ, etc. + British Columbia)

EMEA (Europe, Middle East, Africa)
├── UK (United Kingdom, Ireland)
├── DACH (Germany, Austria, Switzerland)
├── France
├── Nordics (Sweden, Norway, Denmark, Finland)
├── Southern Europe (Spain, Italy, Portugal)
├── Benelux (Netherlands, Belgium, Luxembourg)
├── Middle East
└── Africa

APAC (Asia Pacific)
├── ANZ (Australia, New Zealand)
├── Japan
├── Southeast Asia (Singapore, Malaysia, Thailand, Vietnam, Philippines, Indonesia)
├── India
├── Greater China (China, Hong Kong, Taiwan)
└── Korea
```

### 4.2 Territory-to-Region Mapping

Accounts have a `sales_territory` field with free-text values. We map these to regions:

| Territory Value | Maps To | Rule |
|-----------------|---------|------|
| "California", "CA", "San Francisco" | West | State/city name |
| "NYC", "New York", "Boston" | North East | City name |
| "Texas", "Dallas", "Houston" | South East | State/city name |
| "Chicago", "IL", "Midwest" | Central | State/city/keyword |
| "UK", "London", "Britain" | UK | Country/city name |
| "Global", "Worldwide" | UNMAPPED | Requires manual mapping |

**Priority Order for Matching**:
1. Keywords (most specific) - e.g., "PAC NW" → West
2. Cities - e.g., "San Francisco" → West
3. State codes - e.g., "CA" → West

**EMEA Country Mapping**:

**Impl**: `commercialPriorityHandlers.ts` - `EMEA_COUNTRY_TO_SUBREGION`

| Sub-Region | Countries |
|------------|-----------|
| DACH | DE, AT, CH (Germany, Austria, Switzerland) |
| UKI | GB, UK, IE (United Kingdom, Ireland) |
| Nordics | SE, NO, DK, FI, IS |
| France | FR |
| Benelux | NL, BE, LU |
| Southern Europe | ES, IT, PT |
| Middle East | AE, SA, IL, QA, KW, BH, OM |

### 4.3 Geo Match Scoring (Hierarchy-Based)

**Impl**: `constants.ts` - `GEO_MATCH_SCORES`

Geography matching rewards **specificity**. More specific matches score higher:

```
HIERARCHY (most specific at bottom):
─────────────────────────────────────
Global (can take anything)
├── AMER / EMEA / APAC (Parent Region)
│   ├── North East / UK / ANZ (Sub-Region)
│   │   └── NYC / Boston / etc. (Territory - most specific)
```

| Match Type | Score | Example |
|------------|-------|---------|
| **Exact Match** | 1.00 | Account "North East" → Rep "North East" |
| **Same Sub-Region** | 0.85 | Account "NYC" → Rep "North East" (NYC maps to NE) |
| **Same Parent** | 0.65 | Account "North East" → Rep "AMER" |
| **Global Fallback** | 0.40 | Account "NYC" → Rep "Global" |
| **Cross-Region** | 0.20 | Account "West" → Rep "EMEA" (avoid!) |
| **Unknown** | 0.50 | Can't determine territory |

**Key Principle**: The optimization model should reward specificity. 
- NYC account → NYC rep is ideal (1.0)
- NYC account → North East rep is good (0.85) 
- NYC account → AMER rep is acceptable (0.65)
- NYC account → Global rep is last resort (0.40)
- France account → France rep (exact) → EMEA rep (parent fallback)

---

## 5. Team Tiers

**Impl**: `tiers.ts` - `classifyTeamTier()`, `TEAM_TIER_ORDER`, `getTierDistance()`, `isEnterprise()`, `parseExpansionTier()`, `getAccountExpansionTier()`
**Constants**: `constants.ts` - `TIER_THRESHOLDS`, `HIGH_VALUE_ARR_THRESHOLD`

### 5.1 Team Tier (Employee-Based)

| Tier | Employee Count | Rep Specialization |
|------|----------------|-------------------|
| **SMB** | < 100 employees | Small Business |
| **Growth** | 100-499 employees | Scaling companies |
| **MM** | 500-1,499 employees | Mid-Market |
| **ENT** | 1,500+ employees | Enterprise |
| **(null)** | Unknown/unmapped | No tier assigned |

```typescript
const TIER_THRESHOLDS = {
  SMB_MAX: 99,
  GROWTH_MAX: 499,
  MM_MAX: 1499
};

function classifyTeamTier(employees) {
  // Unknown employees → null (don't force a tier on unmapped fields)
  if (employees == null) return null;
  if (employees <= 99) return 'SMB';
  if (employees <= 499) return 'Growth';
  if (employees <= 1499) return 'MM';
  return 'ENT';
}
```

**Null Handling**: If employee count is unknown, return `null` rather than forcing a tier. Let the consumer decide how to handle unmapped fields.

**⚠️ Data Quality Note**:
- Team tier classification is **only relevant if employee count data is present and accurate**
- If `employees` field is null, 0, or missing → tier is null → team alignment scoring is skipped
- ENT threshold (1500+) was chosen to align with typical enterprise sales org structure
- These thresholds can be adjusted in `TIER_THRESHOLDS` constant if your org uses different breakpoints

### 5.1.1 Team Alignment Scoring with Missing Data

**Rule**: When either account tier OR rep tier is unknown (null), team alignment is **N/A** - not a mismatch.

| Account Tier | Rep Tier | Result | Explanation |
|--------------|----------|--------|-------------|
| SMB | SMB | 1.0 (exact match) | Both known, same tier |
| SMB | Growth | 0.60 (1 level) | Both known, adjacent tiers |
| SMB | null | **N/A** | Rep tier unknown → exclude from scoring |
| null | Growth | **N/A** | Account tier unknown → exclude from scoring |
| null | null | **N/A** | Both unknown → exclude from scoring |

**Implementation**:
- `teamAlignmentScore()` returns `null` (not 0.5) when either tier is unknown
- Aggregation redistributes weights to continuity + geography when team alignment is N/A
- Analytics display "N/A" instead of a percentage for these assignments

**Why N/A instead of penalty?**
- Missing data ≠ bad match. Penalizing unknown tiers would bias assignments toward reps with complete data.
- N/A allows the optimizer to use continuity and geography without artificial handicap.
- Users see "N/A" in analytics, prompting data cleanup rather than hiding the gap.

### 5.2 Expansion Tier (Scoring-Based)

| Tier | Meaning | Used For |
|------|---------|----------|
| **Tier 1** | Highest priority | High expansion potential |
| **Tier 2** | Medium priority | Standard accounts |
| **Tier 3** | Lower priority | Smaller opportunity |
| **Tier 4** | Lowest priority | Minimal potential |

Source fields: `expansion_tier` (customers) or `initial_sale_tier` (prospects)

---

## 6. Data Normalization

**Impl**: `normalization.ts` - `normalizeRegion()`, `normalizePEFirm()`, `normalizeTeamTier()`

Imported data contains typos and variations. These are normalized on import.

### 6.1 Region Aliases

| Raw Import | Normalized To |
|------------|---------------|
| "NYC", "New York", "NY" | North East |
| "California", "CA", "SF" | West |
| "Texas", "TX", "Dallas" | South East |
| "Chicago", "IL", "Midwest" | Central |
| "Global", "Worldwide" | UNMAPPED |

### 6.2 PE Firm Aliases

| Raw Import | Normalized To |
|------------|---------------|
| "JMI", "JMI Equity" | JMI Private Equity |
| "Vista", "Vista Equity" | Vista Equity Partners |
| "TPG", "TPG Capital" | TPG Capital |

### 6.3 Team Tier Aliases

| Raw Import | Normalized To |
|------------|---------------|
| "small", "small business" | SMB |
| "grwth" (typo) | Growth |
| "mid market", "mid-market" | MM |
| "enterprise", "large" | ENT |

---

# Part 2: Organizational Structure

> 👥 **What's here**: Manager roles (Rep/FLM/SLM/RevOps), approval chains, backfill workflows.  
> How the sales org is structured and how changes flow through approvals.

---

## 7. Manager Hierarchy

**Impl**: `utils/approvalChainUtils.ts` - `getApprovalStepsForRegion()`, `getApprovalChainDescription()`

### 7.1 Role Definitions

| Role | Full Name | Description |
|------|-----------|-------------|
| **Rep** | Sales Representative | Individual contributor who owns accounts |
| **FLM** | First Line Manager | Direct manager of Reps. Reviews and approves Rep book changes. |
| **SLM** | Second Line Manager | Manager of FLMs. Reviews FLM-approved changes before RevOps. |
| **RevOps** | Revenue Operations | Final approver. Executes assignments to Salesforce. |

### 7.2 Hierarchy Structure

```
RevOps (Final Authority)
└── SLM (Second Line Manager)
    └── FLM (First Line Manager)
        └── Rep (Account Owner)
```

**Data Fields**:
- `sales_reps.flm` → First Line Manager name
- `sales_reps.slm` → Second Line Manager name
- `sales_reps.manager` → Legacy field (prefer FLM/SLM)

### 7.3 Approval Chain

When a Rep's book is modified, changes flow through an approval chain:

**Standard Flow (AMER, Global)**:
```
Rep Book → FLM Approval → SLM Approval → RevOps Approval → Approved
```

**EMEA Flow** (no SLMs in EMEA structure):
```
Rep Book → FLM Approval → RevOps Approval → Approved
```

**Status Values**:
| Status | Meaning |
|--------|---------|
| `pending_flm` | Awaiting FLM approval |
| `pending_slm` | Awaiting SLM approval |
| `pending_revops` | Awaiting RevOps final approval |
| `approved` | Fully approved, ready to execute |
| `rejected` | Rejected at any level |

### 7.4 Portfolio Views

Dashboards group accounts by manager hierarchy:
- **FLM View**: All accounts owned by Reps under a specific FLM
- **SLM View**: All accounts owned by Reps under all FLMs reporting to an SLM
- Metrics (ARR, ATR, account count, tier distribution) roll up through hierarchy

---

## 8. Backfill & Open Headcount

### 8.1 Terminology

| Term | Definition |
|------|------------|
| **Backfill Source** | A Rep who is leaving. ALL accounts/prospects are removed from this rep and need reassignment. |
| **Backfill Target** | A Rep designated to receive accounts from the leaving Rep. Can be a new Rep or an existing Rep. |
| **Placeholder** | An open headcount slot (no actual person yet). Used for planning. |
| **Open Headcount** | Same as Placeholder - a slot for a future hire. |

> **Backfill Priority**: When the backfill target is a different (existing) rep rather than a new hire, they receive lower continuity priority than same-rep continuity. This is because the relationship is still changing, even if to a known target.

### 8.2 Data Fields

**Sales Reps Flags**:

| Field | Table | Purpose |
|-------|-------|---------|
| `is_active` | `sales_reps` | TRUE = Rep can receive new assignments |
| `include_in_assignments` | `sales_reps` | TRUE = Rep participates in assignment engine |
| `is_strategic_rep` | `sales_reps` | TRUE = Handles strategic accounts only |
| `is_manager` | `sales_reps` | TRUE = FLM/SLM role, may not carry accounts |
| `is_renewal_specialist` | `sales_reps` | DEPRECATED - Removed in v1.3.9 |
| `is_backfill_source` | `sales_reps` | TRUE = Rep is leaving, excluded from assignments |
| `is_backfill_target` | `sales_reps` | TRUE = Rep was created as backfill for leaving Rep |
| `backfill_target_rep_id` | `sales_reps` | Links leaving Rep to their backfill Rep |
| `is_placeholder` | `sales_reps` | TRUE = Open headcount (no actual person) |

**Account Flags**:

| Field | Table | Purpose |
|-------|-------|---------|
| `is_customer` | `accounts` | TRUE = Has revenue (ARR > 0) |
| `is_parent` | `accounts` | TRUE = Top of hierarchy (no ultimate_parent_id) |
| `is_strategic` | `accounts` | TRUE = Strategic account, goes to strategic reps only |
| `exclude_from_reassignment` | `accounts` | TRUE = Manual lock, stays with current owner |
| `has_customer_hierarchy` | `accounts` | TRUE = Has child accounts |
| `has_split_ownership` | `accounts` | TRUE = Children have different owners than parent |

### 8.3 Backfill Workflow

1. **Mark Rep as Leaving**: Set `is_backfill_source = true`
   - Automatically sets `include_in_assignments = false`
   - Rep's accounts become available for reassignment

2. **Create Backfill Rep**: System auto-generates a backfill target
   - New Rep with `is_backfill_target = true`
   - Linked via `backfill_target_rep_id`

3. **Assignment Engine Behavior**:
   - Backfill source Reps get continuity score = 0 (relationship ending)
   - Accounts from leaving Reps can be migrated to their backfill target
   - Stability lock: `backfill_migration` routes accounts to target Rep

### 8.4 Placeholder/Open Headcount

When importing Reps CSV:
- If `rep_id` is blank but `name` is provided → auto-generates placeholder ID
- Sets `is_placeholder = true`
- Used for capacity planning ("what if we hire 2 more reps?")

---

# Part 3: App-Specific Logic

> ⚙️ **What's here**: Data import, assignment engine, LP optimization model, balancing thresholds.  
> How the Book Builder application implements the business rules above.

---

## 9. Data Import Flow

### 9.1 Import Pipeline

```
CSV File → Parse → Validate → Normalize → Insert to Supabase
```

### 9.2 Import Tables

| Data Type | Table | Key Fields |
|-----------|-------|------------|
| Accounts | `accounts` | `sfdc_account_id`, `build_id` |
| Sales Reps | `sales_reps` | `rep_id`, `build_id` |
| Opportunities | `opportunities` | `sfdc_opportunity_id`, `build_id` |

### 9.3 Batch Sizes

**Impl**: `constants.ts` - `BATCH_SIZES`, `SUPABASE_LIMITS`

Database operations use batching to avoid timeouts:

| Operation | Batch Size | Reason |
|-----------|------------|--------|
| Import | 500 | Supabase request size limits |
| Update | 100 | Smaller batches for safety |
| Delete | 1000 | Faster cleanup |

**Supabase Limits**:
- Default page size: 1000 rows (use `.range()` for more)
- Max rows per insert: 500

```typescript
// From constants.ts
const BATCH_SIZES = { IMPORT: 500, UPDATE: 100, DELETE: 1000 };
const SUPABASE_LIMITS = { DEFAULT_PAGE_SIZE: 1000, MAX_ROWS_PER_INSERT: 500 };
```

### 9.4 Post-Import Calculations

After import, database functions compute:
- `calculated_arr`: ARR with opportunity adjustments
- `calculated_atr`: ATR rolled up from opportunities
- `is_parent`: Based on `ultimate_parent_id`
- `child_count`: Number of child accounts

### 9.5 Auto-Mapping System

**Impl**: `autoMapFields()` in autoMappingUtils.ts

The import system automatically maps CSV headers to database fields using a multi-tier matching strategy:

| Match Type | Priority | Confidence | Example |
|------------|----------|------------|---------|
| **Exact** | 1st | 1.0 | "Account Name" → `account_name` |
| **Alias** | 2nd | 0.9 | "Company Name" → `account_name` |
| **Pattern** | 3rd | 0.8 | "Acct_Nm" → `account_name` (regex match) |
| **Fuzzy** | 4th | 0.6+ | "Accnt Name" → `account_name` (string similarity) |

#### Field Alias Tables

**Accounts** (key mappings):

| Schema Field | Common Aliases |
|--------------|----------------|
| `sfdc_account_id` | Account ID (18), Account_ID, AccountID, SFDC_Account_ID |
| `account_name` | Account Name, Company Name, organization |
| `owner_id` | Account Owner User ID, Owner_ID, Sales_Rep_ID |
| `owner_name` | Account Owner: Full Name, Sales_Rep, account_manager |
| `hierarchy_bookings_arr_converted` | Hierarchy Bookings ARR, Hierarchy ARR |
| `employees` | ROE Employee Count, Employee_Count, headcount |
| `sales_territory` | ROE Sales Territory, Territory, Territory_Code |
| `pe_firm` | Related Partner Account: Related Partner Account Name, PE Firm, Private_Equity_Firm |
| `ultimate_parent_id` | Financial Ultimate Parent: Account ID (18), Parent_ID |

**Sales Reps** (key mappings):

| Schema Field | Common Aliases |
|--------------|----------------|
| `rep_id` | Rep_ID, Sales_Rep_ID, Employee_ID, SFDC_ID |
| `name` | Rep Name, Full_Name, Sales_Rep_Name |
| `email` | Email, Rep_Email, Work_Email |
| `region` | Region, Sales_Region, Territory |
| `team` | Team, Sales_Team, Team_Name (SMB/Growth/MM/ENT) |
| `slm_name` | SLM, SLM_Name, Second_Line_Manager |
| `flm_name` | FLM, FLM_Name, First_Line_Manager |
| `is_backfill_source` | Backfill_Source, Is_Leaving |
| `backfill_target_rep_id` | Backfill_Target, Target_Rep_ID |

**Opportunities** (key mappings):

| Schema Field | Common Aliases |
|--------------|----------------|
| `sfdc_opportunity_id` | Opportunity_ID, Opp_ID |
| `sfdc_account_id` | Account_ID, Related_Account_ID |
| `opportunity_type` | Opportunity Type, Opp_Type |
| `available_to_renew` | Available to Renew (converted), ATR |
| `net_arr` | Net ARR (converted), Net_ARR, NARR |
| `cre_status` | CRE_Status, Customer_Risk, renewal_risk |

> **Full alias lists**: See `ACCOUNT_FIELD_ALIASES`, `SALES_REP_FIELD_ALIASES`, `OPPORTUNITY_FIELD_ALIASES` in `utils/autoMappingUtils.ts`

---

## 10. Assignment Engine

**Impl**: `simplifiedAssignmentEngine.ts`, `config/priorityRegistry.ts`

> **TL;DR**: Assignments run through priority levels P0→P7. P0-P2 are "holdover" (locked). P3-P7 are "optimization" (LP solver decides). Priorities are customizable per mode (COMMERCIAL, ENT, EMEA, APAC).

### 10.1 Priority Waterfall (Customizable)

> ⚠️ **Priorities are customizable.** The order below is the default. Users can reorder, enable/disable priorities via the UI. Config is stored in `assignment_configuration.priority_config`.

> **Mode-Based Defaults**: Priority order defaults based on detected book type (ENT, COMMERCIAL, EMEA, APAC). See §10.3 for mode-specific configurations.

Assignments are processed in priority order. Each level runs before the next:

| Priority | ID | Name | Type | Description |
|----------|-----|------|------|-------------|
| **P0** | `manual_holdover` | Manual Holdover | Holdover | Locked accounts stay put, strategic → strategic reps |
| **P1** | `sales_tools_bucket` | Sales Tools Bucket | Holdover | Low-ARR customers (<$25K) → Sales Tools |
| **P2** | `stability_accounts` | Stability Accounts | Holdover | CRE risk, renewal soon, PE firm, recent change |
| **P3** | `team_alignment` | Team Alignment | Optimization | Match account tier to rep tier |
| **P4** | `geo_and_continuity` | Geo + Continuity | Optimization | Current owner if geography matches |
| **P5** | `continuity` | Continuity | Optimization | Prefer current owner |
| **P6** | `geography` | Geography | Optimization | Match territory to region |
| **P7** | `arr_balance` | Residual | Optimization | Balance remaining accounts |

### 10.2 Priority Types

- **Holdover**: Account is LOCKED to current owner. Runs before optimization.
- **Optimization**: Account is available for reassignment. LP solver decides using weighted scoring.

### 10.2.1 Priority Weighting in LP Solver

> **Higher priorities (lower position numbers) = higher weights in the LP objective function.**

When the LP solver runs, it combines multiple factors into a single score for each account-rep pair. The weight of each factor is **derived from its priority position** in the user's configuration.

**SSOT**:
- Formula: `_domain/constants.ts` → `calculatePriorityWeight(position)`
- Implementation: `optimization/utils/weightNormalizer.ts` → `deriveWeightsFromPriorityConfig()`

**Weight Derivation Formula**:
```
raw_weight = 1 / (position + 1)    // Positions are 0-indexed
normalized_weight = raw_weight / sum(all_raw_weights)
```

**Special Case**: `geo_and_continuity` contributes 50% of its weight to both geography and continuity.

| Position | Raw Weight | Description |
|----------|------------|-------------|
| P0 | 1.0 / 1 = **1.00** | Highest priority |
| P3 | 1.0 / 4 = **0.25** | Team alignment (example) |
| P5 | 1.0 / 6 = **0.17** | Continuity (example) |
| P6 | 1.0 / 7 = **0.14** | Geography (example) |

**Example Configuration** (user sets P3=team, P5=continuity, P6=geography):
```
Raw:   team=0.25, continuity=0.17, geography=0.14 → total=0.56
Final: team=45%, continuity=30%, geography=25%
```
Result: Team alignment has highest influence, continuity beats geography.

**LP Objective Coefficient**:
```
coefficient = wC × continuityScore + wG × geoScore + wT × teamScore + tieBreaker
```

**Default Weights** (when priority_config is empty): `wC=0.35, wG=0.35, wT=0.30`

**Code Locations**:
| File | Purpose |
|------|---------|
| `_domain/constants.ts` | `calculatePriorityWeight()` formula |
| `optimization/utils/weightNormalizer.ts` | `deriveWeightsFromPriorityConfig()` implementation |
| `optimization/constraints/lpProblemBuilder.ts` | Applies derived weights in LP objective (line ~162) |

### 10.2.2 Waterfall Execution

Holdover priorities (P0-P2) execute sequentially before optimization:
1. Manual holdovers lock accounts
2. Sales Tools bucket routes low-ARR accounts
3. Stability accounts lock at-risk accounts

Then the LP solver runs with all remaining accounts, using priority-weighted scoring.

### 10.3 Preset Configurations by Mode

**Impl**: `modeDetectionService.ts`

Different sales motions use different priority orders:

| Mode | Description | Key Differences |
|------|-------------|-----------------|
| **COMMERCIAL** | Standard B2B sales | Includes Sales Tools bucket, team alignment |
| **ENT** | Enterprise accounts | No Sales Tools, strategic-focused |
| **EMEA** | European motion | Sub-region routing (DACH, UKI, Nordics, etc.) |
| **APAC** | Asia-Pacific | Similar to EMEA |

**Auto-Detection Logic**:
The system auto-detects mode based on build data:

| Signal | Detected Mode | Confidence |
|--------|---------------|------------|
| Build region = APAC | APAC | High |
| Build region = EMEA | EMEA | High |
| Has team alignment data (employees + rep tiers) | COMMERCIAL | High |
| Has Renewal Specialists OR PE accounts | COMMERCIAL | Medium |
| Default (AMER/GLOBAL, no RS/PE data) | ENT | High |

### 10.4 Sales Tools Routing (Commercial Mode)

> **DEPRECATED**: Renewal Specialist concept has been removed. Commercial accounts <$25k now route to Sales Tools bucket.

**Impl**: `commercialPriorityHandlers.ts`

In Commercial mode, low-ARR customer accounts are routed to the Sales Tools bucket:

| Condition | Routing | Rationale |
|-----------|---------|-----------|
| ARR < $25,000 | Route to Sales Tools | Free up AE capacity for higher-value accounts |
| ARR ≥ $25,000 | Keep with AE | Accounts above threshold get dedicated rep attention |

**Default Priority Order by Mode**:

```
COMMERCIAL:  P0 → P1 → P2 → P3 → P4 → P5 → P6 → P7
             (holdover) (sales) (stab) (team) (geo+cont) (cont) (geo) (residual)

ENT:         P0 → P1 → P2 → P3 → P4 → P5
             (holdover) (stab) (geo+cont) (cont) (geo) (residual)
             [No sales_tools_bucket, no team_alignment]

EMEA/APAC:   P0 → P1 → P2 → P3 → P4 → P5 → P6
             (holdover) (stab) (geo+cont) (cont) (geo) (team) (residual)
             [Team alignment after geography]
```

### 10.5 Priority Conditions (Detailed)

#### P0: Manual Holdover (Locked)
**Condition**: `exclude_from_reassignment = true` OR `is_strategic = true`
**Effect**: Account stays with current owner. Cannot be disabled.

#### P1: Sales Tools Bucket (COMMERCIAL only)
**Condition**: `hierarchy_bookings_arr_converted < $25,000` AND `is_customer = true`
**Effect**: Routes to Sales Tools team (no SLM/FLM hierarchy)

#### P2: Stability Accounts (Sub-conditions)
Each sub-condition can be enabled/disabled independently:

| Sub-condition | ID | Condition | Default |
|---------------|-----|-----------|---------|
| CRE Risk | `cre_risk` | `cre_risk = true` | Enabled |
| Renewal Soon | `renewal_soon` | `renewal_date` within 90 days | Enabled |
| PE Firm | `pe_firm` | `pe_firm IS NOT NULL` | Enabled |
| Recent Change | `recent_owner_change` | `owner_change_date` within 90 days | Enabled |

**renewal_date Aggregation**:

The `renewal_date` field on accounts is automatically populated from opportunities during import:

| Field | Scope | Source | Purpose |
|-------|-------|--------|---------|
| `renewal_quarter` | Parent accounts only | Rolled up from hierarchy | Reporting (e.g., "Q4-FY27") |
| `renewal_date` | All accounts (parent + child) | Individual earliest `renewal_event_date` | Stability check |

**Rules**:
- Takes the **earliest (soonest)** `renewal_event_date` from the account's opportunities
- Opportunity data **always overwrites** any CSV-imported `renewal_date`
- If an account has no opportunities, it keeps its CSV-imported value or remains null
- Days until renewal is calculated at **runtime**: `renewal_date - today`

**Impl**: `batchImportService.ts` - `syncRenewalQuarterFromOpportunities()`

#### P3: Team Alignment
**Condition**: Account tier matches rep tier
**Penalty System**:
- Exact match (ENT→ENT): No penalty
- 1-level mismatch (ENT→MM): γ penalty (100)
- 2+ level mismatch (ENT→SMB): ε penalty (1000)

#### P4-P6: Optimization Priorities
These become **weights in the LP objective function**, not hard constraints:
- **Geo + Continuity**: Score = geo_score × continuity_score
- **Continuity**: Score = tenure + stability + value weight
- **Geography**: Score = region match level

#### P7: Residual Optimization (Locked)
**Condition**: All remaining unassigned accounts
**Effect**: Multi-metric balancing (ARR, ATR, tier). Cannot be disabled.

### 10.6 Strategic Accounts (P0)

Strategic accounts are handled separately from normal accounts:

| Rule | Description |
|------|-------------|
| **Separate Pool** | Strategic accounts only go to strategic reps (`is_strategic_rep = true`) |
| **No Capacity Limits** | Strategic reps are not subject to ARR/account capacity constraints |
| **Balanced Distribution** | Accounts distributed evenly by ARR across strategic reps |
| **Continuity First** | If current owner is strategic rep, account stays |

**Data Fields**:
- `accounts.is_strategic` → TRUE = strategic account
- `sales_reps.is_strategic_rep` → TRUE = strategic rep

### 10.7 PE Firm Accounts (P2)

| Rule | Description |
|------|-------------|
| **Stability Lock** | PE accounts stay with current owner (relationship continuity) |
| **PE Firm Normalization** | Typos normalized on import (see Section 6.2) |

**Data Fields**:
- `accounts.pe_firm` → PE firm name (normalized)

### 10.8 Key Constants

| Constant | Value | Source | Purpose |
|----------|-------|--------|---------|
| `DEFAULT_CONTINUITY_DAYS` | 90 | constants.ts | Days for stability protection |
| `SALES_TOOLS_ARR_THRESHOLD` | $25,000 | constants.ts | Customer accounts under this → Sales Tools bucket |
| `HIGH_VALUE_ARR_THRESHOLD` | $100,000 | constants.ts | Legacy default - for high-value metrics only (does NOT override tier) |
| `DEFAULT_MAX_ARR_PER_REP` | $2,500,000 | constants.ts | Default maximum ARR a single rep should manage |
| `DEFAULT_OVERLOAD_VARIANCE` | 20% | constants.ts | Variance from target before rep is overloaded (configurable) |
| `STRATEGIC_VARIANCE` | 20% | optimizationSolver.ts | Variance band for strategic account balancing |
| `HIGH_VALUE_THRESHOLD` | $500,000 | metricsCalculator.ts | Legacy default - threshold for continuity metrics |

> **Important**: Team tier is determined by employee count only (see §5.1). High ARR does NOT override the employee-based tier classification.

---

## 11. Optimization Model

> **TL;DR**: Uses HiGHS LP solver. Maximizes `score = continuity + geography + team_alignment` while penalizing imbalance. Three-tier penalty system (α=0.01, β=1.0, BigM=1000) keeps reps balanced. Locked accounts are hard constraints; everything else is optimized.

### 11.1 Model Formulations: Waterfall vs Relaxed

The app supports two assignment models:

| Model | Description | When to Use |
|-------|-------------|-------------|
| **Waterfall** | Cascading priority levels (P0→P7). Each level locks accounts before next level runs. | When priority order is strict (strategic → stability → optimization) |
| **Relaxed** | Single global LP solve with weighted objectives. All factors considered simultaneously. | When seeking globally optimal balance |

**Waterfall Formulation**:
```
For each priority P0 through P7:
  1. Identify accounts matching priority criteria
  2. Assign accounts (lock them to selected rep)
  3. Remove assigned accounts from pool
  4. Continue to next priority
```

**Relaxed Formulation**:
```
Maximize: Σ (score_ij × x_ij) - Penalties

Where:
- x_ij = binary decision variable (account i → rep j)
- score_ij = continuity + geography + team_alignment
- Penalties = balance deviation penalties
```

**Why Both Matter**:
- **Waterfall**: Guarantees priority order is respected (strategic accounts ALWAYS go first)
- **Relaxed**: May find better global balance but could assign lower-priority factors first

### 11.2 Solver & Full LP Formulation

**Impl**: `lpProblemBuilder.ts`, `highsWrapper.ts`

The app uses **HiGHS** (open-source LP solver) for account assignment.

#### Complete LP Problem

```
MAXIMIZE:
  Σᵢⱼ (score_ij × x_ij)                     // Assignment scores
  - Σⱼ (α_penalty × α_over_j + α_penalty × α_under_j)    // Alpha penalties
  - Σⱼ (β_penalty × β_over_j + β_penalty × β_under_j)    // Beta penalties
  - Σⱼ (BigM_penalty × M_over_j + BigM_penalty × M_under_j)  // BigM penalties

SUBJECT TO:

  // 1. ASSIGNMENT CONSTRAINT: Each account assigned to exactly one rep
  ∀i: Σⱼ x_ij = 1

  // 2. STABILITY LOCK: Locked accounts must stay with current owner
  ∀(i,j) where locked: x_ij = 1 (for current owner j)
  ∀(i,k) where locked: x_ik = 0 (for all other reps k ≠ j)

  // 3. BALANCE CONSTRAINT (with 3-tier slack) - SYMMETRIC FOR OVER AND UNDER:
  // This handles both over-allocation AND under-allocation identically via soft penalties.
  // No hard capacity constraint needed - BigM zone penalizes extreme deviations.
  ∀j: Σᵢ (metric_i × x_ij) = target_j + α_over - α_under + β_over - β_under + M_over - M_under

  // 4. PARENT-CHILD CONSTRAINT: Same owner for parent and children
  // This is an implicit priority - the optimizer tries to keep parent/child together
  ∀(parent p, child c): x_pj = x_cj for all j

VARIABLE TYPES:
  x_ij ∈ {0, 1}                    // Binary: assign account i to rep j
  α_over, α_under ≥ 0              // Continuous: variance slack
  β_over, β_under ≥ 0              // Continuous: buffer slack  
  M_over, M_under ≥ 0              // Continuous: violation slack

BOUNDS:
  α_over ≤ prefMax - target        // Can't exceed variance band
  α_under ≤ target - prefMin
  β_over ≤ max - prefMax           // Can't exceed buffer zone
  β_under ≤ prefMin - min
  M_over, M_under: unbounded       // But 1000x penalty makes it prohibitive
```

#### Score Composition

```
score_ij = w_cont × continuity_score(i,j) 
         + w_geo × geography_score(i,j)
         + w_team × team_alignment_score(i,j)

Where weights are normalized to sum to 1.0
```

#### Default Objective Weights

**Impl**: `optimization/types.ts` - `DEFAULT_LP_OBJECTIVES_CUSTOMER`, `DEFAULT_LP_OBJECTIVES_PROSPECT`

| Factor | Customer Weight | Prospect Weight |
|--------|-----------------|-----------------|
| Continuity | 0.35 | 0.20 |
| Geography | 0.35 | 0.45 |
| Team Alignment | 0.30 | 0.35 |

**Why different?**
- **Customers**: Continuity matters more (existing relationship)
- **Prospects**: Geography matters more (rep needs to be local for new business)

#### Default Balance Configuration

**Impl**: `optimization/types.ts` - `DEFAULT_LP_BALANCE_CONFIG`

| Metric | Variance Band | Penalty | BigM Zone Boundary |
|--------|---------------|---------|---------------------|
| ARR | ±10% | 0.5 | $3,000,000 (soft) |
| ATR | ±15% | 0.3 | $750,000 (soft) |
| Pipeline | ±15% | 0.4 | $1,000,000 (soft) |

> **Note**: All limits are soft constraints via the BigM penalty system. Exceeding them incurs a steep penalty but is not mathematically forbidden. This ensures the solver always finds a feasible solution.

### 11.3 Three-Tier Penalty System (Alpha, Beta, BigM) - SYMMETRIC

Balance constraints use a **three-tier penalty system** to handle deviation from targets. This system is **symmetric** - both over-allocation (M+) and under-allocation (M-) are penalized identically.

> **Design Note (December 2025)**: The hard capacity constraint was removed in favor of a fully symmetric Big-M system. Previously, over-allocation was forbidden (hard constraint) while under-allocation was only penalized (soft constraint). Now both directions use the same penalty mechanism, ensuring fair treatment of all deviations.

```
actual_value = target + α_over - α_under + β_over - β_under + BigM_over - BigM_under
```

| Zone | Variable | Penalty Weight | Description |
|------|----------|----------------|-------------|
| **Alpha (α)** | Within variance band | 0.01 | Small penalty - expected/acceptable deviation |
| **Beta (β)** | Buffer zone | 0.1 | Medium penalty - undesirable but not catastrophic |
| **BigM** | Beyond absolute limits | 100.0 | Huge penalty - prevents any violation |

> **Big-M Fix (December 2025)**: BigM set to 100.0 to completely dominate assignment scores (0-110 range). Small accounts accumulating can otherwise outweigh penalties. At VERY_HEAVY intensity (25x), BigM penalty reaches 1250.0 per normalized unit, absolutely preventing any limit violation.

**Why Three Tiers?**
- **Alpha**: Allows the solver flexibility within the configured variance band (soft constraint). Penalty scales linearly the further you deviate from target.
- **Beta**: Warns when approaching hard limits, but still feasible. Also uses linear penalty scaling.
- **BigM**: Makes violations expensive → strongly discouraged but not mathematically forbidden (allows solver to find feasible solutions even with locked accounts that push reps over limits)

**Visual Representation**:
```
         ←───── β_under ─────→←── α_under ──→ TARGET ←── α_over ──→←───── β_over ─────→
         |                    |               |               |                    |
       min                 prefMin         target         prefMax                max
    (absolute)           (variance)                      (variance)          (absolute)
```

**Bounds** (all normalized to 0-1 scale):
```typescript
α_over_bound  = variance                      // e.g., 0.10 for 10% variance
α_under_bound = variance
β_over_bound  = 0.5                           // Buffer zone
β_under_bound = 0.5
BigM: unbounded                               // But penalty makes it expensive
```

**Implementation**: `lpProblemBuilder.ts` - `PENALTY` constant and `buildMetricPenaltyTerms()`

> ⚠️ **Critical Implementation Note (December 2025)**: When building the LP problem string, penalty terms MUST be added to `objectiveTerms[]` BEFORE writing the objective line. The objective function should only be assembled AFTER all balance constraint loops have pushed their penalty terms. Writing the objective too early (before penalty terms are added) causes the solver to ignore balance constraints entirely.

### 11.3.1 Balance Intensity Configuration

**Impl**: `constants.ts` - `BALANCE_INTENSITY_PRESETS`, `getBalancePenaltyMultiplier()`

**DB Column**: `assignment_configuration.balance_intensity` (TEXT, default 'NORMAL')

Users can configure how aggressively the optimizer enforces balance constraints via a "Balance Intensity" slider. This controls the trade-off between:
- **Assignment Fit** (continuity, geography, strategic pools, team alignment)
- **Even Distribution** (balanced ARR/ATR/Pipeline/Tier across reps)

Higher values increase balance penalty weights, causing the solver to prioritize even distribution over preserving existing account-rep relationships.

| Intensity | Multiplier | Effect |
|-----------|------------|--------|
| Very Light | 0.1x | Preserves fit; balance rarely overrides other factors |
| Light | 0.5x | Slight preference for balance |
| Normal | 1.0x | Balanced trade-off (default) |
| Heavy | 10.0x | Strong preference for even distribution |
| Very Heavy | 100.0x | Forces even distribution; max limits are hard constraints |

The multiplier is applied to all three penalty tiers (Alpha, Beta, BigM) for:
- ARR balance
- ATR balance (customers only)
- Pipeline balance (prospects only)
- Tier balance (Tier 1-4 distribution)

**Formula**:
```
effective_penalty = LP_PENALTY.{ALPHA|BETA|BIG_M} × metric_weight × intensity_multiplier
```

**Example** (ARR with Heavy intensity):
```
Alpha penalty = 0.01  × 0.50 × 10.0 = 0.05
Beta penalty  = 0.1   × 0.50 × 10.0 = 0.50
BigM penalty  = 100.0 × 0.50 × 10.0 = 500.0
```

**Example** (Pipeline with Very Heavy intensity):
```
BigM penalty = 100.0 × 0.50 × 100.0 = 5000.0 per normalized unit
```
At this level, exceeding max limits by even 1x target costs 5000 penalty points,
completely dominating any assignment scores (~0.1-1.0 per account).

At "Very Heavy" (25x), the BigM penalty becomes **1250.0** - this is 10x larger than any possible assignment score (0-110 range), completely preventing any limit violation. The solver will leave accounts unassigned rather than violate max limits.

**Note**: In waterfall mode, balance intensity only affects ARR penalties. ATR/Pipeline/Tier balance is only available in relaxed_optimization mode.

### 11.4 Scoring Functions

#### Continuity Score (Account-Rep Pair)

```
Score = base + tenure_weight×T + stability_weight×B + value_weight×V
```

| Component | Formula | Description |
|-----------|---------|-------------|
| **T** (Tenure) | `min(days_with_owner / 730, 1.0)` | 2-year cap on tenure value |
| **B** (Stability) | `1 - (owner_count - 1) / (max_owners - 1)` | Fewer owners = higher score |
| **V** (Value) | `min(ARR / $2M, 1.0)` | Higher ARR = more valuable continuity |

> **Data Quality Note**: The `days_with_owner` field is often empty in imported data. When empty, tenure scoring falls back to default behavior.

**Special Cases**:
- Not current owner → 0
- Rep is backfill source (leaving) → 0
- No current owner → 0

**Default Params** (from `optimization/types.ts`):
```typescript
{
  base_continuity: 0.10,
  tenure_weight: 0.35,
  stability_weight: 0.30,
  value_weight: 0.25,
  tenure_max_days: 730,
  stability_max_owners: 5,
  value_threshold: 2_000_000
}
```

#### Geography Score (Account-Rep Pair)

**Impl**: `optimization/scoring/geographyScore.ts`

Uses region hierarchy for scoring:

| Match Type | LP Score | Example |
|------------|----------|---------|
| **Exact Match** | 1.00 | Account "North East" → Rep "North East" |
| **Sibling Region** | 0.65 | Account "NYC" → Rep "Boston" (both in NE) |
| **Same Parent** | 0.40 | Account "North East" → Rep "AMER" |
| **Cross-Region** | 0.20 | Account "West" → Rep "EMEA" |
| **Unknown** | 0.50 | Can't determine territory |

**Note**: `_domain/constants.ts` has slightly different values (`SAME_SUB_REGION: 0.85`, `SAME_PARENT: 0.65`) used for analytics display. The LP solver uses the values above.

**Advanced Geo Mapping**:
The model can boost specificity by mapping city/state to specific regions:
```
Territory "San Francisco" → "West" (auto-map)
Territory "NYC" → "North East" (auto-map)
Territory "Custom District" → Explicit mapping in territory_mappings
```

**Why Specificity Matters**: 
More specific geo mappings → higher exact match rates → better geo scores → better overall assignment quality.

#### Team Alignment Score

**Impl**: `optimization/scoring/teamAlignmentScore.ts`

Scores based on tier distance (discrete values, not linear):

| Distance | Score | Example |
|----------|-------|---------|
| 0 (exact) | 1.00 | ENT account → ENT rep |
| 1 level | 0.60 | ENT account → MM rep |
| 2 levels | 0.25 | ENT account → Growth rep |
| 3 levels | 0.05 | ENT account → SMB rep |
| Unknown | 0.50 | Missing employee count |

**Reaching Down Penalty**: When a higher-tier rep is assigned to a lower-tier account (e.g., ENT rep → SMB account), an additional penalty is applied:
```
penalty = reaching_down_penalty × tier_distance
final_score = max(0, base_score - penalty)
```
Default `reaching_down_penalty = 0.15`. This discourages putting expensive ENT reps on small accounts.

| Tier | Index | Employee Count |
|------|-------|----------------|
| SMB | 0 | < 100 (`TIER_THRESHOLDS.SMB_MAX = 99`) |
| Growth | 1 | 100 - 499 (`TIER_THRESHOLDS.GROWTH_MAX = 499`) |
| MM | 2 | 500 - 1,499 (`TIER_THRESHOLDS.MM_MAX = 1499`) |
| ENT | 3 | 1,500+ |
| (null) | -1 | Unknown - alignment not scored |

**Data Quality Note**: Team tier scoring is only meaningful if employee count data is accurate. If `employees` field is null or 0, tier is null and alignment scoring is skipped.

### 11.5 Account Locking Priorities

**Impl**: `optimization/types.ts` - `DEFAULT_LP_STABILITY_CONFIG`, `constraints/stabilityLocks.ts`

Accounts can be locked to their current owner (or backfill target). Locks are evaluated **in priority order** - first match wins:

| Priority | Lock Type | Condition | Effect |
|----------|-----------|-----------|--------|
| 1 | **Manual Lock** | `exclude_from_reassignment = true` | Stay with current owner |
| 2 | **Backfill Migration** | Owner `is_backfill_source = true` | Migrate to backfill target rep |
| 3 | **CRE Risk** | `cre_risk = true` | Stay with current owner (relationship stability) |
| 4 | **Renewal Soon** | `renewal_date` within 90 days | Stay with current owner |
| 5 | **PE Firm** | `pe_firm` is set | Stay with current owner |
| 6 | **Recent Change** | `owner_change_date` within 90 days | Stay with current owner |

**Stability Config Defaults**:
```typescript
// From optimization/types.ts
const DEFAULT_LP_STABILITY_CONFIG = {
  cre_risk_locked: true,
  renewal_soon_locked: true,
  renewal_soon_days: 90,
  pe_firm_locked: true,
  recent_change_locked: true,
  recent_change_days: 90,
  backfill_migration_enabled: true
};
```

**Important**: Locked accounts become **hard constraints** in the LP. They are not part of the optimization - they are pre-assigned.

### 11.6 LP Objective Weights

**Impl**: `optimization/types.ts` - `LPObjectivesConfig`

The LP solver weighs three scoring factors differently for customers vs prospects:

**Customer Objective Weights** (relationship-focused):
| Factor | Weight | Rationale |
|--------|--------|-----------|
| Continuity | 0.35 | Preserve existing relationships |
| Geography | 0.35 | Regional alignment matters |
| Team Alignment | 0.30 | Match account complexity to rep tier |

**Prospect Objective Weights** (coverage-focused):
| Factor | Weight | Rationale |
|--------|--------|-----------|
| Continuity | 0.20 | Less relationship history |
| Geography | 0.45 | Territory alignment is primary |
| Team Alignment | 0.35 | Fair distribution by potential |

```typescript
// From optimization/types.ts
const DEFAULT_LP_OBJECTIVES_CUSTOMER = {
  continuity_weight: 0.35,
  geography_weight: 0.35,
  team_alignment_weight: 0.30
};

const DEFAULT_LP_OBJECTIVES_PROSPECT = {
  continuity_weight: 0.20,
  geography_weight: 0.45,
  team_alignment_weight: 0.35
};
```

### 11.7 Balance Weights (for Dashboard/Analytics)

These weights are used for **balance calculations** in dashboards, separate from LP scoring:

```typescript
// From _domain/constants.ts
const DEFAULT_OPTIMIZATION_WEIGHTS = {
  CUSTOMER: { ARR: 0.50, ATR: 0.25, TIER: 0.25 },
  PROSPECT: { PIPELINE: 0.50, TIER: 0.50 },
};
```

**Note on Tier Balancing**: Each tier (Tier 1, 2, 3, 4) is balanced individually, not grouped. The TIER weight applies to each tier's distribution separately.

### 11.8 Balance Penalties

**Impl**: `optimization/types.ts` - `LPBalanceConfig`

The solver penalizes imbalance using the three-tier system:

| Metric | LP Variance | Alpha Penalty | Beta Penalty | BigM Penalty |
|--------|-------------|---------------|--------------|--------------|
| ARR | ±10% | 0.01 | 1.0 | 1000.0 |
| ATR | ±15% | 0.01 | 1.0 | 1000.0 |
| Pipeline | ±15% | 0.01 | 1.0 | 1000.0 |
| Tier | ±20% (β only) | - | 1.0 | - |

> **Configuration Note**: Variance bands and maximum values should come from the assignment configuration, not be hardcoded. The values above are defaults that can be overridden per-build.

**Note**: LP variance bands are tighter than dashboard defaults (which use ±25%). This is intentional - the solver aims for tighter balance while dashboards show a wider acceptable range.

**Tier Balance**: Uses β-only penalties (soft approach) since tier counts are harder to balance exactly.

### 11.9 Rationale Generation

The optimization generates human-readable rationales for each assignment:

| Priority Level | Rationale Format |
|----------------|------------------|
| P0 Strategic | `P0: Strategic Account → {rep_name} (strategic rep, ARR-balanced)` |
| P1 Stability Lock | `P1: Stability Lock → {rep_name} ({lock_type})` |
| Optimization | `Optimized: {rep_name} (geo={score}, cont={score}, team={score})` |

**Highest-Scoring Display**: Even in relaxed mode, the rationale shows which factor scored highest for transparency.

### 11.10 Scale Limits (Solver Routing)

**Impl**: `_domain/constants.ts` - `LP_SCALE_LIMITS`, `highsWrapper.ts`, `pureOptimizationEngine.ts`

The solver routing system handles problems of varying sizes:

| Limit | Value | Reason |
|-------|-------|--------|
| **MAX_ACCOUNTS_FOR_GLOBAL_LP** | 8,000 | Cloud Run native HiGHS handles large problems reliably |
| **WARN_ACCOUNTS_THRESHOLD** | 3,000 | Performance warning threshold |

**Why these limits:**
- Each balance constraint (ARR, ATR, Tier 1-4) references ALL accounts
- For N accounts and R reps, constraint matrix has ~N × R × 6 non-zeros
- At 8000 accounts × 48 reps × 6 metrics = ~2.3M non-zeros
- Testing showed Cloud Run native HiGHS handles this (~85s solve time)

**What happens when exceeded:**
```
Account count (10000) exceeds global LP limit (8000). Use waterfall mode for large builds.
```

**Routing behavior:**
- Accounts ≤ 8,000: Cloud Run native HiGHS (reliable, ~85s for 8K accounts)
- Accounts > 8,000: Error returned, UI offers waterfall mode
- Waterfall processes smaller batches per priority level

**Testing**: `solver-tests/test-scale-threshold.html` tests various account counts to find the exact threshold.

### 11.11 Solver Routing Strategy

**Impl**: `highsWrapper.ts` - `solveProblem()`, `solveLPString()`, `_domain/constants.ts` - `SolverMode`

Two solver modes control routing for different use cases:

| Mode | Primary Solver | Fallback Chain | Use Case |
|------|---------------|----------------|----------|
| `browser` | HiGHS WASM | GLPK → Cloud Run | Waterfall sub-priority (fast, small LPs) |
| `cloud` | Cloud Run | None | Global optimization (large LPs, reliability) |

**Routing Logic**:
- `mode='cloud'`: Always use Cloud Run native HiGHS (no fallback)
- `mode='browser'`: WASM → GLPK → Cloud Run (on memory errors)

**Why Two Modes?**
- **Waterfall** solves many small LPs (one per priority level). Browser WASM is fast (~100ms) and avoids network latency.
- **Global Optimization** solves one large LP. Cloud Run native HiGHS is more reliable and can handle larger problems.

**Default Behavior**:
- `solveProblem()` defaults to `mode='cloud'` since global optimization is the primary caller
- `solveLPString()` defaults to `mode='browser'` for backward compatibility with waterfall

**Code Locations**:
| File | Function | Default Mode |
|------|----------|--------------|
| `highsWrapper.ts` | `solveProblem()` | `'cloud'` |
| `highsWrapper.ts` | `solveLPString()` | `'browser'` |
| `pureOptimizationEngine.ts` | Calls `solveProblem()` | Explicit `'cloud'` |
| `simplifiedAssignmentEngine.ts` | Calls `solveLPString()` | Implicit `'browser'` |

---

## 12. Balancing & Thresholds

> **TL;DR**: Target = Total ÷ Reps. Variance bands: ARR/ATR/Pipeline ±25% (dashboard) or ±10-15% (LP solver). Overload = exceeds configured variance (default 20%) from target.

**Impl**: `calculations.ts` - `calculateBalanceTarget()`, `calculateBalanceRange()`
**Constants**: `constants.ts` - `DEFAULT_VARIANCE`, `BATCH_SIZES`, `SUPABASE_LIMITS`

### 12.1 Balance Targets

**Target = Pure Average**: `Total Value / Number of Active Reps`

```typescript
// From calculations.ts
function calculateBalanceTarget(totalValue: number, repCount: number): number {
  if (repCount === 0) return 0;
  return totalValue / repCount;
}
```

### 12.1.1 Auto-Calculate Targets

**Impl**: `FullAssignmentConfig.tsx` → `calculateRecommendedTargets()`

The "Auto-Calculate Targets" button calculates recommended values using this pattern:

| Metric | Target Formula | Max Formula |
|--------|----------------|-------------|
| **Customer ARR** | `totalARR / repCount` | `MAX(target × 1.5, largestAccountARR × 1.2)` |
| **Prospect Pipeline** | `totalPipeline / repCount` | `target × 1.5` |
| **ATR** | `totalATR / repCount` | `MAX(avg × 1.2, largestAccountATR × 1.2)` |
| **CRE Count** | `totalCRE / repCount` | `MAX(avg × 1.2, largestAccountCRE × 1.2)` |
| **Tier 1/2 Count** | `totalTierX / repCount` | `avg × 1.2` |

**Why Max considers largest account**: Ensures every account can be assigned to at least one rep. If max were lower than the largest account's value, that account could never fit within any rep's capacity.

**Why Target is pure average**: Continuity rules keep large accounts with their current owners naturally. The target should reflect the true balanced state, not be inflated by outliers.

### 12.1.2 Waterfall Engine Min/Max Enforcement

**Impl**: `simplifiedAssignmentEngine.ts` - `getCapacityLimit()`, `getMinimumFloor()`, `getMinimumThreshold()`

The waterfall engine enforces configured min/max ARR through LP slack constraints with asymmetric bounds.

**Configuration Fields** (from `assignment_configuration` table):
| Field | Purpose | Fallback |
|-------|---------|----------|
| `customer_min_arr` | Absolute minimum ARR for customer assignments | `target × (1 - variance)` |
| `customer_max_arr` | Absolute maximum ARR for customer assignments | `DEFAULT_MAX_ARR_PER_REP` |
| `prospect_min_arr` | Absolute minimum ARR for prospect assignments | `target × (1 - variance)` |
| `prospect_max_arr` | Absolute maximum ARR for prospect assignments | `DEFAULT_MAX_ARR_PER_REP` |

**Helper Methods**:
```typescript
// Returns configured max or fallback
getCapacityLimit(): number {
  return (assignmentType === 'customer' ? customer_max_arr : prospect_max_arr) 
    || DEFAULT_MAX_ARR_PER_REP;
}

// Returns configured min or calculated threshold
getMinimumFloor(): number {
  return (assignmentType === 'customer' ? customer_min_arr : prospect_min_arr) 
    ?? getMinimumThreshold();  // target × (1 - variance)
}
```

**LP Constraint Zones**:
```
                absoluteMinARR  preferredMinARR   target   preferredMaxARR  absoluteMaxARR
                     │               │              │              │              │
     BigM penalty ◄──┼──► β penalty ◄┼─► α penalty ◄┼─► α penalty ◄┼─► β penalty ◄┼──► BigM penalty
     (under)         │    (under)    │   (under)    │   (over)     │   (over)     │    (over)
```

**Asymmetric Beta Ranges**:
- `betaOverRange = (absoluteMaxARR - preferredMaxARR) / targetARR`
- `betaUnderRange = (preferredMinARR - absoluteMinARR) / targetARR`

**Safety Checks**:
- If `absoluteMinARR >= targetARR`: Log warning, use 0 as floor (prevents infeasible LP)
- If config values are null: Fall back to calculated defaults

### 12.1.3 Capacity Gating & LP Solver Consistency

**Impl**: `simplifiedAssignmentEngine.ts` - `hasCapacity()`, `batchAssignPriority4()`

**Design Principle**: The LP solver runs the **same Big-M formulation** at every priority level. Capacity filtering should be minimal to let the solver make optimal trade-offs.

#### Priority Levels P1-P3: Capacity-Gated Eligibility

Earlier priorities (Geo+Continuity, Geography, Continuity) use `hasCapacity()` to filter eligible reps:

```typescript
// P1-P3: Filter by hard cap only
hasCapacity(repId, accountARR, ...): boolean {
  if (newLoad > capacityLimit) return false;  // Hard cap
  if (workload.cre >= max_cre_per_rep) return false;  // CRE limit
  return true;  // Let LP solver handle Alpha/Beta penalties
}
```

#### Priority Level P4 (RO): No Capacity Filter

The Residual Optimization priority does **NOT** filter by capacity at all. ALL eligible reps are passed to the LP solver:

```typescript
// batchAssignPriority4() - RO
const allEligibleReps = allReps.filter(rep =>
  rep.is_active &&
  rep.include_in_assignments &&
  !rep.is_strategic_rep
  // NO hasCapacity() call - LP solver handles all balance constraints
);

// Every account sees ALL eligible reps
for (const account of accounts) {
  eligibleRepsPerAccount.set(account.sfdc_account_id, allEligibleReps);
}
```

**Why No Capacity Filter for RO?**
- RO is the last priority - we want to assign ALL remaining accounts
- The LP solver's Big-M penalties handle balance: over-allocation gets penalized, not blocked
- The solver can make optimal trade-offs: "assign to over-loaded rep with geo match vs under-loaded rep without"
- Only the Force Assignment fallback runs if the LP solver leaves accounts unassigned (very rare)

#### Zone Handling Summary

| Zone | P1-P3 (hasCapacity) | P4/RO (no filter) | LP Solver |
|------|---------------------|-------------------|-----------|
| Alpha | ✅ eligible | ✅ eligible | α penalty (0.01 × intensity) |
| Beta | ✅ eligible | ✅ eligible | β penalty (0.1 × intensity) |
| Beyond Max | ❌ excluded | ✅ **eligible** | BigM penalty (100.0 × intensity) |

At "Very Heavy" intensity (25x), BigM penalty = 2500.0 per normalized unit. This completely dominates assignment scores (0-110 range), effectively preventing any significant over-allocation while still allowing the solver to make optimal decisions.

### 12.2 Variance Bands

Two systems use different variance bands:

**Dashboard Variance** (`constants.ts` - `DEFAULT_VARIANCE`):
Used for analytics/UI to show acceptable ranges.

| Metric | Variance | Min | Max |
|--------|----------|-----|-----|
| ARR | 25% | Target × 0.75 | Target × 1.25 |
| ATR | 25% | Target × 0.75 | Target × 1.25 |
| Pipeline | 25% | Target × 0.75 | Target × 1.25 |
| Accounts | 15% | Target × 0.85 | Target × 1.15 |
| Tier | 20% | Target × 0.80 | Target × 1.20 |

**LP Solver Variance** (`optimization/types.ts` - `LPBalanceConfig`):
Used by HiGHS solver - intentionally tighter to optimize for balance.

| Metric | Variance | Rationale |
|--------|----------|-----------|
| ARR | 10% | Tighter balance for revenue |
| ATR | 15% | Moderate flexibility for renewals |
| Pipeline | 15% | Moderate flexibility for prospects |

```typescript
// From constants.ts
const DEFAULT_VARIANCE = {
  ARR: 0.25,
  ATR: 0.25,
  PIPELINE: 0.25,
  ACCOUNT_COUNT: 0.15,
  TIER: 0.20,
};
```

> **Configuration Note**: All variance bands and maximum values should come from the assignment configuration step, not be hardcoded. The values above are defaults that can be overridden per-build.

### 12.3 Threshold Overrides

Users can override calculated thresholds in `assignment_configuration`:
- `arr_min_override`, `arr_max_override`
- `atr_min_override`, `atr_max_override`
- `pipeline_min_override`, `pipeline_max_override`

### 12.4 Workload Balance Grades

**Impl**: `utils/workloadBalancing.ts`

The system calculates a composite balance score (0-100) based on ARR, account count, and tier distribution:

| Grade | Score Range | Meaning |
|-------|-------------|---------|
| **Excellent** | 90-100 | Near-perfect distribution |
| **Good** | 75-89 | Acceptable balance |
| **Fair** | 60-74 | Some imbalances detected |
| **Poor** | 40-59 | Significant imbalances |
| **Critical** | 0-39 | Severe imbalances, rebalancing needed |

**Composite Score Formula**:
```
ARR Balance Score    = 100 - (ARR CV × 2)        // CV heavily penalized
Account Balance Score = 100 - (Account CV × 1.5)
Tier Balance Score   = 100 - (Tier CV × 1)

Composite = (ARR × 0.50) + (Account × 0.30) + (Tier × 0.20)
```

Where CV = Coefficient of Variation (std dev / mean × 100)

**Default Workload Config**:
```typescript
{
  arrWeight: 0.50,          // ARR is primary factor
  accountCountWeight: 0.30, // Account distribution secondary
  tierMixWeight: 0.20,      // Tier mix tertiary
  maxARRVariance: 25,       // 25% tolerance
  maxAccountVariance: 15,   // 15% tolerance
}
```

### 12.5 Display Utilities

**Impl**: `calculations.ts` - `formatCurrency()`, `formatCurrencyCompact()`

| Function | Example | Output |
|----------|---------|--------|
| `formatCurrency(1234567)` | Full format | `$1,234,567` |
| `formatCurrencyCompact(1500000)` | Compact | `$1.5M` |
| `formatCurrencyCompact(500000)` | Compact | `$500K` |
| `formatCurrencyCompact(2500000000)` | Compact | `$2.5B` |

---

## 13. Analytics & Success Metrics

**Impl**: `services/optimization/postprocessing/metricsCalculator.ts`, `constants.ts` - `CRE_RISK_THRESHOLDS`, `getCRERiskLevel()`

The app calculates success metrics to measure assignment quality. These are displayed in dashboards.

### 13.1 LP Success Metrics

| Metric | Range | Description |
|--------|-------|-------------|
| **Balance Score** | 0-1 | How evenly ARR/ATR is distributed (MSE-based) |
| **Continuity Score** | 0-1 | % of accounts staying with current owner |
| **Geography Score** | 0-1 | Weighted geo alignment (uses GEO_MATCH_SCORES) |
| **Team Alignment Score** | 0-1 | Account tier matching rep tier |
| **Capacity Utilization** | 0-1+ | Average % of target load per rep |

### 13.2 Balance Score Calculation

> **DEPRECATED**: The MSE-based balance score formula below is deprecated. The app now uses **Coefficient of Variation (CV)** displayed on ARR, ATR, and Pipeline Value charts instead.

```
# DEPRECATED FORMULA - for reference only
BalanceScore = 1 - (MSE / MaxMSE)

Where:
- MSE = Mean Squared Error from target load
- MaxMSE = Theoretical maximum error
- Higher = more balanced
```

**Current Approach**: Each metric chart (ARR, ATR, Pipeline) displays its own CV (standard deviation / mean × 100) for balance assessment.

### 13.3 ARR Distribution Buckets

For histogram visualizations:

| Bucket | Range |
|--------|-------|
| $0-50K | 0 - 50,000 |
| $50K-100K | 50,000 - 100,000 |
| $100K-500K | 100,000 - 500,000 |
| $500K-1M | 500,000 - 1,000,000 |
| $1M+ | 1,000,000+ |

### 13.4 CRE Risk Levels

Customer Renewal risk categorization for dashboard badges:

| Level | CRE Count | Badge Color |
|-------|-----------|-------------|
| None | 0 | Secondary (gray) |
| Low | 1-2 | Outline |
| Medium | 3-5 | Default |
| High | 6+ | Destructive (red) |

```typescript
// From _domain/constants.ts
CRE_RISK_THRESHOLDS = {
  LOW_MAX: 2,    // 1-2 = Low
  MEDIUM_MAX: 5, // 3-5 = Medium
  // 6+ = High
}
```

### 13.5 Balance Threshold Calculator

**Impl**: `services/balanceThresholdCalculator.ts`

Calculates dynamic per-rep targets for additional balance metrics beyond ARR:

| Metric | Calculation | Variance |
|--------|-------------|----------|
| **CRE** | Total CRE count ÷ normal reps | Configurable |
| **ATR** | Total ATR ÷ normal reps | Configurable |
| **Tier 1** | Tier 1 account count ÷ normal reps | Configurable |
| **Tier 2** | Tier 2 account count ÷ normal reps | Configurable |
| **Q1-Q4 Renewals** | Quarterly renewal count ÷ normal reps | renewal_concentration_max |

**Notes**:
- Only **normal reps** (non-strategic, active, with valid region) are included in denominator
- Targets are stored in `assignment_configuration.calculated_thresholds`

### 13.6 Scoring Consistency

**All scoring weights are unified across engine and dashboards:**

| Score Type | Source | Used In |
|------------|--------|---------|
| Geo Match | `_domain/constants.ts` | Engine + Analytics |
| Team Alignment | Section 11.4 formula | Engine + Analytics |
| Continuity | Section 11.4 formula | Engine + Analytics |

The `types/analytics.ts` file imports from `@/_domain` to ensure consistency.

### 13.7 Continuity Eligibility (Analytics Filter)

**Impl**: `calculations.ts` - `getValidRepIdsForContinuity()`, `isEligibleForContinuityTracking()`

**Problem**: Accounts whose past owner isn't in the current reps CSV are counted as "not retained" in the continuity percentage denominator. This artificially deflates the metric since these accounts can never be retained - their owner left the company.

**Solution**: Only include accounts in continuity calculations where the original owner exists in the current sales reps list and is not a backfill source (leaving).

**Eligibility Criteria**:
An account is **eligible for continuity tracking** if:
1. `owner_id` is not null/undefined
2. `owner_id` exists in current `sales_reps` table
3. That rep is NOT a backfill source (`is_backfill_source = false`)

**Formula**:
```
eligible_accounts = accounts WHERE owner_id IN (valid_rep_ids)
valid_rep_ids = reps WHERE is_backfill_source = false

continuity_rate = (eligible_accounts with same owner) / (eligible_accounts) × 100
```

**Example**:
| Scenario | Retained | Total | Continuity % |
|----------|----------|-------|--------------|
| **Without filter (wrong)** | 50 | 100 | **50%** |
| **With filter (correct)** | 50 | 70 | **71%** |

The 30 accounts whose owner left were never going to be retained - excluding them gives the true retention rate.

**Files Using This Filter**:
- `buildDataService.ts` → `calculateContinuityScore()` (dashboard analytics)
- `metricsCalculator.ts` → `calculateMetrics()` (LP post-processing)

**Note**: The LP objective scoring (`continuityScore.ts`) is NOT affected. It already returns 0 for non-owners, and departed owners aren't in the eligible reps list anyway.

### 13.7.1 Continuity Metrics Structure

**Impl**: `types/analytics.ts` - `ContinuityMetrics`, `buildDataService.ts` - `calculateContinuityMetrics()`

For UI display, the continuity calculation returns a full metrics object with counts:

| Field | Formula | Description |
|-------|---------|-------------|
| `score` | `retainedCount / eligibleCount` | 0-1, the percentage |
| `retainedCount` | eligible accounts WHERE `new_owner_id = owner_id` OR `new_owner_id IS NULL` | Accounts staying with same owner |
| `changedCount` | `eligibleCount - retainedCount` | Accounts moving to different owner |
| `eligibleCount` | parent accounts WHERE `owner_id IN valid_rep_ids` | Denominator for score |
| `excludedCount` | `parentAccounts.length - eligibleCount` | Accounts excluded (owner not in reps file) |

**Why excludedCount matters**: Accounts whose original owner isn't in the uploaded reps file cannot be "retained" - there's no one to retain them with. These are excluded from the continuity percentage but shown separately in the UI for transparency.

**TypeScript Interface** (in `types/analytics.ts`):
```typescript
interface ContinuityMetrics {
  score: number;           // 0-1
  retainedCount: number;
  changedCount: number;
  eligibleCount: number;
  excludedCount: number;
}
```

---

# Appendix

## Code Locations

### File → Section Mapping

| File | Key Exports | Doc Section |
|------|-------------|-------------|
| `calculations.ts` | `getAccountARR()`, `getAccountATR()`, `isCustomer()`, `calculateBalanceTarget()`, `getValidRepIdsForContinuity()`, `isEligibleForContinuityTracking()` | §2, §3, §12, §13.7 |
| `tiers.ts` | `classifyTeamTier()`, `TEAM_TIER_ORDER`, `getTierDistance()`, `isEnterprise()` | §5 |
| `geography.ts` | `REGION_HIERARCHY`, `REGION_ANCESTRY`, `calculateGeoMatchScore()`, `autoMapTerritoryToUSRegion()` | §4 |
| `normalization.ts` | `normalizeRegion()`, `normalizePEFirm()`, `normalizeTeamTier()`, `REGION_ALIASES`, `PE_FIRM_ALIASES` | §6 |
| `constants.ts` | `TIER_THRESHOLDS`, `GEO_MATCH_SCORES`, `DEFAULT_VARIANCE`, `BATCH_SIZES`, `DEFAULT_OPTIMIZATION_WEIGHTS` | §4, §5, §9, §11, §12 |

### External Dependencies

| File | Key Exports | Doc Section |
|------|-------------|-------------|
| `utils/approvalChainUtils.ts` | `getApprovalStepsForRegion()` | §7 |
| `utils/autoMappingUtils.ts` | `autoMapFields()`, `ACCOUNT_FIELD_ALIASES`, `SALES_REP_FIELD_ALIASES` | §9.5 |
| `config/priorityRegistry.ts` | `PRIORITY_REGISTRY`, `getDefaultPriorityConfig()` | §10 |
| `services/simplifiedAssignmentEngine.ts` | Priority waterfall execution | §10 |
| `services/optimization/` | LP solver, scoring functions | §11 |

**Import Path**: Always use `@/_domain` (configured in `tsconfig.json`)

---

## Cross-Reference System

Every function/constant in `_domain/*.ts` links back to this doc, and vice versa:

| Direction | Format | Example |
|-----------|--------|---------|
| Code → Doc | `@see MASTER_LOGIC.mdc §X.X` in JSDoc | `@see MASTER_LOGIC.mdc §2.1` |
| Doc → Code | `**Impl**: functionName()` in section | `**Impl**: getAccountARR()` |

> See `_domain/README.md` for the full cross-reference guide.

---

## SSOT Workflow

> **See the full SSOT Workflow section at the top of this document.**

### Quick Reference: The 3-Step Flow

```
1. MASTER_LOGIC.mdc   →   Document the rule/formula FIRST
2. _domain/*.ts       →   Implement in the appropriate file
3. Consumer files     →   Import from @/_domain and use
```

### SSOT Violations to Avoid

| Violation | Example | Fix |
|-----------|---------|-----|
| **Magic numbers** | `if (arr < 25000)` | Use `SALES_TOOLS_ARR_THRESHOLD` |
| **Inline calculations** | `account.calculated_arr \|\| account.arr \|\| 0` | Use `getAccountARR(account)` |
| **Undocumented constants** | `const MAX = 3000` in service | Document in §X.X first |
| **Duplicate logic** | Same formula in 2+ files | Consolidate to `_domain/` |
| **Code before docs** | Implement, then document | Always document FIRST |

### Bug Fixes Follow SSOT Too

Even urgent fixes should:
1. Document the **correct** behavior in this file first
2. Then fix the implementation in `_domain/*.ts`
3. This prevents "fix drift" where code diverges from documentation

---

## Maintenance Rules

1. **Documentation First** - Update this file BEFORE implementing code
2. **Add to `_domain/`** - Never add business logic elsewhere
3. **Add cross-references** - Link code ↔ doc both directions (`@see §X.X`)
4. **Import from `@/_domain`** - All consumers must import, never inline
5. **Label changelog entries** - Use `SSOT:` prefix when following the flow
6. **Version this document** - Update version number when making changes

> See `_domain/README.md` for detailed contribution guidelines.

---

## Appendix: Deprecated Fields

> **Version**: 1.3.9  
> **Last Updated**: 2025-12-16  
> **Purpose**: Document fields that have been deprecated and removed from import processing

The following fields were identified as unused or legacy. They have been removed from CSV import processing but may still exist in the database schema (flagged for future migration).

### Accounts - Deprecated Fields

| Field | Status | Reason |
|-------|--------|--------|
| `initial_sale_score` | REMOVED | Never used in business logic |
| `expansion_score` | REMOVED | Never used in business logic |
| `is_2_0` | REMOVED | Legacy flag, never implemented |
| `in_customer_hierarchy` | REMOVED | Never used (hierarchy derived from `ultimate_parent_id`) |
| `include_in_emea` | REMOVED | Never used |
| `inbound_count` | REMOVED | Never used in business logic |
| `idr_count` | REMOVED | Never used in business logic |
| `ultimate_parent_employee_size` | REMOVED | Never used (tier uses account's `employees` field) |
| `industry` | REMOVED | Display-only field, no business logic |
| `account_type` | REMOVED | Display-only field, no business logic |

### Opportunities - Deprecated Fields

| Field | Status | Reason |
|-------|--------|--------|
| `stage` | REMOVED | Display-only field, no business logic |
| `amount` | REMOVED | Fallback for `net_arr`, rarely needed |
| `close_date` | REMOVED | Display-only field, no business logic |
| `created_date` | REMOVED | Display-only field, no business logic |

**Kept:** `opportunity_name` remains available for import (display value).

### Sales Reps - Deprecated Fields

| Field | Status | Reason |
|-------|--------|--------|
| `manager` | REMOVED | Legacy field - use `flm`/`slm` instead |
| `sub_region` | REMOVED | Never implemented - EMEA uses region field directly |
| `is_renewal_specialist` | REMOVED | Never used in production - RS routing disabled |

### Database Migration Candidates

The following columns exist in the database but are no longer populated via import. They are candidates for removal in a future database migration:

| Table | Column | Notes |
|-------|--------|-------|
| `accounts` | `industry` | Can be dropped |
| `accounts` | `account_type` | Can be dropped |
| `accounts` | `expansion_score` | Can be dropped |
| `accounts` | `initial_sale_score` | Can be dropped |
| `accounts` | `is_2_0` | Can be dropped |
| `accounts` | `in_customer_hierarchy` | Can be dropped |
| `accounts` | `include_in_emea` | Can be dropped |
| `accounts` | `inbound_count` | Can be dropped |
| `accounts` | `idr_count` | Can be dropped |
| `accounts` | `ultimate_parent_employee_size` | Can be dropped |
| `opportunities` | `stage` | Can be dropped |
| `opportunities` | `close_date` | Can be dropped |
| `opportunities` | `created_date` | Can be dropped |
| `sales_reps` | `manager` | Can be dropped (use `flm`/`slm`) |
| `sales_reps` | `sub_region` | Can be dropped |
| `sales_reps` | `is_renewal_specialist` | Can be dropped |

**Note:** `opportunities.amount` is kept as fallback for `net_arr` in the `getOpportunityPipelineValue()` function.

---

## 14. Optimization Telemetry

### 14.1 Purpose

The telemetry system captures comprehensive data about every optimization run, enabling:
- Performance analysis across different configurations
- Historical comparison of model behavior
- AI-assisted parameter tuning
- Debugging and anomaly detection

### 14.2 Model Versioning

The optimization model uses semantic versioning (`MAJOR.MINOR.PATCH`) to track changes:

| Version Component | When to Bump | Examples |
|-------------------|--------------|----------|
| **Major** (X.0.0) | Breaking changes to scoring formula structure | New scoring factor added, constraint type removed |
| **Minor** (0.X.0) | New optional features, significant algorithm changes | New balance metric, solver routing change |
| **Patch** (0.0.X) | Threshold/weight value changes | `LP_PENALTY.ALPHA` change, `DEFAULT_LP_GEOGRAPHY_PARAMS` tweak |

**Current Version:** Defined in `@/_domain/constants.ts` as `OPTIMIZATION_MODEL_VERSION`.

**Version History:** See `docs/core/MODEL_CHANGELOG.md` for detailed version history.

### 14.3 Telemetry Data Model

#### 14.3.1 Run Context
- `build_id`: Links to the build being optimized
- `config_id`: Links to `assignment_configuration` for full config access
- `assignment_type`: 'customer' or 'prospect'
- `engine_type`: 'waterfall' or 'relaxed_optimization'
- `model_version`: Semantic version at time of run

#### 14.3.2 Configuration Snapshot

Stored as JSONB for historical analysis even if config changes:

```json
{
  "objectives": { "wC": 0.35, "wG": 0.35, "wT": 0.30 },
  "balance": { "arr_penalty": 0.5, "atr_penalty": 0.3, "pipeline_penalty": 0.4 },
  "intensity_multiplier": 1.0
}
```

- `balance_intensity`: The intensity preset used (VERY_LIGHT to VERY_HEAVY)
- `priority_config_snapshot`: Priority order at run time

#### 14.3.3 Problem Size Metrics
- `num_accounts`, `num_reps`: Input size
- `num_locked_accounts`, `num_strategic_accounts`: Constraint counts
- `num_variables`, `num_constraints`, `lp_size_kb`: LP-specific (null for waterfall)

#### 14.3.4 Solver Performance
- `solver_type`: 'highs-wasm', 'cloud-run', or 'glpk' (null for waterfall)
- `solver_status`: 'optimal', 'feasible', 'infeasible', 'timeout', 'error', 'complete'
- `solve_time_ms`: Execution time in milliseconds
- `objective_value`: LP objective function value (null for waterfall)

#### 14.3.5 Success Metrics

All metrics stored as percentages (0-100):

| Category | Metrics |
|----------|---------|
| **Balance** | `arr_variance_percent`, `atr_variance_percent`, `pipeline_variance_percent`, `max_overload_percent` |
| **Continuity** | `continuity_rate`, `high_value_continuity_rate`, `arr_stayed_percent` |
| **Geography** | `exact_geo_match_rate`, `sibling_geo_match_rate`, `cross_region_rate` |
| **Team** | `exact_tier_match_rate`, `one_level_mismatch_rate` |
| **Feasibility** | `feasibility_slack_total`, `reps_over_capacity` |

#### 14.3.6 Error Handling
- `warnings`: Array of warning messages from the run
- `error_message`: Detailed error message if failed
- `error_category`: Categorized error type for analysis
  - `data_validation`: Bad input data
  - `solver_timeout`: HiGHS timeout
  - `solver_infeasible`: No solution exists
  - `solver_crash`: WASM memory error
  - `network`: Cloud Run unreachable
  - `unknown`: Uncategorized error

### 14.4 Implementation

**Database Table:** `optimization_runs`

**Telemetry Service:** `src/services/optimization/telemetry/optimizationTelemetry.ts`
- `recordLPOptimizationRun()`: Full metrics from LP engine
- `recordWaterfallRun()`: Simplified metrics from waterfall engine

**Fire-and-Forget Pattern:** Telemetry recording is non-blocking. Failures are logged but never prevent assignment generation.

### 14.5 Usage Guidelines

1. **Always bump `OPTIMIZATION_MODEL_VERSION`** when changing:
   - Scoring functions (`continuityScore`, `geographyScore`, `teamAlignmentScore`)
   - LP penalty values (`LP_PENALTY.*`)
   - Default weights (`DEFAULT_OPTIMIZATION_WEIGHTS`)
   - Constraint formulations in `lpProblemBuilder.ts`

2. **Query patterns** for analysis:
   - Compare versions: `WHERE model_version = '1.0.0' vs '1.1.0'`
   - Compare engines: `WHERE engine_type = 'waterfall' vs 'relaxed_optimization'`
   - Find optimal configs: `ORDER BY continuity_rate DESC WHERE arr_variance_percent < 20`

---

## 15. The Car Loading Analogy: Understanding the Optimization Model

### 15.1 The Problem

**Imagine you're loading 5 cars for a road trip.** Each car has limited trunk space (capacity), and you have 500 suitcases to pack. Each suitcase has:
- A **size** (how much trunk space it uses = ARR)
- A **priority** (how important it is = tier, strategic flag)
- A **preference** (which car it "wants" to be in = current owner, geography)

Your goal: Pack all suitcases into cars while keeping cars balanced and respecting preferences.

### 15.2 Naive Approach: The Waterfall (Loading Blind)

**The waterfall is like loading each suitcase one at a time, without seeing what's left:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  WATERFALL = Loading Suitcases One by One (Greedy/Sequential)               │
│                                                                              │
│  1. Pick up suitcase #1 (highest priority)                                   │
│  2. Find the "best" car for it (preference + has space)                      │
│  3. Put it in that car. Done with suitcase #1.                               │
│  4. Pick up suitcase #2...                                                   │
│  5. Repeat 500 times.                                                        │
│                                                                              │
│  PROBLEM: You can't un-pack. Early decisions lock you in.                    │
│                                                                              │
│  Example:                                                                    │
│    - Suitcase #50 is huge (whale account, $5M ARR)                           │
│    - It belongs in Car A (owner continuity)                                  │
│    - But you already filled Car A with 49 smaller suitcases                  │
│    - Now Car A is at capacity → whale goes to Car B (breaks continuity)      │
│    - Meanwhile Car C is empty → terrible balance                             │
│                                                                              │
│  The waterfall CAN'T see ahead. It makes locally optimal choices that        │
│  become globally suboptimal.                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Waterfall strengths:**
- Fast (O(n) decisions)
- Predictable (rule-based)
- Easy to debug (clear priority cascade)

**Waterfall weaknesses:**
- Can't "save room" for important items
- Balance is accidental, not optimized
- Early priorities can crowd out later ones

### 15.3 Smart Approach: Relaxed Optimization (Seeing Everything First)

**The LP solver is like laying out ALL suitcases on the floor, measuring ALL trunks, then finding the optimal packing:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LP OPTIMIZATION = See Everything, Solve Once (Global Optimum)               │
│                                                                              │
│  1. Lay out ALL 500 suitcases on the floor                                   │
│  2. Measure ALL 5 trunks exactly                                             │
│  3. Calculate a "score" for every possible (suitcase, car) combination:      │
│     - Does this suitcase prefer this car? (continuity)                       │
│     - Is this car in the right location? (geography)                         │
│     - Is this car the right "size class"? (team alignment)                   │
│  4. Define constraints:                                                      │
│     - Each suitcase goes in exactly one car                                  │
│     - Each car shouldn't exceed 120% capacity (soft, penalized)              │
│     - Balance: all cars should be ±10% of average (soft, penalized)          │
│  5. Solve: Find the assignment that MAXIMIZES total score                    │
│                                                                              │
│  RESULT: The solver "tries every combination" mathematically and finds       │
│  the globally optimal solution in milliseconds.                              │
│                                                                              │
│  Example:                                                                    │
│    - Solver sees the $5M whale up front                                      │
│    - Reserves space in Car A for it automatically                            │
│    - Fills Car A with smaller suitcases that fit around the whale            │
│    - Balances all cars simultaneously                                        │
│    - Result: whale stays in Car A, all cars balanced                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

**LP strengths:**
- Globally optimal (provably best)
- Balance is guaranteed, not accidental
- Handles complex trade-offs automatically
- Can weight multiple objectives (continuity vs balance vs geography)

**LP weaknesses:**
- Computationally expensive (O(n²) or worse for large problems)
- Requires all data upfront (can't stream decisions)
- Less intuitive to debug

### 15.4 The Technical Model

The LP solver formulates book building as a **weighted assignment problem**:

```
MAXIMIZE:
  Σ (wC × continuity_score + wG × geography_score + wT × team_score) × x[account,rep]
  - Σ (penalty_over + penalty_under) for balance deviations

SUBJECT TO:
  1. Assignment: Each account assigned to exactly one rep
     Σ x[account, rep] = 1  for each account
  
  2. Balance (soft): Rep loads should be within variance bands
     rep_load = target ± variance_band (with Big-M penalty tiers)
  
  3. Stability Locks: Locked accounts stay with their rep
     x[locked_account, locked_rep] = 1
```

**Variables:**
- `x[account, rep]` = Binary (0 or 1): Is this account assigned to this rep?
- `slack_over[rep]`, `slack_under[rep]` = Continuous: How much is this rep over/under target?

**Objective Function Components:**
| Component | Weight | Description |
|-----------|--------|-------------|
| Continuity Score | wC (0-1) | Reward keeping accounts with current owner |
| Geography Score | wG (0-1) | Reward matching account territory to rep region |
| Team Alignment Score | wT (0-1) | Reward matching account tier to rep tier |
| Balance Penalty | -α, -β, -M | Penalize deviation from target (tiered) |

### 15.5 Three-Tier Penalty System (Big-M)

Balance enforcement uses progressive penalties:

```
                    Target
                      │
    ←── Under ───────│─────── Over ──→
                      │
┌─────────┬───────────┼───────────┬─────────┐
│  Big-M  │   Beta    │   Alpha   │  Beta   │ Big-M  │
│  (1.0)  │  (0.10)   │  (0.01)   │ (0.10)  │ (1.0)  │
├─────────┼───────────┼───────────┼─────────┼────────┤
│ HARD NO │ Discouraged│ Preferred │Discouraged│HARD NO│
└─────────┴───────────┴───────────┴─────────┴────────┘
     │           │           │           │        │
   min        pref_min    target     pref_max    max
```

| Zone | Penalty | Meaning |
|------|---------|---------|
| Alpha (±variance%) | 0.01 × weight | Within preferred range, minimal cost |
| Beta (between variance and limit) | 0.10 × weight | Allowed but discouraged |
| Big-M (beyond limits) | 1.00 × weight | Almost never - huge penalty |

### 15.6 Implementation Files

| File | Purpose |
|------|---------|
| `pureOptimizationEngine.ts` | Orchestrates the LP solve flow |
| `lpProblemBuilder.ts` | Builds variables, constraints, objective |
| `highsWrapper.ts` | Sends LP to HiGHS solver (WASM or Cloud Run) |
| `simplifiedAssignmentEngine.ts` | Waterfall engine (priority cascade) |
| `metricsCalculator.ts` | Calculates post-solve metrics |
| `rationaleGenerator.ts` | Generates human-readable explanations |

### 15.7 When to Use Which Engine

| Scenario | Engine | Why |
|----------|--------|-----|
| Initial book build | LP Optimization | See all accounts, find global optimum |
| Quick preview/test | Waterfall | Faster iteration |
| Debugging rules | Waterfall | Clearer priority cascade |
| Production balancing | LP Optimization | Balance guarantee |
| Very large datasets (>10K) | LP via Cloud Run | Native HiGHS handles scale |

### 15.8 Configuration: Tuning the Model

The LP solver is highly configurable. These "dials" let you control the trade-offs:

#### Priority Weights (wC, wG, wT)

**What they control:** How much the solver cares about each factor.

```
Objective = wC × continuity + wG × geography + wT × team_alignment - penalties
```

| Weight | Default | Description |
|--------|---------|-------------|
| wC (Continuity) | 0.35 | Keep accounts with current owner |
| wG (Geography) | 0.35 | Match account territory to rep region |
| wT (Team Alignment) | 0.30 | Match account tier to rep tier |

**How to configure:** Weights are derived from **priority order** in the UI.
- Higher priority position → higher weight
- Formula: `weight = 1 / (position + 1)`, then normalized

**Example:** If user sets `P1=team_alignment, P2=continuity, P3=geography`:
- wT = 0.50 (P1 = highest weight)
- wC = 0.33 (P2)
- wG = 0.17 (P3)

→ See §10.2.1 for full derivation formula.

#### Balance Intensity (The Main Dial)

**What it controls:** Continuity vs Balance trade-off.

```
penalty = base_penalty × metric_weight × intensity_multiplier
```

| Intensity | Multiplier | Effect |
|-----------|------------|--------|
| VERY_LIGHT | 0.1× | Almost ignore balance (maximize continuity) |
| LIGHT | 0.5× | Prefer continuity, gentle balance nudge |
| **NORMAL** | 1.0× | Balanced trade-off (default) |
| HEAVY | 10× | Strong balance pressure, some continuity breaks |
| VERY_HEAVY | 100× | Force balance, break continuity as needed |

**The car analogy:**
- VERY_LIGHT = "Put suitcases in their preferred cars even if some trunks are overloaded"
- VERY_HEAVY = "Balance trunks exactly, even if we have to move suitcases from their preferred cars"

→ See §11.3.1 for full configuration details.

#### Variance Bands (Target Tolerance)

**What they control:** How close to "perfectly balanced" we require.

| Config | Default | Description |
|--------|---------|-------------|
| `arr_variance` | 10% | Rep can be ±10% of target ARR |
| `atr_variance` | 15% | Rep can be ±15% of target ATR |
| `pipeline_variance` | 15% | Rep can be ±15% of target Pipeline |

**Tighter variance = more balance pressure = more continuity breaks.**

#### Min/Max Bounds (Hard Limits)

| Config | Description |
|--------|-------------|
| `arr_min` | Absolute floor (rep can't have less) |
| `arr_max` | Absolute cap (rep can't have more) |
| `pipeline_min/max` | Same for prospects |

**These create the Big-M penalty zone.** Exceeding them costs ~100× the normal penalty.

### 15.9 Telemetry: Learning from Runs

Every optimization run is recorded to `optimization_runs`. This enables **model improvement over time**.

#### What's Captured

| Field | Purpose |
|-------|---------|
| `model_version` | Which version of scoring/penalty logic ran |
| `engine_type` | waterfall vs relaxed_optimization |
| `balance_intensity` | What dial setting was used |
| `weights (wC, wG, wT)` | Exact weight values used |
| `arr_variance_percent` | Resulting balance quality |
| `continuity_rate` | What % of accounts kept their rep |
| `solve_time_ms` | Performance tracking |

#### How to Use Telemetry for Model Improvement

```sql
-- 1. Find the best balance_intensity for your dataset
SELECT 
  balance_intensity,
  AVG(arr_variance_percent) as avg_variance,
  AVG(continuity_rate) as avg_continuity,
  COUNT(*) as runs
FROM optimization_runs
WHERE engine_type = 'relaxed_optimization'
GROUP BY balance_intensity
ORDER BY avg_variance ASC;

-- 2. Compare model versions
SELECT 
  model_version,
  AVG(continuity_rate) as continuity,
  AVG(arr_variance_percent) as variance
FROM optimization_runs
GROUP BY model_version
ORDER BY model_version DESC;

-- 3. Find runs with best outcomes
SELECT *
FROM optimization_runs
WHERE continuity_rate > 0.80  -- High continuity
  AND arr_variance_percent < 15  -- Good balance
ORDER BY created_at DESC
LIMIT 10;
```

#### The Feedback Loop

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MODEL IMPROVEMENT CYCLE                                   │
│                                                                              │
│   ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐       │
│   │ Configure │ ──→ │   Run    │ ──→ │  Record  │ ──→ │ Analyze  │        │
│   │  weights  │      │  solver  │      │telemetry │      │ outcomes │        │
│   └──────────┘      └──────────┘      └──────────┘      └──────────┘        │
│        ↑                                                      │              │
│        │                                                      │              │
│        └──────────────────────────────────────────────────────┘              │
│                          Tune configuration                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

1. **Configure** - Set weights, intensity, variance bands
2. **Run** - Execute optimization (waterfall or LP)
3. **Record** - Telemetry captures full config + outcomes
4. **Analyze** - Query telemetry to find what worked
5. **Tune** - Adjust configuration based on learnings

**Example tuning insights:**
- "HEAVY intensity gives 5% better balance but breaks 10% more continuity"
- "Version 1.1.0 has 8% better geography matching than 1.0.0"
- "Prospects need higher variance (20%) than customers (10%)"

### 15.10 The Key Insight

> **Waterfall** = Making decisions one at a time, hoping it works out.
> **LP Optimization** = Seeing everything at once, finding the mathematically best answer.

The car analogy: Would you rather pack suitcases blindfolded one by one, or lay everything out and plan the perfect packing? The LP solver gives you that "see everything" superpower.

**The configuration dials (weights, intensity, variance) let you tell the solver what "best" means for your specific situation.** And telemetry lets you learn which settings work best over time.
