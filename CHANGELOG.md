# Changelog

All notable changes to this project will be documented in this file.

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
