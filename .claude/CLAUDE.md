# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Book Builder** is a territory balancing and assignment tool for Sales Operations (RevOps). It enables users to import sales data (Accounts, Sales Reps, Opportunities), configure assignment rules, and generate fair territory assignments based on ARR, geography, and other business metrics.

**Current Status**: v1.0 QA Phase - The codebase is unstable with known critical issues in assignment generation and data import flows.

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
