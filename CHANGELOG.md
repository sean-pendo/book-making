# Changelog

All notable changes to this project will be documented in this file.

## [2025-11-21] - Assignment Engine Fixes (v1.0.4)
- **Fix**: Filter out UI-only fields from `assignment_configuration` database updates
  - Root cause: `BalanceThresholdCalculator.calculateThresholds()` returns object with both database columns (`atr_target`, `cre_target`) and UI display fields (`totalATR`, `totalCRE`)
  - Code was blindly updating database with entire object, causing schema error: "Could not find the 'totalATR' column"
  - Fixed by destructuring to filter out `total*` fields before update in `useAssignmentEngine.ts:481`
  - Assignment generation now completes without schema errors
- **Fix**: Added `is_customer` field classification to sync with ARR-based customer logic
  - Created migration `20251121000000_fix_is_customer_classification.sql`
  - Updates `is_customer = true` for parent accounts with `hierarchy_bookings_arr_converted > 0`
  - Fixes Assignment Engine showing 0 customers despite having 410 customer accounts
  - Added index on `(is_customer, is_parent)` for performance
- **Fix**: Added missing `account_scope` column to `assignment_configuration` table
  - Created migration `20251121000001_add_account_scope_to_config.sql`
  - Column values: 'customers', 'prospects', or 'all'
  - Fixes "Configure Assignment Targets" dialog error
- **Docs**: Comprehensive ARR vs ATR documentation added to CLAUDE.md
  - Clarified that ATR is a subset/temporal slice of ARR, NOT additive
  - Documented ATR business logic: flat renewal, upsell, downgrade scenarios
  - Added data source summary with SQL examples
  - Included account classification rules and parent detection logic

## [2025-11-20] - Critical Import Bug Fix (v1.0.3)
- **Fix**: CRITICAL - Fixed `is_parent` calculation being overwritten in `transformAccountData()`
  - Root cause: `transformAccountData()` in importUtils.ts:647 was using simple null-check logic: `is_parent: !sanitizeIdField(row.ultimate_parent_id)`
  - This overwrote the correct self-referencing parent detection logic from validation step
  - Fixed by implementing self-referencing detection in transform function: parent if (1) ultimate_parent_id is NULL/empty OR (2) ultimate_parent_id === sfdc_account_id
  - Solves $0 Total ARR bug caused by all self-referencing parents being marked as children
  - User confirmed fix working: Total ARR now shows correct $34,521,335 with 129 customer accounts
- **Fix**: DELETE RLS policies added for accounts, opportunities, and sales_reps tables
  - Created migration 20251120000000_add_delete_policies.sql
  - Policies already existed in database (likely from previous session)
  - Allows REVOPS and FLM users to delete records via UI delete button
- **Fix**: Profile authentication issue identified and resolved
  - User profile exists with REVOPS role (sean.muse@pendo.io)
  - DELETE operations now work with proper authentication
- **Fix**: Enhanced delete debugging with auth session logging and row count
  - Added authentication status, user ID, and email logging to delete operations
  - Added `count: 'exact'` to DELETE queries to show how many rows actually deleted
  - Helps diagnose RLS policy issues vs authentication issues
- **Fix**: Auto-load now merges with existing localStorage files instead of replacing
  - Previously only loaded if files array was empty (`files.length === 0`)
  - Now intelligently merges Supabase data with localStorage cached files
  - Filters out duplicates by file ID to prevent showing same data twice
  - Shows all three data types (accounts, opportunities, sales_reps) even if one is cached

## [2025-11-20] - Data Import Enhancement (v1.0.2)
- **Fix**: Automatic `is_parent` field calculation during account CSV import
  - System now automatically sets `is_parent = true` when `ultimate_parent_id` is NULL/empty **OR** self-referencing
  - Handles Salesforce self-referencing pattern: parent accounts where `sfdc_account_id = ultimate_parent_id`
  - System automatically sets `is_parent = false` when `ultimate_parent_id` points to different account
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
- **Feature**: Auto-load existing imported data from Supabase
  - Import page now checks Supabase for existing data on page load
  - Displays imported data in "Uploaded Files" table even if not in localStorage
  - Shows row counts for accounts, opportunities, and sales reps
  - Enables delete functionality on data imported in previous sessions
  - No longer dependent on localStorage state

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
