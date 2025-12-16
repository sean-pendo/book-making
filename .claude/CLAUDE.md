# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Book Builder** is a territory balancing and assignment tool for Sales Operations. It allows RevOps to import data (Accounts, Reps), define rules, and generate fair account assignments based on ARR, geography, and other metrics.

**Current Status**: v1.3+ (Stabilized) - Business logic is centralized in `src/_domain/` with comprehensive documentation.

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

## Business Logic Architecture: `src/_domain/`

### 📚 SINGLE SOURCE OF TRUTH

**The `_domain/` folder is the authoritative source for ALL business logic.**

| File | Purpose |
|------|---------|
| **`MASTER_LOGIC.mdc`** | Human-readable documentation of all business rules |
| **`calculations.ts`** | ARR, ATR, Pipeline calculations |
| **`tiers.ts`** | Team tier (SMB/Growth/MM/ENT) classification |
| **`geography.ts`** | Region hierarchy, territory mapping, geo scoring |
| **`constants.ts`** | Thresholds, defaults, configuration values |
| **`normalization.ts`** | Typo handling and data normalization |

### ✅ What BELONGS in `_domain/` (Business Logic)
- **Calculations**: How ARR, ATR, Pipeline values are computed
- **Classification rules**: Tier thresholds, account categorization
- **Geography rules**: Region hierarchy, territory mapping logic
- **Constants**: Threshold values, scoring weights, defaults
- **Normalization**: Data cleanup (region aliases, typos)

### ❌ What does NOT belong in `_domain/`
- React components (`*.tsx` with JSX)
- Hooks (`useXxx`)
- Services (API calls, Supabase queries)
- UI state management
- Contexts (`AuthContext`, etc.)
- Formatting helpers (currency display, date formatting)

**Rule**: `_domain/` answers "HOW should the app calculate/classify things?"
It does NOT answer "HOW should the app render/fetch/store things?"

### 🔒 MANDATORY RULES

#### ⚠️ THE SSOT FLOW (Single Source of Truth)

**When adding or editing ANY reusable business logic, ALWAYS follow this order:**

```
1. MASTER_LOGIC.mdc   →   Document the rule/formula first
2. _domain/*.ts       →   Implement in the appropriate .ts file
3. Consumer files     →   Import from @/_domain and use
```

**This flow is NON-NEGOTIABLE.** Never skip steps or go out of order.

| Step | Action | Example |
|------|--------|---------|
| **1. Document** | Add/update in `MASTER_LOGIC.mdc` | "§12.1.1 Balance Max = MAX(avg × 1.5, largest × 1.2)" |
| **2. Implement** | Add function/constant to `_domain/*.ts` | `export function calculateBalanceMax(...)` in `constants.ts` |
| **3. Export** | Ensure exported from `_domain/index.ts` | Already auto-exports via `export * from './constants'` |
| **4. Import** | Use in components/services/hooks | `import { calculateBalanceMax } from '@/_domain'` |

**Why this order?**
- Documentation-first prevents logic drift
- Single implementation prevents duplicates
- Centralized exports enable easy refactoring
- Consumers stay clean and focused on their purpose

### Key Rules for `_domain/`

1. **Always import from `@/_domain`** - Never hardcode business logic elsewhere
   ```typescript
   // ✅ CORRECT
   import { getAccountARR, classifyTeamTier, REGION_HIERARCHY } from '@/_domain';

   // ❌ WRONG - inline logic
   const arr = account.calculated_arr || account.arr || 0;
   ```

2. **Paired updates required** - When changing business logic:
   - Update `MASTER_LOGIC.mdc` (documentation) **FIRST**
   - Update the corresponding `.ts` file (implementation)
   - Both must stay in sync

3. **Never create duplicate logic** - If you find business logic outside `_domain/`:
   - Flag it to the user
   - Refactor to import from `@/_domain`

4. **Standardized Consolidation Technique** - When consolidating code:
   - `_domain/` = **DEFINITIONS** (source of truth)
   - `utils/`, `components/`, `services/`, `hooks/` = **CONSUMERS**
   - **Don't MOVE files** between folders. Refactor them to IMPORT from `@/_domain`
   - Keep utils in utils, components in components, etc.

### 🔍 Gradual Refactoring Rule

When working on ANY file in the codebase:

1. **Detect Hardcoded Logic**: Look for inline calculations that should use `@/_domain`:
   - ARR calculations (priority chains like `calculated_arr || arr || 0`)
   - ATR calculations (filtering by `opportunity_type = 'Renewals'`)
   - Tier thresholds (magic numbers like `100`, `500`, `1500`)
   - Region/territory mappings
   - PE firm name handling

2. **Flag Discrepancies**: If you find hardcoded logic that **differs** from `src/_domain/`:
   - **STOP and ASK the user** before changing anything
   - Example: "I found `employees < 150` for SMB in this file, but `TIER_THRESHOLDS.SMB_MAX` is 99. Which is correct?"

3. **Propose Refactor**: If the hardcoded logic **matches** `src/_domain/`:
   - Suggest replacing with the import
   - Example: "This file has inline ARR calculation. Want me to refactor to use `getAccountARR()` from `@/_domain`?"

4. **Never Silently Change**: Business logic discrepancies may be intentional edge cases. Always confirm with user.

**Questions to Ask When Discrepancy Found:**
- "Is this intentional or a bug?"
- "Should we update `MASTER_LOGIC.mdc` and `src/_domain/` to match this, or vice versa?"
- "Is this an exception for this specific use case?"
- "Should we add this as a new constant/function in the _domain module?"

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

### Assignment Engine

Multiple services exist for different use cases:
1. **`simplifiedAssignmentEngine.ts`**: Primary engine with priority waterfall
2. **`rebalancingAssignmentService.ts`**: Multi-pass rebalancing
3. **`enhancedAssignmentService.ts`**: Enhanced balancing features
4. **`optimization/`**: HiGHS LP solver for optimal assignments

All engines import business logic from `@/_domain`.

### Edge Functions

Located in `supabase/functions/`:
- `ai-balance-optimizer` - AI-powered balancing optimization
- `calculate-balance-thresholds` - Calculate balance thresholds
- `generate-assignment-rule` - Generate assignment rules
- `gemini-territory-mapping` - AI territory mapping suggestions
- `lp-solver` - Linear programming solver (HiGHS WASM) for optimal assignments
- `manager-ai-assistant` - AI assistant for managers
- `optimize-balancing` - Balancing optimization
- `parse-ai-balancer-config` - Parse AI balancer configuration
- `process-large-import` - Handle large data imports
- `recalculate-accounts` - Recalculate account metrics
- `send-slack-notification` - Send Slack notifications for errors/feedback
- `sync-assignments` - Sync assignment data
- `fix-owner-assignments` - Fix owner assignment issues

All Edge Functions have `verify_jwt = false` in `config.toml`.

## QA Status (v1.3+)

Codebase has been stabilized and consolidated. Business logic is centralized in `_domain/`.

### Recent Improvements (v1.3.x)
- **Domain Consolidation**: All business logic in `src/_domain/`
- **Dead Code Removal**: ~4,000 lines of dead code removed
- **Unified Scoring**: Analytics and engine use same scoring weights
- **Documentation**: MASTER_LOGIC.mdc is comprehensive and audited

### Debugging Strategy
1. **Check `_domain/`**: All business logic should come from here
2. **Verify Supabase**: If data looks wrong, check the DB first
3. **Console Logs**: Assignment engine logs to console with `[AssignmentEngine]` prefix

### 🔴 Debug Mode Requirements

**When entering Debug Mode, ALWAYS start by reviewing business logic:**

1. **Read `src/_domain/MASTER_LOGIC.mdc`** - Understand the expected behavior before investigating
2. **Check relevant `_domain/*.ts` files** - Verify the implementation matches documentation
3. **Compare actual vs expected** - Use `MASTER_LOGIC.mdc` as the source of truth for what *should* happen

**Debug Mode Checklist:**
- [ ] Did I read `MASTER_LOGIC.mdc` to understand the business rule?
- [ ] Is the bug in the business logic (fix `_domain/`) or in a consumer (fix component/service)?
- [ ] Does the current implementation match the documented behavior?
- [ ] If there's a discrepancy, which is correct - the docs or the code?

**Why this matters:** Many bugs are business logic misunderstandings, not code errors. Reading the docs first prevents "fixing" code that's actually correct.

### Important Conventions

- **Always read existing files before editing** - never assume file structure
- **Check Supabase data directly** when debugging - don't trust UI state
- **Import components from `@/` alias** - Vite configured with path alias
- **Use React Query for data fetching** - Don't bypass the cache
- **Follow Shadcn UI patterns** for new components

## Rules & Guidelines

### 📜 Documentation Rules
- **Structure**:
  - `docs/core/`: Strategy & Architecture (e.g., `architecture.md`).
  - `docs/archive/`: Historical plans and resolved issues.
  - `src/_domain/MASTER_LOGIC.mdc`: Business logic documentation (primary reference).
- **Docs First**: Update `MASTER_LOGIC.mdc` or `docs/core/architecture.md` before complex changes.
- **Changelog Maintenance**: **MANDATORY**. You must maintain a `CHANGELOG.md` file in the root.
  - Every time you make a code change (fix, feature, refactor), you must append an entry to `CHANGELOG.md`.
  - Format: `[YYYY-MM-DD] - {Type}: {Description}`.
  - Types: `Fix`, `Feature`, `Refactor`, `Docs`.
- **Simple Language**: Use clear, non-jargon English in comments and docs.

### 🛡️ Safety & Coding
- **File Operations**: Always check if a file exists before creation. Prefer `edit` over `overwrite`.
- **No Magic**: Do not assume deployment environments. Check env vars first.
- **Browser Tools**: Only use browser/testing tools (navigate, snapshot, click, screenshot, etc.) when the user **explicitly asks** to test in the browser or view the app. Do NOT proactively open browser tabs or test features without being asked.
- **Pre-Deploy Code Review**: **MANDATORY**. Before deploying ANY change to Vercel:
  1. Re-read the code you modified to verify it makes sense
  2. Check for edge cases (null values, empty arrays, race conditions)
  3. Verify the change doesn't break related flows (e.g., if you change approval logic, check ALL approval paths)
  4. Look for missing error handling
  5. Ensure notifications go to the right people
  6. Run linter checks on modified files

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

## Versioning & Releases

### Version Display
The app version is shown in **Settings** at the bottom. It pulls from `package.json` at build time.

### Release Workflow (AI-Assisted)
**Proactive releases**: After significant changes (3+ features/fixes, or end of session), suggest a patch release (e.g., 1.1.1 → 1.1.2).

When the user says "release", "push to GitHub", or "create a version", follow this process:

1. **Bump version** in `book-ops-workbench/package.json`
   - Patch (x.x.1): Bug fixes only
   - Minor (x.1.0): New features
   - Major (1.0.0): Breaking changes

2. **Update CHANGELOG.md** with all changes since last release

3. **Run these commands** (requires git_write permission):
   ```bash
   cd "/Users/sean.muse/code/book building v1.0 QA"
   git add -A
   git commit -m "Release vX.X.X - <summary>"
   git tag vX.X.X
   git push origin master --tags
   ```

4. **Deploy to Vercel** (if not already done)

### Current Version
Check `book-ops-workbench/package.json` for the current version number.

## Git & GitHub

### When to Push
Push to GitHub when:
- A feature is complete and tested
- User explicitly requests a release
- Before ending a long session with significant changes

### Commit Message Format
`Release vX.X.X - Brief summary` for releases
`Fix: description` or `Feature: description` for regular commits

## Developer & Notifications

### Developer Info
- **Developer Slack**: `@sean.muse` (pendo.io workspace)
- **Developer Email**: `sean.muse@pendo.io`
- All developer feedback, error notifications, and fallback messages go to @sean.muse

### Slack Notification Routing
- **pendo.io emails** → DM to user (extracted from email prefix)
- **Non-pendo.io emails** → Fallback DM to @sean.muse with context
- **Feedback widget** → Always DMs @sean.muse
- **Error reports** → Always DMs @sean.muse (includes stack traces)

### Error Reporting
The app has global error handlers that automatically send errors to Slack:
- Uncaught JavaScript errors
- Unhandled Promise rejections
- React Error Boundary catches
All errors include: stack trace, URL, user agent, app version, timestamp.

### Supabase Project
- **Project ID**: `lolnbotrdamhukdrrsmh`
- **Edge Functions**: `send-slack-notification`, `gemini-territory-mapping`, etc.
- **Required Secret**: `SLACK_BOT_TOKEN` - Must be set in Supabase Dashboard → Settings → Edge Functions for Slack notifications to work

### Vercel Deployment
- **Account**: `seanxmuses-projects` (personal Vercel - CLI deployments only)
- **Project**: `book-ops-workbench`
- **Production URL**: `https://book-ops-workbench-eosin.vercel.app`
- **Beta URL (v1.2)**: `https://book-ops-v1-2-beta.vercel.app` (pinned deployment for beta testers)
- **Deploy Command**: `vercel --prod` (from `book-ops-workbench` directory)
- **Environment Variables**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

**Note**: Beta URL requires Deployment Protection to be disabled in Vercel Settings for public access.

### GitHub (Separate from Vercel)
- **Repo**: `https://github.com/sean-pendo/book-making` (work GitHub)
- **Purpose**: Version control only - NOT connected to Vercel
- **Push Command**: `git push origin master`

**Important**: GitHub and Vercel are intentionally separate. Push to GitHub for version control, use `vercel --prod` CLI for deployments.

## Terminology & Glossary

> **Full Reference**: See [`src/_domain/MASTER_LOGIC.mdc`](../../book-ops-workbench/src/_domain/MASTER_LOGIC.mdc) for complete glossary with calculation formulas.

### Quick Reference

| Term | Meaning |
|------|---------|
| **ARR** | Annual Recurring Revenue (customers only) |
| **ATR** | Available to Renew - revenue timing, NOT risk |
| **Pipeline** | Prospect opportunity value (`net_arr`) |
| **CRE** | Customer Renewal at Risk - churn indicator |
| **Team Tier** | SMB/Growth/MM/ENT based on employee count |

### Key Calculation Rules

```
ARR Priority:  hierarchy_bookings_arr_converted → calculated_arr → arr → 0
               (hierarchy_bookings first to prevent double-counting from children)
ATR Source:    SUM(available_to_renew) WHERE opportunity_type = 'Renewals'
Team Tier:     SMB (<100 emp) | Growth (100-499) | MM (500-1499) | ENT (1500+) | null (unknown)
```

## Monorepo Structure

This repo has a nested structure:
```
book building v1.0 QA/     ← Git root (you start here)
├── .claude/               ← Claude Code instructions (this file)
├── .cursor/               ← Cursor IDE rules
├── docs/                  ← Documentation
├── CHANGELOG.md           ← Required: update on every change
└── book-ops-workbench/    ← The actual React app
    ├── src/              ← Frontend source code
    ├── supabase/         ← Migrations & Edge Functions
    ├── package.json      ← npm commands run from here
    └── .env              ← Environment variables (not committed)
```

**Important**: Run `npm` commands from `book-ops-workbench/`, not the git root.
