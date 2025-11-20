# Changelog

All notable changes to this project will be documented in this file.

## [2025-11-20] - Data Import Enhancement (v1.0.2)
- **Fix**: Automatic `is_parent` field calculation during account CSV import
  - System now automatically sets `is_parent = true` when `ultimate_parent_id` is NULL/empty
  - System automatically sets `is_parent = false` when `ultimate_parent_id` has a value
  - Fixes $0 Total ARR bug caused by missing `is_parent` classification
  - Eliminates need for manual SQL function execution after import
  - Added debug logging for first 5 rows to track parent/child classification
- **Fix**: Added missing favicon link in index.html
  - Favicon.png (200x200 PNG) now displays correctly in browser tabs
  - Added `<link rel="icon" type="image/png" href="/favicon.png" />` to HTML head
- **Fix**: File delete button now actually deletes data from Supabase
  - Previously only removed file from UI state, leaving data in database
  - Now properly deletes accounts, opportunities, or sales_reps from Supabase when delete button clicked
  - Prevents duplicate data issues when re-uploading same file type
  - Shows success/error toast notifications for delete operations

## [2025-11-20] - Critical Bug Fixes (v1.0.1)
- **Security**: Enabled JWT verification on all Edge Functions (`verify_jwt = true`)
  - `process-large-import`, `recalculate-accounts`, `generate-assignment-rule`
  - `ai-balance-optimizer`, `parse-ai-balancer-config`, `manager-ai-assistant`
  - Fixes critical security vulnerability allowing unauthenticated function calls
- **Fix**: Implemented Q2-Q4 renewal date calculations in assignment engine
  - Added `calculateRenewalsByQuarter()` method to fetch and calculate quarterly renewals
  - Updated `initializeWorkloadTracker()` and `initializeEnhancedWorkloadTracker()` to be async
  - Renewals now properly distributed across all quarters instead of hardcoded to 0
- **Fix**: Enhanced CSV header validation in data import
  - Filter out empty/invalid headers before rendering field mapping dropdowns
  - Better error messages for malformed CSV files
  - Prevents UI crashes from null/undefined headers
- **Fix**: Added API retry logic with exponential backoff for Edge Functions
  - Implemented `fetchWithRetry()` with 3 retry attempts (1s, 2s, 4s delays)
  - Automatic retry on 429 (rate limit) and network errors
  - Better error messages for rate limits and depleted credits

## [2025-11-20] - Lovable.dev Independence & Multi-Platform Hosting
- **Refactor**: Removed all Lovable.dev dependencies from codebase.
- **Refactor**: Removed `lovable-tagger` package from devDependencies.
- **Refactor**: Cleaned up vite.config.ts to remove componentTagger plugin.
- **Docs**: Completely rewrote README.md with independent setup instructions.
- **Docs**: Created DEPLOYMENT.md with comprehensive deployment guide for Vercel/Netlify/Firebase.
- **Docs**: Created HOSTING_COMPARISON.md to help choose between hosting platforms.
- **Infra**: Created .env.example for environment configuration.
- **Infra**: Added vercel.json, netlify.toml, firebase.json, and .firebaserc for multi-platform hosting support.
- **Infra**: Enhanced supabase/config.toml with auth, database, storage, and studio settings.
- **Refactor**: Updated package.json name from "vite_react_shadcn_ts" to "book-builder" and version to 1.0.0.
- **Docs**: Updated CLAUDE.md to remove Lovable heritage reference.

## [2025-11-20] - Migration Fixes Round 2 (Fresh Database)
- **Fix**: Fixed duplicate `assignment_rules` INSERT statements in migrations for fresh database initialization.
- **Fix**: Wrapped 20250910150752 migration with DO block and NOT EXISTS checks to prevent duplicate rule inserts.
- **Fix**: Neutralized 20250910152851 migration (duplicate of previous migration).
- **Fix**: Wrapped 3 ghost build ID UPDATE statements in DO blocks (20250923005059, 20250923005640, 20250923005943).
- **Docs**: Created comprehensive CLAUDE.md documentation file for future Claude Code instances.
- **Infra**: All migrations now safe for fresh/empty Supabase database initialization.

## [2025-11-20] - Migration Fixes & Database Setup
- **Fix**: Successfully migrated all database migrations to new Supabase instance.
- **Fix**: Wrapped all ghost build ID references (`e783d327...`) in DO blocks to prevent FK violations on fresh database.
- **Fix**: Fixed column name mismatches (`rep_name` -> `name`, `rule_config` -> `conditions`, removed `account_scope` references).
- **Fix**: Added data cleanup steps before constraint additions to prevent constraint violations.
- **Infra**: Database schema fully initialized and ready for local development.

## [2025-11-20] - Infra
- **Env**: Refactored `supabase/client.ts` to use environment variables instead of hardcoded Lovable credentials.
- **Env**: Added local `.env` file with new Pendo QA Supabase credentials.
- **Infra**: Fixed `supabase/config.toml` to work with Supabase CLI.
- **Infra**: Linked local project to remote Supabase instance and began migration push.

## [2025-11-20] - Docs Refactor
- **Docs**: Reorganized documentation into `docs/core` (Strategy) and `docs/ops` (QA/Ops).
- **Rules**: Updated Master Context to reflect new documentation structure.

## [2025-11-20] - Docs
- **Docs**: Initialized `docs/` structure (Architecture, QA Log, Ideas).
- **Docs**: Created `.cursor/rules/master_context.mdc` for AI context.
- **Infra**: Initialized Git repository and pushed v1.0 to GitHub.
