# Changelog

All notable changes to this project will be documented in this file.

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
