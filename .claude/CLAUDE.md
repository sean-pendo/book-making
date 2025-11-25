# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Book Builder** is a territory balancing and assignment tool for Sales Operations (RevOps). It enables users to import sales data (Accounts, Sales Reps, Opportunities), configure assignment rules, and generate fair territory assignments based on ARR, geography, and other business metrics.

**Current Status**: v1.0 QA Phase - The codebase is unstable with known critical issues in assignment generation and data import flows.

## Business Terminology

### ARR vs ATR

**CRITICAL: ARR and ATR are NOT additive - ATR is a subset/temporal slice of existing ARR.**

- **ARR (Annual Recurring Revenue)**: The primary metric for account value and territory balancing
  - Source: `accounts.hierarchy_bookings_arr_converted` field (from Accounts CSV import)
  - Fallback: `accounts.calculated_arr` (sum of opportunities if primary is null)
  - Used for: Customer classification, dashboard totals, territory balancing
  - Represents: **Total current recurring revenue** for the account

- **ATR (Available To Renew)**: The baseline revenue amount available for renewal on each renewal opportunity
  - Source: `opportunities.available_to_renew` field (only for `opportunity_type = 'Renewals'`)
  - Calculated per account: `accounts.calculated_atr` = SUM of ATR from all renewal opportunities
  - Used for: Renewal forecasting, net ARR calculation, upsell/churn tracking
  - Represents: **Portion of ARR that is up for renewal** (not separate money)

**Example:**
- Account has $100K ARR
- Of that $100K, $50K is coming up for renewal (ATR = $50K)
- Total company revenue = $100K (NOT $150K)
- ATR is a planning metric showing "how much ARR is at risk or opportunity for expansion"

### ATR Business Logic

**ATR represents the baseline amount from the previous contract that is "available to renew".**

Every renewal opportunity has an ATR value that remains constant for that specific opportunity:

1. **Flat Renewal**: `ARR = ATR` (customer renews at same price)
2. **Upsell**: `ARR > ATR` → Net ARR is positive (customer increased spend)
3. **Downgrade/Churn**: `ARR < ATR` → Net ARR is negative (customer decreased spend or churned)

**Important**: ATR is tied to each distinct renewal opportunity and doesn't change within that opportunity. When a new renewal opportunity is created in the next cycle, the ATR updates to reflect the current ARR from the previous renewal.

**Example Flow**:
```
Year 1: Customer signs for $100K → ARR = $100K
Year 2: Renewal opportunity created → ATR = $100K (baseline from Year 1)
        Customer renews at $120K → ARR = $120K (upsell, Net ARR = +$20K)
Year 3: New renewal opportunity created → ATR = $120K (baseline from Year 2)
        Customer renews at $115K → ARR = $115K (downgrade, Net ARR = -$5K)
```

**Database Implementation**: The `recalculate_account_values_db()` function sums ATR from all renewal opportunities per account and stores it in `accounts.calculated_atr`.

### Data Source Summary

**For ARR Calculation:**
```sql
-- Primary source: Accounts table
SELECT hierarchy_bookings_arr_converted
FROM accounts
WHERE is_parent = true AND build_id = ?

-- Dashboard Total ARR
SUM(hierarchy_bookings_arr_converted) WHERE hierarchy_bookings_arr_converted > 0
```

**For ATR Calculation:**
```sql
-- Source: Opportunities table (renewal type only)
SELECT SUM(available_to_renew) as calculated_atr
FROM opportunities
WHERE opportunity_type = 'Renewals'
  AND build_id = ?
GROUP BY sfdc_account_id

-- Result stored in: accounts.calculated_atr
```

**Import Requirements:**
- **Accounts CSV must have:** `hierarchy_bookings_arr_converted` field
- **Opportunities CSV must have:** `available_to_renew` field (for renewal opportunities)
- System calculates ATR by summing `available_to_renew` from all renewal opportunities per account

### Account Classification Rules

**ONLY parent accounts are classified as Customer or Prospect. Child accounts do not count.**

- **Customer Account**: Parent account (`is_parent = true`) **AND** `hierarchy_bookings_arr_converted > 0`
- **Prospect Account**: Parent account (`is_parent = true`) **AND** `hierarchy_bookings_arr_converted ≤ 0` (or NULL)
- **Child Account**: Account where `is_parent = false` (rolls up to parent via `ultimate_parent_id`, NOT counted separately)

**Classification Logic (from buildDataService.ts):**
```typescript
const parentAccounts = accounts.filter(a => a.is_parent);

const customerAccounts = parentAccounts.filter(a =>
  a.hierarchy_bookings_arr_converted && a.hierarchy_bookings_arr_converted > 0
);

const prospectAccounts = parentAccounts.filter(a =>
  !a.hierarchy_bookings_arr_converted || a.hierarchy_bookings_arr_converted <= 0
);

// Dashboard metrics
customerCount = customerAccounts.length;
prospectCount = prospectAccounts.length;
totalARR = customerAccounts.reduce((sum, a) =>
  sum + (a.hierarchy_bookings_arr_converted || a.calculated_arr || 0), 0
);
```

**IMPORTANT**:
- Opportunities do NOT determine account classification
- Classification is based solely on `hierarchy_bookings_arr_converted` from Accounts CSV
- Child accounts are excluded from all counts
- Only parent-level accounts are classified and counted

### Parent Account Detection
Salesforce uses a self-referencing pattern for parent accounts:
- **Parent account**: `sfdc_account_id = ultimate_parent_id` OR `ultimate_parent_id` is NULL/empty
- **Child account**: `ultimate_parent_id` points to a different `sfdc_account_id`

This logic is implemented in `src/utils/importUtils.ts` during CSV import validation.

### CRITICAL: PostgreSQL NUMERIC Type Handling

**Supabase returns PostgreSQL `NUMERIC` columns as strings to preserve precision.**

This affects ALL financial fields: `hierarchy_bookings_arr_converted`, `calculated_arr`, `arr`, `available_to_renew`, `calculated_atr`, etc.

**Example:**
```javascript
// Database value: 3304500
// Supabase returns: "3304500" (string, not number)

// WRONG - String concatenation breaks math:
const total = customers.reduce((sum, acc) => sum + acc.hierarchy_bookings_arr_converted, 0);
// Result: "03304500" (string concatenation!)

// CORRECT - Always use parseFloat():
const total = customers.reduce((sum, acc) => sum + parseFloat(acc.hierarchy_bookings_arr_converted || 0), 0);
// Result: 3304500 (number)
```

**Required pattern for ALL numeric database fields:**
```javascript
parseFloat(value) || parseFloat(fallback) || 0
```

**Affected files that handle financial calculations:**
- `src/hooks/useEnhancedBalancing.ts` - Rep-level ARR/ATR aggregation
- `src/utils/enhancedRepMetrics.ts` - Parent/child ARR calculations
- `src/services/buildDataService.ts` - Dashboard totals
- Any file doing math with database numeric fields

**Testing tip:** If you see `$0` displayed but query shows values, check if `parseFloat()` is missing.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **UI**: Shadcn UI + Tailwind CSS + Radix UI
- **State Management**: TanStack Query (React Query v5)
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **Routing**: React Router v6
- **Form Handling**: React Hook Form + Zod validation
- **Data Processing**: PapaParse (CSV), client-side validation

## Development Commands

All commands should be run from the `book-ops-workbench/` directory:

```bash
# Start development server (port 8080)
npm run dev

# Production build
npm run build

# Development build (with source maps)
npm run build:dev

# Lint code
npm run lint

# Preview production build
npm run preview
```

### Supabase Commands

```bash
# Start local Supabase (from book-ops-workbench/)
supabase start

# Stop local Supabase
supabase stop

# Apply migrations
supabase db push

# Reset local database
supabase db reset

# View database
supabase studio
```

## Architecture

### Data Flow (ELT Pattern)

1. **Extract/Import**: User uploads CSV files via browser
2. **Load**: PapaParse parses in browser → Validates → Batches to Supabase via `BatchImportService`
3. **Transform/Assign**: Assignment engines read data, apply rules, write to `assignments` table
4. **Visualize**: React Query fetches results for UI rendering

### Core Directory Structure

```
book-ops-workbench/
├── src/
│   ├── components/        # React components (100+ files)
│   │   ├── ui/           # Shadcn UI components
│   │   └── data-tables/  # Table components
│   ├── pages/            # Route-level components
│   ├── services/         # Business logic & assignment engines
│   ├── hooks/            # Custom React hooks
│   ├── contexts/         # React Context providers (AuthContext)
│   ├── integrations/     # External integrations
│   │   └── supabase/    # Supabase client & types
│   ├── lib/             # Utilities
│   └── config/          # Configuration
├── supabase/
│   ├── migrations/      # 100+ SQL migration files
│   └── functions/       # Edge Functions (see below)
└── docs/
    ├── core/           # Strategy & Architecture
    └── ops/            # QA logs & operations
```

### Database Schema (Supabase)

**Core Tables:**
- `accounts` - Company/territory data
- `sales_reps` - Sales representatives
- `opportunities` - Sales opportunities
- `assignments` - Join table linking accounts to reps
- `assignment_rules` - Rule configuration for assignment engine
- `builds` - Scenario metadata (e.g., "FY26 Planning")

**Key Relationships:**
- `assignments.account_id` → `accounts.id`
- `assignments.sales_rep_id` → `sales_reps.id`
- `assignments.build_id` → `builds.id`

### Assignment Engine Architecture

**CRITICAL**: Multiple assignment services exist due to iterative development. This creates fragmentation risk.

**Primary Engine (Use This):**
- `src/services/rebalancingAssignmentService.ts` - "Complete Assignment Logic Overhaul"
  - Handles full flow: Fetch → Apply Rules → Optimize → Save
  - Entry point: `generateRebalancedAssignments()`

**Legacy Engines (Avoid):**
- `collaborativeAssignmentService.ts` - Rule-based approach
- `sophisticatedAssignmentService.ts` - Multi-pass (Geo → Continuity → Balance)
- `algorithmicAssignmentService.ts` - Older algorithmic approach

**When debugging assignment generation, first verify which service the UI is calling.**

### Edge Functions

Located in `supabase/functions/`:
- `ai-balance-optimizer` - AI-powered balancing optimization
- `calculate-balance-thresholds` - Calculate balance thresholds
- `generate-assignment-rule` - Generate assignment rules
- `manager-ai-assistant` - AI assistant for managers
- `optimize-balancing` - Balancing optimization
- `parse-ai-balancer-config` - Parse AI balancer configuration
- `process-large-import` - Handle large data imports
- `recalculate-accounts` - Recalculate account metrics
- `sync-assignments` - Sync assignment data
- `fix-owner-assignments` - Fix owner assignment issues

All Edge Functions have `verify_jwt = false` in `config.toml`.

## Critical Issues & Known Pitfalls

### 🔴 Critical Bugs (QA Phase)

1. **Assignment Generation Broken**
   - Assignments fail to generate or return blank results
   - Check `RebalancingAssignmentService` logs first
   - Verify which assignment service is being called by the UI

2. **Data Import State Sync**
   - Users see "0 Accounts" after import until hard refresh
   - State desync between React state and Supabase
   - Root cause: `localStorage` state vs actual DB state in `DataImport.tsx`
   - **Always verify data in Supabase first** - if it's not in DB, the UI is lying

3. **Optimized Import Risk**
   - `BatchImportService` uses "Optimized Import" which **deletes all existing records before inserting**
   - High risk of data loss if insert operation fails after delete
   - Affects opportunities table especially

### State Management

- React Query handles server state caching
- `localStorage` used for import state persistence (source of bugs)
- Auth state managed via `AuthContext.tsx`

### Important Conventions

- **Always read existing files before editing** - never assume file structure
- **Check Supabase data directly** when debugging - don't trust UI state
- **Import components from `@/` alias** - Vite configured with path alias
- **Use React Query for data fetching** - Don't bypass the cache
- **Follow Shadcn UI patterns** for new components

## Documentation Rules

### MANDATORY: Changelog Maintenance

**Every code change must be logged in `CHANGELOG.md`** (root directory).
Highlight bigger changed in the changelog

Format:
```markdown
## [YYYY-MM-DD] - Category
- **Type**: Description
```

Types: `Fix`, `Feature`, `Refactor`, `Docs`, `Infra`, `Env`

Example:
```markdown
## [2025-11-20] - Database Fixes
- **Fix**: Wrapped ghost build ID references in DO blocks to prevent FK violations.
- **Fix**: Fixed column name mismatches in migrations.
```

### Documentation Structure

- `docs/core/` - Strategy, architecture, long-term planning
  - `architecture.md` - System architecture & data flows
  - `ideas.md` - Future feature brainstorming

- `docs/ops/` - Daily operations, QA, debugging
  - `qa_log.md` - Bug tracking during QA phase

**Before complex changes**, update relevant docs in `docs/core/` or `docs/ops/`.

## Environment & Configuration

### Environment Variables

Located in `book-ops-workbench/.env`:
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key

**Never commit `.env` to git** (already in `.gitignore`).

### Supabase Configuration

- Project ID: `lolnbotrdamhukdrrsmh`
- Local API: `http://localhost:54321`
- Local Studio: `http://localhost:54323`
- Client configured in `src/integrations/supabase/client.ts`

## Git Workflow

- Main branch: `master`
- Project uses conventional commits (see `CHANGELOG.md`)
- **The user will notify you when to push to GitHub** - don't push proactively
- WHen its a big change we should make ti stand out like v1.1 etc. smaller will be 1.0.1

## Testing Strategy

No automated tests currently exist. QA is manual.

**Debugging Strategy (from master_context.mdc):**
1. **Trust Nothing** - Verify data in Supabase first
2. **Isolate Flow** - When fixing Generation, check `RebalancingAssignmentService` logs
3. **Local Dev** - Debug locally with connected Supabase to reproduce bugs

## Key Pages & Routes

- `/` - Index (Home/Dashboard)
- `/auth` - Authentication
- `/import` - Data Import (CSV upload)
- `/build/:id` - Build Detail view
- `/assignment-config/:id` - Assignment Configuration
- `/manager-dashboard` - Manager Dashboard
- `/revops-final` - RevOps Final View
- `/governance` - Governance page
- `/settings` - User Settings

## Notes for Future Claude Instances

1. **This is a QA-phase codebase** - expect bugs and incomplete features
2. **Assignment engine is fragmented** - multiple competing implementations exist
3. **State sync is unreliable** - always verify Supabase data directly
4. **Import flow is dangerous** - deletes before insert (data loss risk)
5. **No automated tests** - rely on manual QA and careful verification
6. **User wants learning log maintained** - document what changes are made and why

## Additional Context

Review `.cursor/rules/master_context.mdc` for detailed project context, QA status, and debugging rules. This file is the source of truth for current project state and critical issues.
