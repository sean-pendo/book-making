# Changelog

---

## Release v1.3.4 (2025-12-14)

### Unified Scoring & Complete Documentation

#### Analytics Scoring Unified
- `types/analytics.ts` now imports GEO_MATCH_SCORES from `@/_domain/constants`
- Geo scores unified: exact=1.0, sibling=0.85, parent=0.65, global=0.40
- Team alignment scores unified with optimization model formula

#### MASTER_LOGIC.mdc Additions
- Added Section 11: Analytics & Success Metrics
- Documented LP Success Metrics (Balance, Continuity, Geography, Team Alignment)
- Added ARR Distribution Buckets for chart visualization
- Updated section numbering for Part 3

#### CURSOR.mdc Updates
- Updated QA Status from "v1.0 unstable" to "v1.3+ stabilized"
- Fixed docs structure references (removed stale qa_log.md reference)
- Updated assignment engine list to reflect current active services

---

## Release v1.3.3 (2025-12-14)

### Documentation Cleanup & MASTER_LOGIC Audit

#### Archived (moved to `docs/archive/`)
- `stability.plan.md` - Stability priority implementation plan
- `pure_optimization_plan.md` - LP engine implementation plan
- `model_analysis.md` - Assignment engine theory doc
- `qa_log.md` - Historical QA notes from v1.0

#### Deleted (obsolete)
- `docs/core/ideas.md` - Generic brainstorming
- `docs/ops/prospect_accounts_data_issue.md` - Old bug doc
- `docs/README.md` - Redundant ToC
- `bun.lockb` - Regenerated lockfile (using npm)

#### MASTER_LOGIC.mdc Enhancements
- Added optimization weights section (customer vs prospect)
- Added batch sizes and Supabase limits
- Added key constants (continuity days, Sales Tools threshold, high-value ARR)
- Fixed `isCustomer()` to reflect current implementation
- Updated conflicts section to show all resolved
- Fixed path references to `_domain/` folder

---

## Release v1.3.2 (2025-12-14)

### Dead Code Cleanup & Domain Consolidation

Major codebase cleanup removing ~4,000 lines of dead code and consolidating business logic.

#### Files Deleted (15 total)
- **Components** (12 files, ~3,500 lines):
  - `SophisticatedAssignmentControls.tsx`, `SophisticatedAssignmentRulesBuilder.tsx`
  - `AssignmentConfigurationUI.tsx`, `SimpleAssignmentConfiguration.tsx`
  - `AdvancedRuleBuilder.tsx`, `ConditionalModifierBuilder.tsx`
  - `RuleFieldMapper.tsx`, `AIRuleGenerator.tsx`, `AIBatchProgress.tsx`
  - `DataRecovery.tsx`, `DataRecoveryFix.tsx`
- **Utils** (2 files, ~400 lines):
  - `ruleValidator.ts` (circular dead code with AdvancedRuleBuilder)
- **Config files**:
  - `firebase.json`, `netlify.toml`, `bun.lockb`
  - `FIREBASE_QUICKSTART.md`, `HOSTING_COMPARISON.md`

#### Domain Consolidation
- Verified all suspected dead services are actually live
- Updated `CLEANUP_PLAN.md` with verified status
- Documented customer classification design decision (hierarchy_bookings only)

#### Build
- Confirmed build passes with all deletions
- Removed bun lockfile (using npm)

---

## Release v1.3.1 (2025-12-14)

### Major Accomplishments

This release represents a significant leap forward in assignment engine capabilities, analytics, and user customization.

#### New Optimization Model
- Integrated HiGHS LP solver for mathematically optimal account distribution
- Replaced greedy assignment with true multi-constraint optimization
- Balance ARR, ATR, Pipeline, and account counts simultaneously

#### Priority Customization System
- Dynamic priority waterfall configuration per assignment mode
- Drag-and-drop priority reordering in UI
- Enable/disable individual priorities (Manual Holdover, Stability Accounts, Team Alignment, Geography, Continuity, etc.)
- Sub-condition toggles for Stability Accounts (CRE Risk, Renewal Soon, PE Firm, Recent Owner Change)

#### Enhanced Analytics
- Before vs After dashboard with ghost-bar comparisons
- Success metric tiles (Geo Alignment, Team Alignment, Coverage, Continuity)
- Customer/Prospect cards with parent/child breakdown on hover
- Improved threshold visualization with color-coded bars

#### Other Features
- Parent-child conflict resolution with implicit priority handling
- Improved territory-to-region auto-mapping
- Backfill migration support for departing reps
- Manager reassignment approval workflow enhancements

### Known Issues

There is fragmented business logic across the codebase that will be addressed in v1.4:
- Duplicate calculation functions in `utils/` and `domain/`
- Inconsistent region hierarchy definitions across services
- Not all files import from centralized `@/domain` module

### Next Steps (v1.4)

- Centralize all business logic into `src/domain/`
- Create comprehensive `business_logic.md` documentation
- Refactor all files to use single source of truth
- Clean up duplicate/dead code

---

## [2025-12-14] - Feature: Customer/Prospect Cards Show Total with Parent/Child Breakdown on Hover

### Summary
Updated the Customer and Prospect KPI cards across the app to show total counts (parent + children) by default, with a tooltip breakdown on hover showing how many are parents vs children.

### Changes
- Updated `BuildDataSummary` interface with new fields: `childCustomers`, `childProspects`, `totalCustomers`, `totalProspects`
- Modified `buildDataService.ts` to calculate child account breakdowns by linking to parent customer/prospect accounts
- Updated `BalancingKPIRow` component to display totals with hover tooltips showing parent/child breakdown
- Updated `BuildDetail.tsx` overview cards with the same tooltip breakdown pattern
- Added child counts pass-through in `TerritoryBalancingDashboard`

### Files Modified
- `src/services/buildDataService.ts`
- `src/components/balancing/BalancingKPIRow.tsx`
- `src/pages/BuildDetail.tsx`
- `src/pages/TerritoryBalancingDashboard.tsx`

---

## [2025-12-14] - Fix: Before vs After Dashboard Improvements

### Summary
Fixed several UX issues in the Before vs After tab based on user feedback.

### Changes

**Terminology Standardization:**
- Renamed "Regional Alignment" to "Geo Alignment" for consistency with Overview tab
- Updated tooltips and comments to use consistent terminology

**Target Zone Visibility:**
- Increased green target zone opacity from 10% to 25%
- Added left/right borders to the target zone
- Made min/max threshold lines dashed for better visibility
- Moved target line rendering order so it appears above bars

**Tooltip Z-Index Fix:**
- Added z-50 class to all TooltipContent components
- Prevents tooltips from being covered by adjacent charts

**Geo Alignment Calculation:**
- Changed from using lpMetrics.geographyScore to geoAlignment.alignmentRate
- Now consistent with how Overview tab calculates and displays this metric

### Files Modified
- `src/components/balancing/BeforeAfterTab.tsx`
- `src/components/balancing/BeforeAfterDistributionChart.tsx`
- `src/components/balancing/BeforeAfterAccountChart.tsx`
- `src/components/balancing/SuccessMetricTile.tsx`

---

## [2025-12-13] - Feature: Before vs After Dashboard Tab

### Summary
Redesigned the "Before vs After" tab in the Territory Balancing Dashboard with comprehensive comparison metrics, ghost-bar visualizations, and success metric tiles.

### Changes

**Part 1: Fixed RepDistributionChart Threshold Coloring**
- Added dynamic bar coloring based on thresholds using Recharts Cell components
- Blue = below floor, Green = in target range, Red = over ceiling
- Added ReferenceArea for visual green target zone between min and max
- Updated legend to show color meanings (Below Floor / In Range / Over Ceiling)
- Enhanced tooltips to show threshold status for each bar

**Part 2: Created New Components**

**SuccessMetricTile.tsx:**
- Compact before → after metric tiles with delta indicators
- TrendingUp/TrendingDown icons for positive/negative changes
- Hover tooltips with detailed breakdowns
- Supports N/A state for unavailable metrics

**BeforeAfterDistributionChart.tsx:**
- Gray "ghost" bars showing original assignment values
- Colored bars showing proposed values (blue/green/red by threshold)
- ARR/ATR/Pipeline toggle (same pattern as existing charts)
- Summary stats with CV delta indicator
- Target zone visualization with threshold lines

**BeforeAfterAccountChart.tsx:**
- Customer/Prospect stacked bars with before/after comparison
- Parent/Child breakdown in tooltips
- Delta indicators showing net account changes per rep

**BeforeAfterTab.tsx:**
- Row 1: Success metric tiles (Regional Alignment, Team Alignment, Coverage, Continuity)
- Row 2: Side-by-side distribution and account charts
- Integrated with useMetricsComparison hook for data

**Part 3: Integration**
- Updated TerritoryBalancingDashboard.tsx to use new BeforeAfterTab
- Changed tab label from "Before / After" to "Before vs After"

### Files Modified
- `src/components/analytics/RepDistributionChart.tsx`
- `src/pages/TerritoryBalancingDashboard.tsx`
- `src/components/balancing/index.ts`

### Files Created
- `src/components/balancing/SuccessMetricTile.tsx`
- `src/components/balancing/BeforeAfterDistributionChart.tsx`
- `src/components/balancing/BeforeAfterAccountChart.tsx`
- `src/components/balancing/BeforeAfterTab.tsx`

---

## [2025-12-13] - Feature: Account Changes Tab in Sales Rep Detail Dialog

### Summary
Added a new "Account Changes" tab to the Sales Rep Detail Dialog that shows which accounts are being gained and lost by each rep after assignments are applied.

### Changes
**SalesRepDetailDialog.tsx:**
- Added third tab "Account Changes" with ArrowRightLeft icon
- Badge shows count of total account changes
- **Accounts Gaining section**: Shows accounts being transferred TO this rep
  - Lists account name, type (customer/prospect), previous owner, and geo
  - Displays ARR value in emerald/green
  - Sorted by ARR (highest first)
  - Summary shows total ARR being gained
- **Accounts Losing section**: Shows accounts being transferred FROM this rep
  - Lists account name, type, new owner, and geo
  - Displays ARR value in red
  - Summary shows total ARR being lost
- **Net Impact Summary**: Shows consolidated view with:
  - Number of accounts gained vs lost
  - Net ARR impact (positive/negative with color coding)

### Technical Details
- New query fetches accounts where `new_owner_id = rep_id AND owner_id != rep_id` (gaining)
- And accounts where `owner_id = rep_id AND new_owner_id IS NOT NULL AND new_owner_id != rep_id` (losing)
- Only shows parent accounts for cleaner view
- Uses subtle emerald/red color theming that's "demure" and optimal UX
- Loading state and empty state handled gracefully

### Files Modified
- `src/components/data-tables/SalesRepDetailDialog.tsx`

---

## [2025-12-12] - Feature: Slack Notification Confirmations

### Summary
Users now receive confirmation when their sharing or bug reports trigger Slack notifications.

### Changes

**FeedbackWidget.tsx:**
- Updated success toast to explicitly confirm Slack notification was sent
- Bug reports now show: "Bug report sent! Sean has been notified via Slack and will look into it."
- Other feedback shows: "Thank you! Your feedback has been sent to Sean via Slack."
- Shows fallback message if Slack notification is pending

**SendToManagerDialog.tsx:**
- Added tracking for Slack notification success/failure counts
- Success dialog now shows confirmation banner with notification status
- Green banner: "Slack notification(s) sent (X)" when successful
- Amber banner with warning if any notifications failed
- Includes explanatory text: "The recipient(s) have been notified via Slack."

---

## [2025-12-12] - Feature: Improved Configure & Generate Button States

### Summary
Enhanced the Configure and Generate buttons in the Assignment Engine to show clearer, context-aware labels and tooltips based on the current workflow state.

### Changes
**Configure Button:**
- Now shows "Click to edit settings" when already configured (instead of just "Rules configured")
- Added tooltip: "Edit thresholds, territory mapping, and priority rules"

**Generate Button - Dynamic States:**
| State | Button Label | Subtitle | Tooltip |
|-------|-------------|----------|---------|
| Not configured | Generate (disabled) | Run assignment engine | "Complete configuration first" |
| Configured, no assignments | Generate | Run assignment engine | "Generate territory assignments based on your configuration" |
| **Config just saved** | Generate (amber pulse) | **Apply new settings** | "Settings updated — click to generate assignments with new configuration" |
| Has existing assignments | **Re-generate** (green) | "X assigned • Click to re-run" | "Run assignment engine again to update assignments" |

### Technical Details
- Added `configJustSaved` state to track when config was just saved
- Added `hasExistingAssignments` computed from accounts with `new_owner_id`
- `configJustSaved` clears when generation starts
- Button styling changes (amber for "needs regeneration", green for "complete")

### Files Modified
- `src/pages/AssignmentEngine.tsx`

---

## [2025-12-12] - Feature: Assignment Risk Tooltips & Clarification

### Summary
Added tooltips to clarify the difference between **Assignment Risk** and **CRE Risk** across the application.

### Problem
Users were confused about what "Risk" meant in different contexts:
- **Assignment Risk** = How risky is it to change an account's owner? (based on account value, customer status)
- **CRE Risk** = Customer Retention/churn probability from renewal events

### Changes

**VirtualizedAccountTable.tsx:**
- Added tooltip to "Risk" column header explaining Assignment Risk levels
- Updated `getContinuityRiskBadge` function to wrap badges with tooltips explaining CRE Risk
- Updated assignment risk badges with tooltips explaining each level

**AssignmentPreviewDialog.tsx:**
- Added Tooltip import
- Added tooltip to "Risk" and "Risk Level" column headers in Proposals and Conflicts tables
- Updated `getConflictRiskBadge` function to include tooltips with explanations

### Risk Level Definitions

| Level | Assignment Risk | Trigger |
|-------|-----------------|---------|
| **High** | Relationship disruption | Reassigning an existing customer account |
| **Medium** | Review needed | ARR > $100K or has risk flag |
| **Low** | Safe to move | Prospects or low-value accounts |

---

## [2025-12-12] - Fix: Remove Debug Tools from Data Import

Removed the "Debug Tools" section with "Clear Import State" button from the Data Import page. This dev-only UI was appearing in localhost and shouldn't be visible—localhost should match production.

## [2025-12-12] - Feature: Auto-Navigation for Data Import Module

### Summary
Improved UX in the Data Import module by automatically navigating users to the appropriate tab based on their import progress, eliminating the blank screen issue.

### Changes to `src/pages/DataImport.tsx`
- Added `hasInitializedTabRef` to track first-load navigation
- Added new `useEffect` hook for auto-navigation logic that:
  - Navigates to "Review & Import" tab if all files are completed
  - Navigates to "Map Fields" tab if files need field mapping
  - Navigates to "Upload" tab for new imports
- Reset navigation flag when build changes to re-evaluate for each build

### Behavior
- On first load, the module checks Supabase for existing imported data
- Based on file statuses (`completed`, `uploaded`, `validated`, `mapped`), it auto-selects the appropriate inner tab
- User no longer sees a blank screen - they're taken directly to the relevant step

---

## [2025-12-12] - Feature: Comprehensive Code Comments for Domain Module

### Summary
Added extensive JSDoc comments to all domain module files so developers can understand the business logic without needing the markdown docs.

### Changes
- **All `src/domain/*.ts` files** now have:
  - Module header explaining purpose and usage
  - JSDoc on every exported function with examples
  - Inline comments explaining "why" not just "what"
  - `@see` links to markdown documentation

### CURSOR.mdc Updated
- Added "Gradual Refactoring Rule" - when working on any file:
  - Detect hardcoded logic that should use `@/domain`
  - Flag discrepancies and ASK before changing
  - Never silently change business logic

---

## [2025-12-12] - Feature: Data Normalization for Typos & Variations

### Summary
Added comprehensive data normalization module to handle typos, variations, and non-standard values in imported data (regions, PE firms, team tiers).

### New Files
- `src/domain/normalization.ts` - Normalization functions and alias maps

### Key Features
- **Region Normalization**: `NYC` → `North East`, `California` → `West`, `Global` → `UNMAPPED`
- **PE Firm Normalization**: `JMI` → `JMI Private Equity`, `TPG` → `TPG Capital`
- **Team Tier Normalization**: `grwth` → `Growth`, `enterprise` → `ENT`
- Batch normalization with statistics

### Documentation
- Added Section 5 "Data Normalization" to `docs/core/business_logic.md`
- Documents all alias mappings and usage patterns

---

## [2025-12-12] - Feature: Centralized Business Logic Documentation

### Summary
Created a single source of truth for all business terminology, calculations, and rules - both as documentation and as a code module that can be imported throughout the application.

### New Files Created

**Documentation:**
- `docs/core/business_logic.md` - Complete glossary, calculation rules, tier definitions, geography mapping

**Code Module (`src/domain/`):**
- `index.ts` - Re-exports all domain modules
- `calculations.ts` - ARR, ATR, Pipeline calculation functions with JSDoc
- `tiers.ts` - Team tier (SMB/Growth/MM/ENT) and expansion tier logic
- `geography.ts` - Region hierarchy, territory mapping, geo scoring
- `constants.ts` - Thresholds, defaults, configuration values

### Updated CURSOR.mdc
- Added new Section 3: Business Logic Documentation
- Points to `docs/core/business_logic.md` as the first resource to check
- Points to `src/domain/` for code implementation
- Updated glossary section to reference full documentation
- Renumbered subsequent sections

### Purpose
This creates alignment between documentation and code, reduces scattered logic, and ensures consistent terminology across the team. When changing business logic, the workflow is:
1. Update `docs/core/business_logic.md` first
2. Update corresponding file in `src/domain/`
3. Update consuming code

---

## [2025-12-12] - Fix: Data Overview Analytics Improvements

### Critical Fixes
- **Pagination bug causing missing accounts** - `calculateMetricsSnapshot` was querying accounts without pagination (Supabase default limit = 1000). With 2,095 accounts, ~1,000 were being lost! Now reuses properly paginated data from `getBuildDataRelationships`.
- **Pipeline calculation bug** - Fixed `opp.account_id` → `opp.sfdc_account_id` causing 0 pipeline values
- **Clarified account counts** - Changed "Total: X accounts" to "X assigned to Y reps" to make the data clearer

### UI Improvements
- **Removed redundant section** - Removed Accounts by Region, Account Tiers, Owner Coverage charts (redundant with summary cards)
- **Removed redundant legend** - Customer/Prospect legend removed from account chart (already shown in header stats)
- **Dynamic chart height** - Charts now scale with number of reps (22px per rep, min 400px) so you can scroll to see all reps
- **Square root scale** - Financial charts use sqrt scale for better proportional display with large value variations
- **Larger bars** - Increased bar size from 14px to 16px for better visibility

---

## [2025-12-12] - Feature: Data Overview Analytics Redesign

### Summary
Completely redesigned the Data Overview page analytics with improved layout, new metrics, and enhanced distribution charts with CV (Coefficient of Variation) statistics.

### Section 1: Summary Metrics Redesign
- **Removed** Total ARR card (now shown in Section 2 charts)
- **Added** Coverage card - Shows % of accounts with valid owner assigned
- **Added** Team Fit card - Shows account-rep tier alignment score with tooltip explaining SMB/Growth/Enterprise tiers
- **Reorganized** into cleaner layout: Row 1 (Customers, Prospects, All Accounts), Row 2 (Pipeline, Team, Coverage, Team Fit)

### Section 2: Analytics Charts Redesign
- **Two side-by-side distribution charts**:
  - Left: Financial Distribution (toggleable ARR/ATR/Pipeline) with Total, Average, CV stats
  - Right: Account Distribution (Customer vs Prospect stacked bars)
- **Enhanced RepDistributionChart** with:
  - `allowedMetrics` prop to control which metrics are toggleable
  - `showStats` prop to display Total/Avg/CV header
  - CV (Coefficient of Variation) with color-coded status and tooltip explanation
  - Average reference line on financial charts
  - Parent/child account breakdown in tooltip
- **Removed** redundant ARR Buckets chart (replaced by enhanced distribution chart)
- **Kept** Region distribution, Tier distribution, and Owner coverage charts

### Files Modified
- `src/pages/BuildDetail.tsx` - Summary cards redesign, added useAnalyticsMetrics hook
- `src/components/DataOverviewAnalytics.tsx` - Side-by-side chart layout
- `src/components/analytics/RepDistributionChart.tsx` - Enhanced with allowedMetrics, showStats, CV calc, ReferenceLine
- `src/types/analytics.ts` - Added parent/child fields to RepDistributionData
- `src/services/buildDataService.ts` - Updated calculateRepDistribution() with parent/child counts

---

## [2025-12-12] - Fix: Geo Match Metric Bug + Rep Distribution Chart

### Bug Fixed
**Geo Match showing 9% instead of 98%** - The dashboard's geo alignment calculation was using a different algorithm than the assignment engine. The dashboard only checked territory mappings, while the assignment engine falls back to direct `account.geo` comparison when no mappings exist.

**Fix**: Updated `useEnhancedBalancing.ts` to use the same fallback logic:
1. If territory mappings configured → use those
2. If no mappings → compare `account.geo` directly to `rep.region`

### New Feature: Rep Distribution Chart
Added a toggleable distribution chart to the Data Overview page showing the "before" state:
- **ARR Distribution** - Per-rep ARR from customer accounts
- **ATR Distribution** - Per-rep Available to Renew
- **Pipeline Distribution** - Per-rep prospect pipeline value
- **Account Distribution** - Stacked bar showing customers vs prospects per rep

Use the arrow buttons to toggle between views.

### Files Modified
- `src/hooks/useEnhancedBalancing.ts` - Fixed geo alignment calculation
- `src/types/analytics.ts` - Added `RepDistributionData` type
- `src/services/buildDataService.ts` - Added `calculateRepDistribution()` method
- `src/components/analytics/RepDistributionChart.tsx` - New component
- `src/components/DataOverviewAnalytics.tsx` - Integrated new chart

---

## [2025-12-12] - Feature: Priority-Based Rationales for LP Assignments

### Summary
Updated the LP rationale generator to produce priority-prefixed rationales (P0, P1, P2, P3, P4, RO) that match the waterfall format. This enables the UI analytics to correctly categorize and display assignment reasons.

### Priority Codes
- **P0**: Manual locks, Strategic accounts, Child follows parent
- **P1**: Stability locks (CRE, renewal, PE firm, recent change, backfill)
- **P2**: Geography + Continuity (both factors strong)
- **P3**: Geography Match (dominant factor)
- **P4**: Account Continuity (dominant factor)
- **RO**: Balance Optimization / Team Alignment / Residual

### Example Rationales
- `P0: Strategic Account → John Smith (strategic rep assignment)`
- `P1: Stability Lock → Jane Doe (CRE at-risk - relationship stability)`
- `P2: Geography + Continuity → Bob Wilson (AMER-West, relationship maintained, score 0.85)`
- `P3: Geography Match → Alice Brown (EMEA - exact geo match, score 0.72)`
- `P4: Account Continuity → Tom Davis (long-term relationship, score 0.68)`
- `RO: Balance Optimization → Sarah Lee (best available for balance, score 0.25)`

### Files Modified
- `src/services/optimization/postprocessing/rationaleGenerator.ts`
- `src/services/optimization/preprocessing/strategicPoolHandler.ts`
- `src/services/optimization/preprocessing/parentChildAggregator.ts`
- `src/services/optimization/optimizationSolver.ts`

---

## [2025-12-12] - Feature: Tier Balance Constraints for Relaxed Optimization

### Summary
Added tier balance constraints with Big-M penalties to the Relaxed Optimization LP engine, ensuring fair distribution of Tier 1-4 accounts across all reps.

### Weights Applied
**Customers:**
- ARR: 50%
- ATR: 25%
- Tiers: 25% (6.25% each tier)

**Prospects:**
- Pipeline: 50%
- Tiers: 50% (12.5% each tier)

### Changes
- Added `tier`, `expansion_tier`, `initial_sale_tier` fields to `AggregatedAccount` interface
- Added `getTier()` helper in dataLoader to extract tier from expansion_tier/initial_sale_tier fields
- Added tier count calculation and targets (total per tier / number of reps)
- Added Big-M penalty slack variables for each tier (Tier 1-4)
- Added tier decomposition constraints for each rep/tier combination
- Each tier treated individually (not grouped) per user specification

### Files Modified
- `src/services/optimization/types.ts`
- `src/services/optimization/preprocessing/dataLoader.ts`
- `src/services/optimization/constraints/lpProblemBuilder.ts`

---

## [2025-12-12] - Feature: Big-M Penalty System for Relaxed Optimization

### Summary
Implemented the three-tier Big-M penalty system for balance constraints in the Relaxed Optimization LP engine, matching the waterfall engine's behavior. This enforces absolute minimum/maximum ARR, ATR, and Pipeline per rep.

### The Three-Tier System
1. **Alpha zone** (within variance band) - Small penalty (0.01x)
2. **Beta zone** (between variance and absolute limits) - Medium penalty (1.0x)  
3. **Big-M zone** (beyond absolute limits) - Huge penalty (1000x)

### Decomposition Formula
```
actual_value = target + alpha_over - alpha_under + beta_over - beta_under + bigM_over - bigM_under
```

### Changes
- Added `buildMetricPenaltyTerms()` function for three-tier slack generation
- Updated balance constraints to use decomposition formula with six slack variables
- Added `arr_min`, `arr_max`, `arr_variance`, `atr_min/max/variance`, `pipeline_min/max/variance` to `LPBalanceConfig`
- Updated dataLoader to read min/max/variance from assignment_configuration table

### Also Fixed
- DataLoader pagination: Now fetches ALL accounts/opportunities (was hitting Supabase 1000-row limit)
- Added `fetchAllAccounts()` and `fetchAllOpportunities()` with proper pagination

### Files Modified
- `src/services/optimization/constraints/lpProblemBuilder.ts`
- `src/services/optimization/types.ts`
- `src/services/optimization/preprocessing/dataLoader.ts`

---

## [2025-12-12] - Fix: Save Button Disabled After Changing Optimization Model

### Summary
Fixed bug where the "Save Configuration" button would remain disabled (unclickable) after selecting a new optimization model in the Assignment Engine configuration dialog.

### Root Cause
The `ModelSelector` component's `onChange` handler was directly updating `config` state but not setting `isDirty` to `true`. The Save button is disabled when `!isDirty`, so it stayed grayed out.

### Fix
Updated the `onChange` handler for `ModelSelector` to also call `setIsDirty(true)` and `setShowSuccess(false)`, matching the behavior of other field handlers.

### Files Modified
- `src/components/FullAssignmentConfig.tsx`

---

## [2025-12-12] - Fix: HiGHS Relaxed Optimization Engine (Multiple Issues)

### Summary
Fixed multiple issues preventing the Relaxed Optimization LP engine from working.

### Issues Fixed
1. **WASM Loading**: Module was trying to load from local Vercel assets instead of the CDN
2. **API Error**: `setOption is not a function` - HiGHS JS API doesn't expose setOption method
3. **LP Format Error**: "Unable to read LP model" - Invalid LP format due to:
   - Variable names starting with numbers (Salesforce IDs like `001...`)
   - Incorrect coefficient formatting in objective function

### Fixes
1. Added CDN configuration for WASM files (`https://lovasoa.github.io/highs-js/`)
2. Removed unsupported `setOption` calls
3. Added `sanitizeVarName()` to ensure LP-compliant variable names (must start with letter)
4. Fixed LP format to match CPLEX specification
5. Added variable mapping to correctly extract solution back to original account/rep IDs

### Files Modified
- `src/services/optimization/solver/highsWrapper.ts`

---

## [2025-12-12] - Feature: Enhanced Balance Score with MSE and Drill-Down

### Summary
Upgraded the Balance Score metric on the Assignments page to be a comprehensive, MSE-based score with expandable drill-down visualization.

### Changes
- **New `BalanceScoreDetailCard` component** - Replaces simple balance percentage with full detail:
  - MSE-based scoring: Score increases as rep loads converge to mean (0-100%)
  - Quick stats: Shows Avg/Rep, Std Dev, and Coefficient of Variation
  - Outlier badges: Visual indicators for underloaded, overloaded, and balanced reps
  - Expandable drill-down with bar chart showing rep ARR distribution
  - Target reference line and tolerance bands (±15%)
  - Color-coded bars (red=under, amber=over, green=in range)
- **Fixed 0% Balance bug**: Added flexible owner matching (rep_id, email, name)
- **New TypeScript types**: `BalanceMetricsDetail`, `RepLoadDistribution`

### Technical Details
- Balance score = 70% MSE score + 30% in-range percentage
- Tolerance configurable (default 15%)

---

## [2025-12-12] - Feature: Duplicate Build Button

### Summary
Added a "Duplicate Build" button to the Dashboard that creates a complete copy of an existing build with all its data.

### Changes
- New duplicate button (copy icon) appears on hover next to Edit and Delete buttons
- Creates new build named "{Original Name} (copy)"
- Copies all related data: accounts, sales_reps, opportunities, assignment_rules, assignment_configuration, and assignments
- New duplicated build starts in DRAFT status with approval flags reset
- Shows loading spinner during duplication process
- Uses pagination to fetch ALL records (bypasses Supabase 1000 row limit)
- Inserts records in batches of 500 for reliability
- Success toast shows count of copied accounts and opportunities

### Files Modified
- `src/pages/Dashboard.tsx` - Added duplicate functionality with pagination support

---

## [2025-12-12] - Fix: Default Priority Order for Account Continuity

### Summary
Updated default priority order so Account Continuity is ranked above Geography, and added `geo_and_continuity` to EMEA/APAC modes.

### Changes
- Added `geo_and_continuity` priority to EMEA and APAC modes (position 2)
- In ENT mode, swapped `continuity` (now 3) above `geography` (now 4)
- Adjusted EMEA/APAC positions: continuity=3, geography=4, team_alignment=5, arr_balance=6
- All modes now consistently have account continuity ranked above geography

### Files Modified
- `src/config/priorityRegistry.ts` - Added EMEA/APAC to geo_and_continuity, adjusted all positions

---

## [2025-12-13] - Fix: Build Card Layout - Consistent Alignment

### Summary
Fixed build cards to have consistent alignment across all elements.

### Changes
- **Title row**: Title on left, action buttons (hover) on right
- **Badges row**: Status and region badges on their own row below title (left-aligned)
- **Info grid**: Simplified to always show just Created + Owner (2 columns, consistent height)
- **Action button**: Always pinned to bottom with `mt-auto`
- Removed conditional Last Updated and Target Date from info grid to ensure consistent heights

### Files Modified
- `src/pages/Dashboard.tsx` - Restructured card layout for consistency

---

## [2025-12-13] - Feature: Duplicate Build Button

### Summary
Added a "Duplicate Build" button to the Dashboard that creates a complete copy of an existing build with all its data.

### Changes
- New duplicate button (copy icon) appears on hover next to Edit and Delete buttons
- Creates new build named "{Original Name} (copy)"
- Copies all related data: accounts, sales_reps, opportunities, assignment_rules, assignment_configuration, and assignments
- New duplicated build starts in DRAFT status with approval flags reset
- Shows loading spinner during duplication process

### Files Modified
- `src/pages/Dashboard.tsx` - Added duplicate functionality and UI button

---

## [2025-12-13] - Refactor: Streamlined Assignment Preview Dialog

### Summary
Simplified the cluttered Assignment Preview dialog by removing redundant elements.

### Changes
- Removed duplicate stats display (was showing same info 3 times)
- Removed empty Statistics tab (data wasn't being populated)
- Simplified header description (removed verbose "What happens when you Apply" text)
- Consolidated to compact summary row + 2 tabs (Proposals, Conflicts)
- Single Apply button in footer, cleaner styling

### Files Modified
- `src/components/AssignmentPreviewDialog.tsx` - Major simplification

---

## [2025-12-13] - Fix: Progress Dialog Stage Transition

### Summary
Fixed visual glitch where AI Optimization stage would flash "0%" briefly before showing completion checkmark.

### Change
- `aiProgressPercentage` now returns 100 when stage is completed, preventing the 0% flash during state transition

### Files Modified
- `src/components/AssignmentGenerationDialog.tsx`

---

## [2025-12-13] - Fix: Remove HiGHS from User-Facing Text

### Summary
Removed technical "HiGHS" references from user-facing UI. Internal solver name shouldn't be visible to users.

### Changes
- Assignment rationale: `(HiGHS Optimized)` → `(Optimized)`
- Logic explainer: `(HiGHS)` removed from optimization description

### Files Modified
- `src/services/simplifiedAssignmentEngine.ts`
- `src/components/WaterfallLogicExplainer.tsx`

---

## [2025-12-13] - Fix: ARR Distribution Chart Scaling

### Summary
Fixed bar chart scaling to be data-driven instead of scaling to hardcoded thresholds. Previously, bars would appear tiny if data was much smaller than the hardCap fallback (2.9M).

### Change
- Scale now uses max data value + 10% padding
- Only extends to `preferredMax` if needed to show target zone
- No longer stretches to irrelevant hardCap when data is small

### Files Modified
- `src/components/ARRDistributionChart.tsx` - Data-driven maxValue calculation

---

## [2025-12-13] - Fix: Remove Duplicate Apply Button

### Summary
Removed redundant green "Apply Proposals" button from the Assignment Engine header. Now only the contextual amber warning banner shows the Apply button (with explanation that assignments are in memory).

### Files Modified
- `src/pages/AssignmentEngine.tsx` - Removed duplicate header Apply button

---

## [2025-12-13] - Fix: Rep Stats Cards Layout

### Summary
Fixed awkward 5+1 card layout on the Reps view. Stats cards now display in a clean 2-column grid (1 column on mobile).

### Files Modified
- `src/components/RepManagement.tsx` - Changed grid from `lg:grid-cols-6` to `sm:grid-cols-2`

---

## [2025-12-13] - Feature: Geographic Scoring in Assignment Optimization

### Summary
Added soft geographic scoring to the assignment engine. All reps remain eligible based on priority level filtering, but geographic match quality is now a weighted factor in the HiGHS optimization objective. Users can configure how strongly geography is weighted via a slider.

### How It Works
- **P2 (Geography)**: Still requires geo-matched reps, but now uses geo score as a tiebreaker among matched reps
- **P4 (Fallback)**: Uses geo score to prefer closer matches when all reps are eligible
- **Scoring**: Exact match = 100, Sibling region = 60, Parent region = 40, Global = 25

### Database Changes
- Added `geo_weight` column to `assignment_configuration` (default 0.3)

### Key Features
1. **Geographic Hierarchy** - Defined region relationships:
   - AMER: 'North East', 'South East', 'Central', 'West'
   - EMEA: 'UK', 'DACH', 'France', 'Nordics', 'Benelux'
   - APAC: 'ANZ', 'Japan', 'Singapore'

2. **Configurable Weight** - Slider in Assignment Config:
   - 0-30%: "Balance" - Prioritize balanced books over geography
   - 30-60%: "Mixed" - Balance both factors
   - 60-100%: "Geo-first" - Strongly prefer exact geo matches

3. **Sibling Regions** - Partial credit when accounts go to neighboring regions (e.g., Central account → West rep gets 60 points vs 100 for exact match)

### Files Modified
- `src/services/simplifiedAssignmentEngine.ts` - Added REGION_HIERARCHY, REGION_SIBLINGS, getGeographyScore(), getMappedRegion(), geoBonus in HiGHS coefficient
- `src/components/FullAssignmentConfig.tsx` - Added geo_weight slider UI
- `src/integrations/supabase/types.ts` - Added geo_weight field
- `supabase/migrations/20251213000001_add_geo_weight.sql` - Database migration

### Design Notes
- **P2 filtering unchanged** - Maintains waterfall design where accounts cascade through priority levels
- **Score affects ranking, not eligibility** - HiGHS uses score as tiebreaker, not to expand/restrict rep pools
- **Backward compatible** - Default weight of 0.3 maintains similar behavior to before

---

## [2025-12-12] - Feature: Pure Optimization LP Engine - COMPLETE IMPLEMENTATION

### Summary
Fully implemented the Pure Optimization LP Engine as specified in the v2 plan. This provides a single-solve global optimization alternative to the cascading priority waterfall, using HiGHS WASM solver with weighted objectives and hard constraints.

### New Service Modules (`src/services/optimization/`)

**Core Engine:**
- `pureOptimizationEngine.ts` - Main orchestrator class with progress tracking
- `types.ts` - Complete TypeScript interfaces (600+ lines)
- `index.ts` - Public API exports

**Preprocessing:**
- `preprocessing/dataLoader.ts` - Load accounts, reps, opportunities, territory mappings
- `preprocessing/parentChildAggregator.ts` - Aggregate children into parents, cascade post-solve
- `preprocessing/strategicPoolHandler.ts` - Pre-assign strategic accounts to strategic reps

**Scoring Functions:**
- `scoring/continuityScore.ts` - Tenure, stability, value components
- `scoring/geographyScore.ts` - Region hierarchy with sibling detection
- `scoring/teamAlignmentScore.ts` - Account tier to rep tier matching

**Constraints:**
- `constraints/stabilityLocks.ts` - 6 lock types (CRE, renewal, PE, recent, manual, backfill)
- `constraints/lpProblemBuilder.ts` - Build complete LP problem for HiGHS

**Solver:**
- `solver/highsWrapper.ts` - HiGHS WASM integration with LP format conversion

**Post-Processing:**
- `postprocessing/rationaleGenerator.ts` - Human-readable assignment explanations
- `postprocessing/metricsCalculator.ts` - All success metrics (CV, continuity, geo, tier)

**Utilities:**
- `utils/weightNormalizer.ts` - Linked slider weight normalization

### New UI Components (`src/components/optimization/`)
- `ModelSelector.tsx` - Toggle between Waterfall and Pure Optimization
- `ObjectiveWeights.tsx` - Customer/Prospect weight tabs with linked sliders
- `ConstraintToggles.tsx` - Hard constraint and stability lock toggles
- `BalanceConfig.tsx` - Balance metric penalty sliders
- `MetricsDashboard.tsx` - Post-solve metrics display

### Integration
- `useAssignmentEngine.ts` - Routes to LP engine when `optimization_model = 'pure_optimization'`
- Progress tracking through all LP solve stages
- Result transformation to existing AssignmentResult format

### Mathematical Model
**Objective Function:**
```
max Σ(c_{a,r} × x_{a,r}) - Σ(λ_m × deviation_r^m / target^m) - M × Σ(slack_r)
```

Where `c_{a,r} = w_C×Continuity + w_G×Geography + w_T×TeamAlignment + ε×rank`

**Hard Constraints:** Assignment uniqueness, capacity, stability locks, strategic pool

### Database Migration
`supabase/migrations/20241212000001_add_pure_optimization.sql` adds:
- `optimization_model` column ('waterfall' | 'pure_optimization')
- 8 JSONB columns for LP configuration

### Files Created (25 new files)
```
src/services/optimization/
├── index.ts
├── types.ts
├── pureOptimizationEngine.ts
├── preprocessing/
│   ├── dataLoader.ts
│   ├── parentChildAggregator.ts
│   └── strategicPoolHandler.ts
├── scoring/
│   ├── continuityScore.ts
│   ├── geographyScore.ts
│   └── teamAlignmentScore.ts
├── constraints/
│   ├── stabilityLocks.ts
│   └── lpProblemBuilder.ts
├── solver/
│   └── highsWrapper.ts
├── postprocessing/
│   ├── rationaleGenerator.ts
│   └── metricsCalculator.ts
└── utils/
    └── weightNormalizer.ts

src/components/optimization/
├── index.ts
├── ModelSelector.tsx
├── ObjectiveWeights.tsx
├── ConstraintToggles.tsx
├── BalanceConfig.tsx
└── MetricsDashboard.tsx
```

### Deployment
- Production: https://book-ops-workbench-c4ird7e0e-seanxmuses-projects.vercel.app

---

## [2025-12-12] - Fix: Pure Optimization LP Engine Bug Fixes

### Summary
Fixed 6 critical bugs in the Pure Optimization LP Engine found during code review.

### Bugs Fixed

1. **Locked accounts missing from LP problem (CRITICAL)**
   - Bug: Locked accounts were passed to buildLPProblem but not included in decision variables
   - Fix: Now creates variables for ALL accounts (unlocked + locked) so they contribute to capacity/balance constraints

2. **Division by zero in balance penalty calculation**
   - Bug: If `arrTarget = 0`, dividing by it crashed the solver
   - Fix: Added guards `&& arrTarget > 0` before creating balance constraints

3. **Variable name parsing in HiGHS wrapper**
   - Bug: Regex `/^x_(.+)_([^_]+)$/` failed for IDs with underscores
   - Fix: Changed to `lastIndexOf('_')` approach for more reliable parsing

4. **Imports at wrong location in pureOptimizationEngine.ts**
   - Bug: `AssignmentScores` and `LPMetrics` were imported AFTER the class definition
   - Fix: Moved all imports to the top with other type imports

5. **Capacity constraints excluded locked accounts**
   - Bug: Locked accounts didn't consume capacity from their assigned reps
   - Fix: Capacity constraints now include ALL accounts

6. **Balance constraints excluded locked accounts**
   - Bug: Locked accounts didn't contribute to balance calculations
   - Fix: Balance deviation constraints now include ALL accounts

### Files Modified
- `src/services/optimization/pureOptimizationEngine.ts` - Import fix
- `src/services/optimization/constraints/lpProblemBuilder.ts` - Locked accounts + div/0 fixes
- `src/services/optimization/solver/highsWrapper.ts` - Variable parsing fix

### Deployment
- Production: https://book-ops-workbench-4k2qihqj7-seanxmuses-projects.vercel.app

---

## [2025-12-12] - Feature: Relaxed Optimization Now Ready for Use

### Summary
Connected all the pieces to make Relaxed Optimization usable:

1. **Database migration applied** - Added all 9 LP config columns to `assignment_configuration`
2. **UI integrated** - `ModelSelector` component added to Assignment Configuration page
3. **Full pipeline connected**: Config → Engine routing → LP solve → Results

### What Users Can Do Now
- Open Assignment Configuration
- Select "Relaxed Optimization" at the top of the page
- Save configuration
- Generate assignments → Will use LP engine instead of waterfall

### Deployment
- Production: https://book-ops-workbench-65s5chai1-seanxmuses-projects.vercel.app

---

## [2025-12-12] - Refactor: Renamed to "Waterfall" vs "Relaxed Optimization"

### Summary
Renamed the two assignment models for clarity:

| Old Name | New Name |
|----------|----------|
| Waterfall | **Waterfall Optimization** |
| Pure Optimization | **Relaxed Optimization** |

### Rationale
- "Relaxed" is an LP term meaning soft constraints with penalties (which is exactly what we do)
- Suggests flexibility vs the rigid priority cascade of waterfall
- Both names now include "Optimization" for consistency

### Files Modified
- `components/optimization/ModelSelector.tsx` - UI labels
- `services/optimization/types.ts` - Type definition
- `hooks/useAssignmentEngine.ts` - Routing check
- `services/optimization/preprocessing/dataLoader.ts` - Default value
- `supabase/migrations/20241212000001_add_pure_optimization.sql` - CHECK constraint

---

## [2025-12-12] - Docs: Pure Optimization LP Engine Plan v2

### Summary
Complete rewrite of the Pure Optimization LP Engine implementation plan based on critical review. Fixed 12 critical gaps, 8 ambiguities, and added 4 architectural improvements.

### Critical Fixes Made
1. **Balance penalty scale mismatch** - Changed from per-dollar penalties to relative (0-1) scale
2. **Customer vs prospect mode** - Added separate objective configs for each assignment type
3. **Locked accounts constraint** - Added `locked_accounts_enabled` to lp_constraints schema
4. **Parent-child constraint explosion** - Changed to pre-aggregate children (no linking constraints)
5. **Stability locks** - Added all 6 types: CRE, renewal, PE, recent change, manual, backfill migration
6. **Backfill migration** - Added handling for accounts with leaving reps migrating to replacement
7. **Data loading specs** - Added complete preprocessing section with data sources
8. **ARR source field** - Specified `hierarchy_bookings_arr_converted` as primary source
9. **Rationale generation** - Added detailed spec for human-readable explanations
10. **Success metrics** - Added full metrics calculation spec with targets
11. **Tie-breaking** - Changed to rank-based tie-breaker (not per-dollar)
12. **Weight normalization** - Added linked slider behavior spec

### Files Created
- `docs/core/pure_optimization_plan.md` - Complete v2 plan document (600+ lines)
- `supabase/migrations/20241212000001_add_pure_optimization.sql` - Database migration
- `src/services/optimization/types.ts` - All TypeScript interfaces (450+ lines)
- `src/services/optimization/index.ts` - Public API exports
- `src/services/optimization/scoring/continuityScore.ts` - Tenure/stability/value scoring
- `src/services/optimization/scoring/geographyScore.ts` - Region hierarchy scoring
- `src/services/optimization/scoring/teamAlignmentScore.ts` - Tier matching scoring
- `src/services/optimization/utils/weightNormalizer.ts` - Weight normalization utility

### Mathematical Formulation
The plan now includes complete LP formulation:
- **Objective**: Maximize scoring coefficients - balance deviation penalties
- **3 Scoring Functions**: Continuity, Geography, Team Alignment (all 0-1 scale)
- **Balance Penalties**: Relative (deviation/target), not per-dollar
- **6 Hard Constraints**: Assignment, capacity, locked, stability, strategic, parent-child

### Database Schema
Added 10 new JSONB columns to `assignment_configuration`:
- `optimization_model` - 'waterfall' or 'pure_optimization'
- `lp_objectives_customer` / `lp_objectives_prospect` - Separate weights by type
- `lp_balance_config` - Balance metric enables and relative penalties
- `lp_constraints` - Hard constraint toggles
- `lp_stability_config` - Stability lock enables and parameters
- `lp_continuity_params` / `lp_geography_params` / `lp_team_params` - Scoring params
- `lp_solver_params` - HiGHS solver configuration

### Deployment
- Production: https://book-ops-workbench-1evrnxuge-seanxmuses-projects.vercel.app

---

## [2025-12-12] - Feature: Phase 4 Analytics Upgrade

### Summary
Added comprehensive LP Engine success metrics and analytics across three tabs: Data Overview (pre-assignment insights), Assignments (preview before generation), and Balancing (before/after comparison). Surfaces the 5 core success metrics everywhere analytics are displayed.

### LP Success Metrics
The 5 metrics from the weighted LP engine plan are now visible in all analytics views:
1. **Balance Score** - How evenly ARR is distributed across reps (0-100%)
2. **Continuity Score** - % of accounts retaining same owner (0-100%)
3. **Geography Score** - Weighted geo alignment (exact=100%, sibling=60%, global=25%)
4. **Team Alignment Score** - Account tier matching rep specialization (0-100%)
5. **Capacity Utilization** - Average rep load vs target (shown after assignments)

### New Components
- `src/types/analytics.ts` - TypeScript interfaces for all analytics types
- `src/components/analytics/` folder with:
  - `LPScoreCard.tsx` - Individual metric card with color-coded progress bar
  - `LPScoresSummary.tsx` - Row of 5 LP metric cards
  - `RegionPieChart.tsx` - Region distribution pie chart
  - `MetricBarChart.tsx` - ARR/tier distribution bar charts
  - `BeforeAfterBar.tsx` - Grouped bar comparing original vs proposed
  - `VarianceIndicator.tsx` - Delta badge with up/down arrows
- `src/components/DataOverviewAnalytics.tsx` - Full analytics section for Data Overview tab
- `src/components/AssignmentPreviewMetrics.tsx` - Pre-generation metrics preview
- `src/components/BeforeAfterComparisonPanel.tsx` - Before/After LP metrics comparison

### Integration Points
1. **Data Overview Tab** (BuildDetail.tsx) - Shows LP scores + distribution charts after data import
2. **Assignment Engine** (AssignmentEngine.tsx) - Shows current state metrics before Generate
3. **Balancing Tab** (EnhancedBalancingDashboard.tsx) - Shows before/after comparison with deltas

### Service Extensions
- `src/services/buildDataService.ts` - Added LP metric calculation methods:
  - `calculateBalanceScore()`, `calculateContinuityScore()`, `calculateGeographyScore()`
  - `calculateTeamAlignmentScore()`, `calculateCapacityUtilization()`
  - `getAnalyticsMetrics()`, `getMetricsComparison()`
- `src/hooks/useBuildData.ts` - Added `useAnalyticsMetrics()`, `useMetricsComparison()` hooks

### Deployment
- Production: https://book-ops-workbench-idpc77a4x-seanxmuses-projects.vercel.app

---

## [2025-12-12] - Fix: Backfill Feature Bug Fixes

### Summary
Fixed 4 bugs in the Backfill and Open Headcount feature implementation.

### Bugs Fixed
1. **Silent migration errors** - Account and opportunity migrations now have proper error handling. If any migration fails, the error is thrown and the user is notified.

2. **Missing opportunity cache invalidation** - Added `queryClient.invalidateQueries({ queryKey: ['opportunities'] })` to the onSuccess handler so the UI reflects migrated opportunities.

3. **Double-enable guard** - Added check in mutation to prevent creating duplicate BF reps if someone toggles the switch when already enabled. Also disabled the switch for placeholder reps.

4. **Weak BF rep ID uniqueness** - Added random suffix to BF rep ID generation to match the OPEN- pattern: `BF-${buildId}-${timestamp}-${random}`

### Files Modified
- `src/components/data-tables/SalesRepDetailDialog.tsx` - All 4 fixes

---

## [2025-12-12 23:45 UTC] - Feature: Backfill & Open Headcount Support

### Summary
Added support for two key rep transition scenarios:
1. **Backfill**: Mark leaving reps to exclude from assignments; auto-create replacement rep and migrate accounts
2. **Open Headcount**: Import reps without Salesforce IDs; placeholder ID auto-generated

### Database Changes
- Added `is_backfill_source` (boolean) - true for reps leaving the business
- Added `is_backfill_target` (boolean) - true for auto-created replacement reps  
- Added `backfill_target_rep_id` (text) - links leaving rep to their replacement
- Added `is_placeholder` (boolean) - true for open headcount reps

### Key Features
1. **Backfill Toggle** in SalesRepDetailDialog:
   - Creates BF-{name} replacement rep with same region/team/FLM/SLM
   - Migrates all accounts (owner_id and new_owner_id) to backfill rep
   - Migrates all opportunities similarly
   - Sets `include_in_assignments = false` on leaving rep
   - Logs action to audit_log

2. **Open Headcount Import**:
   - rep_id can be left blank during import
   - Auto-generates `OPEN-{buildId}-{timestamp}-{random}` ID
   - Sets `is_placeholder = true` for tracking

3. **UI Badges** in SalesRepsTable:
   - "Leaving" (orange) - is_backfill_source
   - "Backfill" (blue) - is_backfill_target
   - "Placeholder" (gray) - is_placeholder

4. **Import Tooltips**:
   - Open Headcount explanation near Sales Reps upload
   - Backfill process explained with link to Reps tab

5. **Assignment Engine Fixes**:
   - RebalancingAssignmentService now respects `include_in_assignments` flag
   - Fixed 4 filter locations that only checked `is_active`

### Files Modified
- `supabase/migrations/20251212000001_add_backfill_columns.sql`
- `src/integrations/supabase/types.ts`
- `src/services/batchImportService.ts`
- `src/pages/DataImport.tsx`
- `src/components/data-tables/SalesRepDetailDialog.tsx`
- `src/components/data-tables/SalesRepsTable.tsx`
- `src/services/rebalancingAssignmentService.ts`

---

## [2025-12-12] - Fix: Auto-Calculate Targets + Prospect Pipeline Limits

### Summary
Fixed two critical issues preventing 100% assignment rates:
1. Auto-calculate was setting targets too low for accounts with high individual ARR
2. Prospect pipeline limits were being bypassed (no capacity enforcement)

### Root Cause Analysis
Build `423614d8` had accounts with ARR values of $50K-$190K but auto-calculate set target at $33K. Individual accounts exceeded the entire rep capacity limit, making them impossible to assign through normal priorities.

### Key Changes
1. **Auto-Calculate now considers max account ARR**
   - Target is set to at least the largest individual account value
   - Ensures every account CAN be assigned to at least one rep
   - `recommendedCustomerTarget = Math.max(calculatedTarget, maxAccountARR)`

2. **Prospect pipeline limits now enforced** (from earlier today)
   - `hasCapacity()` now checks `prospect_max_arr` and `prospect_variance_percent`
   - Prospects no longer bypass capacity checks entirely

### Files Modified
- `src/components/FullAssignmentConfig.tsx` - Auto-calculate now includes max account ARR floor
- `src/services/simplifiedAssignmentEngine.ts` - Prospect capacity checks added

---

## [2025-12-12] - Fix: Force Assignment for Unassigned Accounts

### Summary
Fixed a critical bug where accounts that couldn't be assigned through normal priority levels would remain unassigned. The force assignment logic existed but was in dead code (`assignSingleAccount`) that was never called.

### Root Cause
After all priorities completed, accounts without any eligible reps (all at capacity) were only logged as warnings but never actually assigned. This resulted in some accounts showing "Unassigned" status after applying proposals.

### Key Changes
- Added force assignment loop after all priorities execute in `generateAssignments()`
- Remaining accounts now get assigned to the least loaded rep
- Workload tracking updated for force-assigned accounts  
- Proper warnings generated for forced assignments
- **100% assignment rate now guaranteed** - no accounts left unassigned

### Files Modified
- `src/services/simplifiedAssignmentEngine.ts` - Added force assignment for remaining accounts

---

## [2025-12-12 00:15 UTC] - Fix: Priority Rule Labels Complete Fix + UI Cleanup

### Summary
Completed fix for priority labels - now all assignments show formatted labels like `P1: Continuity + Geography` instead of raw backend IDs. Also removed "How It Worked" section from preview dialog.

### Additional Fixes (from 23:55 UTC entry)
1. **Fixed solveWithHiGHS calls** - The 4 HiGHS optimization calls were still passing raw IDs:
   - `batchAssignPriority1`: `'geo_and_continuity'` → `formatPriorityLabel('geo_and_continuity', 1)`
   - `batchAssignPriority2`: `'geography'` → `formatPriorityLabel('geography', 2)`
   - `batchAssignPriority3`: `'continuity'` → `formatPriorityLabel('continuity', 3)`
   - `batchAssignPriority4`: `'arr_balance'` → `formatPriorityLabel('arr_balance', 4)`

2. **Separated Sales Tools from Protected** - Sales Tools now shows distinct orange badge, not amber "Protected"

3. **Removed "How It Worked" section** - Removed verbose configuration summary from AssignmentPreviewDialog

### Files Modified
- `src/services/simplifiedAssignmentEngine.ts` - Fixed 4 solveWithHiGHS calls
- `src/components/AssignmentPreviewDialog.tsx` - Removed How It Worked, fixed Sales Tools badge

---

## [2025-12-11 23:55 UTC] - Fix: Priority Rule Labels in Assignment Tables

### Summary
Fixed inconsistent priority labels in assignment output tables. Rules now display with consistent `P0:`/`P1:`/`P2:`/`P3:`/`P4:`/`RO:` prefix and friendly names. Unassigned accounts show "Unassigned" instead of "-".

### Root Cause
`simplifiedAssignmentEngine.ts` set `ruleApplied` inconsistently:
- Some used raw backend IDs: `'sales_tools_bucket'`
- Some used formatted names: `'Priority 1: Continuity + Geography'`

### Fix Applied
1. **Added `formatPriorityLabel()` helper** in `simplifiedAssignmentEngine.ts`:
   - Maps backend IDs to friendly names via `PRIORITY_NAMES` constant
   - Formats as `P{level}: {friendlyName}` or `RO: {friendlyName}`

2. **Updated 9 ruleApplied assignments** to use the helper:
   - `sales_tools_bucket` → `P0: Sales Tools Bucket`
   - `manual_holdover` → `P0: Manual Holdover`
   - Strategic accounts → `P0: Strategic Pool: Continuity/Distribution`
   - P1-P4 priorities now use consistent format

3. **Added `formatRuleDisplay()` helper** in `VirtualizedAccountTable.tsx`:
   - Handles new format, legacy IDs, and missing values
   - Shows "Unassigned" for accounts without rules

4. **Updated `AssignmentPreviewDialog.tsx`**:
   - `getRuleAppliedBadge()` now uses pattern matching for P0-P4, RO prefixes
   - Summary counts use `startsWith()` pattern matching
   - Added Shield icon for protected accounts

### Files Modified
- `src/services/simplifiedAssignmentEngine.ts` - Added helper, updated 9 ruleApplied lines
- `src/components/VirtualizedAccountTable.tsx` - Added formatter, updated display logic
- `src/components/AssignmentPreviewDialog.tsx` - Updated badge function and summary counts

---

## [2025-12-11 23:30 UTC] - Fix: Assignment Type Database Constraint Violation

### Summary
Fixed database constraint violation when applying assignments. The `assignment_type` column had a CHECK constraint that rejected values like `'rebalancing'`, `'customer'`, `'prospect'`, and `'SALES_TOOLS'`.

### Root Cause
The database only allowed: `'AUTO_COMMERCIAL'`, `'MANUAL_ENTERPRISE'`, `'MANAGER_OVERRIDE'`
But code was inserting invalid values in 5 different files.

### Fix Applied
1. **Expanded DB constraint** via migration to allow new semantic values:
   - `'MANUAL_REASSIGNMENT'` - for UI manual reassignments
   - `'SALES_TOOLS'` - for accounts routed to Sales Tools bucket
2. **Fixed 4 code files**:
   - `rebalancingAssignmentService.ts:1047` - `'rebalancing'` → `'AUTO_COMMERCIAL'`
   - `AssignmentEngine.tsx:1525` - conditional → `'MANUAL_REASSIGNMENT'`
   - `UnassignedAccountsModal.tsx:263` - conditional → `'MANUAL_REASSIGNMENT'`
   - `SalesRepDetailModal.tsx:398` - conditional → `'MANUAL_REASSIGNMENT'`
3. **Added orphan detection** in `useAssignmentEngine.ts` - logs warning for proposals with owner_ids not in sales_reps, prevents "Unknown is 273% over target" warning by filtering orphans from imbalance check.

### Files Modified
- `supabase/migrations/20251211000002_expand_assignment_type_constraint.sql` - New migration
- `src/services/rebalancingAssignmentService.ts` - Fixed invalid value
- `src/pages/AssignmentEngine.tsx` - Fixed invalid value
- `src/components/UnassignedAccountsModal.tsx` - Fixed invalid value
- `src/components/SalesRepDetailModal.tsx` - Fixed invalid value
- `src/hooks/useAssignmentEngine.ts` - Added orphan warning + filtering

---

## [2025-12-11 21:45 UTC] - Feature: Team Alignment Threshold Slider

### Summary
Added configurable "Minimum Tier Match %" slider to Team Alignment priority. Reps must have at least X% of their accounts matching their tier (SMB/Growth/MM/ENT), enforced as an LP constraint.

### Key Changes
1. **New `settings` property** on `PriorityConfig` interface for priority-specific settings
2. **Threshold slider** in Priority Configuration when Team Alignment is expanded (default: 80%)
3. **LP constraint** in HiGHS solver enforces minimum tier match per rep
4. **Fixed tier thresholds** - now consistent across all files:
   - SMB: < 100 employees
   - Growth: 100-499 employees
   - MM: 500-2499 employees
   - ENT: 2500+ employees

### Files Modified
- `src/config/priorityRegistry.ts` - Added `settings` field, default in `getDefaultPriorityConfig()`
- `src/components/PriorityWaterfallConfig.tsx` - Added slider UI and `handleSettingsChange()`
- `src/services/simplifiedAssignmentEngine.ts` - Added LP tier match constraint
- `src/components/WaterfallLogicExplainer.tsx` - Display configured threshold
- `src/services/optimization/optimizationSolver.ts` - Fixed tier thresholds

### How It Works
When Team Alignment is enabled with 80% threshold:
- SMB rep must have ≥80% SMB-tier accounts
- If below threshold, further mismatched assignments are heavily penalized
- Constraint is added to HiGHS LP formulation, not a dynamic penalty

---

## [2025-12-11 21:10 UTC] - Fix: Sub-Condition Count in How It Works Dialog

### Summary
Fixed "Active sub-conditions (4)" showing 4 when only 1 has data. The count now filters by BOTH enabled AND data availability.

### Key Changes
- `WaterfallLogicExplainer.tsx`: Added `mappedFields` prop and filter logic using `getAvailableSubConditions()`
- `AssignmentEngine.tsx`: Added `useMappedFields` hook and passes `mappedFields` to `WaterfallLogicExplainer`

### Root Cause
The "How It Works" dialog counted all enabled sub-conditions without checking if they have data, unlike the Priority Configuration component which correctly filtered them.

---

## [2025-12-11 20:30 UTC] - Feature: Dynamic Priority Configuration

### Summary
Fixed critical issue where UI priority configuration was ignored by the assignment engine. The engine now reads and executes priorities in the order configured in the UI.

### Problem
The Priority Configuration UI saved settings to `priority_config` in the database, but `simplifiedAssignmentEngine.ts` used hardcoded P1-P4 order, completely ignoring user configuration.

### Solution
Modified the working `simplifiedAssignmentEngine.ts` to:
1. Load `priority_config` from the database (using existing config fetch, no extra DB call)
2. Execute priorities in the configured order via new `executePriority()` dispatcher
3. Use priority IDs in `ruleApplied` field to match UI display

### Key Changes
- **New methods extracted**:
  - `handleManualHoldover()` - Strategic accounts + locked accounts
  - `handleSalesToolsBucket()` - Low-ARR customers (<$25K) to Sales Tools
  - `executePriority()` - Routes priority ID to appropriate handler

- **Dynamic execution loop** replaces hardcoded P1-P4 sequence
- **Priority IDs now match** between UI configuration and engine output
- Console logs show which priorities execute in which order

### Priority ID to Method Mapping
| Priority ID | Engine Method | Status |
|-------------|---------------|--------|
| `manual_holdover` | `handleManualHoldover()` | Implemented |
| `sales_tools_bucket` | `handleSalesToolsBucket()` | Implemented |
| `stability_accounts` | - | Phase 2 stub |
| `team_alignment` | HiGHS solver penalties | Embedded in solver |
| `geo_and_continuity` | `batchAssignPriority1()` | Implemented |
| `geography` | `batchAssignPriority2()` | Implemented |
| `continuity` | `batchAssignPriority3()` | Implemented |
| `arr_balance` | `batchAssignPriority4()` | Implemented |

### Files Modified
- `src/services/simplifiedAssignmentEngine.ts`

### Phase 2 (Future)
- Implement `stability_accounts` logic (CRE risk, renewal soon, PE firm, recent owner change)
- Consider UI clarification that `team_alignment` is a solver weight, not a discrete step

---

## [2025-12-11 19:00 UTC] - Fix: Auto-Apply Detected Mode & Add APAC

### Summary
Fixed mode detection to auto-select the detected mode in the dropdown, and added missing APAC option.

### Key Changes
- **Auto-apply detected mode**: When Priority Configuration opens, it now auto-selects the detected mode (e.g., Commercial) instead of keeping ENT as default
- **Added APAC to dropdown**: APAC was missing from the mode selector options

### Files Modified
- `src/components/PriorityWaterfallConfig.tsx`

---

## [2025-12-11 18:45 UTC] - Fix: Mode Detection & Sub-Condition Count

### Summary
Fixed two issues in Priority Configuration:
1. **Sub-condition count showed "4/4 active" when only 1 had data** - Now only counts sub-conditions that are both enabled AND have data
2. **Mode detection didn't suggest COMMERCIAL for Team Alignment data** - Now checks for `employees` + `team` (tier values) to suggest COMMERCIAL mode

### Key Changes
- `PriorityWaterfallConfig.tsx`: Fixed `enabledSubCount` to only count sub-conditions that are available (have data)
- `modeDetectionService.ts`: Added Team Alignment data detection (employees in accounts + team tier in reps)
- Mode detection now suggests COMMERCIAL when Team Alignment data exists

### Mode Detection Logic (Updated)
| Condition | Suggested Mode |
|-----------|----------------|
| Build region = EMEA | EMEA |
| Build region = APAC | APAC |
| Team Alignment data exists (employees + team tier) | COMMERCIAL |
| RS reps OR PE accounts exist | COMMERCIAL |
| Default | ENT |

---

## [2025-12-11 18:30 UTC] - Fix: Team Alignment Priority Now Uses 'team' Field

### Summary
Fixed Team Alignment priority showing "Missing data" even when data exists. The system now uses the `team` field (which contains tier values like SMB/Growth/MM/ENT) instead of the empty `team_tier` field.

### Key Changes
- Updated `priorityRegistry.ts` to require `team` instead of `team_tier` for sales_reps
- Updated `priorityExecutor.ts` to map `team` → `team_tier` when loading reps
- Added `team` interface field to SalesRep type
- Added `employees` to accounts field presence check in `useMappedFields.ts`
- Added `team` to sales_reps field presence check in `useMappedFields.ts`

### Files Modified
- `src/config/priorityRegistry.ts`
- `src/services/priorityExecutor.ts`
- `src/hooks/useMappedFields.ts`

---

## [2025-12-11 18:15 UTC] - Fix: Assignment Configuration Save Error (Complete)

### Summary
Fixed schema mismatch errors when saving assignment configuration. The frontend was using field names that didn't match the database columns.

### Key Changes
**Field Name Mappings (Frontend → Database):**
- `atr_variance_percent` → `atr_variance`
- `customer_target_atr` → `atr_target`
- `customer_min_atr` → `atr_min`
- `customer_max_atr` → `atr_max`

**Code Updates:**
- Updated `handleSave()` to explicitly map frontend fields to correct DB columns instead of spreading `...config`
- Updated load logic to read from correct DB columns (`atr_target`, `atr_min`, `atr_max`)
- Renamed `atr_variance_percent` to `atr_variance` in `priorityExecutor.ts`

### Files Modified
- `src/components/FullAssignmentConfig.tsx`
- `src/services/priorityExecutor.ts`

---

## [2025-12-11 17:55 UTC] - Fix: Priority Configuration UI Shows "RO" for Residual Optimization

### Summary
Fixed the Priority Configuration UI (`PriorityWaterfallConfig.tsx`) to display "RO" instead of "P5" for the Residual Optimization priority, matching the fix applied earlier to the WaterfallLogicExplainer component.

### Key Changes
- Updated `SortablePriorityItem` component to check if priority is `arr_balance` and display "RO" instead of `P{position}`

---

## [2025-12-11] - Feature: APAC Region Support & EMEA Priority Reorder

### Summary
Added APAC as a new assignment mode and region option throughout the app. Updated EMEA priority order to remove combined geo+continuity in favor of separate continuity and geography priorities. Added team alignment to EMEA/APAC modes.

### Key Changes

**New APAC Mode:**
- Added `'APAC'` to `AssignmentMode` type
- Added APAC detection in `modeDetectionService.ts`
- Added APAC to user region options in Auth flow
- APAC uses same priority structure as EMEA

**EMEA Priority Reorder:**
- Removed `geo_and_continuity` from EMEA mode (now ENT/COMMERCIAL only)
- Moved `continuity` to position 2 (was 4)
- Added `team_alignment` to EMEA at position 4

**Priority Positions (EMEA/APAC):**
| Pos | Priority |
|-----|----------|
| 0 | Manual Holdover |
| 1 | Stability Accounts |
| 2 | Account Continuity |
| 3 | Geographic Match |
| 4 | Team Alignment |
| 5 | Residual Optimization |

**Documentation:**
- Added `cannotGoAbove` constraint comments explaining ENT/COMMERCIAL-only behavior
- Added ENT threshold pending comment (Daniel feedback: 2500+ vs 1500+)
- Added engine doc log noting UI-only nature of `assignment_mode`

### Files Modified
- `src/config/priorityRegistry.ts` - Added APAC mode, updated EMEA positions
- `src/services/modeDetectionService.ts` - Added APAC detection, labels, descriptions
- `src/contexts/AuthContext.tsx` - Added APAC to UserRegion type
- `src/pages/Auth.tsx` - Added APAC to region dropdown
- `src/services/optimization/optimizationSolver.ts` - Added ENT threshold pending comment
- `src/services/simplifiedAssignmentEngine.ts` - Added UI-only documentation log

### Important Note
The assignment engine (`simplifiedAssignmentEngine.ts`) runs hardcoded P1-P4 logic regardless of the selected mode. The `assignment_mode` from config is currently **UI-only** - it affects which priorities are displayed in the configuration interface but does not change actual engine behavior. This is documented with a console log in the engine.

---

## [2025-12-11 18:30] - Critical Fix: Route Features to Active Engine

### Summary
Discovered that Sales Tools and Team Alignment were implemented in `priorityExecutor.ts` but the **UI actually uses `simplifiedAssignmentEngine.ts`**. This architectural mismatch meant both features were dead code. Fixed by implementing features in the active engine.

### Root Cause
The codebase has multiple assignment engines:
- `simplifiedAssignmentEngine.ts` - **ACTIVE** (used by `useAssignmentEngine` hook)
- `priorityExecutor.ts` - NOT USED by UI (orphaned)
- `optimizationSolver.ts` - Part of priorityExecutor flow (orphaned)
- `enhancedAssignmentService.ts` - Legacy

### Fixes Applied

**Sales Tools Bucket:**
- Added Sales Tools routing to `simplifiedAssignmentEngine.ts`
- Routes customers < $25K ARR (configurable via `rs_arr_threshold`)
- Creates pseudo-rep with empty `rep_id` for UI display as "Sales Tools"
- Updated `assignmentService.ts` to handle null owner:
  - Separate batch for Sales Tools accounts (no owner cascade)
  - `assignment_type: 'SALES_TOOLS'` for DB records
  - Proper audit logging with `SALES_TOOLS_ROUTED` action

**Team Alignment Penalties:**
- Added `employees` field to Account interface in engine
- Added `team_tier` field to SalesRep interface in engine
- Added `classifyAccountTeamTier()` function (SMB/Growth/MM/ENT based on employee count)
- Added `calculateTeamAlignmentPenalty()` function (GAMMA=100 for 1-level, EPSILON=1000 for 2+ levels)
- Integrated penalties into HiGHS objective function via coefficient reduction
- Updated `useAssignmentEngine.ts` to pass `team_tier` from DB to engine

### Files Modified
- `src/services/simplifiedAssignmentEngine.ts` - Added Sales Tools + Team Alignment
- `src/services/assignmentService.ts` - Sales Tools null owner handling
- `src/hooks/useAssignmentEngine.ts` - Pass team_tier to engine

---

## [2025-12-11 19:00] - Cleanup: Documented Orphaned Code

### Summary
Added clear deprecation notices to files that contain unused execution code. These files export types that ARE used by UI components, so they cannot be deleted entirely.

### Files with Deprecation Notices Added

**`src/config/priorityRegistry.ts`**
- ✅ USED: Type exports (`AssignmentMode`, `PriorityConfig`, `PriorityDefinition`)
- ✅ USED: Registry data for UI display (WaterfallLogicExplainer, config components)
- ⚠️ NOT USED: Priority definitions don't drive actual execution (hardcoded in simplifiedAssignmentEngine)

**`src/services/priorityExecutor.ts`**
- ✅ USED: Type exports (`Account`, `SalesRep`) by parentalAlignmentService, commercialPriorityHandlers
- ❌ DEAD: `executeAssignmentWithPriorities()`, `filterAccountsByPriority()`, `combineResults()`, `loadAssignmentConfig()`

**`src/services/optimization/optimizationSolver.ts`**
- ✅ USED: Type exports via optimization/index.ts (by sandboxMetricsCalculator)
- ❌ DEAD: All execution functions (`runCustomerOptimization()`, `buildCustomerLPProblem()`, team alignment functions)

### Recommendation
Future work should either:
1. Connect these files to the UI flow (replace simplifiedAssignmentEngine calls)
2. Move shared types to a dedicated types file and delete the dead execution code

---

## [2025-12-11] - Fix: Team Alignment Penalties Integration

### Summary
Fixed critical bug where team alignment penalties were defined but never applied in the LP solver. The helper functions `classifyAccountTeamTier()` and `calculateTeamAlignmentPenalty()` existed but were never called.

### Fixes
1. **Added `team_alignment` case in `filterAccountsByPriority()`** - Previously fell through to `default` case
2. **Integrated GAMMA/EPSILON penalties into LP solver** - Added penalty terms to both `buildCustomerLPProblem()` and `buildProspectLPProblem()` for account-rep tier mismatches
   - GAMMA (100): 1-level tier mismatch (e.g., Growth account → SMB rep)
   - EPSILON (1000): 2+ level tier mismatch (e.g., MM account → SMB rep)
3. **Penalties only apply when rep has `team_tier` set** - Graceful degradation for reps without tier assignment

### Files Modified
- `priorityExecutor.ts` - Added `team_alignment` case handler
- `optimizationSolver.ts` - Integrated penalty calculations into customer and prospect LP problems

---

## [2025-12-11] - Feature: Commercial Priority Reconfiguration

### Summary
Reconfigured Commercial mode priorities to add Sales Tools bucket for sub-$25K customers and Team Alignment optimization with graduated penalties. This replaces the old `rs_routing` optimization priority with a more robust filter-based approach.

### New Priority Stack (Commercial Mode)
1. P0: Strategic + Manual Locks (filter) - unchanged
2. PA: Parental Alignment (implicit) - unchanged  
3. P1: Sales Tools Bucket (filter) - NEW - routes customers under $25K ARR
4. P2: Stability Accounts (filter) - shifted from P1
5. P3: Team Alignment (optimization) - NEW - matches accounts to rep tiers
6. P4: Geo + Continuity (optimization)
7. P5: Continuity (optimization)
8. P6: Geography (optimization)
9. RO: Residual Optimization (locked)

### Key Changes

**Sales Tools Bucket (P1):**
- Replaced `rs_routing` (optimization) with `sales_tools_bucket` (holdover/filter)
- Routes customer accounts with ARR < $25K to "Sales Tools" bucket
- Uses NULL rep assignment with "Sales Tools" display name
- Does NOT apply to prospects
- Parental alignment takes precedence (parent stays with children's owner)

**Team Alignment (P3):**
- NEW optimization priority for Commercial mode
- Matches account employee count to rep team tier (SMB/Growth/MM/ENT)
- Tier classification: SMB (0-99), Growth (100-299), MM (300-1499), ENT (1500+)
- Graduated penalties: GAMMA=100 for 1-level mismatch, EPSILON=1000 for 2+ levels
- NULL employees default to SMB tier

**Database Changes:**
- Added `team_tier` column to `sales_reps` table
- Values: SMB, Growth, MM, ENT (or NULL)

### Files Modified
- `src/config/priorityRegistry.ts` - Replaced rs_routing, added sales_tools_bucket + team_alignment, updated positions
- `src/services/priorityExecutor.ts` - Added Sales Tools holdover case with NULL rep pattern, updated combineResults()
- `src/services/optimization/optimizationSolver.ts` - Added GAMMA/EPSILON penalties, team tier classification functions
- `src/utils/autoMappingUtils.ts` - Added team_tier field mapping for imports
- `src/components/WaterfallLogicExplainer.tsx` - Updated UI for new priorities
- `src/utils/assignmentExportUtils.ts` - Added Sales Tools labeling in exports
- `src/integrations/supabase/types.ts` - Regenerated with team_tier column
- `supabase/migrations/20251211000001_add_team_tier_to_sales_reps.sql` - New migration

---

## [2025-12-11 20:35] - Fix: P0 Holdover Now Active in EnhancedAssignmentService

### Summary
Added P0 holdover logic to `EnhancedAssignmentService` so accounts with `exclude_from_reassignment = true` are actually respected. Previously this flag was in the interface but never checked.

### Changes
- Accounts with `exclude_from_reassignment = true` are now filtered out before processing
- Holdover accounts stay with their current owner (no reassignment)
- Holdover proposals included in results with reason "P0: Excluded from reassignment (manually locked)"
- Console logging shows holdover count during assignment generation

### Files Modified
- `enhancedAssignmentService.ts` - Added holdover filtering and proposal generation

---

## [2025-12-11 20:30] - Refactor: Remove Dead Priority Weights & P5 Cleanup

### Summary
Removed the vestigial "weight" concept from priority configuration (was never used in backend) and cleaned up P5 references to use "RO" (Residual Optimization) consistently.

### Changes

**Removed dead weight code:**
- Removed `defaultWeight` property from `PriorityDefinition` interface
- Removed `weight` property from `PriorityConfig` interface
- Removed all `defaultWeight` values from PRIORITY_REGISTRY entries
- Updated `getDefaultPriorityConfig()` to not include weight

**UI cleanup in WaterfallLogicExplainer.tsx:**
- Removed "Weight: {weight}" badges from optimization priority cards
- Changed "Residual Optimization" badge from dynamic "P5" to static "RO"
- Removed the "Global Constraints" section (Capacity Hard Cap, Parent-Child Alignment, Regional Alignment cards)
- Updated header text from "HiGHS Solver Weights" to "Sequential Waterfall"

**Backend rationale cleanup in simplifiedAssignmentEngine.ts:**
- Changed `ruleApplied: 'Priority 5: Forced Assignment'` to `'RO: Forced Assignment'`
- Updated console.log messages from "P5:" to "RO:"
- Updated rationale prefix to include "RO:" for proper analytics categorization

**Files Modified:**
- `priorityRegistry.ts` - Removed weight from interfaces and data
- `WaterfallLogicExplainer.tsx` - Removed weight badges, P5→RO, removed Global Constraints
- `PriorityWaterfallConfig.tsx` - Removed weight from config objects
- `simplifiedAssignmentEngine.ts` - Changed P5 references to RO

---

## [2025-12-11 20:15] - Feature: Stability Priority Refactor v5

### Summary
Simplified P1 Stability to 4 sub-conditions with capacity-based override. Reps at capacity limits will have their stability-protected accounts released to optimization.

### Changes

**Sub-conditions:**
- **Kept**: `cre_risk`, `renewal_soon`, `pe_firm`, `recent_owner_change`
- **Removed**: `top_10_arr`, `expansion_opps`
- **Changed**: `recent_owner_change` now `defaultEnabled: true`

**Capacity Override (NEW):**
- If rep has >= 8 customers OR >= 30 prospects, stability protection is bypassed
- Configurable via `customer_max_accounts` and `prospect_max_accounts` in assignment_configuration
- Only applies to P1 stability, NOT P0 manual holdovers

**Database Migrations:**
- `add_owner_change_date`: Added `owner_change_date DATE` column to accounts
- `add_max_accounts_config`: Added `customer_max_accounts` and `prospect_max_accounts` to assignment_configuration (NULL defaults)

**Files Modified:**
- `priorityRegistry.ts` - Removed 2 sub-conditions, enabled recent_owner_change, fixed renewal_soon requiredFields
- `priorityExecutor.ts` - Capacity override logic, interface updates, dead code removal
- `batchImportService.ts` - renewal_date rollup from opportunities
- `autoMappingUtils.ts` - owner_change_date CSV mapping aliases
- `importUtils.ts` - owner_change_date transform
- `WaterfallLogicExplainer.tsx` - Removed dead icon cases and if statements
- `supabase/types.ts` - Regenerated with new columns

---

## [2025-12-11 19:45] - Fix: Expose Parental Alignment Warnings to UI

### Summary
Added `parentalAlignmentWarnings` to `AssignmentResult` interface so UI can display split ownership warnings.

### Changes
- Added `parentalAlignmentWarnings?: ParentalAlignmentWarning[]` to `AssignmentResult` interface
- Include warnings in return object when present

---

## [2025-12-11 19:30] - Fix: Parental Alignment Critical Bugs

### Summary
Fixed critical bugs in the parental alignment implementation identified during code review.

### Critical Fixes

1. **Dead Code Bug - Integration into wrong service**
   - Original implementation was in `priorityExecutor.ts` but the UI uses `EnhancedAssignmentService`
   - **Fix**: Integrated parental alignment into `EnhancedAssignmentService.generateBalancedAssignments()`
   - Now runs before any assignment rules, creating proposals for resolved parents

2. **Non-deterministic Tiebreaker**
   - Using `Math.random()` in sort caused non-deterministic results
   - **Fix**: Changed to `a.sfdc_account_id.localeCompare(b.sfdc_account_id)` for consistency

3. **Opportunities Cascade to Locked Children**
   - `parentToChildMap` included locked children, so their opportunities got updated
   - **Fix**: Added `exclude_from_reassignment` to child fetch and filter locked children from map

4. **Non-null Assertion**
   - Changed `winner.owner_id!` to `winner.owner_id || ''` for defensive coding

### Files Modified
- `enhancedAssignmentService.ts` - Added parental alignment integration
- `parentalAlignmentService.ts` - Fixed tiebreaker and non-null assertion
- `assignmentService.ts` - Fixed opportunities cascade filtering

---

## [2025-12-11 18:00] - Feature: Parental Alignment Rule

### Summary
Added implicit parent-child alignment logic that resolves parent account ownership when children have conflicting owners. This runs after holdovers but before strategic accounts, and is invisible in the UI.

### Changes

1. **New Service: `parentalAlignmentService.ts`**
   - `resolveParentChildConflicts()` - main entry point
   - `determineParentOwner()` - tiebreaker logic
   - Fetches children via single DB query, builds parent->children map
   - Returns resolutions + warnings

2. **priorityExecutor.ts** (note: also integrated into EnhancedAssignmentService)
   - Added Phase 1.5 after holdovers, before strategic
   - Calls `resolveParentChildConflicts()` to determine parent owners
   - Converts resolutions to protected accounts with resolved owner (not current owner)
   - Added `parentalAlignmentWarnings` to result type

3. **assignmentService.ts - Cascade Fix**
   - Both `cascadeNewAssignments()` and `cascadeToChildAccounts()` now skip locked children
   - Added filter: `.or('exclude_from_reassignment.is.null,exclude_from_reassignment.eq.false')`

### Tiebreaker Logic
1. Locked children (`exclude_from_reassignment = true`) get priority
2. Among candidates: higher child ARR wins
3. If still tied: deterministic account ID comparison

### Split Ownership Behavior
- Split only occurs when multiple children are locked to different owners
- Locking one child: that child's owner wins, cascade unifies all
- Locking multiple to same owner: that owner wins, no split
- Locking multiple to different owners: tiebreaker picks winner, locked children retain their owners → split

### UI
- Rule is completely invisible in the UI (not in priority registry)
- Rationale shows as "Parent-Child Alignment"
- Warnings generated for conflicts and splits

---

## [2025-12-11 15:30] - Fix: BalancingAnalyticsRow RO Implementation Bugs

### Summary
Fixed two bugs discovered during verification of the Residual Optimization (RO) implementation.

### Fixes

1. **Tooltip text outdated** - Changed "P2-P5" to "P2-P4" and added explicit "RO" line
2. **Strategic accounts not counted as P0** - The strategic rationale uses "Priority 0:" format but parsing only checked for "P0:". Added `'Priority 0:'` to the detection logic.

---

## [2025-12-11] - UI: RepManagement Summary Cards Grid Layout

### Summary
Changed the Rep Management summary cards from a 5-column layout to a 6-column layout to accommodate the Orphaned Owners card.

### Changes
- **RepManagement.tsx**: Updated grid classes to `grid-cols-2 md:grid-cols-3 lg:grid-cols-6` for responsive 6-tile layout

---

## [2025-12-11] - Refactor: Residual Optimization UI Rename

### Summary
Renamed "Next Best Reps" → "Residual Optimization" (RO). RO is now a locked final fallback stage that displays as "RO" in analytics, separate from the numbered priority sequence (P0-P6).

### Changes

1. **priorityRegistry.ts**
   - Renamed `arr_balance` display name to "Residual Optimization"
   - Added `isLocked: true` - cannot be disabled or reordered

2. **BalancingAnalyticsRow.tsx**
   - Added new "RO" key to PRIORITY_COLORS and PRIORITY_DESCRIPTIONS
   - Removed P5 from the sequence (was only used for Next Best Reps)
   - Fixed pre-existing bug: P5 parsing was broken (looked for 'Next Best' but actual rationale was 'Optimized:')
   - Added backward-compatible parsing for legacy patterns

3. **optimizationSolver.ts**
   - Changed rationale format from `Optimized: <metric>` to `RO: <metric>`
   - Added maintainability comment linking to BalancingAnalyticsRow.tsx parsing

4. **WaterfallLogicExplainer.tsx**
   - Updated `arr_balance` bullets to describe HiGHS optimization

### Bug Fix
Fixed pre-existing analytics bug where P5 accounts were miscategorized as "Other" because the parsing logic looked for 'Next Best', 'Best Available', 'Fallback' but actual rationale was 'Optimized: ARR/ATR/Tier balanced'.

### UI Cleanup
- Removed redundant "Strategic Pool" section from WaterfallLogicExplainer (was duplicating P0 info)
- Expanded P0 bullets to clarify difference: holdover = locked, strategic = can rebalance within pool

---

## [2025-12-11] - Refactor: Three-Tier Penalty Structure for HiGHS Optimization

### Summary
Replaced the heuristic-based objective function with a mathematically rigorous three-tier penalty structure. This provides smoother optimization with proper handling of soft preferences vs hard constraints.

### Penalty Structure

| Zone | Coefficient | Description |
|------|-------------|-------------|
| Alpha (α) | 1.0 | Light penalty inside target ± variance band |
| Beta (β) | 10.0 | Medium penalty in buffer zone (variance to absolute limit) |
| Big M | 1,000,000 | Prohibitive penalty for violating absolute min/max |

### Changes to `optimizationSolver.ts`

1. **New Constants**: Added `PENALTY` object with ALPHA, BETA, BIG_M coefficients

2. **New Helper Functions**:
   - `buildMetricPenaltyTerms()`: Generates slack variables, bounds, and constraints for ARR/ATR/Pipeline with 3-tier penalties
   - `buildTierPenaltyTerms()`: Generates beta-only penalties for tier balancing (no Big M)

3. **Refactored LP Builders** (all now use Minimize instead of Maximize):
   - `buildCustomerLPProblem()`: ARR + ATR + Tier penalties
   - `buildProspectLPProblem()`: Pipeline + Tier penalties
   - `buildStrategicLPProblem()`: All metrics with average-based targets

### LP Formulation

Before (heuristic scoring):
```
Maximize: Σ (balance_score[i,j] * x[i,j])
Subject To: arr >= min, arr <= max (hard constraints)
```

After (penalty-based):
```
Minimize: Σ (α*alpha_slack + β*beta_slack + M*bigM_slack)
Subject To: arr = target + alpha_over - alpha_under + beta_over - beta_under + bigM_over - bigM_under
```

### Benefits
- Prevents infeasibility from hard constraints
- Smooth penalty gradient guides solver toward optimal balance
- Normalized penalties ensure ARR, ATR, Pipeline contribute proportionally
- Tier constraints use soft beta penalties (can exceed average if needed)

---

## [2025-12-10 17:30] - Feature: Strategic Account Optimization (Priority 0)

### Summary
Added strategic account/rep designation with separate Priority 0 optimization. Strategic accounts are assigned exclusively to strategic reps using average-based balancing.

### Database Changes
- Added `is_strategic` column to `accounts` table (boolean, default false)

### New Features

1. **Strategic Toggle in Account Management** (`AccountsTable.tsx`)
   - New "Strategic" column with toggle button (purple sparkles icon)
   - Strategic accounts are assigned only to strategic reps
   - Tooltip explains the behavior

2. **Strategic Optimization Solver** (`optimizationSolver.ts`)
   - New `runStrategicOptimization()` function
   - Uses average-based balancing (no hard min/max targets)
   - Same weights: ARR 50%, ATR 25%, Tiers 25% for customers; Pipeline 50%, Tiers 50% for prospects
   - Minimizes deviation from average rather than enforcing fixed targets

3. **Priority 0 Execution** (`priorityExecutor.ts`)
   - Strategic optimization runs before all regular priorities
   - Filters: `is_strategic = true` accounts -> `is_strategic_rep = true` reps
   - Edge case handling:
     - No strategic reps: Warning logged, accounts left unassigned
     - No strategic accounts: Skipped entirely
   - Assigned strategic accounts removed from regular pool

4. **Import Support** (`importUtils.ts`)
   - `is_strategic` field mapped during account import
   - `is_strategic_rep` field (already existed) mapped during rep import
   - Sample CSVs updated with strategic examples

### Architecture

```
Priority 0: Strategic Optimization
  └─> Strategic accounts → Strategic reps only (avg-based)
  
Priority 1+: Regular Optimization  
  └─> Non-strategic accounts → Non-strategic reps (target-based)
```

---

## [2025-12-10 16:45] - UI Update: Explicit Min/Max Constraints & Balance Limits Cleanup

### Changes

1. **Added Explicit Minimum Fields for All Metrics** (`FullAssignmentConfig.tsx`)
   - **Customer ARR**: Added "Minimum ARR" input (hard floor ≤ preferred min from variance)
   - **Customer ATR**: Added "Minimum ATR" input (hard floor ≤ preferred min from variance)
   - **Prospect Pipeline**: Added "Minimum Pipeline" input (hard floor ≤ preferred min from variance)
   - All min/max fields now displayed in a clean 2-column grid layout

2. **Removed Balance Limits Section** (`FullAssignmentConfig.tsx`)
   - Removed: Max CRE per Rep
   - Removed: Max ATR per Rep (legacy field)
   - Removed: Max Tier 1 Accounts
   - Removed: Max Tier 2 Accounts
   - Removed: Max Renewals/Qtr (%)
   - These are now handled by the HIGHS optimization constraints

3. **Updated Optimization Solver** (`optimizationSolver.ts`)
   - `MetricConfig` now includes explicit `min` field alongside `max`
   - Constraints now use explicit min values instead of calculating from variance
   - Default configs updated to include min values

4. **Updated Priority Executor** (`priorityExecutor.ts`)
   - `AssignmentConfig` interface extended with min fields
   - `buildCustomerConfig()` and `buildProspectConfig()` now pass min values to solver

---

## [2025-12-10] - Feature: HIGHS Multi-Metric Optimization Engine

### Summary
Major refactor of the optimization engine to use HIGHS MILP solver at each priority level with separate customer/prospect optimization paths and weighted objectives.

### New Optimization Weights

**Customers:**
- ARR Balance: 50% weight
- ATR Balance: 25% weight
- Tier Distribution: 25% weight (all 4 tiers balanced individually)

**Prospects:**
- Pipeline Balance: 50% weight
- Tier Distribution: 50% weight (all 4 tiers balanced individually)

### Key Changes

1. **Multi-Priority HIGHS Optimization** (`priorityExecutor.ts`)
   - Runs HIGHS optimization at each priority level, not just once at the end
   - Separate optimization paths for customers and prospects
   - Dynamic weighting: customers prioritized when more prospects exist (ratio-based)
   - Tracks rep workloads across priority levels for cumulative balancing

2. **New Optimization Solver** (`optimizationSolver.ts`)
   - Removed geo/continuity from objectives (handled by priority filters)
   - Added ATR constraints for customer optimization
   - Added Pipeline constraints for prospect optimization
   - Added individual tier balancing (Tier 1, 2, 3, 4 each balanced separately)
   - New functions: `runCustomerOptimization()`, `runProspectOptimization()`

3. **ATR Configuration UI** (`FullAssignmentConfig.tsx`)
   - New "Customer ATR Targets" section matching ARR pattern
   - Target ATR per Rep slider
   - ATR Variance % slider
   - Maximum ATR per Rep hard cap

4. **Cleanup: Removed Unused AI Components**
   - Deleted: `aiBalancingOptimizer.ts` (LLM-based, not used)
   - Deleted: `aiBalancingConfig.ts` (unused config)
   - Deleted: `AIBalancingOptimizerDialog.tsx`, `AIBalancingOptimizer.tsx`
   - Deleted: `aiMultiDimensionalBalancer.ts`
   - Updated: `enhancedAssignmentService.ts` - deprecated AI_BALANCER rule type

5. **Cleanup: Removed Dead Assignment Services**
   - Deleted: `collaborativeAssignmentService.ts` (not imported anywhere)
   - Deleted: `ruleBasedAssignmentEngine.ts` (not imported anywhere)
   - Deleted: `multiCriteriaScoringService.ts` (only imported by deleted service)
   - Deleted: `algorithmicAssignmentService.ts` (only imported by deleted service)
   - Deleted: `sophisticatedAssignmentService.ts` (not imported anywhere)

### Active Assignment Services (Remaining)
- `simplifiedAssignmentEngine.ts` - Main assignment engine
- `enhancedAssignmentService.ts` - Used by AssignmentEngine page
- `rebalancingAssignmentService.ts` - Used by hooks

### Files Changed
- `src/services/optimization/optimizationSolver.ts` - Complete refactor
- `src/services/priorityExecutor.ts` - Multi-pass optimization per priority
- `src/components/FullAssignmentConfig.tsx` - ATR configuration UI
- `src/pages/AssignmentEngine.tsx` - Removed AI optimizer references
- `src/services/enhancedAssignmentService.ts` - Deprecated AI_BALANCER

### Files Deleted (10 total)
AI Components:
- `src/services/aiBalancingOptimizer.ts`
- `src/config/aiBalancingConfig.ts`
- `src/components/AIBalancingOptimizerDialog.tsx`
- `src/components/AIBalancingOptimizer.tsx`
- `src/services/aiMultiDimensionalBalancer.ts`

Dead Assignment Services:
- `src/services/collaborativeAssignmentService.ts`
- `src/services/ruleBasedAssignmentEngine.ts`
- `src/services/multiCriteriaScoringService.ts`
- `src/services/algorithmicAssignmentService.ts`
- `src/services/sophisticatedAssignmentService.ts`

---

## [2025-12-10 15:20 PST] - Fix: 0 Assignments Due to ARR Field Priority Bug

### Summary
Fixed critical bug where assignment engine was reading `calculated_arr` (always 0) instead of `hierarchy_bookings_arr_converted` (actual ARR data).

### Root Cause
- `calculated_arr` column was `0` for all accounts (not NULL)
- JavaScript's `||` operator treats `0` as falsy, so `account.calculated_arr || account.arr || 0` returned `0`
- The actual ARR data was in `hierarchy_bookings_arr_converted` ($107M total)
- Result: All capacity checks failed because accounts appeared to have $0 ARR

### Fix
1. Added `getEffectiveARR()` helper in `simplifiedAssignmentEngine.ts`:
   - Priority: `hierarchy_bookings_arr_converted` → `calculated_arr` (if > 0) → `arr` → `0`
2. Updated all ARR calculations in the waterfall engine
3. Updated `useAssignmentEngine.ts` to use same priority for rep workload calculations

### Files Changed
- `src/services/simplifiedAssignmentEngine.ts` - New `getEffectiveARR()` method, updated all ARR references
- `src/hooks/useAssignmentEngine.ts` - Updated rep workload and balance calculations

---

## [2025-12-10] - Fix: Greedy Fallback When HiGHS Solver Fails

### Summary
Added greedy assignment fallback when HiGHS solver crashes on large batches (5000+ accounts).

### Problem
HiGHS solver was crashing with "Unable to read LP model" error when processing large prospect batches, resulting in 0 assignments.

### Solution
When HiGHS fails, now falls back to greedy assignment:
- Iterates through accounts one by one
- Assigns each to the rep with most available capacity
- Logs fallback usage for debugging

---

## [2025-12-10] - Fix: Enable Prospect Assignments by Default

### Summary
Changed default `assign_prospects` to `true` so prospects are assigned when running "Assign All".

### Changes
- Default `assign_prospects` changed from `false` to `true` in:
  - `collaborativeAssignmentService.ts`
  - `SimpleAssignmentConfiguration.tsx`
- Existing builds need to enable via config or database update

---

## [2025-12-10] - Fix: Rename FLM Routing & Engine Safety Checks

### Summary
Renamed FLM Routing priority to "Renewal Specialist (FLM)" and ensured engine handles missing optional fields gracefully.

### Changes
- **Renamed Priority**: "FLM Routing (≤$25k ARR)" → "Renewal Specialist (FLM)"
- **Updated Descriptions**: WaterfallLogicExplainer now explains FLM holds until RS is hired
- **Import Safety**: Added `pe_firm` to account transform (was defined in schema but not imported)
- **Engine Safety**: All stability sub-conditions use safe null checks (`&& account.field`)
- **Dashboard Labels**: Updated P6 description to match new name

### No-Error Guarantee
The engine safely handles missing optional fields:
- `renewal_event_date` - checked with `&& account.renewal_event_date`
- `owner_change_date` - checked with `&& account.owner_change_date`  
- `has_expansion_opp` - checked with `&& account.has_expansion_opp`
- `pe_firm` - checked with `&& account.pe_firm`

If data is not mapped during import, sub-conditions simply won't match (no errors).

---

## [2025-12-10] - Fix: Engine & Dashboard Compatibility with New Priority Structure

### Summary
Fixed critical issues with the assignment engine and dashboard to work with the new priority structure including stability_accounts sub-conditions.

### Engine Fixes (`priorityExecutor.ts`)
- Added `stability_accounts` handler that checks enabled sub-conditions (CRE Risk, Renewal Soon, Top 10% ARR, PE Firm, Expansion Opps, Recent Owner Change)
- Sub-condition check uses logical OR - account is protected if ANY enabled condition matches
- Added legacy handlers for backwards compatibility with old configs
- Rationale format now uses `P0:`, `P1:`, etc. for easier parsing

### Dashboard Fixes (`BalancingAnalyticsRow.tsx`)
- Updated priority color palette for P0-P6 structure
- Added `PRIORITY_DESCRIPTIONS` map for legend tooltips
- Rationale parsing supports new `P#:` format with legacy fallback
- Legend items now show full description on hover

### Ordering Constraint (`PriorityWaterfallConfig.tsx`)
- `geography` and `continuity` auto-placed AFTER `geo_and_continuity` when enabled
- `geo_and_continuity` auto-inserted BEFORE enabled `geography`/`continuity`
- Ensures proper waterfall ordering is always maintained

---

## [2025-12-10] - UI: Add Copy Link button to Send to Manager dialog

### Changes
- Added separate "Copy Link" button to generate and copy shareable link
- Users can now copy the link without needing to send to a manager first
- Changed "Send" button to "Send & Copy Link" for clarity
- Link remains copyable in success dialog after sending

---

## [2025-12-10] - Feature: Priority Waterfall Overhaul with Stability Accounts

### Summary
Major restructure of the priority waterfall with new expandable "Stability Accounts" priority (P1) that combines multiple holdover conditions. Includes UI improvements with P0/P1/P2 format, tooltips, and CUSTOM mode showing all priorities.

### New Priority Waterfall (All Modes)
- **P0**: Manual Holdover & Strategic Accounts (Filter, locked)
- **P1**: Stability Accounts (Filter, expandable sub-conditions)
  - CRE Risk (at-risk accounts stay)
  - Renewal Soon (RED within 90 days)
  - Top 10% ARR (per FLM hierarchy)
  - PE Firm (stay with majority owner)
  - Open Expansion Opps
  - Recent Owner Change
- **P2**: Geography + Continuity (Optimize)
- **P3**: Geographic Match (Optimize)
- **P4**: Account Continuity (Optimize)
- **P5**: Next Best Reps (Optimize)
- **P6** (COMMERCIAL only): FLM Routing (≤$25k ARR)

### Changes
- `priorityRegistry.ts`: Added `stability_accounts` with `subConditions` array, removed sub_region priority
- `PriorityWaterfallConfig.tsx`: P0/P1/P2 format, expandable sub-conditions, tooltips, disabled at bottom
- `WaterfallLogicExplainer.tsx`: Dynamic sub-condition display, P0 numbering
- `modeDetectionService.ts`: Removed sub_region detection (EMEA uses region field directly)
- CUSTOM mode now shows ALL priorities with unavailable ones locked

### Key Features
- **Expandable Stability Accounts**: Click to expand/collapse sub-conditions with individual toggles
- **Tooltips**: Descriptions now shown on hover instead of inline
- **Disabled priorities**: Move to bottom of list, no position number
- **CUSTOM mode**: Shows all possible priorities (available + unavailable with "Missing data" tooltip)

---

## [2025-12-10] - Feature: PE Firm Field Mapping for Related Partner Account

### Summary
Added auto-mapping support for "Related Partner Account: Related Partner Account Name" to map to the `pe_firm` field in the accounts table. This enables PE-owned accounts to be properly identified during import.

### Changes
- Added `pe_firm` field aliases to `autoMappingUtils.ts` with patterns for:
  - "Related Partner Account: Related Partner Account Name"
  - "PE Firm", "Private Equity Firm", "Partner Account" variants
- Added `pe_firm` to account field mappings in `DataImport.tsx`
- Field appears in "Secondary" priority section during import

---

## [2025-12-10] - Refactor: Simplified Priority Waterfall

### Summary
Removed CRE Risk and Renewal Quarter Balance (Q4) priorities from the waterfall pending team input. Renamed "ARR Workload Balance" to "Next Best Reps" for clarity.

### Changes
- Commented out `cre_risk` priority from `priorityRegistry.ts`
- Commented out `renewal_balance` (Q4) priority from `priorityRegistry.ts`
- Renamed `arr_balance` to "Next Best Reps" with updated description
- Updated default positions for ENT/COMMERCIAL/EMEA modes to be sequential
- Removed icon and detail mappings for removed priorities in `WaterfallLogicExplainer.tsx`
- Updated `arr_balance` icon to Zap (lightning bolt) to represent optimization

### Core Priority Waterfall (ENT)
- **P0**: Manual Holdover & Strategic Accounts (locked filter)
- **P1**: Geography + Continuity (locked filter)
- **P2**: Geographic Match (optimization)
- **P3**: Account Continuity (optimization)
- **P4**: Next Best Reps (optimization)

---

## [2025-12-10] - Feature: Renewal Quarter Auto-Calculation from Opportunities

### Summary
Automatically calculates and populates the `renewal_quarter` field on **parent accounts** based on the earliest `renewal_event_date` from opportunities across the entire hierarchy (parent + all children).

### Changes
- Updated `fiscalYearCalculations.ts` with correct FY logic (FY27 starts Feb 1, 2026)
- Added `getFiscalQuarterLabel()` function returning formatted strings like "Q4-FY27"
- Added `syncRenewalQuarterFromOpportunities()` to `batchImportService.ts`
- Sync runs automatically after opportunity import completes
- **Rollup behavior**: Uses `ultimate_parent_id` to roll up child opportunity dates to parent accounts

### UI Updates for New Format
- Updated `RenewalQuarterBadge` component with `whitespace-nowrap` and `min-w-[4rem]` for wider format
- Fixed quarter matching in `BalanceThresholdConfig.tsx` to use `startsWith` instead of exact match
- Fixed quarter matching in `simplifiedAssignmentEngine.ts` for workload tracking
- Fixed quarter matching in `balanceThresholdCalculator.ts` for threshold calculations

### Fiscal Year Logic
- Q1: Feb-Apr, Q2: May-Jul, Q3: Aug-Oct, Q4: Nov-Jan
- Format: "Q#-FY##" (e.g., Nov 2026 → "Q4-FY27")

---

## [2025-12-10] - UI: Improved Slack App Install Prompt

### Changes
- Changed Slack App Prompt from linking to marketplace to showing instructions modal
- Users now see step-by-step instructions to search "Book Builder" in Slack Apps
- Banner permanently dismissed when closed or "Got it" clicked (no more 7-day reappear)
- Modal styled to match app's theme using primary colors
- Disabled URL unfurling in Slack messages to remove preview cards

---

## [2025-12-10] - Feature: Complete Slack Integration for Notifications

### Summary
Full Slack integration for debugging, error reporting, and user notifications. All notification types now working and users are prompted to install the Slack app.

### Notification Types
- **feedback** (📝) - User feedback sent to developer
- **review_assigned** (📋) - Managers notified when assigned reviews
- **proposal_approved** (✅) - Users notified of approvals
- **proposal_rejected** (❌) - Users notified of rejections  
- **build_status** (🏗️) - Build status updates
- **error** (🚨) - JavaScript errors sent to developer with stack traces
- **welcome** (👋) - Welcome message on user signup

### Features
- **Welcome messages**: New users receive Slack DM on signup with getting started tips
- **Slack App Prompt**: Banner prompts pendo.io users to install the Slack app
- **Settings Page**: New Slack Integration section with notification types and install link
- **Fallback routing**: Non-pendo.io emails route to developer as fallback
- **Error reporting**: Global error handlers capture and report JS errors to Slack

### Technical Changes
- Updated `send-slack-notification` edge function (v5) with welcome type
- Added `SlackAppPrompt` component (banner and card variants)
- Added Slack section to Settings page
- AuthContext sends welcome notification on signup
- All notification types logged to `slack_notifications_log` table

---

## [2025-12-10] - Feature: Dynamic Priority Waterfall Tooltip
- WaterfallLogicExplainer now dynamically displays your configured priorities
- Added "Geography + Continuity" combined priority (locked at P1 for ENT) - accounts with matching geo AND current owner stay put
- Tooltip shows holdover vs optimization priorities with proper grouping
- Shows mode badge (Enterprise/Commercial/EMEA/Custom) and priority count
- Displays weight values for optimization priorities

## [2025-12-10] - UI: Removed "What Changed from Old System" section
- Removed outdated comparison card from WaterfallLogicExplainer tooltip

## [2025-12-10] - Feature: Priority Waterfall Configuration System
Major implementation of multi-mode priority configuration for assignment engine.

### Database Changes
- Added `pe_firm` field to accounts table (Private Equity firm tracking)
- Added `is_renewal_specialist` and `sub_region` fields to sales_reps table
- Added priority config fields to assignment_configuration: `assignment_mode`, `priority_config`, `rs_arr_threshold`, `is_custom_priority`
- Assignment modes: ENT (Enterprise), COMMERCIAL (Renewal Specialist routing), EMEA (sub-region routing), CUSTOM

### New Files Created
- `src/config/priorityRegistry.ts` - Defines all assignment priorities with holdover vs optimization types
- `src/hooks/useMappedFields.ts` - Checks which fields were mapped during import
- `src/services/modeDetectionService.ts` - Auto-detects assignment mode from build data
- `src/services/priorityExecutor.ts` - Orchestrates holdovers then HiGHS optimization
- `src/services/commercialPriorityHandlers.ts` - Top 10% ARR calculation, RS routing, EMEA sub-region mapping
- `src/components/PriorityWaterfallConfig.tsx` - Drag-drop priority configuration UI
- `src/utils/approvalChainUtils.ts` - EMEA approval chain (skips SLM)

### Features
- **Priority Configuration UI**: Drag-drop reordering, toggle on/off, mode selection (ENT/COMMERCIAL/EMEA/CUSTOM)
- **Unavailable priorities**: Shown at bottom with lock icon and "Missing data required" tooltip
- **Mode auto-detection**: Suggests mode based on build region and data characteristics
- **Holdover priorities**: Manual holdover, PE firm, Top 10% ARR, CRE risk (filter before optimization)
- **Optimization priorities**: Geography, sub-region, continuity, renewal balance, ARR balance (HiGHS weights)
- **Commercial mode**: Renewal Specialist routing for accounts ≤$25K ARR
- **EMEA mode**: Sub-region routing (DACH, UKI, Nordics, France, Benelux, Middle East)
- **EMEA approval chain**: Skips SLM step (FLM → RevOps → Approved)

### Integration
- Added Priority Configuration section to FullAssignmentConfig with mode badge and priority count
- All assignment decisions go through HiGHS MILP solver (never greedy)

## [2025-12-10] - UI: Removed redundant UI elements
- Removed "View Balancing Dashboard" button from "Ready for Territory Assignment" card (balancing tab wouldn't be unlocked at that stage)
- Removed redundant ImbalanceWarningDialog that required two clicks to apply assignments
- Imbalance warnings now show as a toast notification while applying proceeds directly
- Cleaner UX: one click to apply assignments instead of two
- Removed duplicate "Priority Configuration" header from dialog (was showing title twice)

## [2024-12-10] - UI: Simplified ARR Distribution threshold display
- Replaced 4 individual threshold lines with a single **green target zone** ($1.7M - $2.1M)
- Only shows Hard Cap line as a red vertical marker
- Much cleaner visualization - zone shows where reps should be

## [2024-12-10] - Feature: Real-time analytics updates after reassignments
- Manual reassignments now properly tagged with `MANUAL_REASSIGNMENT:` prefix in all dialogs
- ChangeChildOwnerDialog now also uses MANUAL_REASSIGNMENT prefix
- Priority distribution pie chart now refreshes automatically after any reassignment
- Metric cards updated: Avg ARR | Avg ATR | Avg Pipeline (3 distinct metrics)

## [2024-12-10] - UI: Clearer terminology across Balancing Dashboard
- "Retention" → "Continuity" in stats bar
- ARR Distribution chart labels updated:
  - "Under Min" → "Below Floor"
  - "Over Max" → "Over Ceiling"  
  - "Min" → "Floor", "Max" → "Ceiling", "Cap" → "Hard Cap"
- Status tooltips now explain what each color means

## [2024-12-10] - UI: Major Balancing Dashboard Analytics Overhaul
- Fixed threshold label overlap on ARR Distribution chart - now shows legend above chart
- Rep names now show "First L" format (e.g., "Tom S") for clarity
- Added info tooltips (i) to each chart explaining what they show
- Split "Book Changes" into **Biggest Gains** and **Biggest Losses** charts
- Added toggle to switch between $ (ARR) and # (account count) views
- Added **Total Pipeline** metric card alongside Avg ARR and Avg Pipeline
- Reorganized layout: metrics row → priority pie → gains/losses charts

## [2024-12-10] - UI: Consolidated Balancing Dashboard - removed redundancy
- Removed OptimizationMetricsPanel (duplicate info)
- Removed 6 separate summary cards (duplicate info)  
- Added compact summary stats bar: Customers, Prospects, Total ARR, Reps, Retention %, Geo Match %
- Dashboard now: Stats bar → Analytics row (3 charts) → ARR Distribution → Rep list

## [2024-12-10] - UI: Reduced "Book Changes" chart from Top 8 to Top 5 reps
- Changed chart to show fewer reps for better spacing/readability

# v1.3.0 - Development Branch

*Beta testers: Continue using https://book-ops-v1-2-beta.vercel.app (pinned to v1.2.0)*

## [2025-12-10] - Feature: Balancing Analytics Row with Charts

### Summary
Added a compact analytics row to the Balancing Dashboard with average metrics, before/after comparison charts, and priority distribution pie chart. Manual reassignments are now tracked with a consistent prefix for analytics.

### Changes
- **BalancingAnalyticsRow Component**: New component with three sections:
  - Avg ARR/Rep and Avg ATR/Rep metric cards with gradient styling
  - Before/After horizontal bar chart showing top 8 reps by ARR change
  - Priority Distribution donut chart (P1-P4 + Manual) with live counts
- **Priority Query**: Fetches assignment rationale from database and parses priority levels
- **Manual Tracking**: Both `AssignmentEngine` and `SalesRepDetailModal` now save manual reassignments with `MANUAL_REASSIGNMENT:` prefix
- **Live Updates**: Charts update automatically when assignments change via React Query invalidation

### Visual Design
- Muted color palette matching theme (emerald for ARR, blue for ATR)
- Compact ~150px height, responsive layout
- Priority colors: P1=green, P2=blue, P3=yellow, P4=orange, Manual=purple

---

## [2025-12-10] - Feature: Slack Integration for Debugging & Error Reporting

### Summary
Added global error handling that automatically sends JavaScript errors and crashes to @sean.muse via Slack DM. Also deployed the `send-slack-notification` edge function for manager notifications.

### Changes
- **ErrorBoundary Component**: React error boundary that catches component crashes and reports to Slack
- **Global Error Handlers**: `window.onerror` and `onunhandledrejection` catch uncaught errors
- **Error Reporting Service**: `errorReportingService.ts` sends errors with stack traces, URL, and app version
- **Edge Function Deployed**: `send-slack-notification` now active on Supabase (v3 with CORS fix)
- **Slack Notifications Log**: Database table tracks all notification attempts for debugging
- **Error Type Added**: Notification service now supports `error` type alongside feedback, review_assigned, etc.
- **CORS Fix**: Updated edge function to allow `x-client-info` and `apikey` headers from Supabase client
- **SLACK_BOT_TOKEN**: Set as Supabase secret for authentication

### Slack Bot Requirements
The Slack bot needs these OAuth scopes to work:
- `users:read.email` - Look up users by email
- `im:write` - Open DM channels
- `chat:write` - Send messages

### Slack Notification Routing
| Event Type | Recipient |
|------------|-----------|
| Feedback | @sean.muse |
| Errors | @sean.muse |
| Review Assigned | Manager's pendo.io email |
| Proposal Approved/Rejected | Manager's pendo.io email |
| Non-pendo.io users | Fallback to @sean.muse |

### Setup Required
The `SLACK_BOT_TOKEN` secret must be set in Supabase Dashboard → Settings → Edge Functions for Slack notifications to work.

---

## [2025-12-10] - Feature: Priority-Level Batch Optimization + Balancing Analytics

### Summary
Integrated advanced analytics and priority-level batch optimization into the Balancing Dashboard. The assignment engine now processes all accounts at each priority level before moving to the next, preventing greedy assignments where early accounts "steal" capacity from better matches.

### Critical Fixes (Same Day)
- **HiGHS Constraint Fix**: Solver now uses **Ceiling** (Target × 1.1) instead of **Hard Cap** as the capacity constraint
- **P1 Now Uses HiGHS**: All four priority levels now use HiGHS optimization (was only P2-P4)
- **Tightened Overflow Logic**: Reduced overflow allowance from 20%→10% (far below min) and 15%→5% (below min)
- **Territory Auto-Mapping Fix**: "Southwest" now correctly maps to West region (was mapping to South East due to TX state code matching first). Also changed matching priority: keywords → cities → states

### Assignment Engine Improvements - HiGHS Integration
- **Priority-Level Batching**: Engine now processes ALL accounts at each priority level (P1→P4) before cascading remainders
- **P1**: Continuity + Geography - keeps account with current owner if same geo + has capacity (greedy check)
- **P2**: Geography Match - **HiGHS optimized** - formulates LP problem with all geo-matched accounts/reps and solves for globally optimal assignment
- **P3**: Continuity Any-Geo - **HiGHS optimized** - optimizes which accounts to keep with current owner when capacity is limited
- **P4**: Fallback - **HiGHS optimized** - distributes remaining accounts optimally across all reps using LP solver
- **Priority Tracking**: Each assignment now tracks `priorityLevel` (1-4) for analytics
- **LP Formulation**: Variables x[account][rep]=1, maximize balance bonus + continuity bonus, subject to capacity constraints

### Balancing Dashboard Enhancements
- **OptimizationMetricsPanel**: Shows ARR balance score, geographic alignment %, continuity %, reps in band
- **Priority Distribution**: Visualizes % of accounts assigned at each priority level (P1-P4)
- **ARR Distribution Chart**: Horizontal bar chart showing each rep's ARR with threshold markers
- **Biggest Movers Section**: Highlights reps who gained/lost the most ARR from reassignments

### Cleanup
- Removed standalone Optimization Sandbox page (`/build/:id/sandbox` route)
- Removed sandbox button from Build Detail header
- Kept `sandbox_runs` table for potential future use

### Technical Notes
- **HiGHS Solver Active**: Now used in P2 and P4 for true mathematical optimization
- `solveWithHiGHS()` method in `simplifiedAssignmentEngine.ts` formulates MILP problem per priority level
- Objective function: maximize (balance_bonus + continuity_bonus) per assignment
- Constraints: each account assigned to at most 1 rep, rep ARR capacity limits
- Dashboard metrics now conform to `OptimizationMetrics` interface
- ARRDistributionChart shows min/target/preferredMax/hardCap thresholds

---

## [2025-12-09] - Feature: Optimization Sandbox with HiGHS Solver

### New Feature
Added an Optimization Sandbox that uses the HiGHS mathematical optimization solver to find optimal account-to-rep assignments. This allows comparing "what-if" scenarios with true mathematical optimization vs the current heuristic waterfall engine.

### Technical Details
- **HiGHS Integration**: Installed `highs` npm package (WebAssembly-compiled MILP solver)
- **LP Model Formulation**: Accounts and reps modeled as Mixed Integer Linear Program with:
  - Decision variables: Binary assignment variables (account → rep)
  - Objective: Maximize weighted score (geographic match + continuity + balance)
  - Constraints: ARR bands per rep, Max CRE per rep, strategic rep matching
- **Metrics Calculator**: Computes success metrics for baseline vs optimized:
  - Geographic alignment %
  - Continuity % (accounts kept with current owner)
  - ARR variance (coefficient of variation)
  - Capacity utilization distribution
  - Greedy overflow detection

### Files Added
- `src/services/optimization/optimizationSolver.ts` - HiGHS wrapper and LP model
- `src/services/optimization/sandboxMetricsCalculator.ts` - Metrics calculations
- `src/pages/OptimizationSandbox.tsx` - Sandbox UI with config panel
- `supabase/migrations/20251209000001_create_sandbox_runs_table.sql` - Persistence

### Access
- Navigate to any build and click the "Sandbox" button in the header
- Route: `/build/:buildId/sandbox`

### Also Fixed
- **Capacity Variance % Slider**: Added the missing slider to the main Assignment Configuration dialog (was stored in DB but had no UI). Now shows between Target ARR and Maximum ARR with tooltip explanation and calculated band display.
- **Prospect Variance % Slider**: Added separate variance slider for Prospect Pipeline (not shared with customers). New `prospect_variance_percent` column in DB.
- **Maximum ARR/Pipeline Validation**: Maximum sliders now auto-enforce minimum ≥ preferred max from variance band. Prevents invalid configurations.
- **Assignment Apply Bug (CRITICAL)**: Fixed "Duplicate assignment detected" error when applying assignments. The delete-before-insert pattern failed for >1000 accounts due to PostgreSQL IN clause limits. Now uses proper upsert with `ON CONFLICT`.

---

## [2025-12-08] - Setup: Version 1.3.0 Development Start

### Changes
- Bumped version to 1.3.0 to begin new development cycle
- Created beta alias `book-ops-v1-2-beta.vercel.app` pinned to v1.2.0 for beta testers
- Production URL (`book-ops-workbench-eosin.vercel.app`) will receive v1.3.0+ updates

---

# v1.2.0 - Major UI Enhancements Release

## [2025-12-06] - Fix: Renewal Quarter Display & Remove HQ Location

### Changes
- **Fixed**: Added `renewal_quarter` to the assignment changes query so the Renewal column now shows data in the "All Account Moves" table
- **Removed**: HQ Location column from SalesRepDetailDialog (was showing blank values)
- **Removed**: Location column from FLMDetailDialog accounts table

### Note on Renewal Data
The Renewal Quarter badges will only display if your imported account data has the `renewal_quarter` field populated. If you're not seeing renewal data, check your CSV import mappings.

---

## [2025-12-06] - Fix: Imbalance Warning Not Blocking Assignment Execution

### Issue
When clicking "Apply" on assignments, the imbalance warning dialog appeared but assignments were still being applied regardless of user choice. This led to a confusing UX where both the warning and success dialogs would appear together.

### Root Cause
`handleExecuteAssignments()` returned silently when showing the imbalance warning, but `onExecuteAssignments()` continued to the success path anyway (showing success dialog, refreshing data, etc.).

### Fix (Part 1)
- Updated `handleExecuteAssignments()` to return a boolean indicating if execution actually happened
- Updated `executeAssignmentsInternal()` to return `false` when blocked by imbalance warning
- Updated `onExecuteAssignments()` in AssignmentEngine.tsx to check the return value and exit early if execution was blocked
- Moved the "Executing Assignments" toast to only show after the imbalance check passes

### Fix (Part 2) - "Apply Anyway" Success Confirmation
- When user clicks "Apply Anyway" on the imbalance warning, execution now properly shows the success dialog
- Created `onImbalanceConfirm` wrapper in AssignmentEngine.tsx that:
  - Shows "Applying Assignments" toast
  - Calls the hook's confirm handler
  - Refreshes data on success
  - Shows the success dialog with correct count

### Files Changed
- `src/hooks/useAssignmentEngine.ts`
- `src/pages/AssignmentEngine.tsx`

---

## [2025-12-05] - Feature: Book Impact by Manager (Before/After View)

### Overview
Added a comprehensive "Book Impact by Manager" section to the Impact Analysis tab in ComprehensiveReview. Provides RevOps with clear visibility into which accounts are leaving and joining each FLM's book.

### Changes
- **New Section**: "Book Impact by Manager (Before → After)" in Impact Analysis tab
- Shows each FLM with cross-team account movements
- **Before/After Summary**: Total accounts and ARR before vs after the build
- **Net Impact**: Clearly highlighted gain/loss with color coding (red for losses, green for gains)
- **Leaving Details**: Lists accounts leaving with destination owner and FLM
- **Gaining Details**: Lists accounts being gained with source owner and FLM
- Sorted by net impact (biggest losses shown first)

### Visual Design
- Red/green color coding for net losses/gains
- Card-based layout per FLM with expandable details
- Shows ARR values in millions format
- Scrollable lists for managers with many account changes

---

## [2025-12-05] - Feature: Renewal Quarter Badges

### Overview
Added color-coded renewal quarter badges (Q1-Q4) to all account tables across the application, providing visual indication of when accounts are up for renewal.

### Changes
- **New Component**: Created `RenewalQuarterBadge.tsx` with color-coded badges:
  - Q1 (Feb-Apr): Blue
  - Q2 (May-Jul): Green
  - Q3 (Aug-Oct): Amber
  - Q4 (Nov-Jan): Purple
- **ComprehensiveReview**: Added Renewal column to All Account Moves table
- **SalesRepDetailDialog**: Added Renewal column to account tables (parents and children)
- **FLMDetailDialog**: Added Renewal column to accounts table
- **SalesRepDetailModal**: Added Renewal column to account tables
- **ManagerHierarchyView**: Added Renewal column to account tables
- **BookImpactSummary**: Added Renewal column to gained/lost accounts modals
- **UnassignedAccountsModal**: Added Renewal column to unassigned accounts table
- **AccountsLeavingView**: Added Renewal column to leaving accounts table

### Technical Details
- Updated interfaces to include `renewal_quarter: string | null`
- Modified database queries to fetch `renewal_quarter` field
- Component handles normalization of quarter values (Q1, q1, 1 → Q1)

---

## [2025-12-04] - Feature: Reason Column in SalesRepDetailDialog (Review Page)

### Overview
Added "Reason" column to the SalesRepDetailDialog used in the Comprehensive Review page to show why accounts were assigned.

### Changes
- Added "Reason" column to the Account Portfolio table
- Fetches assignment rationale from assignments table
- Shows reason for both parent and child accounts

---

## [2025-12-04] - Fix: Geo-Alignment Calculation in Comprehensive Review

### Overview
Fixed the geo-alignment percentage calculation which was showing 0% incorrectly.

### Changes
- Changed from comparing `sales_territory` (e.g., "AUSTIN - HOUSTON") to using `geo` field (e.g., "South East")
- The `geo` field matches the rep's `region` field naming convention
- Added flexible matching: exact match, or either contains the other (case-insensitive)

---

## [2025-12-04] - Feature: Accounts Leaving View for SLM/FLM

### Overview
Added a dedicated "Accounts Leaving" view so SLMs and FLMs can clearly see which accounts are being reassigned OUT of their team's books.

### Changes
- **New Component**: `AccountsLeavingView.tsx` - Shows accounts leaving with grouping by rep
- **FLMDetailDialog**: Added "Accounts Leaving" tab (3rd tab alongside Reps and Accounts)
- **ManagerHierarchyView**: Added "Accounts Leaving Your Team" section below the hierarchy view

### Features
- Summary cards showing: Total accounts leaving, ARR leaving, Reps affected
- Grouped by rep losing the account with collapsible sections
- Shows previous owner, destination (new owner), account type, location, tier, and ARR impact
- Search/filter functionality
- CSV export capability (includes previous owner)
- Only shows accounts going OUTSIDE the manager's hierarchy (not internal transfers)

---

## [2025-12-04] - Feature: Show Assignment Reason in Balancing & Review Views

### Overview
Added "Reason" column to show why accounts were assigned/reassigned in both the Balancing Dashboard (via SalesRepDetailModal) and ComprehensiveReview (All Account Moves tab).

### Changes
- **SalesRepDetailModal**: Added "Reason" column showing assignment rationale from assignments table
- **SalesRepDetailModal**: Child accounts now also show assignment rationale
- **ComprehensiveReview - All Account Moves**: Added "Reason" column with assignment rationale
- Data is fetched by joining with the `assignments` table to get `rationale` field
- Reason is shown as truncated text with full text on hover (title attribute)
- Fixed column layout: Reason column has min-width, Actions column has fixed width to prevent overlap

---

## [2025-12-04] - Feature: Manager Status Tab in Review & Notes

### Overview
Added a new "Manager Status" tab to the Review & Notes page so RevOps can see which managers have reviewed and accepted their assignments.

### Changes
- Added new tab showing all manager reviews for the selected build
- Displays manager name, level (FLM/SLM), status (Pending/In Review/Accepted), sent date, and reviewed date
- RevOps can now track manager acceptance without needing access to the Manager Dashboard

---

## [2025-12-04] - Fix: Separate ARR and Net ARR Display

### Overview
Changed "ARR / Net ARR" column to show ARR clearly, with Net ARR as a sub-field for prospects only.

### Changes
- Header changed from "ARR / Net ARR" to just "ARR"
- For prospects with $0 ARR, shows "$0" in muted text
- Net ARR from opportunities now shows as a smaller sub-line labeled "Net: $X"
- Updated across all dialogs: SalesRepDetailDialog, FLMDetailDialog, BookImpactSummary, UnassignedAccountsModal, ManagerHierarchyView, SalesRepDetailModal

---

## [2025-12-04] - Fix: Remove Territory Status Warning from Balancing Dashboard

### Overview
Removed the "Territory Status: Unbalanced" warning banner from the Balancing Dashboard.

### Changes
- Removed the red alert banner showing territory rebalancing status
- Cleaned up unused `shouldShowWarning()` function

---

## [2025-12-04] - Fix: Demote Manager Field from High Priority in Rep Import

### Overview
The `manager` field on sales reps was incorrectly marked as "high priority" in the import UI, even though it's a legacy field that's never been mapped or used.

### Changes
- Changed `manager` field from `priority: 'high'` to `priority: 'secondary'`
- Updated description to indicate it's a legacy field (use FLM/SLM instead)
- Field will no longer appear in the "important fields" section during rep import

---

## [2025-12-04] - Feature: Net ARR Column Sorting for Prospects

### Overview
Added sorting capability to the Net ARR column in the Prospects table.

### Changes
- Net ARR column header is now clickable with sort indicator
- Sorting calculates Net ARR from linked opportunities in real-time
- Supports ascending and descending order

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
