---
name: Solver Routing Strategy
overview: ""
todos:
  - id: add-solver-mode
    content: Add SolverMode type and parameter to solveProblem() in highsWrapper.ts
    status: pending
  - id: update-routing-logic
    content: Update solveProblem() routing to use mode parameter instead of ALWAYS_USE_CLOUD_RUN
    status: pending
  - id: update-global-engine
    content: Pass 'global' mode from pureOptimizationEngine.ts
    status: pending
  - id: remove-flag
    content: Remove ALWAYS_USE_CLOUD_RUN flag from highsWrapper.ts
    status: pending
---

# Solver Routing: WASM for Waterfall, Cloud Run for Global

## Problem

Currently `ALWAYS_USE_CLOUD_RUN = true` routes ALL solver calls to Cloud Run, causing slowness/hangs for waterfall sub-priority solves due to network latency and cold starts.

## Solution

Route solver calls based on optimization mode:

- **Waterfall (sub-priority)**: Use browser WASM (fast, no network) with Cloud Run fallback on failure
- **Global optimization**: Always use Cloud Run (handles large problems reliably)

## Architecture

```mermaid
flowchart TD
    subgraph waterfallPath [Waterfall Engine]
        WF[simplifiedAssignmentEngine.ts] -->|"small LP per priority"| WASM[Browser HiGHS WASM]
        WASM -->|"on failure"| CR1[Cloud Run Fallback]
    end
    
    subgraph globalPath [Global Optimization]
        GO[pureOptimizationEngine.ts] -->|"single large LP"| CR2[Cloud Run Always]
    end
```

## Changes

### 1. Add solver mode parameter to `solveProblem()` in [highsWrapper.ts](book-ops-workbench/src/services/optimization/solver/highsWrapper.ts)

Add a new parameter to control routing:

```typescript
export type SolverMode = 'waterfall' | 'global';

export async function solveProblem(
  problem: LPProblem,
  params: LPSolverParams,
  mode: SolverMode = 'waterfall'  // Default to waterfall for backward compatibility
): Promise<SolverSolution>
```

Update the routing logic (around line 1027):

```typescript
// Global mode: Always use Cloud Run for reliability on large problems
if (mode === 'global') {
  console.log(`[Solver] Global mode: using Cloud Run native solver`);
  // ... Cloud Run logic
}

// Waterfall mode: Use WASM first, Cloud Run as fallback
// ... existing WASM -> GLPK -> Cloud Run fallback chain
```

### 2. Update [pureOptimizationEngine.ts](book-ops-workbench/src/services/optimization/pureOptimizationEngine.ts) to pass `'global'` mode

Around line 219:

```typescript
const solution = await solveProblem(problem, data.lpConfig.lp_solver_params, 'global');
```

### 3. Remove `ALWAYS_USE_CLOUD_RUN` flag

Delete lines 31-33 in `highsWrapper.ts`:

```typescript
// DELETE these lines:
// Feature flag: Always use Cloud Run (bypass WASM/GLPK entirely)
// Set to true to route ALL problems to Cloud Run native solver
const ALWAYS_USE_CLOUD_RUN = true;
```

### 4. Keep `USE_CLOUD_RUN_FOR_LARGE` as additional safety

The existing `USE_CLOUD_RUN_FOR_LARGE` flag (line 29) provides a safety net for waterfall mode if a single priority batch exceeds WASM limits.

## Result

| Mode | Primary Solver | Fallback | Use Case |

|------|---------------|----------|----------|

| Waterfall | Browser WASM | GLPK -> Cloud Run | Fast sub-priority solves |

| Global | Cloud Run | None | Large single-solve optimization |

This gives you fast waterfall execution while ensuring global optimization uses the robust Cloud Run solver.