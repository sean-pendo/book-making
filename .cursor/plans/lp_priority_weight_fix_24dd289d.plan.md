---
name: LP Priority Weight Fix
overview: Make the LP solver derive objective weights from the user's priority configuration positions instead of using hardcoded defaults. This aligns the behavior with simplifiedAssignmentEngine and respects user customization.
todos:
  - id: add-derive-function
    content: Add deriveWeightsFromPriorityConfig() to weightNormalizer.ts
    status: pending
  - id: update-lp-builder
    content: Modify lpProblemBuilder.ts to use priority-derived weights
    status: pending
    dependencies:
      - add-derive-function
  - id: export-function
    content: Export deriveWeightsFromPriorityConfig from optimization/index.ts
    status: pending
    dependencies:
      - add-derive-function
  - id: test-weights
    content: Verify weights are correctly derived by checking console logs
    status: pending
    dependencies:
      - update-lp-builder
---

# LP Solver Priority Weight Derivation

## Problem

The LP optimization engine ignores user-configured priority positions and uses hardcoded weights (35%/35%/30% for customers, 20%/45%/35% for prospects). Priority configuration is loaded but only used for rationale labels.

**Current flow:**

```
priority_config.position → ignored
lp_objectives_customer → hardcoded 35%/35%/30% → LP solver
```

**Expected flow:**

```
priority_config.position → calculatePriorityWeight() → normalized weights → LP solver
```

## Solution

Modify [`lpProblemBuilder.ts`](book-ops-workbench/src/services/optimization/constraints/lpProblemBuilder.ts) to derive weights from `priority_config` positions using the existing `calculatePriorityWeight()` function from `@/_domain/constants`.

## Changes

### 1. Add weight derivation function to weightNormalizer.ts

Add a new function to [`weightNormalizer.ts`](book-ops-workbench/src/services/optimization/utils/weightNormalizer.ts) that converts priority positions to normalized weights:

```typescript
import { calculatePriorityWeight } from '@/_domain';
import type { PriorityConfig } from '@/config/priorityRegistry';

/**
 * Derive LP objective weights from user's priority configuration.
 * 
 * IMPORTANT: Priority positions in the registry are 0-indexed (0, 1, 2, ...),
 * but calculatePriorityWeight() expects 1-indexed positions (1 = highest priority).
 * We add 1 to convert: position 0 → weight 1.0, position 1 → weight 0.5, etc.
 * 
 * @see simplifiedAssignmentEngine.ts lines 816-829 for reference implementation
 */
export function deriveWeightsFromPriorityConfig(
  priorityConfig: PriorityConfig[]
): NormalizedWeights {
  const getPositionWeight = (id: string): number => {
    const p = priorityConfig.find(c => c.id === id && c.enabled);
    if (!p) return 0;
    // Convert 0-indexed position to 1-indexed for calculatePriorityWeight
    // Position 0 → 1.0, Position 1 → 0.5, Position 2 → 0.33, etc.
    return calculatePriorityWeight(p.position + 1);
  };
  
  // geo_and_continuity contributes 50% to both geo and continuity
  // This matches simplifiedAssignmentEngine behavior
  const geoAndCont = getPositionWeight('geo_and_continuity');
  const rawG = getPositionWeight('geography') + geoAndCont * 0.5;
  const rawC = getPositionWeight('continuity') + geoAndCont * 0.5;
  const rawT = getPositionWeight('team_alignment');
  
  const total = rawG + rawC + rawT;
  if (total === 0) {
    // Fallback to defaults if no optimization priorities enabled
    return { wC: 0.35, wG: 0.35, wT: 0.30 };
  }
  
  return {
    wG: rawG / total,
    wC: rawC / total,
    wT: rawT / total
  };
}
```

### 2. Modify lpProblemBuilder.ts to use priority-derived weights

Update [`lpProblemBuilder.ts`](book-ops-workbench/src/services/optimization/constraints/lpProblemBuilder.ts) lines 163-167:

**Before:**

```typescript
const objectivesConfig = assignmentType === 'customer' 
  ? config.lp_objectives_customer 
  : config.lp_objectives_prospect;
const weights = normalizeWeights(objectivesConfig);
```

**After:**

```typescript
// Derive weights from priority_config positions (SSOT)
// Falls back to lp_objectives if priority_config is empty
const weights = config.priority_config && config.priority_config.length > 0
  ? deriveWeightsFromPriorityConfig(config.priority_config)
  : normalizeWeights(
      assignmentType === 'customer' 
        ? config.lp_objectives_customer 
        : config.lp_objectives_prospect
    );
```

### 3. Update BuildProblemInput interface

Add `priority_config` to the input type if not already present (it flows through from `LPConfiguration`).

### 4. Add console logging for visibility

Add a log line showing derived weights:

```typescript
console.log(`[LPBuilder] Weights from priority positions: C=${weights.wC.toFixed(2)}, G=${weights.wG.toFixed(2)}, T=${weights.wT.toFixed(2)}`);
```

## Example Weight Derivation

Given COMMERCIAL mode priority config (from priorityRegistry.ts defaultPositions):

| Priority ID | 0-indexed Position | 1-indexed (pos+1) | Weight = 1/(pos+1) |

|-------------|-------------------|-------------------|-------------------|

| team_alignment | 3 | 4 | 1/4 = 0.25 |

| geo_and_continuity | 4 | 5 | 1/5 = 0.20 |

| continuity | 5 | 6 | 1/6 = 0.167 |

| geography | 6 | 7 | 1/7 = 0.143 |

Raw weights (before normalization):

- Geography: 0.143 + (0.20 x 0.5) = 0.243
- Continuity: 0.167 + (0.20 x 0.5) = 0.267
- Team: 0.25

Total: 0.76

Normalized:

- **Continuity: 35%**
- **Team: 33%**
- **Geography: 32%**

### If user moves continuity to position 2:

| Priority ID | Position | Weight |

|-------------|----------|--------|

| continuity | 2 | 1/3 = 0.33 |

| team_alignment | 3 | 1/4 = 0.25 |

| geo_and_continuity | 4 | 1/5 = 0.20 |

| geography | 6 | 1/7 = 0.14 |

Raw:

- Continuity: 0.33 + 0.10 = 0.43
- Geography: 0.14 + 0.10 = 0.24
- Team: 0.25

Normalized:

- **Continuity: 47%** (significantly increased!)
- **Team: 27%**
- **Geography: 26%**

This correctly reflects the user's intent to prioritize account continuity over geography.

## Files Modified

1. [`book-ops-workbench/src/services/optimization/utils/weightNormalizer.ts`](book-ops-workbench/src/services/optimization/utils/weightNormalizer.ts) - Add `deriveWeightsFromPriorityConfig()`
2. [`book-ops-workbench/src/services/optimization/constraints/lpProblemBuilder.ts`](book-ops-workbench/src/services/optimization/constraints/lpProblemBuilder.ts) - Use priority-derived weights
3. [`book-ops-workbench/src/services/optimization/index.ts`](book-ops-workbench/src/services/optimization/index.ts) - Export new function