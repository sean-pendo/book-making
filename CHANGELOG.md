# Changelog

## [2025-12-08] - Analysis: Waterfall Optimization Logic Review

### Overview
Comprehensive analysis of the current waterfall assignment algorithm to understand if it produces "true optimization" for good output metrics.

### Key Findings
- Current engine is a **greedy heuristic**, not mathematical optimization
- Processes accounts sequentially with no backtracking
- Prioritizes business rules (continuity, geography) over pure balance
- Balance score is used as tie-breaker only, not primary decision factor

### New Artifacts Created

**Documentation:**
- `docs/core/waterfall-optimization-analysis.md` - Full analysis with improvement roadmap
- `docs/core/lp-formulation-guide.md` - Educational guide on LP problem formulation
- `docs/core/optimization-frameworks.md` - Comparison of free LP frameworks

**Experiments (standalone, not integrated):**
- `experiments/lp-test.js` - Runnable LP experiment script (`node experiments/lp-test.js`)
- `experiments/lpOptimizationService.ts` - Reference implementation for future integration

**Quality Measurement:**
- `src/services/assignmentQualityService.ts` - Quality metrics service (for future integration)

### Proposed Improvement Path
1. **Phase 1**: Understand LP formulation (use experiments/lp-test.js)
2. **Phase 2**: Define and measure quality metrics (ARR CV, CRE distribution, compliance rates)
3. **Phase 3**: Quick wins (weighted scoring, difficulty-based sorting)
4. **Phase 4**: True optimization (LP/CSP approach)

---

## [2025-12-04] - Fix: Sample CSV Headers Match Field Mappings

### Overview
Fixed sample CSV templates to properly align with auto-mapping field aliases.

### Changes
- **Accounts CSV**: Removed duplicate `Owner Name` field (conflicted with `Owner Full Name`)
- **Accounts CSV**: Removed `Sales Manager Name` (not a database field)
- **Accounts CSV**: Changed `AccountId` to `Account ID (18)` for better auto-mapping
- **Accounts CSV**: Added `Industry` field
- All sample headers now match aliases in `autoMappingUtils.ts`

---

## [2025-12-04] - Ops: Separated GitHub and Vercel Deployments

### Overview
Reconfigured deployment workflow to separate GitHub (work account) from Vercel (personal account). GitHub is now version control only; Vercel CLI is used for deployments.

### Configuration
- **Personal Vercel Account**: `seanxmuses-projects`
- **Vercel Project**: `book-ops-workbench`
- **Production URL**: `https://book-ops-workbench-eosin.vercel.app`
- **Work GitHub Repo**: `https://github.com/sean-pendo/book-making` (not connected to Vercel)

### Deployment Workflow
1. Push code to GitHub: `git push origin master` (version control)
2. Deploy to Vercel: `vercel --prod` (from `book-ops-workbench` directory)

### Environment Variables (Vercel)
- `VITE_SUPABASE_URL`: `https://lolnbotrdamhukdrrsmh.supabase.co`
- `VITE_SUPABASE_ANON_KEY`: Configured in Vercel project

---

## [2025-12-04] - Docs: New Vercel Deployment Configuration

### Overview
Switched to a new Vercel account for deployments. Updated project documentation to reflect the new deployment configuration.

### Changes
- **New Vercel Account**: `seanxmuses-projects`
- **Project Name**: `book-ops-workbench`
- **Production URL**: `https://book-ops-workbench.vercel.app`
- **GitHub Repo**: `https://github.com/sean-pendo/book-making`

### Updated Files
- `.cursor/rules/CURSOR.mdc`: Added Vercel deployment section with account, project, URL, and deploy command details

### Environment Variables Required
- `VITE_SUPABASE_URL`: `https://lolnbotrdamhukdrrsmh.supabase.co`
- `VITE_SUPABASE_ANON_KEY`: (from Supabase dashboard)

---

## [2025-12-04 10:30 AM CST] - Feature: Net ARR + Close Date Display for Prospects

### Overview
Prospects now show meaningful data instead of $0/$0. Net ARR (from opportunities) and Close Date replace ARR/ATR for prospect accounts across all views.

### Changes

**New Hook: `useProspectOpportunities.ts`**
- Fetches and aggregates opportunity data per account
- Returns Net ARR (sum of `net_arr` from opportunities) and Close Date (earliest `close_date`)
- Includes parent/child rollup logic (sum Net ARR, earliest close date across children)
- Provides color class helper for green (positive) / red (negative) Net ARR styling

**Updated Components (7 total):**
| Component | Change |
|-----------|--------|
| `ManagerHierarchyView.tsx` | Net ARR in rep/FLM summaries, prospect rows show Net ARR + Close Date |
| `SalesRepDetailModal.tsx` | Prospect accounts show Net ARR + Close Date |
| `FLMDetailDialog.tsx` | Prospect rows show Net ARR + Close Date |
| `data-tables/SalesRepDetailDialog.tsx` | Prospect rows show Net ARR + Close Date |
| `UnassignedAccountsModal.tsx` | Prospects show Net ARR instead of $0 |
| `ParentChildRelationshipDialog.tsx` | Prospect info shows Net ARR |
| `BookImpactSummary.tsx` | Gained/Lost accounts show Net ARR for prospects |

**Color Coding:**
- Positive Net ARR: Green (expansion / new business)
- Zero Net ARR: Gray (no pipeline)
- Negative Net ARR: Red (contraction / churn)

**Column Headers:**
- Updated headers with tooltips explaining difference:
  - Customers: ARR / ATR
  - Prospects: Net ARR / Close Date

**Files**: `useProspectOpportunities.ts` (new), `ManagerHierarchyView.tsx`, `SalesRepDetailModal.tsx`, `FLMDetailDialog.tsx`, `SalesRepDetailDialog.tsx`, `UnassignedAccountsModal.tsx`, `ParentChildRelationshipDialog.tsx`, `BookImpactSummary.tsx`

---

## [2025-12-05 1:00 AM CST] - Fix: Previous Notes not loading in Manager Notes dialog

### Root Cause
- The `manager_notes` table had `manager_user_id` as a FK to `auth.users`, not `profiles`
- The PostgREST embedded query `.select('*, profiles:manager_user_id(full_name, email)')` requires a FK relationship to work
- Without the FK, the query silently failed causing infinite loading spinner

### Fix
- Added FK constraint: `manager_notes.manager_user_id` → `profiles.id`
- This enables PostgREST to perform the embedded join correctly

**Migration**: `20251205010000_add_manager_notes_profiles_fk.sql`

---

## [2025-12-04 8:30 PM CST] - Fix: Re-applied RPC functions for Auto-Calculate Targets

### Changes
- **Applied**: `get_customer_arr_total` and `get_prospect_pipeline_total` RPC functions were re-applied to the database
- **Verified**: Database now contains the functions required for the "Auto-Calculate Targets" button to work
- **Note**: Migration file `20251204200000_fix_rpc_calculations.sql` was present but not active in the database

**Files**: Supabase Migrations

---

## [2025-12-04 8:10 PM CST] - UI: Move collapse button to sidebar, refine favicon

### Changes
- **Moved**: Collapse button from header to top of sidebar (where favicon was)
- **Removed**: Favicon from sidebar
- **Styled**: Header favicon now uses `rounded-lg` instead of `rounded-xl` for subtler corners

**Files**: `Layout.tsx`, `AppSidebar.tsx`

---

## [2025-12-04 8:00 PM CST] - Fix: Use RPC functions to bypass Supabase row limits

### Changes
- **Created**: `get_prospect_pipeline_total` RPC function - calculates pipeline server-side
- **Created**: `get_customer_arr_total` RPC function - calculates ARR server-side
- **Fixed**: Totals now calculated via SQL aggregation, not JS (bypasses 1000 row limit)
- **Simplified**: Accounts query now only fetches territories, not all fields

**Files**: `FullAssignmentConfig.tsx`, Supabase migrations

---

## [2025-12-04 7:55 PM CST] - UI: Add logo back to sidebar, round favicon corners

### Changes
- **Added**: Favicon logo back to sidebar above the Builds nav item (icon only, no text)
- **Styled**: Added `rounded-xl` to favicon in both header and sidebar for smoother corners

**Files**: `Layout.tsx`, `AppSidebar.tsx`

---

## [2025-12-04 7:50 PM CST] - Refactor: Move favicon to header, clean up sidebar

### Changes
- **Moved**: Favicon icon now displays in the header next to "Book Builder" title
- **Removed**: Logo/icon from sidebar - sidebar now contains only navigation menu items
- **Cleaned up**: Removed unused imports (FileBarChart, SidebarGroupLabel, etc.)

**Files**: `Layout.tsx`, `AppSidebar.tsx`

---

## [2025-12-04 7:35 PM CST] - Fix: Supabase 1000 row limit causing missing data

### Changes
- **Fixed**: Added `.limit(50000)` to accounts queries (Supabase default is 1000 rows)
- **Fixed**: Added `.limit(10000)` to opportunities queries
- **Root cause**: Only 213 of 5970 prospect accounts were being loaded due to default limit

**Files**: `FullAssignmentConfig.tsx`

---

## [2025-12-04 7:30 PM CST] - Feature: Parent/Child account badges in tables

### Changes
- **Added**: Visual badges showing "Parent" or "Child" status next to account names in Assignment Engine
- **Parent accounts**: Blue badge with building icon
- **Child accounts**: Gray badge with branch icon, plus shows parent name when applicable
- **Applied**: Consistent styling across VirtualizedAccountTable and AccountsTable

**Files**: `VirtualizedAccountTable.tsx`, `AccountsTable.tsx`

---

## [2025-12-04 7:20 PM CST] - Fix: Button text + Debug logging for pipeline

### Changes
- **Renamed**: Button now says "Auto-Calculate Targets" instead of "Calculate Targets"
- **Added**: Console debug logging to trace pipeline calculation issue

**Files**: `FullAssignmentConfig.tsx`

---

## [2025-12-04 7:15 PM CST] - Fix: Tooltip hover/dismiss behavior

### Changes
- **Fixed**: Tooltips now properly appear on hover and dismiss when mouse leaves
- **Root cause**: Redundant `<TooltipProvider>` wrappers inside components conflicted with the global provider in `App.tsx`
- **Solution**: Removed 40+ nested `TooltipProvider` wrappers across all components
- **Enhanced**: Global provider now has `delayDuration={200}` and `skipDelayDuration={100}` for responsive feel

**Files**: `App.tsx`, `InteractiveKPICard.tsx`, `BookImpactSummary.tsx`, `ManagerHierarchyView.tsx`, `SalesRepDetailModal.tsx`, `DataVisualizationCard.tsx`, `VirtualizedAccountTable.tsx`, `AccountsTable.tsx`, `TerritoryBalancingTabbedView.tsx`, `FullAssignmentConfig.tsx`, `AssignmentEngine.tsx`, `BuildDetail.tsx`, `DataImport.tsx`, `ComprehensiveReview.tsx`

---

## [2025-12-04 5:30 PM CST] - Fix: Pipeline/ARR calculations + Territory styling

### Changes
- **Fixed**: ARR and Pipeline values now calculate correctly (Supabase returns numerics as strings, added `Number()` conversion)
- **Fixed**: Prospect Pipeline was showing $0.1M instead of actual $3.8M due to string concatenation bug
- **Fixed**: Customer ARR calculation had same string-vs-number bug
- **Styled**: Territory Mapping section now borderless/seamless (removed blue border and background)

**Files**: `FullAssignmentConfig.tsx`

---

## [2025-12-04 5:15 PM CST] - Simplify: Removed Capacity Variance (redundant with Max)

### Changes
- **Removed**: Capacity Variance slider from config UI (was redundant with Max ARR setting)
- **Config**: Now just has Target + Max for both customers and prospects - simpler mental model

**Files**: `FullAssignmentConfig.tsx`

---

## [2025-12-04 5:05 PM CST] - Feature: Calculate Targets includes prospects + simplified capacity

### Changes
- **Enhanced**: "Calculate Targets" now calculates both Customer ARR and Prospect Pipeline targets
- **Simplified**: Capacity Management reduced to single inline row (was a full card with explanation box)
- **Cleaned**: Removed unused `calculateCapacityLimit` function

**Files**: `FullAssignmentConfig.tsx`

---

## [2025-12-04 4:55 PM CST] - Fix: Config dialog footer + Prospect terminology

### Changes
- **Fixed**: Save/Cancel buttons now stick to true bottom of config dialog (content scrolls independently)
- **Renamed**: "Prospect Account Targets" → "Prospect Pipeline Targets" (prospects don't have ARR)
- **Clarified**: Labels now say "Pipeline" instead of "Net ARR" to avoid confusion

**Files**: `FullAssignmentConfig.tsx`

---

## [2025-12-04 4:45 PM CST] - Fix: Builds sidebar stays active when inside a build

### Changes
- **Fixed**: "Builds" sidebar item now stays highlighted when working inside `/build/:id`
- **Added**: `matchPaths` property to navigation items for flexible route matching

**Files**: `AppSidebar.tsx`

---

## [2025-12-04 3:15 PM CST] - Fix: Loading message text

### Changes
- Changed initial loading text from "Analyzing Data" to "Loading Data" on BuildDetail page

**Files**: `BuildDetail.tsx`

---

## [2025-12-04 3:25 PM CST] - Fix: Calculate Targets now uses correct ARR fields

### Changes
- **Fixed**: Calculate Targets was returning $0 because `calculated_arr` wasn't populated
- **Now uses fallback**: `calculated_arr` → `hierarchy_bookings_arr_converted` → `arr`
- **Added**: Console logging to debug total ARR calculation
- **Added**: Error toast if no ARR data found
- **Removed**: "How It Works" section from config dialog (redundant)

**Files**: `FullAssignmentConfig.tsx`

---

## [2025-12-04 3:15 PM CST] - Fix: Calculate Thresholds moved to top & now updates values

### Changes
- **Moved**: "Calculate Targets" button now at the top of configuration with prominent styling
- **Added**: Tooltip explaining what the calculation does
- **Fixed**: Button now actually updates the ARR target values when clicked
- **Shows**: Last calculated timestamp, total ARR ÷ reps badge
- **Removed**: Redundant `BalanceThresholdConfig` component at bottom (was duplicative)
- **Simplified**: "How It Works" section to be more concise

**Files**: `FullAssignmentConfig.tsx`

---

## [2025-12-04 3:00 PM CST] - Fix: Configure buttons now open popup instead of old page

### Changes
- **Fixed**: "Configure Settings" and "Configure Now" buttons in WaterfallLogicExplainer now open the config popup
- **Updated**: `WaterfallLogicExplainer` accepts `onConfigureClick` callback prop
- **Updated**: AssignmentEngine passes callback to close "How It Works" dialog and open config dialog

**Files**: `WaterfallLogicExplainer.tsx`, `AssignmentEngine.tsx`

---

## [2025-12-04 2:45 PM CST] - Fix: Restore original Assignment Configuration flow

### Changes
- **Restored**: Full assignment configuration flow that was lost during popup conversion
- **Fixed**: `FullAssignmentConfig` component now uses the proven flow from `SimplifiedAssignmentConfig`
- **Includes all original sections in one scrollable view**:
  - "How It Works" waterfall logic explanation
  - Capacity Management with variance slider
  - Customer ARR Targets (target + max)
  - Prospect ARR Targets with Net ARR display
  - Territory & Geography Mapping with AI Auto-Map
  - Balance Threshold Configuration
- **AI Auto-Map**: Uses Gemini AI to intelligently match territories to regions with confidence scores
- **Territory Mapping**: Shows progress, highlights mapped/unmapped territories, supports "Not Applicable" for international territories

**Files**: `FullAssignmentConfig.tsx`

---

## [2025-12-04 1:15 PM CST] - Fix: Data refresh now properly awaited

### Changes
- **Fixed**: All data change callbacks (`onImportComplete`, `onDataChange`) now properly `await` async operations
- Created dedicated `handleDataChange` callback in BuildDetail instead of inline function
- Updated DataImport prop types to accept `Promise<void>` returns
- This ensures animations and UI updates trigger correctly after import/delete without manual refresh

**Files**: `BuildDetail.tsx`, `DataImport.tsx`

---

## [2025-12-04 1:05 PM CST] - Fix: Unlock animation now triggers immediately + more prominent

### Animation Fixes
- **Fixed**: Unlock now triggers immediately after import (no navigation required)
  - Changed from `invalidateQueries` to `refetchQueries` for immediate data refresh
- **Enhanced**: Unlock animation is now much more prominent:
  - Entire tab turns bright green with gradient background
  - Pulsing glow effect (box-shadow animation)
  - All text/icons inside tab turn white
  - Green border appears
  - Tab slightly scales up during animation
  - Animation lasts 2.5 seconds with smooth fade

**Files**: `useBuildData.ts`, `BuildDetail.tsx`, `index.css`

---

## [2025-12-04 12:50 PM CST] - Fix: Data deletion properly re-locks tabs

### Changes
- **Removed**: Hard Refresh button from header (dev tool, not for end users)
- **Removed**: "Limited Data Detected" debug warning alert
- **Fixed**: Deleting data (reps/accounts/assignments) now properly re-locks downstream tabs
  - Deleting Sales Reps or Accounts → Assignments tab re-locks
  - Assignments deleted → Balancing/Clashes/Review tabs re-lock
- **Fixed**: DataVerification component now refreshes when data is deleted (uses key-based remount)

**Files**: `BuildDetail.tsx`, `DataImport.tsx`

---

## [2025-12-04 12:30 PM CST] - Fix: Sidebar progress stepper centering and fill

### Fix: Centered progress line with dots
- Vertical line now properly centered with navigation dots (2px wide at 10px left)
- Line starts/ends at 20px from edges for clean alignment with dots

### Feature: Progress fill on completed steps
- Progress line now fills with primary color up to current step
- Completed steps stay highlighted with `bg-primary/70` dots
- Text for completed items stays semi-highlighted (`text-primary/70`)
- Active dot has glow effect with `shadow-[0_0_8px_rgba(...)]`
- Smooth 300ms transition on progress fill for nice UX

**File**: `AppSidebar.tsx`

---

## [2025-12-04 12:10 AM CST] - Fix: Smart Import Validation

### Summary
Refined import validation to use contextual, tiered approach instead of blanket "all required" or "all optional".

### Validation Tiers

| Tier | Behavior | Account Fields | Opportunity Fields | Sales Rep Fields |
|------|----------|----------------|-------------------|------------------|
| Essential | Block if missing | `sfdc_account_id`, `account_name` | `sfdc_opportunity_id`, `sfdc_account_id` | `rep_id`, `name` |
| High-Priority | Warn, allow import | `owner_id`, `owner_name`, `sales_territory`, etc. | `opportunity_name`, `opportunity_type`, etc. | `team`, `manager`, `region` |

### Key Change
- `ultimate_parent_id` empty is now VALID (identifies parent accounts)
- Removed console spam for empty `ultimate_parent_id`
- High-priority fields generate warnings but don't block import

---

## [2025-12-03 11:58 PM CST] - Fix: Import validation was blocking all rows

### Problem
- Import was showing "27,255 critical errors found. 0/27,255 rows can be imported"
- Console showed "Empty value for ultimate_parent_id in row X" for thousands of rows
- All rows were being rejected even though fields were properly mapped

### Root Cause
- Validation logic had **hardcoded list of "required" fields** that didn't match field mappings
- `ultimate_parent_id` was required but it's **legitimately empty for parent accounts**
- Many other fields (arr, employees, etc.) were required but are empty for prospects/child accounts

### Fix Applied
- **DataImport.tsx**: Changed all "high priority" fields from `required: true` to `required: false`
- **importUtils.ts**: Changed validation to generate **warnings** instead of **blocking errors** for high-priority fields
- Only truly essential fields now block import: `sfdc_account_id` + `account_name` for accounts

### Impact
- Imports with empty `ultimate_parent_id` (parent accounts) now work correctly
- Imports with empty ARR/employees (prospects) now work correctly
- System still shows warnings but allows import to proceed

---

## [2025-12-03] - Feature: All high-priority import fields now required (REVERTED)

### Breaking Change: Field mapping validation is now strict
- **Changed**: All "high priority" fields for Accounts, Opportunities, and Sales Reps are now **required**
- Import cannot proceed to validation step until all required fields are mapped
- Validation now blocks rows missing required field data

### Why this change?
Previously, fields like `ultimate_parent_id`, `arr`, `owner_id`, etc. were marked optional, but the system would silently produce bad results without them:
- Without `ultimate_parent_id`: Hierarchy breaks, every account becomes a "parent"
- Without `arr`: All accounts become "prospects" (customer classification fails)  
- Without `owner_id`: Continuity/retention logic can't work
- Without `sales_territory`/`geo`: Geographic matching fails

### Required fields by type

**Accounts (12 required)**:
- Essential: `sfdc_account_id`, `account_name`
- High Priority: `owner_id`, `owner_name`, `ultimate_parent_id`, `ultimate_parent_name`, `sales_territory`, `hq_country`, `arr`, `hierarchy_bookings_arr_converted`, `employees`, `initial_sale_tier`

**Opportunities (13 required)**:
- Essential: `sfdc_opportunity_id`, `sfdc_account_id`
- High Priority: `opportunity_name`, `opportunity_type`, `stage`, `close_date`, `created_date`, `owner_id`, `owner_name`, `available_to_renew`, `cre_status`, `renewal_event_date`, `net_arr`

**Sales Reps (7 required)**:
- Essential: `rep_id`, `name`
- High Priority: `team`, `manager`, `flm`, `slm`, `region`

**Files**: `DataImport.tsx`, `importUtils.ts`

---

## [2025-12-03 11:55 PM CST] - Fix: Auto-refresh after import and delete

### Feature: Data auto-refreshes after all operations
- **Added**: `onDataChange` callback prop to DataImport component
- **Fixed**: Data now auto-refreshes after deleting files (previously only worked after import)
- **Fixed**: Both import and delete operations now trigger `invalidateBuildData()` to refresh counts
- Tabs unlock status and all data counts update immediately after changes
- **Files**: `DataImport.tsx`, `BuildDetail.tsx`

---

## [2025-12-03 11:45 PM CST] - Fix: Unlock animation now stops properly

### Fix: Animation timer no longer resets infinitely
- **Fixed**: Unlock animation was running forever because useEffect kept resetting the timer
- Added `hasTriggeredUnlockAnimation` ref to ensure animation only triggers once per session
- Animation now properly stops after 2.5 seconds
- **File**: `BuildDetail.tsx`

### Enhancement: Smoother green unlock animation
- **Changed**: Animation now uses smooth green glow instead of harsh pink flashes
- Uses emerald/green colors (hsl 142 76%) for success feel
- Single smooth fade from green glow to grey (2s duration)
- Removed jittery ping overlay effect
- **Files**: `BuildDetail.tsx`, `index.css`

---

## [2025-12-03 11:30 PM CST] - UX: Tab unlock styling + Continue button

### Fix: Unlocked tabs return to grey after animation
- **Fixed**: After unlock animation, tabs 3-6 (Assignments, Balancing, Clashes, Review) now return to grey/muted style matching Data Overview
- Reverted earlier change that made them pink
- **File**: `BuildDetail.tsx`

### Enhancement: Preview button tooltip for imported files
- **Added**: Tooltip on disabled Preview button explaining "Preview unavailable - data already in database"
- Helps users understand why preview doesn't work for previously-imported files
- **File**: `DataImport.tsx`

### UX: "Continue" button replaces "Open Build Details"
- **Changed**: Button text from "Open Build Details" to "Continue"
- **Changed**: Icon from ExternalLink to ChevronRight
- **Fixed**: Button now switches to Data Overview tab instead of reloading page
- Added `onContinue` prop to DataImport component for parent control
- **Files**: `DataImport.tsx`, `BuildDetail.tsx`

---

## [2025-12-03 10:45 PM CST] - Fix: Sidebar nav alignment

### Fix: Centered vertical stepper line with dots
- **Fixed**: Vertical line in sidebar now perfectly aligned with dot indicators
- Changed dot size from 7px to 6px (even number for precise centering)
- Line positioned at exactly 11px (8px padding + 3px half-dot)
- **File**: `AppSidebar.tsx`

---

## [2025-12-03 10:35 PM CST] - UX: Unlock animation + imported file actions

### Enhancement: Unlock animation for tabs
- **Changed**: Tabs now flash 3 times slowly when unlocked (not continuous pulse)
- **Changed**: Shows step numbers during/after animation (not checkmarks)
- **Changed**: Tabs return to grey default state after animation completes
- Animation duration: 2.4 seconds total
- **Files**: `BuildDetail.tsx`, `index.css`

### Feature: Preview/Delete for imported files
- **Added**: Preview and Delete buttons to already-imported file cards in Review tab
- These cards now have consistent actions with validation cards
- Preview disabled if data not cached in memory
- **File**: `DataImport.tsx`

---

## [2025-12-03 10:25 PM CST] - UX: Preview and Delete buttons in Review tab

### Feature: Preview button in Review tab
- **Added**: "Preview" button on each data card in the Review & Import tab
- Opens a dialog showing the DataPreview component with sample data and quality analysis
- Shows warning if data not cached (needs re-upload)
- **Files**: `EnhancedValidationResults.tsx`, `DataImport.tsx`

### Feature: Delete button in Review tab  
- **Added**: Trash icon button on each data card to delete/remove the file
- Styled with destructive hover state
- Uses existing `handleDeleteFile` function
- **Files**: `EnhancedValidationResults.tsx`, `DataImport.tsx`

---

## [2025-12-03 10:15 PM CST] - UX: Import button loading state + auto-refresh

### Feature: Import button loading state
- **Added**: Loading spinner on "Import Data" button while import is in progress
- **Added**: All import buttons disabled during import to prevent multiple clicks
- Shows "Importing..." text with spinning loader
- **Files**: `DataImport.tsx`, `EnhancedValidationResults.tsx`

### Feature: Auto-refresh after import
- **Added**: Build data automatically refreshes when import completes
- No more need to manually hard refresh to see updated counts
- Triggers unlock animation when Accounts + Sales Reps are both imported
- **Files**: `BuildDetail.tsx` (uses `useInvalidateBuildData` hook)

---

## [2025-12-03 10:00 PM CST] - UX: Friendly "Continue Upload" prompt

### Enhancement: Redesigned missing data prompt
- **Changed**: Warning-style alert → Friendly, glowing, interactive prompt
- Gradient background with subtle shimmer animation
- Upload icon with gentle bounce animation
- Encouraging copy: "Almost there! Just need [missing types]"
- Large, prominent "Continue Upload" button with hover effects
- Subtle glow pulsing effect on the container
- **Files**: `DataImport.tsx`, `index.css`

### New CSS Animations
- `animate-pulse-subtle` - Gentle glow pulsing
- `animate-shimmer` - Horizontal shimmer effect
- `animate-bounce-subtle` - Soft bounce for icons

---

## [2025-12-03 9:45 PM CST] - Fix: Data Import tab navigation + "Go Back" button

### Bug Fix: Grey screen when validating data
- **Fixed**: Clicking "Validate Data" caused grey screen because code was switching to non-existent tabs
- Changed `setActiveTab('validation')` → `setActiveTab('review')` (3 places)
- Changed `setActiveTab('verification')` → `setActiveTab('review')` (1 place)
- **File**: `DataImport.tsx`

### Feature: "Go Back to Upload" prompt for missing data types
- **Added**: Alert banner in Review tab when some data types haven't been uploaded yet
- Shows amber warning: "Missing data: Opportunities and Sales Reps still need to be uploaded"
- Prominent "← Go Back to Upload" button to return to upload step
- Only shows when user has validated at least one file but not uploaded all three types
- **File**: `DataImport.tsx`

---

## [2025-12-03 9:15 PM CST] - UX: Locked tabs until data import complete + unlock animation

### Feature: Progressive Tab Unlocking
- **Feature**: Assignment, Balancing, Clashes, and Review tabs are now LOCKED until both Accounts AND Sales Reps data are imported
  - Locked tabs show 🔒 lock icon instead of step number
  - Locked tabs are grayed out and non-clickable
  - Hovering shows tooltip: "Import Accounts and Sales Reps data first"
  - Only Import Data (step 1) and Data Overview (step 2) are available initially

### Feature: Unlock Animation
- **Feature**: When both data types are imported, locked tabs animate to unlocked state
  - Glow animation effect highlights the newly unlocked tabs
  - Animation runs for 3 seconds then fades
  - Visual feedback confirms user can proceed to next steps

### Technical
- Added `recentlyUnlocked` and `wasLocked` state tracking
- `useEffect` monitors `buildData?.accounts.total` and `buildData?.salesReps.total`
- CSS class `glow-animation` applied conditionally during unlock transition

### Files Changed
- `BuildDetail.tsx` - Tab locking logic, unlock animation, tooltip integration

---

## [2025-12-03 8:30 PM CST] - UX: Build target date restricted to future dates only
- **Fix**: Target date picker on new build creation now only allows future dates
- Added `min` attribute to date input using today's date as minimum
- **File**: `Dashboard.tsx`

---

## [2025-12-03 7:45 PM CST] - UX: Data Import now embedded in Build flow

### Change
- **Data Import is now the first tab** inside BuildDetail page
- No longer asks "Select Target Build" - it knows which build you're in
- Standalone `/import` page still works but build selector is hidden when embedded

### Flow
1. Dashboard → Click build → **Import Data** tab (first)
2. Upload files, map fields, validate
3. Move to Data Overview, Assignments, etc.

### Files Changed
- `DataImport.tsx` - Added `buildId` prop, hide selector when embedded
- `BuildDetail.tsx` - Added Import Data as first tab (6 tabs now)

---

## [2025-12-03 7:30 PM CST] - Fix: RevOps Owner dropdown only shows REVOPS users

### Problem
- Build creation showed FLM users in "RevOps Owner" dropdown

### Fix
- Changed query from `.in('role', ['REVOPS', 'FLM'])` to `.eq('role', 'REVOPS')`

---

## [2025-12-03 7:15 PM CST] - Fix: Build deletion now works (cascade delete)

### Problem
- Deleting a build failed with 409 Conflict error
- Root cause: 16 tables have foreign keys to `builds` table
- Direct delete was blocked by referential integrity constraints

### Fix
- Created `delete_build_cascade(p_build_id)` database function
- Deletes all related data in correct order: manager_reviews, assignments, accounts, etc.
- Returns detailed count of deleted records for logging
- Updated Dashboard to use this function instead of direct delete

### Files Changed
- `Dashboard.tsx` - Use new RPC function
- New migration: `add_cascade_delete_build_function.sql`

---

## [2025-12-03 6:45 PM CST] - Fix: At-Risk Parents now checks both cre_status AND cre_count

### Problem
- At-Risk Parents showing 0 even when accounts had risk data
- Root cause: Different CSV imports mapped risk data to different columns
  - Some builds: `cre_status` (text like "At Risk", "Pre-Risk Discovery")  
  - Some builds: `cre_count` (numeric count of CRE opportunities)

### Fix
- Updated 8 places across 3 files to check BOTH fields:
  - `cre_status !== null` OR `cre_count > 0`
- Now works regardless of which column the import populated

### Files Changed
- `ManagerHierarchyView.tsx` - CRE count calculation
- `FLMDetailDialog.tsx` - Risk count in FLM detail view
- `ComprehensiveReview.tsx` - Risk filter, portfolio summary, risk metrics cards

---

## [2025-12-03 5:30 PM CST] - Feature: FLM Counter-Proposal Flow & Approval Ownership

### Approval Ownership Tracking
- **Feature**: Approvals now track WHO approved (user ID, name, role, timestamp)
  - New JSON format stored in approval notes with structured `ApprovalInfo`
  - Backwards compatible with legacy "Book approved by [Name]" format
- **Visual Distinction**: Green checkmarks now show tooltip with approver details
  - Hover to see "Approved by [Name]" with role and date
  - Gray checkmark when approved by different role (e.g., SLM approval viewed by FLM)
  - "[Role] Approved" badge shown when viewed by different role type

### FLM Counter-Proposal Workflow
- **Feature**: When FLM clicks "Reassign" on an account in a book that was already approved by SLM:
  - Confirmation dialog appears: "This book was already approved by [SLM Name]"
  - Explains: "Your proposal will create a counter-proposal that requires SLM re-review"
  - User can Cancel or "Continue with Counter-Proposal"
- **Purpose**: Allows FLMs to challenge SLM decisions while maintaining audit trail

### Pending Proposals Badge
- **Feature**: Rep books now show orange "X Pending" badge when there are pending reassignment proposals
  - Appears next to rep name in the team hierarchy view
  - Tooltip explains how many pending proposals exist
- **Purpose**: Quick visibility into which reps have unsettled changes

### Cross-Build Conflict Detection (Enhanced)
- **Feature**: Purple "Cross-Build" badge now appears on accounts in ManagerHierarchyView
  - Shows when the same account has pending proposals in OTHER builds
  - Tooltip lists: "Build A: 2 proposal(s), Build B: 1 proposal(s)"
  - Applied to both parent and child account rows
- **Purpose**: Clear flagging across all builds as requested

### Files Changed
- `ManagerHierarchyView.tsx` - All changes above

## [2025-12-03] - UX: Sidebar Navigation Cleanup
- **Removed**: "Data Import" from sidebar - it's now only accessible from within a build (as a step in the build flow)
- **Hidden**: "Manager Dashboard" from RevOps users - was confusing since RevOps uses the main Dashboard and Review pages
- **Moved**: Sign Out button from sidebar to Settings page - cleaner sidebar with Settings link at bottom
- **Added**: Sign Out section in Settings page with clear button
- **Files**: `AppSidebar.tsx`, `Settings.tsx`

## [2025-12-02 6:30 PM CST] - Fix: Role Badge Showing Lowercase
- **Fix**: Changed role badge in sidebar from `.toLowerCase()` to `.toUpperCase()`
- **File**: `AppSidebar.tsx`

## [2025-12-02 6:25 PM CST] - Fix: User Signup Role Not Being Saved
- **Root Cause**: Database trigger `handle_new_user` wasn't reading role from user metadata - was always defaulting to REVOPS
- **Fix Applied**: Applied migration to update trigger to read `role` from `raw_user_meta_data`
- **Manual Fix**: Updated Warren Burt's profile from REVOPS to FLM
- **Note**: Updated Supabase project ID in CURSOR.mdc from `jbcpesxfzkhdalrymfhv` to `lolnbotrdamhukdrrsmh`

## [2025-12-03 3:15 PM CST] - Feature: Cross-Build Conflict Detection
- **Feature**: Proposals now show warnings if the same account has pending proposals in OTHER builds
  - Purple "Cross-Build" badge appears in the Warnings column
  - Shows which builds have conflicts and how many proposals
  - Detailed warning in review dialog: "Cross-Build Conflict: X proposal(s) in other builds: Build A, Build B"
  - Does NOT auto-reject across builds (builds are independent planning scenarios)
- **Purpose**: Helps RevOps identify when the same account is being changed in multiple planning scenarios
- **Files**: `ReviewNotes.tsx`

## [2025-12-02 2:45 PM CST] - Fix: Auto-Reject Competing Proposals on Approval
- **Fix**: When any proposal is approved (via Review & Notes OR direct RevOps assignment), all other pending proposals for the same account are now auto-rejected
  - **ReviewNotes.tsx**: RevOps approval from Review & Notes page auto-rejects competitors
  - **ManagerHierarchyView.tsx**: RevOps direct proposal (auto-approved) also auto-rejects existing pending proposals
  - Prevents "orphaned" proposals that could accidentally overwrite approved changes
  - Competing proposals get status `rejected` with rationale explaining which proposal was chosen instead
  - Managers whose proposals were superseded receive Slack notification explaining the outcome
  - Added error logging for reject operations (graceful degradation if reject fails)
- **Edge Case Handled**: FLM and SLM propose conflicting changes → approving one now cleanly resolves the conflict
- **Files**: `ReviewNotes.tsx`, `ManagerHierarchyView.tsx`

## [2025-12-02 1:00 PM CST] - Slack Notification System
- Created `send-slack-notification` edge function for secure Slack messaging
- Added `slack_notifications_log` table for tracking all notifications
- Updated FeedbackWidget to use edge function (removed n8n webhook)
- Added notifications when review is sent to manager
- Added notifications when proposals are approved/rejected
- Routing: pendo.io emails → DM to user; others → fallback to @sean.muse
- Created `slackNotificationService.ts` for reusable notification functions

## [2025-12-02 12:20 PM CST] - Added Feedback Widget
- Added floating "?" help button in bottom-right corner (always visible)
- Users can submit: Bug Reports, Questions, Feature Requests
- Option to include Loom video URL with direct link to record
- Sends to n8n webhook for team notifications
- Includes user info, app version, and current URL for context

## [2025-12-02 12:05 PM CST] - Fixed Role Uppercase on Sign Up
- Roles now always stored as uppercase (REVOPS, SLM, FLM)
- Fixed race condition where profile could be created before signup data was saved
- User metadata now includes full_name/role/region as backup during sign up

## [2025-12-02 11:55 AM CST] - Added App Version Display in Settings
- Added version info card at bottom of Settings page
- Shows current version (v1.1.0) and build timestamp
- Version is pulled from package.json at build time
- Helps align deployed version with GitHub releases

## [2025-12-02 11:50 AM CST] - Removed Team Field from User Profiles
- Removed "Team (Optional)" field from sign-up/onboarding form
- Removed Team column from User Management table in Settings
- Field was unused and caused confusion

## [2025-12-02 11:45 AM CST] - Reassignment Dropdown UX Improvements
- **Grouped reps by FLM** in the reassignment dropdown with section headers
- **Current owner's FLM shown first** in the dropdown for easy same-team reassignments
- **Added "Owner's FLM" badge** in the reassignment dialog to show which FLM the account currently belongs to
- Fixed syntax error preventing deployment

All notable changes to this project will be documented in this file.

## [2025-12-02] - Feature: Out-of-Scope Account Flagging

- **Feature**: New "Out-of-Scope Account" option in reassignment dropdown
  - Allows managers to flag accounts that don't belong in their hierarchy
  - Appears in red at top of dropdown with warning icon
  - When selected, account is flagged for RevOps to assign elsewhere
- **Feature**: Out-of-scope warnings in Review & Notes
  - Red "Out of Scope" badge on flagged proposals
  - Row highlighted in red with left border
  - Warning message: "You must assign this account to someone outside their team or it will have no owner"
- **Fix**: Dropdown shows rep's FLM name in parentheses for clarity

## [2025-12-02] - Feature: Dual SLM/RevOps Approval Path

- **Feature**: Both SLM and RevOps can now approve FLM proposals
  - RevOps sees ALL pending items (including `pending_slm`) on Review & Notes page
  - Either SLM or RevOps can approve first - whoever approves first wins
  - No more waiting for SLM if RevOps wants to approve directly
- **Feature**: Clear approval indicators showing who approved
  - "Approved by RevOps" - RevOps approved directly
  - "Approved by SLM" - SLM approved (then RevOps finalized)
  - "SLM Approved • Awaiting RevOps" - SLM approved, waiting for RevOps final
  - "Awaiting Review" - Neither has approved yet
- **Feature**: SLMs can see "Recently Approved" section in FLM Approvals tab
  - Shows items approved in last 7 days
  - Indicates if approved by "RevOps (Direct)" or "SLM → RevOps" flow
- **Feature**: Status column added to pending reviews in Review & Notes

## [2025-12-02] - UX: Improved Send to Manager Dialog

- **Feature**: Searchable manager dropdown with type-ahead search
- **Feature**: Managers grouped by SLM hierarchy (SLMs first, then FLMs under each SLM)
- **Fix**: Selecting a manager or user now auto-deselects "Send All" option
- **Fix**: Dropdowns are no longer disabled when "Send All" is selected - interacting deselects it

## [2025-12-02] - Feature: Accounts Gained/Lost Detail Modals

- **Feature**: Added clickable "View Accounts" buttons to Book Impact Summary
  - Click on "+X accounts" to see detailed list of accounts being added to your book
  - Click on "-X accounts" to see detailed list of accounts leaving your book
  - Shows account name, ARR value, and who the account is coming from / going to
  - Managers can now see exactly which accounts they're gaining/losing and the destination

## [2025-12-02] - Feature: Manager Approval Flow Overhaul

### Role Case Sensitivity Fix
- **Fix**: Role checks now case-insensitive (`'slm'` works same as `'SLM'`)
  - Updated ManagerDashboard, ManagerHierarchyView, ReviewNotes, AppSidebar, Dashboard, Layout
  - SLM users can now see their "FLM Approvals" tab properly

### Updated Approval Flow
- **Feature**: SLMs can now submit their review without approving all FLM proposals
  - Warning shown in submit dialog if there are pending FLM proposals
  - FLM proposals stay at `pending_slm` status and can be reviewed later
- **Feature**: Late submission detection for FLM proposals
  - If FLM proposes after SLM already submitted review, flagged as `is_late_submission`
  - Helps RevOps identify proposals that SLM may not have seen

### Sharing Scope Restrictions
- **Feature**: Hierarchy-based recipient filtering when sharing builds
  - FLM book can only be shared with: that FLM or the SLM above them
  - SLM book can only be shared with: that SLM or FLMs under them
  - RevOps users excluded from recipient list
- **Feature**: Scoped visibility for FLMs viewing SLM books
  - If SLM book shared with FLM, FLM only sees their portion (`shared_scope = 'flm_only'`)
  - `visible_flms` array tracks which FLMs are visible

### Book Impact Summary
- **Feature**: New `BookImpactSummary` component showing net changes
  - Displays accounts gained/lost, ARR gained/lost, net change
  - Color-coded: green for positive, red for negative
- **Feature**: Grand totals added to Before & After comparison view
  - Summary card at top showing total book change across all FLMs
- **New utility**: `bookImpactCalculations.ts` with `calculateBookImpact()` function

### Conflict Detection for RevOps
- **Feature**: Warning badges in ReviewNotes for conflict detection
  - "Conflict" badge when multiple managers proposed changes to same account
  - "Late" badge for proposals submitted after SLM review
- **Feature**: Detailed warnings in review dialog explaining each warning type

### Database Migration
- New migration: `20251202000001_manager_flow_updates.sql`
  - Added `shared_scope` column to `manager_reviews` (full/flm_only)
  - Added `visible_flms` text array to `manager_reviews`
  - Added `is_late_submission` boolean to `manager_reassignments`

### Files Changed
- `ManagerDashboard.tsx` - Role fixes, added BookImpactSummary
- `ManagerHierarchyView.tsx` - Role fixes, scope filtering, late submission detection
- `ReviewNotes.tsx` - Role fixes, conflict detection UI
- `SendToManagerDialog.tsx` - Hierarchy-based recipient filtering
- `ManagerBeforeAfterComparison.tsx` - Grand totals summary
- `BookImpactSummary.tsx` - New component
- `bookImpactCalculations.ts` - New utility
- `ManagerPendingApprovals.tsx`, `AppSidebar.tsx`, `Dashboard.tsx`, `Layout.tsx` - Role fixes

## [2025-11-26] - Fix: Send to Manager Dialog Now Requires Manager Selection

- **Fix**: Send to Manager dialog now requires selecting which manager's book to share
  - When clicking header "Send to Manager" button, a dropdown now appears to select which FLM/SLM's book to share
  - Prevents accidentally sharing with `manager_name = 'General'` which caused empty data
  - Shows all available FLMs and SLMs from the build's sales_reps data
- **Fix**: Added RLS policies for `manager_reviews` table to allow delete operations
- **Files**: `SendToManagerDialog.tsx`, new migration `20251126200001_add_manager_reviews_policies.sql`

## [2025-11-26] - Feature: Delete Shared Review from Manager Dashboard

- **Feature**: Added ability to delete shared reviews from Manager Dashboard
  - Trash icon button appears next to the build dropdown when a review is selected
  - Confirmation dialog shows build name and manager info before deletion
  - Deleting a review removes it from your list but doesn't affect the build itself
- **Use case**: Delete incorrectly shared reviews (e.g., shared with wrong manager level)
- **Files**: `ManagerDashboard.tsx`

## [2025-11-26] - Fix: Assignment Apply Flow & Balancing Dashboard Refresh

- **Feature**: Added "Apply Proposals" button to Assignment Engine header
  - Appears in top-right when there are pending generated proposals
  - Shows count (e.g., "Apply 6380 Proposals")
  - No need to scroll through Preview dialog to apply
- **Feature**: "Unsaved Changes" warning when leaving Assignments tab
  - If you try to switch tabs with pending proposals, shows confirmation dialog
  - Options: "Stay & Review" or "Leave Without Saving"
  - Prevents accidentally loss of generated proposals
- **Fix**: Balancing Dashboard staying locked after assignments applied
  - Root cause: `useEnhancedBalancing` used local React state, not React Query
  - Query invalidation (`queryClient.invalidateQueries`) had no effect on local state
  - Converted hook to use React Query with proper query key `['enhanced-balancing', buildId]`
  - Now responds correctly to cache invalidation after assignments are applied
- **Fix**: Refresh button on Balancing page causing edge function error
  - Removed call to `recalculateAccountValuesAsync` which invoked failing edge function
  - Refresh now simply refetches data from Supabase directly
- **Files**: `AssignmentEngine.tsx`, `EnhancedBalancingDashboard.tsx`, `useEnhancedBalancing.ts`

## [2025-11-26] - Fix: Build Creation 400 Error (team → region)

- **Fix**: Build creation failing with 400 error
  - Root cause: Migration `20251126110001_remove_team_use_region.sql` removed `team` column from `builds` table
  - Dashboard.tsx was still trying to insert with `team` field which no longer exists
  - Database expects `region` column instead
- **Solution**: Updated Dashboard.tsx to use `region` instead of `team`
  - Renamed `newBuildTeam` state to `newBuildRegion`
  - Updated insert query to use `region: newBuildRegion`
  - Updated UI labels from "Team" to "Region"
  - Added 'GLOBAL' to region options (GLOBAL, AMER, EMEA, APAC)
- **Files**: `Dashboard.tsx`

## [2025-11-26] - Feature: RevOps Admin Mode for Manager Dashboard

- **Feature**: RevOps users can now view any manager's dashboard in Admin Mode
  - Admin Mode banner with manager selector dropdown appears for REVOPS users
  - Select any FLM or SLM to see their assigned builds and review status
  - "View Only" badge shows when RevOps is viewing as another manager
  - Action buttons (Accept/Decline/Approve) are hidden in Admin Mode to prevent accidental changes
  - Manager name displayed instead of "Your role" when viewing another manager's dashboard
- **UX**: Clear empty states guide RevOps to select a manager first
- **Files**: `ManagerDashboard.tsx`

## [2025-11-26] - Feature: Manager Review Submission Flow

- **Feature**: "Submit for Review" button with confirmation dialog
  - Shows warning: "Once submitted, you won't be able to edit assignments"
  - Confirms notes can still be added after submission
  - Sends to RevOps for final approval
- **Feature**: "Accept All Original" button for discarding reassignments
  - Only appears when manager has pending reassignments
  - Shows warning with count of reassignments to be discarded
  - Preserves all notes
  - Does NOT auto-submit (manager must still click Submit)
- **UI**: Button layout improvements
  - Pending status: "Review & Edit" + "Accept All & Submit"
  - In Review status: "Accept All Original" + "Submit for Review"
  - SLM "Approve FLM Proposals" moved to secondary style
- **Files**: `ManagerDashboard.tsx`

## [2025-11-26] - UI: Hide Empty "Approve FLM Proposals" Button

- **Fix**: "Approve FLM Proposals" button now hidden when there are no pending proposals
  - Previously showed error "No pending FLM proposals found" when clicked with 0 proposals
  - Now only appears when `pending_slm` count > 0
  - Shows count in button text: "Approve FLM Proposals (3)"
- **Files**: `ManagerDashboard.tsx`

## [2025-11-26] - Feature: Enhanced FLM Book Approval UX

- **Feature**: Approve Team button for SLMs on FLM rows
  - SLMs can now approve an entire FLM's team with one click
  - Creates approval note with `flm-team-{encodedName}` pattern
  - URL encoding handles special characters in FLM names
- **Feature**: Visual approval state feedback
  - Approved rep books show green checkmark icon next to rep name
  - Approved FLM teams show green checkmark in header
  - Cards get green tint when approved (rep cards and FLM header)
  - Buttons change to "Approved" state with checkmark when clicked
  - Smooth animations on approval state change
- **Feature**: Enhanced reassignment status badges
  - Badges now show approval stage: "Awaiting SLM" or "Awaiting RevOps"
  - Hover tooltip shows proposed new owner name
  - Applies to both parent and child account rows
- **Technical**: Approval state derived from existing notes query
  - Parses `rep-book-*` and `flm-team-*` prefixed account IDs from `manager_notes`
  - No new database tables needed - reuses existing infrastructure
- **Files**: `ManagerHierarchyView.tsx`

## [2025-11-26] - Deploy: Confirm AI Assistant Removal

- **Deploy**: Redeployed to Vercel to ensure ManagerAIAssistant chatbot removal is live
  - AI Assistant was previously removed in commits `8d4dfb0` and `d8187ec`
  - User reported chatbot still visible - likely stale cached deployment
- **Files**: No code changes - production deployment only

## [2025-11-26] - Fix: Approve Book Button, Note Counts, Layout & RLS

- **Feature**: Approve Book button now functional
  - Creates an approval note record for the rep's book
  - Shows loading state while processing
- **Feature**: Note buttons now show count badge when notes exist
  - Badge displays number of existing notes for that account
  - Both parent and child account rows have this feature
- **Fix**: Layout improvements for rep row stats
  - Shifted stats left to make room for button
  - Shortened labels (CRE Parents → CRE, Retention → Retain)
  - More compact column widths
- **Fix**: RLS policy for `manager_review_analytics` table
  - Added policy to allow managers to insert their own analytics records
  - The trigger that fires on note creation can now work for FLM/SLM users
- **Files**: `ManagerHierarchyView.tsx`, `20251126120001_fix_manager_review_analytics_rls.sql`

## [2025-11-26] - UI: Clarify Parent Account Counts in FLM Dialog

- **UI**: Added "(Parents)" subtitle to Customers, Prospects, and Risk column headers
  - Makes it clear these counts are parent-level accounts only, not all accounts
- **Files**: `FLMDetailDialog.tsx`

## [2025-11-26] - Fix: FLM Detail Dialog Active Reps Count Blank

- **Fix**: Active Reps card and Sales Reps tab showing blank/0
  - Root cause: `activeReps` is converted from `Set` to `Array` in ComprehensiveReview.tsx before passing to dialog
  - Dialog was calling `.size` on what's actually an Array (Arrays use `.length`, not `.size`)
  - Solution: Handle both Set and Array types when displaying count
  - Updated interface to reflect `activeReps: Set<string> | string[]`
- **Files**: `FLMDetailDialog.tsx`

## [2025-11-26] - Fix: ARR/ATR Showing $0 in Before & After Comparison

- **Fix**: ARR and ATR values were showing $0 in the Before & After tab
  - Root cause: Query was missing `arr`, `atr`, `hierarchy_bookings_arr_converted` fields
  - Root cause: Restrictive filters (`.eq('is_customer', true)`) were excluding accounts
  - Solution: Added all necessary ARR fields to query
  - Solution: Added opportunities query for accurate ATR from Renewals
  - Solution: Query accounts per rep to properly handle owner_id vs new_owner_id
- **Files**: `ManagerBeforeAfterComparison.tsx`

## [2025-11-26] - Feature: Manager View Enhancements

### Parent/Child Account Nesting
- **Feature**: Added hierarchical account display in Manager Team View
  - Parent accounts now show expandable rows with child accounts nested underneath
  - Virtual parent nodes created for orphaned children (children whose parent isn't owned by this rep)
  - Click chevron icon to expand/collapse child accounts
  - Child accounts displayed with visual indentation and dot marker
- **Files**: `ManagerHierarchyView.tsx`

### CSV Export for Manager Views
- **Feature**: Added "Export CSV" button to Team View (ManagerHierarchyView)
  - Exports all accounts with FLM, rep, account details, ARR, ATR, location, tier, CRE status
- **Feature**: Added "Export CSV" button to Before & After comparison view
  - Exports rep-level comparison data with before/after metrics and change percentages
- **Files**: `ManagerHierarchyView.tsx`, `ManagerBeforeAfterComparison.tsx`

### Role-Aware Approval Status Routing
- **Fix**: Reassignment approval_status now correctly set based on user role:
  - FLM proposals → `pending_slm` (requires SLM approval first)
  - SLM proposals → `pending_revops` (skips SLM, goes directly to RevOps)
  - RevOps proposals → `approved` (auto-approved and applied immediately)
- **Files**: `ManagerHierarchyView.tsx`

### Role-Aware "My Proposals" Tab
- **Feature**: "My Proposals" tab now shows role-appropriate status cards:
  - FLM sees: Awaiting SLM, Awaiting RevOps, Approved, Rejected (4 cards)
  - SLM sees: Awaiting RevOps, Approved, Rejected (3 cards - no "Awaiting SLM")
  - RevOps sees: Applied, Rejected (2 cards - their changes are immediate)
- **Files**: `ManagerPendingApprovals.tsx`, `ManagerDashboard.tsx`

## [2025-11-26] - UI: Manager Dashboard Layout - Dropdown Build Selector
- **Change**: Replaced left sidebar build list with dropdown selector at top
  - Review area now uses full width instead of 9/12 columns
  - Build dropdown shows name, role (SLM/FLM), and shared date
  - Cleaner, more compact header layout
- **Files**: `ManagerDashboard.tsx`

## [2025-11-26] - UI: Manager Review Summary Stats Update
- **Change**: Combined tier percentages in rep stats display
  - T1 & T2 → now shown as single "T1&T2" combined percentage
  - Added "T3&T4" combined percentage (replaces standalone T2)
- **Fix**: Region match % now uses only CUSTOMER accounts as denominator
  - Previously: Region match counted all parent accounts (customers + prospects)
  - Now: Region match % is customers-only, matching tier and retention calculations
- **Files**: `ManagerHierarchyView.tsx`

## [2025-11-26] - Fix: Manager Hierarchy View Metrics & Sorting
- **Fix**: Tier percentages (T1%, T2%) now calculated against CUSTOMERS only, not all accounts
  - Previously: T1 = 1/127 total accounts = 1%
  - Now: T1 = 1/8 customers = 12.5%
- **Fix**: Retention % now based on customer count only
- **Fix**: Accounts now sort by type first (Customers → Prospects), then by ARR
- **Fix**: CRE Parents now counts accounts with `cre_status !== null` (matches ComprehensiveReview exactly)
  - Was incorrectly using `cre_risk=true` (wrong field)
  - Was also incorrectly summing `cre_count` before that
- **UI**: Changed "CRE" label to "CRE Parents" for clarity
- **UI**: Removed confusing Q1/Q2/Q3/Q4 renewal counts from rep rows
- **Files**: `ManagerHierarchyView.tsx`

## [2025-11-26] - Fix: ATR Not Displaying in Manager Hierarchy View
- **Fix**: ATR values showing $0 in Manager Dashboard hierarchy view
  - Root cause: `calculated_atr` field in accounts table was not populated
  - Solution: Query opportunities table directly for `Renewals` type with `available_to_renew` values
  - Now matches the approach used in `FLMDetailDialog` which correctly displays ATR
- **Files**: `ManagerHierarchyView.tsx`

## [2025-11-26] - Fix: ProtectedRoute Redirect Loop & Auth Context Cleanup
- **Fix**: Fixed ProtectedRoute causing infinite redirect loop when profile not yet loaded
  - Root cause: `authLoading` set to false before profile finished loading, causing `hasPageAccess` to return false
  - Added explicit check for `effectiveProfile` before checking permissions
  - Improved error logging to show user's role when access is denied
- **Fix**: Removed stale `team` field from `Profile` and `ImpersonatedUser` interfaces in AuthContext
  - This field was replaced by `region` in the earlier refactor but interface wasn't updated
- **Files**: `ProtectedRoute.tsx`, `AuthContext.tsx`

## [2025-11-25] - Fix: Parent Account Owner Shows "Unknown" in Rep Detail View
- **Fix**: Parent accounts labeled "(Parent - Not Owned)" now display the owner from their children
  - Previously, virtual parent accounts showed "Unknown" in the Previous Owner column
  - Now inherits owner info from child accounts (since they share ownership in the rep's view)
  - Affected view: Sales Rep Detail Dialog → Account Portfolio tab
  - File: `SalesRepDetailDialog.tsx`

## [2025-11-26] - Team Workspaces & Manager Approval Chain

### Architecture: Team-Based Workspaces
- **Feature**: Builds are now scoped to teams (AMER, EMEA, APAC)
- **Feature**: Users can belong to multiple teams via new `teams` array field on profiles
- **Feature**: Builds filtered by user's team memberships (REVOPS sees all)
- **Migration**: `20251126100001_add_team_to_builds.sql` - Added `team` column to builds
- **Migration**: `20251126100002_multi_team_profiles.sql` - Added `teams[]` to profiles
- **UI**: Team badge shown on build cards in Dashboard
- **UI**: Team selector when creating new builds

### Manager Approval Chain (FLM → SLM → RevOps)
- **Feature**: 3-tier approval workflow for account reassignments
  - FLM proposes → status: `pending_slm`
  - SLM approves → status: `pending_revops`
  - RevOps finalizes → status: `approved` (change applied)
- **Migration**: `20251126100003_approval_chain_reassignments.sql`
  - Added `approval_status` field with values: pending_slm, pending_revops, approved, rejected
  - Added `slm_approved_by`, `slm_approved_at` for SLM approval tracking
  - Added `revops_approved_by`, `revops_approved_at` for RevOps final approval
- **Component**: New `SLMApprovalQueue.tsx` for SLMs to review FLM proposals
- **ManagerDashboard**: FLM Approvals tab visible only to SLMs
- **ManagerDashboard**: "Approve All FLM Proposals" button for SLMs only
- **ReviewNotes**: RevOps now sees only `pending_revops` items awaiting final approval

### Permission Model Updates
- **FLM Permissions**: Can view own reps, add notes, propose reassignments (cannot approve)
- **SLM Permissions**: Can view their FLMs, add notes, propose reassignments, approve FLM proposals
- **REVOPS Permissions**: Full access, final approval authority
- **File**: Updated `useRolePermissions.ts` with explicit SLM_PERMISSIONS and FLM_PERMISSIONS

### Conflict Detection Scoping
- **Fix**: GlobalClashDetector now only detects conflicts between builds in the same team
- **Fix**: ClashDetector now filters clashes by user's team builds
- Cross-team conflicts are no longer relevant (separate workspaces)

### Files Changed
- `supabase/migrations/` - 3 new migrations
- `src/integrations/supabase/types.ts` - New fields for builds, profiles, manager_reassignments
- `src/contexts/AuthContext.tsx` - Added `teams` to Profile interface
- `src/pages/Dashboard.tsx` - Team filtering and team selector
- `src/pages/DataImport.tsx` - Team filtering and auto-set team on build creation
- `src/pages/ManagerDashboard.tsx` - Role-based tabs and approval flow
- `src/pages/ReviewNotes.tsx` - Filter by approval_status, RevOps final approval
- `src/pages/GlobalClashDetector.tsx` - Team-scoped conflict detection
- `src/pages/ClashDetector.tsx` - Team-scoped clash filtering
- `src/components/ManagerHierarchyView.tsx` - Set approval_status on reassignments
- `src/components/SLMApprovalQueue.tsx` - New component for SLM approval queue
- `src/hooks/useRolePermissions.ts` - FLM/SLM permission definitions

## [2025-11-26] - CRE Status Field & Parent Account Labels

### Database Changes
- **New Field**: Added `cre_status` (text) to accounts table
- **Migration**: `20251126000001_add_cre_status_to_accounts.sql`
  - Syncs worst CRE status from opportunities with hierarchy rollup
  - Priority: Confirmed Churn > At Risk > Pre-Risk Discovery > Monitoring > Closed
  - Parent accounts inherit worst status from self + all children

### Risk Detection Updates
- **Improved**: Risk detection now uses `cre_status` field instead of `cre_risk`/`cre_count` booleans
- **Severity Badges**: Color-coded badges based on CRE status severity
  - Red/destructive: "Confirmed Churn", "At Risk"
  - Gray/secondary: "Pre-Risk Discovery", "Monitoring", "Closed"

### UI Label Clarity
- **Review Page**: All account counts now specify "Parent Accounts" instead of generic "Accounts"
  - "Customer Accounts" → "Parent Accounts" (subtext: Customer hierarchies)
  - "Risk Accounts" → "At-Risk Parents" (subtext: Parent accounts with CRE status)
  - "Accounts Reassigned" → "Parents Reassigned"
  - "Prospect Accounts" → "Parent Accounts" (subtext: Prospect hierarchies)
  - Table column "Accounts" → "Parents"
- **FLM Detail Dialog**: Labels updated to "Parent Accounts"
- **High-Risk Section**: Now shows actual CRE status values with severity colors

## [2025-11-25 11:30 AM] - ATR Fix & Prospect Overview Cards
- **Fix**: ATR now fetches directly from opportunities table (Renewals with available_to_renew) instead of relying on calculated_atr field
- **Fix**: React Error #310 - Fixed type mismatch in opportunitiesForATR query causing blank screen
- **Feature**: View Mode Toggle on Review screen (All Accounts / Customers / Prospects)
- **Feature**: Prospect overview cards showing total, assigned, reassigned, retention rate

## [2025-11-25] - Fix: "Send All SLM Books to All Users" Upsert Error
- **Fix**: Fixed PostgreSQL error "ON CONFLICT DO UPDATE command cannot affect a row a second time"
  - Root cause: The `manager_reviews` table had a unique constraint on only `(build_id, manager_user_id)`
  - When sending ALL SLM books to ALL users, each user got multiple records (one per SLM)
  - PostgreSQL can't update the same conflict key twice in one batch
- **Solution**: Updated unique constraint to include `manager_name`: `(build_id, manager_user_id, manager_name)`
  - Now each user can have multiple manager assignments (one per SLM)
  - Updated upsert `onConflict` clause to match new constraint
- **Files**:
  - New migration: `20251125000001_fix_manager_reviews_unique_constraint.sql`
  - Updated: `SendToManagerDialog.tsx`

## [2025-11-25] - Feature: Deep Drill-Down in Review Dashboard (FLM → Accounts → Children)
- **Feature**: Enhanced FLM detail dialog with new "All Accounts" tab
  - Click any FLM row in Portfolio Summary → See both **Sales Reps** and **All Accounts** tabs
  - Accounts tab shows all parent accounts under that FLM with expandable child accounts
  - Filter by: Customers, Prospects, or All
  - Search by account name, owner, or location
  - Click parent row to expand and see all child accounts underneath
  - Click account row to open Account Detail dialog
- **Feature**: Portfolio Summary now supports Customers AND Prospects
  - Toggle button at top: "Customers (N)" / "Prospects (N)"
  - Customers view: Same as before with ARR, ATR, tier distribution
  - Prospects view: Shows prospect count, top geo, tier distribution, retention %
  - Prospect table has blue accent styling to differentiate from customers
- **Technical**: New `prospectAccounts` query fetches all prospect parent accounts
- **Technical**: New `prospectPortfolioSummary` useMemo calculates prospect metrics by SLM/FLM
- **Files**: `FLMDetailDialog.tsx` (major rewrite), `ComprehensiveReview.tsx`

## [2025-11-25] - UX: Review Page Now Shows Both Customers AND Prospects
- **Feature**: Added view mode toggle (All / Customers / Prospects)
  - "All Accounts" view shows both customer and prospect portfolios
  - Dedicated summary cards for each account type
  - Customer cards show ARR, ATR, Risk accounts
  - Prospect cards show assignment count, retention rate
- **UX**: Visual distinction with colored left borders (green=customers, blue=prospects)
- Files: `ComprehensiveReview.tsx`

## [2025-11-25] - UX: Assignment Success Confirmation Dialog
- **Feature**: New animated success dialog when assignments are applied
  - Animated checkmark with confetti effect
  - Shows count of applied assignments
  - Quick navigation buttons to Balancing or Review dashboards
- **Fix**: Batch update now tolerates small failure rates (<10%)
  - Previously 196 failures out of 6,380 (3%) would crash the entire process
  - Now logs warning but completes successfully if >90% succeed
- Files: `AssignmentSuccessDialog.tsx` (new), `AssignmentEngine.tsx`, `assignmentService.ts`

## [2025-11-25] - UX: Fix Navigation from Locked Pages & Lock Review Tab
- **Fix**: "Go to Assignments" button on locked Balancing/Review pages now correctly switches to Assignments tab
  - Added URL query parameter support (`?tab=assignments`) to BuildDetail
  - Tab state now syncs with URL for deep-linking
- **Feature**: Review Dashboard now also locked until assignments are applied
  - Same lock screen pattern as Balancing Dashboard
  - Clear instructions on how to unlock via Assignment Engine
- Files: `BuildDetail.tsx`, `ComprehensiveReview.tsx`, `EnhancedBalancingDashboard.tsx`

## [2025-11-25] - **SECURITY**: Remove Hardcoded Gemini API Key
- **Security Fix**: Removed hardcoded Google Gemini API key from frontend code
  - API keys were exposed in `SimplifiedAssignmentConfig.tsx` and `TerritoryMappingInterface.tsx`
  - Anyone viewing network requests or source code could see and abuse the key
- **Solution**: Created `gemini-territory-mapping` Supabase Edge Function
  - API key now stored securely as `GEMINI_API_KEY` environment variable on server
  - Frontend calls edge function, which proxies request to Gemini API
- **Files Changed**:
  - New: `supabase/functions/gemini-territory-mapping/index.ts`
  - Updated: `src/services/geminiRegionMappingService.ts` (calls edge function instead of direct API)
  - Updated: `src/components/SimplifiedAssignmentConfig.tsx` (removed API key)
  - Updated: `src/components/TerritoryMappingInterface.tsx` (removed API key)
  - Updated: `supabase/config.toml` (added function config)
- **Action Required**: Add `GEMINI_API_KEY` secret to Supabase Edge Function environment

## [2025-11-25] - UX: Proper Imbalance Warning Dialog
- **Feature**: Replaced browser `window.confirm()` with proper React dialog for imbalance warnings
  - Clean UI showing overloaded rep name, ARR, target, and percentage
  - Actionable suggestions on how to improve balance (adjust Max ARR, variance, lock accounts)
  - "Go Back & Adjust" or "Apply Anyway" options
- **Refactor**: Moved imbalance check logic into hook state for better UI control
- Files: `ImbalanceWarningDialog.tsx` (new), `useAssignmentEngine.ts`, `AssignmentEngine.tsx`

## [2025-11-25] - UX: Lock Balancing Dashboard Until Assignments Applied
- **Feature**: Balancing Dashboard now shows "locked" state when no assignments exist
  - Clear explanation of why the dashboard is locked
  - Step-by-step instructions on how to unlock (generate + apply assignments)
  - "Go to Assignments" button for easy navigation
- **Data**: Added `assignedAccountsCount` to balancing data to track applied assignments
- Files: `EnhancedBalancingDashboard.tsx`, `useEnhancedBalancing.ts`

## [2025-11-25] - UX: Improved Assignment Apply Flow
- **Feature**: Added prominent "Apply" button at TOP of Assignment Preview dialog
  - No more scrolling through 6000+ proposals to find the Apply button
  - Green action bar with clear messaging about what will happen
- **Feature**: Added "Pending Assignments" alert on main Assignment Engine page
  - Shows amber warning when assignments are generated but not yet applied
  - Includes Review and Apply buttons directly on the main page
  - No need to re-open Preview dialog to apply pending assignments
- Files: `AssignmentPreviewDialog.tsx`, `AssignmentEngine.tsx`

## [2025-11-25] - UX: Add Info Tooltip to "Keep" Lock Button
- **Feature**: Added info icon (ℹ️) next to "Keep" column header in account tables
- **UX**: Enhanced tooltip explains the lock functionality clearly:
  - "Locking an account prevents the assignment engine from changing its owner"
  - "Use this before generating assignments to keep accounts with their current owner"
- Files: `VirtualizedAccountTable.tsx`, `AccountsTable.tsx`

## [2025-11-25] - UI: Remove Rules Map & Upgrade Gemini Model
- **Refactor**: Removed "Rules Map" button from territory mapping UI
  - AI Auto-Map is now the only mapping option (uses Gemini for intelligent matching)
  - Removed unused `Wand2` icon import
  - File: `SimplifiedAssignmentConfig.tsx`
- **Upgrade**: Updated Gemini model from 1.5 Flash to 2.0 Flash
  - Better accuracy and faster response times for territory mapping
  - File: `geminiRegionMappingService.ts`
- **Fix**: Enhanced Gemini prompt with exact 4-region breakdown
  - **West**: WA, OR, CA, NV, UT, AZ, ID, AK, HI + British Columbia (Canada)
  - **Central**: MT, ND, SD, NE, KS, MO, IA, MN, WI, IL, IN, MI, OH, CO, WY, NM + Alberta (Canada)
  - **South East**: TX, OK, AR, LA, MS, AL, GA, FL, SC, NC, TN, KY, VA, WV, MD, DC, DE
  - **North East**: ME, NH, VT, MA, RI, CT, NY, NJ, PA + Quebec, Ontario (Canada)
  - Added specific city names and area keywords for each region
  - Now matches actual Pendo regional structure

## [2025-11-25] - Fix: BuildDataService Only Loading 6000 Accounts
- **Bug**: Supabase has a default 1000 row limit per request that `.range()` doesn't override
- **Fix**: Added `.limit(pageSize)` to batch fetch queries in `buildDataService.ts`
- Import was working correctly (27,255 imported), but loading/fetch was capped at 6×1000=6000

## [2025-11-25] - Performance: Batch Import Speed & Reliability Improvements v2
- **UX**: Added browser warning when trying to refresh/close during active import
  - Prevents accidental interruption of imports
- **Performance**: Tripled batch size for large imports (1000 → 3000 records per batch)
  - For 27k+ records: ~9 batches instead of ~28
  - Increased concurrent batches from 3 → 5 for accounts/sales_reps
  - Opportunities: 100 → 500 batch size, 2 → 4 concurrent batches
- **Reliability**: Fixed imports getting interrupted at ~6000 records
  - Removed `.select('id')` from inserts - was causing timeouts by returning all IDs
  - Increased retry attempts from 2 → 4 with exponential backoff (up to 10s)
  - Added more error types to retry list (rate limiting, serialization failures)
  - Added 25ms delay between starting batches to prevent overwhelming Supabase
- **Files Changed**:
  - `DataImport.tsx` - Added beforeunload warning during imports
  - `batchImportService.ts` - All batch import methods updated with better retry logic
  - `importUtils.ts` - Increased batch sizes and concurrent batches

## [2025-11-25] - Feature: Developer Flag & Dynamic Role Permissions
- **Feature**: Added `developer` boolean flag to profiles table for secure access control
  - Only users with `developer = true` can access the Role Permissions Manager panel
  - Flag can ONLY be set directly in Supabase (not through UI) for security
  - Added trigger to prevent users from modifying their own developer status
  - Independent of role - any SLM, FLM, or REVOPS user can have developer access
  - Migration: `20251125000001_add_developer_flag.sql`
- **Feature**: Made Role Permissions system actually functional
  - Previously: Settings toggles saved to `role_permissions` table but were never enforced
  - Now: Created `useRolePermissions` hook that fetches permissions from database
  - Sidebar navigation dynamically shows/hides pages based on role permissions
  - REVOPS always has full access (hardcoded for security)
  - SLM/FLM permissions are read from `role_permissions` table
- **Files Changed**:
  - New: `useRolePermissions.ts` - Hook for fetching and checking permissions
  - New: `20251125000001_add_developer_flag.sql` - Migration for developer column
  - Updated: `types.ts` - Added `developer` field to profiles types
  - Updated: `AuthContext.tsx` - Added `developer` to Profile interface
  - Updated: `AppSidebar.tsx` - Uses dynamic permissions instead of hardcoded roles
  - Updated: `Settings.tsx` - RolePermissionsManager gated by `developer === true`

## [2025-11-25] - Performance: Parallel Account Loading in BuildDataService
- **Performance**: MAJOR - Changed from sequential to parallel batch fetching in `buildDataService.ts`
  - Root cause: "Continue Building" was making 24+ sequential API calls (1000 records each), waiting for each to complete before the next
  - Solution: Now uses `Promise.all()` to fetch all batches in parallel
  - Increased batch size from 1,000 to 5,000 records (fewer requests)
  - Added count query first to know exact number of batches needed
  - Re-enabled 5-minute cache (was disabled for debugging)
  - Both `getBuildDataSummary()` and `getBuildDataRelationships()` now use parallel fetching
  - Expected improvement: 10-20x faster load times (24 sequential requests → 5-6 parallel requests)
  - Added timing logs to console: "Loaded X accounts in Yms (Z parallel batches)"
  - File: `buildDataService.ts`

## [2025-11-25] - Feature: AI-Powered Region Mapping with Gemini
- **Feature**: Major enhancement to territory-to-region mapping with AI intelligence
  - Created new `geminiRegionMappingService.ts` that uses Google's Gemini 1.5 Flash API for intelligent territory matching
  - AI analyzes territory names against available sales rep regions and suggests the best matches
  - Added "Not Applicable" option for territories that don't belong to any available region
    - Example: Australian accounts when all sales reps are in US regions
    - These accounts are properly excluded from geographic assignment matching
  - Added ability to clear/unselect a region mapping (previously not possible)
  - Enhanced UI in `SimplifiedAssignmentConfig`:
    - "AI Auto-Map" button (purple gradient) uses Gemini for intelligent mapping
    - "Rules Map" button uses traditional rule-based matching as fallback
    - Visual confidence badges show AI's certainty level (high/medium/low)
    - Hover over badges to see AI's reasoning
    - Clear (X) button to remove individual mappings
    - Color-coded rows: green for mapped, gray for Not Applicable
  - Updated `TerritoryMappingInterface` with same AI capabilities:
    - New "Not Applicable" tab to view all excluded territories
    - AI mapping button in header
    - All region dropdowns now include the Not Applicable option
  - Files: `geminiRegionMappingService.ts` (new), `SimplifiedAssignmentConfig.tsx`, `TerritoryMappingInterface.tsx`

## [2025-11-24] - Fix: Data Verification Refresh Shows Stale Data
- **Fix**: Data Verification "Refresh" button now properly fetches fresh data from Supabase
  - Root cause: `buildCountService` had a 2-minute cache that was returning stale data
  - Added `forceRefresh` parameter to `getBuildCounts()` to bypass cache when user clicks Refresh
  - Reduced cache TTL from 2 minutes to 30 seconds for more responsive UI
  - Cache is now automatically cleared after successful data imports
  - Refresh button shows toast confirmation with record counts
  - Files: `buildCountService.ts`, `DataVerification.tsx`, `DataImport.tsx`

## [2025-11-24] - Feature: Persist Import Metadata Across Page Refreshes
- **Feature**: Field mapping and validation status now persists to Supabase and survives page refreshes
  - Created new `import_metadata` table to store import configuration per build per data type
  - Saves: import status, field mappings, auto-mapping summary, validation summary, row counts
  - After importing data, the Field Mapping and Validation tabs now show the saved state
  - No more empty tabs after page refresh - shows "Import Completed" with stats
  - Field Mapping tab shows: record count, fields with data, required fields status, mapped field badges
  - Validation tab shows: total records, valid records, fields with data, warnings count
  - Both tabs show green "completed" styling for imported data
  - **Fallback for old imports**: When no metadata exists, counts populated fields from a sample Supabase row
  - Files: `DataImport.tsx`, `types.ts`, new migration `20251124000001_add_import_metadata.sql`

## [2025-11-24] - Fix: Build Switching Not Clearing Import Files (v2)
- **Fix**: DataImport now properly clears files when switching builds or on page reload
  - Used 'INITIAL' sentinel value to properly detect first render vs build changes
  - Added check on initial render to clear orphaned files when no build is selected
  - Added validation in `loadBuilds` to detect when stored build ID no longer exists in Supabase
  - When stored build is deleted/missing, files are cleared and a valid build is selected
  - This fixes the issue where files from a deleted build would persist on page reload
  - File: `DataImport.tsx`

## [2025-11-24] - Fix: Build Deletion Not Clearing All Data
- **Fix**: Build deletion now properly clears localStorage data
  - When deleting a build, the frontend now clears `dataImport_files`, `dataImport_activeTab`, and `dataImport_currentBuildId` from localStorage if the deleted build matches the current import build
  - Also clears any `assignment_checkpoint_${buildId}` localStorage entries
  - Root cause: Build deletion only deleted from Supabase but left localStorage state, causing stale data to appear in DataImport
  - Note: Supabase CASCADE constraints should auto-delete related data (accounts, opportunities, etc.) - if this isn't happening, the `20251028185105_e11a53d5-9020-4722-a33f-b72163878364.sql` migration may need to be run
  - File: `Dashboard.tsx`

## [2025-11-24] - UI: Remove Size Column from Import Table
- **Refactor**: Removed the "Size" column from the CSV import file list table
  - Removed `<TableHead>Size</TableHead>` header
  - Removed the table cell showing file size in KB
  - File: `DataImport.tsx`

## [2025-11-24] - Fix: Auto-Mapping for ARR Fields (v2)
- **Fix**: Corrected CSV column auto-mapping for ARR fields in data import
  - **ACCOUNTS `arr` field**: Removed `'Bookings Account ARR (converted) Currency'` from aliases
    - Currency column was incorrectly mapping to the numeric ARR field
    - Now only `'Bookings Account ARR (converted)'` and standard ARR aliases map to `arr`
  - **OPPORTUNITIES `available_to_renew` field**: 
    - Added `'Available to Renew (converted)'` as explicit exact-match alias (takes priority)
    - Updated pattern to `/^available.*to.*renew(?!.*currency)/i` - negative lookahead excludes Currency columns
    - CSV column "Available to Renew (converted)" now correctly maps to `available_to_renew`
    - CSV column "Available to Renew (converted) Currency" is now excluded from matching
  - Root cause: Both the ARR value column and the currency code column shared similar names, causing the wrong one to be selected via partial/pattern matching
  - File: `autoMappingUtils.ts`

## [2025-11-24] - Performance: Parallel Account Loading
- **Fix**: CRITICAL - Fixed extremely slow account loading due to duplicate fetches and sequential pagination
  - Root cause #1: `staleTime: 0` and `gcTime: 0` combined with `queryClient.removeQueries()` caused the same query to run multiple times
  - Root cause #2: Pages were being fetched sequentially in a `while` loop instead of in parallel
  - Fixed by removing aggressive cache clearing and changing to parallel fetch with `Promise.all()`
  - Updated cache settings: `staleTime: 5 minutes`, `gcTime: 10 minutes` (was 0)
  - Result: ~7-10x speed improvement on initial load (7 pages × 200ms sequential → all pages in ~200-400ms parallel)
  - File: `useAssignmentEngine.ts`

## [2025-11-25] - UI Improvements: Assignment Controls
- **Feature**: Reorganized Assignment Controls into logical groups with labels
  - Configuration row: Configure Assignment Targets
  - Generate row: Customers | Prospects | All (with "Generate:" label)
  - Actions row: Preview | Reset All (with "Actions:" label)
  - Export row: Customers | Prospects | All (with "Export:" label)
- **Feature**: Config save now redirects back to Assignment Engine
  - Added `useNavigate` to `SimplifiedAssignmentConfig.tsx`
  - After saving, redirects to `/build/${buildId}` after 500ms
- **Removed**: "Fix Assignment Data" button (rarely-used data repair utility)

## [2025-11-25] - Fix Customer/Prospect Classification
- **Fix**: CRITICAL - Fixed customer vs prospect classification showing 0 customers
  - Root cause: `is_customer` field in database was `false` for all accounts (never synced during import)
  - The UI was using `is_customer` from DB while some code calculated from `hierarchy_bookings_arr_converted`
  - Classification logic (confirmed by Nina):
    - Customer = parent account with `hierarchy_bookings_arr_converted > 0`
    - Prospect = parent account with `hierarchy_bookings_arr_converted <= 0` or NULL
  - Created migration `20251125000002_sync_is_customer_from_hierarchy_arr.sql` to sync all existing accounts
  - Updated `batchImportService.ts` to auto-sync `is_customer` after every account import
  - Updated `useAssignmentEngine.ts` to use `is_customer` consistently from DB
  - Result: 410 customers, 5,970 prospects now correctly classified

## [2025-11-24] - UI: Always Show All Generation Buttons
- **Feature**: Made "Generate Customer Assignments" and "Generate Prospect Assignments" buttons always visible in Assignment Controls
  - Previously these buttons only showed when on their respective tabs (customers/prospects)
  - Now both buttons are always visible alongside "Generate All Assignments"
  - "Generate All Assignments" correctly runs both customer AND prospect generation (fixed in earlier change)
  - File: `AssignmentEngine.tsx`

## [2025-11-24] - Generate All Assignments Bug Fix
- **Fix**: CRITICAL - Fixed "Generate All Assignments" button only generating prospect assignments
  - Root cause: When `accountType === 'all'`, the ternary `accountType === 'customers' ? 'customer' : 'prospect'` evaluated to `'prospect'` because `'all' !== 'customers'`
  - The `generateSimplifiedAssignments` function only accepts `'customer'` or `'prospect'`, not `'all'`
  - Fixed by detecting when `accountType === 'all'` and running `generateSimplifiedAssignments` twice:
    1. First for customer accounts (filtered by `is_customer === true`)
    2. Then for prospect accounts (filtered by `is_customer === false`)
  - Combined proposals and warnings from both runs into final result
  - Added progress updates to show separate "Generating customer assignments..." and "Generating prospect assignments..." stages
  - File: `useAssignmentEngine.ts` (handleGenerateAssignments function)

## [2025-11-21] - Phase 1: Manager Workflow Enhancements (v1.1.0)
- **Feature**: Enhanced Manager Notes with categories, status, and tags
  - Added note categories: General, Concern, Question, Approval
  - Added note status: Open, Resolved, Escalated
  - Added tag support (comma-separated, e.g., "high-arr, cre-account, geographic-mismatch")
  - Added filtering by category and status in notes display
  - Added reassignment_id foreign key to link notes to specific reassignments
  - Enhanced UI with category icons (MessageSquare, AlertCircle, HelpCircle, CheckCircle)
  - Color-coded badges for categories and statuses
  - File: `ManagerNotesDialog.tsx`
- **Feature**: Added Impact Analytics to Comprehensive Review page
  - New "Impact Analytics" row showing 4 key metrics:
    - Accounts Reassigned (count + percentage of total)
    - ARR Impacted (sum of reassigned account ARR)
    - Retention Rate (percentage staying with same owner)
    - High-Risk Reassignments (CRE accounts being moved)
  - All metrics calculate using `hierarchy_bookings_arr_converted` as primary ARR source
  - File: `ComprehensiveReview.tsx` (lines 647-711)
- **Feature**: Added Impact Analysis tab to Comprehensive Review page
  - New dedicated tab showing 4 analysis cards:
    1. **Managers with Biggest Changes**: Top 5 FLMs by account reassignment count
    2. **Largest ARR Movements**: Top 5 accounts >$500K ARR being reassigned
    3. **High-Risk Reassignments**: CRE accounts being moved to new owners
    4. **Coverage Gaps**: High-value accounts without assigned owners
  - All cards are interactive - clicking opens account detail dialog
  - File: `ComprehensiveReview.tsx` (lines 1016-1259)
- **Database**: Created manager_review_analytics table for team review tracking
  - Tracks reassignment metrics (total, pending, approved, rejected counts)
  - Tracks note metrics (total, open, concern counts)
  - Tracks performance metrics (avg turnaround time, first reviewed, last activity)
  - Auto-updates via triggers on manager_reassignments and manager_notes tables
  - Migration: `20251121000002_add_manager_workflow_enhancements.sql`
- **Database**: Enhanced manager_notes table schema
  - Added `category` column (concern, question, approval, general)
  - Added `status` column (open, resolved, escalated)
  - Added `tags` TEXT[] column for flexible tagging
  - Added `reassignment_id` FK to link notes to reassignments
  - Added performance indexes on (build_id, manager_user_id, status)
  - Migration: `20251121000002_add_manager_workflow_enhancements.sql`

## [2025-11-21] - Critical ARR Display & Prospect Assignment Fixes (TESTING - Not Yet Verified)
- **Fix**: CRITICAL - Fixed Customer ARR showing $0 in balancing dashboard due to string vs number type issue
  - Root cause: PostgreSQL `NUMERIC` columns returned as strings by Supabase (e.g., `"3304500"` instead of `3304500`)
  - JavaScript `||` operator treated strings as truthy, but string concatenation broke math: `0 + "3304500"` = `"03304500"` (string)
  - Fixed by wrapping all ARR field access with `parseFloat()` to convert strings to numbers before math operations
  - Changes in `useEnhancedBalancing.ts`: totalCustomerARR calculation (line 207) and account details (line 320)
  - Changes in `enhancedRepMetrics.ts`: parent accounts (line 117) and split ownership children (line 134)
  - Balancing dashboard now correctly shows per-rep ARR values (e.g., Elizabeth Evans: $27.3M, Haley Mueller: $21.7M)
- **Fix**: Fixed prospect accounts showing 0 instead of 5,970 in balancing dashboard
  - Removed `.not('new_owner_id', 'is', null)` filter from accounts query in `useEnhancedBalancing.ts:148`
  - Query now fetches ALL parent accounts (both assigned and unassigned)
  - Summary cards now correctly show: 410 customers + 5,970 prospects
- **Important**: Assignment generation handles customers and prospects separately
  - Three generation options available in Assignment Engine: "Generate Customer Assignments", "Generate Prospect Assignments", "Generate All Assignments"
  - Clicking "Generate Customer Assignments" only processes 410 customer accounts
  - Prospects (5,970 accounts) must be assigned separately via "Generate Prospect Assignments" button on Prospects tab or "Generate All Assignments"
  - RebalancingAssignmentButton component (unused) also has three buttons: "Rebalance Customers", "Rebalance Prospects", "Rebalance All"
  - Assignment service correctly filters by `is_customer` field based on accountType parameter ('customers' | 'prospects' | 'all')
  - See `AssignmentEngine.tsx:536` (onGenerateAssignments) and `rebalancingAssignmentService.ts:934` (getParentAccounts)
- **Fix**: Fixed retention and regional alignment percentage calculations
  - Updated formulas to only count ASSIGNED accounts (with `new_owner_id` set) in denominator
  - Before: Divided by ALL accounts, causing false 0% for unassigned accounts
  - After: Divides by assigned accounts only, showing correct percentages
  - Customer Retention: Now calculates as (retained/assigned) instead of (retained/total)
  - Prospect Retention: Now calculates as (retained/assigned) instead of (retained/total)
  - Prospect Regional Alignment: Now calculates as (aligned/assigned) instead of (aligned/total)
  - Changes in `useEnhancedBalancing.ts`: lines 229-239 (customer), 368-380 (prospect retention), 398-402 (prospect alignment)
- **Fix**: Missing `hierarchy_bookings_arr_converted` field in balancing query
  - Added field to accounts SELECT query in `useEnhancedBalancing.ts:132`
  - Updated ARR calculation priority order: `hierarchy_bookings_arr_converted` → `calculated_arr` → `arr` → `0`
  - Ensures primary ARR source is used consistently across all calculations
- **Fix**: Automatic ATR calculation after opportunities import
  - Added `calculateATRFromOpportunities()` method to `batchImportService.ts`
  - Automatically sums `available_to_renew` from renewal opportunities by account
  - Only updates `accounts.calculated_atr` if currently NULL or 0 (preserves existing values)
  - Eliminates need for manual SQL updates or edge function calls
  - ATR now populated immediately after opportunities import completes
- **Fix**: Bypassed failing `recalculate-accounts` edge function CORS errors
  - Modified `useAccountCalculations.ts` to skip edge function call since ATR calculated during import
  - Changed to just refresh UI data instead of calling external function
  - No longer blocks assignment generation with CORS errors
  - Edge function still available but not required for normal operation

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
