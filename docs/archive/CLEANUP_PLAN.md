# Codebase Cleanup Plan

This document tracks deprecated code and cleanup tasks for multiple agents to review before deletion.

---

## Confirmed Dead Code
*(Delete when confirmed by 2+ agents)*

| File | Status | Notes |
|------|--------|-------|
| `utils/dynamicScoringEngine.ts` | ✅ DELETED | Zero imports, confirmed v1.0 code |
| `utils/parentChildValidation.ts` | ✅ DELETED | Zero imports, confirmed v1.0 code |
| `src/core/` folder | ✅ DELETED | Duplicate of `_domain/` |
| `components/SophisticatedAssignmentControls.tsx` | ✅ DELETED | 336 lines, zero imports |
| `components/SophisticatedAssignmentRulesBuilder.tsx` | ✅ DELETED | 89 lines, zero imports |
| `components/AssignmentConfigurationUI.tsx` | ✅ DELETED | 586 lines, zero imports |
| `components/SimpleAssignmentConfiguration.tsx` | ✅ DELETED | 264 lines, zero imports |
| `components/AdvancedRuleBuilder.tsx` | ✅ DELETED | 881 lines, circular dead with ruleValidator |
| `utils/ruleValidator.ts` | ✅ DELETED | 293 lines, circular dead with AdvancedRuleBuilder |
| `components/ConditionalModifierBuilder.tsx` | ✅ DELETED | 156 lines, zero imports |
| `components/RuleFieldMapper.tsx` | ✅ DELETED | 539 lines, zero imports |
| `components/AIRuleGenerator.tsx` | ✅ DELETED | 191 lines, zero imports |
| `components/AIBatchProgress.tsx` | ✅ DELETED | 109 lines, zero imports |
| `components/DataRecovery.tsx` | ✅ DELETED | 224 lines, circular dead with DataRecoveryFix |
| `components/DataRecoveryFix.tsx` | ✅ DELETED | 215 lines, circular dead with DataRecovery |

---

## Suspected Dead Code
*(Needs verification before deletion)*

| File | Suspicion Level | Last Import Check | Notes |
|------|-----------------|-------------------|-------|
| `services/assignmentService.ts` | ✅ VERIFIED LIVE | 2024-12-14 | Used by useAssignmentEngine, AssignmentEngine, AssignmentPreviewDialog |
| `services/enhancedAssignmentService.ts` | ✅ VERIFIED LIVE | 2024-12-14 | Used by useEnhancedBalancing, useAssignmentEngine, AssignmentGenerationDialog |
| `services/rebalancingAssignmentService.ts` | ✅ VERIFIED LIVE | 2024-12-14 | Used by useAssignmentEngine, RebalancingAssignmentButton |
| `services/priorityExecutor.ts` | ✅ VERIFIED LIVE | 2024-12-14 | Used by parentalAlignmentService, commercialPriorityHandlers |
| `services/commercialPriorityHandlers.ts` | ✅ VERIFIED LIVE | 2024-12-14 | Used by priorityExecutor |

**All suspected files verified as LIVE - no deletions needed.**

---

## DO NOT DELETE

| File | Reason |
|------|--------|
| `services/simplifiedAssignmentEngine.ts` | **ACTIVE** - Main UI assignment engine |
| `services/optimization/` folder | **FUTURE** - LP solver using HiGHS |
| `config/priorityRegistry.ts` | Used for UI config displays |
| `utils/debugRecalculation.ts` | Runtime debugging tool (renamed from testAccountCalculations) |

---

## Files with Divergent Logic (Fixed)

These files had inline business logic that differed from `@/_domain`. They have been fixed to import from `@/_domain`:

| File | Issue | Status |
|------|-------|--------|
| `utils/bookImpactCalculations.ts` | Wrong ARR priority | ✅ Fixed - uses getAccountARR() |
| `utils/enhancedRepMetrics.ts` | Inline ARR calculation | ✅ Fixed - uses getAccountARR() |
| `utils/salesRepCalculations.ts` | Missing hierarchy_bookings_arr | ✅ Fixed - uses getAccountARR() |
| `components/FLMDetailDialog.tsx` | Inline ARR calculations | ✅ Fixed - uses getAccountARR() |
| `components/SalesRepDetailModal.tsx` | Inline ARR calculations | ✅ Fixed - uses getAccountARR() |
| `components/AccountDetailDialog.tsx` | Wrong ARR priority | ✅ Fixed - uses getAccountARR() |
| `services/simplifiedAssignmentEngine.ts` | Duplicate getEffectiveARR | ✅ Fixed - imports from @/_domain |
| `services/optimization/optimizationSolver.ts` | Duplicate classifyAccountTeamTier | ✅ Fixed - imports from @/_domain |
| `services/optimization/preprocessing/dataLoader.ts` | Duplicate getAccountARR | ✅ Fixed - imports from @/_domain |
| `services/optimization/scoring/teamAlignmentScore.ts` | Duplicate classifyAccountTier | ✅ Fixed - imports from @/_domain |
| `services/buildDataService.ts` | Duplicate tier classifier + inline ARR | ✅ Fixed - imports from @/_domain |
| `hooks/useEnhancedBalancing.ts` | Inline ARR calculations | ✅ Fixed - uses getAccountARR() |

---

## Remaining Inline Logic (Intentional - Do Not Refactor)

These patterns are **intentionally different** from `getAccountARR()` and should NOT be refactored:

| Pattern | Location | Reason |
|---------|----------|--------|
| `(hierarchy_bookings_arr_converted \|\| 0) > 0` | buildDataService, enhancedRepMetrics | Customer classification uses ONLY hierarchy_bookings (safer, prevents false positives) |

**Design Decision (2024-12-14)**: Customer classification checks ONLY `hierarchy_bookings_arr_converted > 0`, not the full ARR priority chain. This prevents accounts with only `calculated_arr` from being incorrectly classified as customers.

---

## Notes for Agents

1. **Before deleting any file**, verify it has zero imports AND the imports aren't dynamically loaded
2. **Before changing business logic**, check MASTER_LOGIC.mdc for the source of truth
3. **After changes**, run `npm run build` to verify no broken imports
4. **Update this document** when you confirm or delete code

---

*Last updated: December 14, 2025 (Phase 4: Dead code cleanup - 3,883 lines removed)*




