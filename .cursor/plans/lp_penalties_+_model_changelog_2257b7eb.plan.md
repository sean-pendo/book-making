---
name: LP Penalties + Model Changelog
overview: Increase LP penalty values by 100x to enforce balance limits, and introduce a dedicated Model Changelog to track optimization model changes with version history, making it easy to correlate telemetry data with specific model versions.
todos:
  - id: create-model-changelog
    content: Create MODEL_CHANGELOG.md with v1.0.0 and v1.0.1 entries
    status: pending
  - id: update-master-logic-penalties
    content: Update MASTER_LOGIC.mdc §11.3 with new penalty values
    status: pending
  - id: update-master-logic-changelog-ref
    content: Add §14.3 Model Changelog reference to MASTER_LOGIC.mdc
    status: pending
  - id: update-constants
    content: Change LP_PENALTY values in constants.ts (100x increase)
    status: pending
  - id: bump-version
    content: Bump OPTIMIZATION_MODEL_VERSION to 1.0.1
    status: pending
  - id: update-app-changelog
    content: Add entry to CHANGELOG.md for penalty increase
    status: pending
---

# Increase LP Penalties + Model Changelog System

## Part 1: Penalty Increase

### Problem

Current penalty values in [`constants.ts`](book-ops-workbench/src/_domain/constants.ts) are too weak:

| Zone | Current | At VERY_HEAVY | vs Fit Score (~0.9) |
|------|---------|---------------|---------------------|
| ALPHA | 0.001 | 0.005 | 180x weaker |
| BETA | 0.01 | 0.05 | 18x weaker |
| BIG_M | 0.1 | 0.5 | Still weaker |

### Solution

Increase by **100x** (preserving 1:10:100 ratio):

```typescript
export const LP_PENALTY = {
  ALPHA: 0.1,   // was 0.001
  BETA: 1.0,    // was 0.01
  BIG_M: 10.0,  // was 0.1
} as const;
```

---

## Part 2: Model Changelog System

### Purpose

Create a dedicated changelog for the optimization model that:
- Tracks all model version changes with dates and descriptions
- Documents what changed (penalties, scoring, constraints)
- Links to telemetry for before/after comparison
- Serves as a reference for the AI agent learning from historical runs

### New File: `src/_domain/MODEL_CHANGELOG.md`

Structure:

```markdown
# Optimization Model Changelog

Track all changes to the LP/Waterfall optimization model.
Use this to correlate `optimization_runs.model_version` with specific changes.

## Version History

### v1.0.1 (2025-12-17)
**Type**: Patch - Penalty Value Change

**Changes**:
- Increased LP_PENALTY values by 100x
  - ALPHA: 0.001 -> 0.1
  - BETA: 0.01 -> 1.0  
  - BIG_M: 0.1 -> 10.0

**Rationale**: 
Previous penalties were too weak to enforce balance limits.
At VERY_HEAVY intensity, reps still exceeded max ceiling.

**Expected Impact**:
- Stronger enforcement of min/max balance limits
- May reduce continuity rate slightly at high intensity
- Better ARR distribution across team

**Telemetry Query**:
```sql
SELECT model_version, AVG(arr_variance_percent), AVG(continuity_rate)
FROM optimization_runs
WHERE model_version IN ('1.0.0', '1.0.1')
GROUP BY model_version;
```

---

### v1.0.0 (2025-12-17)
**Type**: Initial Release

**Features**:
- Three-tier penalty system (Alpha/Beta/BigM)
- Balance intensity presets (Very Light to Very Heavy)
- Continuity, Geography, Team Alignment scoring
- HiGHS WASM + Cloud Run solver routing
```

### Update MASTER_LOGIC.mdc

Add reference to MODEL_CHANGELOG.md in Section 14 (Optimization Telemetry):

```markdown
### 14.3 Model Changelog

All optimization model changes are documented in `src/_domain/MODEL_CHANGELOG.md`.

When bumping `OPTIMIZATION_MODEL_VERSION`:
1. Add entry to MODEL_CHANGELOG.md with date, type, changes, rationale
2. Include SQL query for comparing before/after telemetry
3. Update version in constants.ts
```

---

## Files Changed

| File | Change |
|------|--------|
| [`src/_domain/MASTER_LOGIC.mdc`](book-ops-workbench/src/_domain/MASTER_LOGIC.mdc) | Update §11.3 penalty values, add §14.3 reference |
| [`src/_domain/constants.ts`](book-ops-workbench/src/_domain/constants.ts) | 100x penalty increase, bump to v1.0.1 |
| `src/_domain/MODEL_CHANGELOG.md` | **NEW** - Dedicated model version history |
| `CHANGELOG.md` | Add entry for penalty change |

---

## Expected Outcome

1. Balance limits become enforceable at high intensity
2. Model changes are tracked separately from app changes
3. AI agent can query MODEL_CHANGELOG to understand version differences
4. Easy correlation between telemetry runs and model versions