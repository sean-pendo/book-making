# Core Business Logic (`_domain/`)

> **⚠️ READ THIS BEFORE MODIFYING ANY BUSINESS LOGIC**

This folder is the **single source of truth** for all business rules in Book Builder.

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

1. **Read `MASTER_LOGIC.mdc` first** - Understand the current rules
2. **Update `MASTER_LOGIC.mdc`** - Document the change
3. **Update the `.ts` file** - Implement the change
4. **Search for inline logic** - Find and update any hardcoded duplicates elsewhere

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

