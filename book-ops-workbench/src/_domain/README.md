# Core Business Logic (`_domain/`)

> **⚠️ READ THIS BEFORE MODIFYING ANY BUSINESS LOGIC**

This folder is the **single source of truth** for all business rules in Book Builder.

**Why SSOT matters:** Before this folder existed, the same business logic was duplicated in 50+ places. When definitions diverged, bugs appeared (dashboard showed $2M, export showed $1.8M). Now there's ONE definition that everything imports.

---

## What's In This Folder

| File | Purpose |
|------|---------|
| `MASTER_LOGIC.mdc` | Human-readable documentation of ALL business rules |
| `CLEANUP_PLAN.md` | Tracks deprecated code for deletion |
| `calculations.ts` | ARR, ATR, Pipeline calculation functions |
| `tiers.ts` | Team tier classification (SMB/Growth/MM/ENT) |
| `geography.ts` | Region hierarchy, territory mapping, geo scoring |
| `constants.ts` | Thresholds, default values, magic numbers |
| `normalization.ts` | Typo handling for imported data |
| `index.ts` | Re-exports everything for easy importing |

---

## Cross-Reference System

Code and documentation are linked bidirectionally so you can trace any rule:

### Code → Doc (in TypeScript files)

Every exported function/constant must have a `@see` tag pointing to its doc section:

```typescript
/**
 * Calculates the effective ARR for an account.
 * @see MASTER_LOGIC.mdc §2.1
 */
export function getAccountARR(account: AccountData): number { ... }
```

**Format**: `@see MASTER_LOGIC.mdc §X.X` where X.X is the section number.

### Doc → Code (in MASTER_LOGIC.mdc)

Every section that has an implementation must include an **Impl** line:

```markdown
### 2.1 ARR Priority Order

**Impl**: `getAccountARR()` in calculations.ts

The priority order is:
1. hierarchy_bookings_arr_converted
2. calculated_arr
3. arr
4. 0 (fallback)
```

### Quick Reference Map

| Doc Section | Implementation | File |
|-------------|----------------|------|
| §2.1 ARR Priority | `getAccountARR()` | calculations.ts |
| §2.2 ATR Calculation | `getAccountATR()` | calculations.ts |
| §2.3 Pipeline | `calculatePipeline()` | calculations.ts |
| §5.1 Team Tier | `classifyTeamTier()` | tiers.ts |
| §5.2 Expansion Tier | `getExpansionTier()` | tiers.ts |
| §4 Geography | `calculateGeoMatchScore()` | geography.ts |
| §6 Normalization | `normalizeRegion()`, `normalizePEFirm()` | normalization.ts |

### Why This Matters

- **Verifying parity**: You can check any doc claim by finding its `@see` reference in code
- **Finding docs**: When reading code, the `@see` tag tells you where to learn more
- **Avoiding drift**: If code changes, the `@see` tag reminds you to update docs

---

## Standardized Consolidation Technique

**Pattern**: `_domain/` contains DEFINITIONS. Other folders contain CONSUMERS.

| Folder | Role | Consolidation Rule |
|--------|------|-------------------|
| `_domain/` | **Definitions** - Source of truth | Add new business logic here |
| `utils/` | **Consumers** - Helper functions | Import from `@/_domain`, don't move files |
| `components/` | **Consumers** - UI components | Import from `@/_domain`, don't move files |
| `services/` | **Consumers** - Business services | Import from `@/_domain`, don't move files |
| `hooks/` | **Consumers** - React hooks | Import from `@/_domain`, don't move files |

**Key Principle**: Don't MOVE files between folders. Instead, REFACTOR them to import from `@/_domain`.

---

## How to Use

**Always import from `@/_domain`**, never write inline business logic:

```typescript
// ✅ CORRECT
import { getAccountARR, classifyTeamTier, TIER_THRESHOLDS } from '@/_domain';

const arr = getAccountARR(account);
const tier = classifyTeamTier(account.employees);

// ❌ WRONG - Don't write inline logic!
const arr = account.calculated_arr || account.arr || 0;
const tier = employees < 100 ? 'SMB' : employees < 500 ? 'Growth' : 'MM';
```

---

## Rules for Modifying

### Adding New Business Logic

1. **Read `MASTER_LOGIC.mdc` first** - Understand the current rules
2. **Add to appropriate `.ts` file** - Put the implementation here
3. **Export from `index.ts`** - Make it available via `@/_domain`
4. **Update `MASTER_LOGIC.mdc`** - Document the rule in the right section
5. **Search for inline logic** - Find and refactor any hardcoded duplicates

### When You Find a Discrepancy

If code elsewhere differs from `_domain/`:

1. **STOP** - Don't silently change it
2. **Ask the user**: "I found `X` in this file, but `MASTER_LOGIC.mdc` says `Y`. Which is correct?"
3. **Possible outcomes**:
   - Bug → Fix the code to match `_domain/`
   - Intentional exception → Document it in CLEANUP_PLAN.md
   - Outdated docs → Update MASTER_LOGIC.mdc

### Intentional Exceptions

Some inline logic is intentionally different (documented in `CLEANUP_PLAN.md`):

| Exception | Reason |
|-----------|--------|
| `buildDataService.ts` uses only `hierarchy_bookings_arr_converted > 0` for customer classification | Prevents false positives from child account `calculated_arr` |

---

## Why This Exists

Before this folder existed, the same business logic was defined in 50+ places across the codebase. When definitions diverged, bugs appeared:
- Dashboard showed $2M ARR, export showed $1.8M
- Some files used `calculated_arr` first, others used `hierarchy_bookings_arr` first
- AI assistants made wrong assumptions about ATR meaning "At Risk" instead of "Available To Renew"

This folder prevents those issues by having ONE definition that everything imports.

---

## For AI Assistants

If you're an AI reading this:
1. **Always read `MASTER_LOGIC.mdc`** before touching any calculation logic
2. **Always import from `@/_domain`** when you need business logic functions
3. **Never create new inline calculations** - add to this module instead
4. **If you find conflicting logic elsewhere**, ask the user which is correct
5. **Don't MOVE files** - refactor them to IMPORT from `@/_domain` instead

