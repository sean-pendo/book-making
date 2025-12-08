# Waterfall Optimization Analysis & Improvement Plan

## Executive Summary

The current "waterfall" assignment engine is a **greedy heuristic**, not a mathematical optimizer. It processes accounts sequentially, making locally optimal decisions without considering global trade-offs. This document outlines a plan to understand, measure, and improve the assignment quality.

---

## Phase 1: Deep Understanding (Current State)

### 1.1 The Current Algorithm Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    WATERFALL ASSIGNMENT FLOW                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. SORT ACCOUNTS                                               │
│     Strategic → Tier 1 → By ARR (descending)                    │
│                                                                 │
│  2. FOR EACH ACCOUNT (sequential, no backtracking):             │
│                                                                 │
│     ┌─────────────────────────────────────────────────────┐     │
│     │ Strategic Account?                                   │     │
│     │   YES → Assign to strategic rep pool (no limits)    │     │
│     │   NO  → Continue to normal waterfall                │     │
│     └─────────────────────────────────────────────────────┘     │
│                          │                                      │
│                          ▼                                      │
│     ┌─────────────────────────────────────────────────────┐     │
│     │ P1: Current owner + Same geo + Has capacity?        │     │
│     │   YES → STAY (continuity preserved)                 │     │
│     │   NO  → Continue                                    │     │
│     └─────────────────────────────────────────────────────┘     │
│                          │                                      │
│                          ▼                                      │
│     ┌─────────────────────────────────────────────────────┐     │
│     │ P2: Any rep in same geo with capacity?              │     │
│     │   YES → Pick rep with lowest balance score          │     │
│     │   NO  → Continue                                    │     │
│     └─────────────────────────────────────────────────────┘     │
│                          │                                      │
│                          ▼                                      │
│     ┌─────────────────────────────────────────────────────┐     │
│     │ P3b: Current owner (any geo) with capacity?         │     │
│     │   YES → STAY (cross-region continuity)              │     │
│     │   NO  → Continue                                    │     │
│     └─────────────────────────────────────────────────────┘     │
│                          │                                      │
│                          ▼                                      │
│     ┌─────────────────────────────────────────────────────┐     │
│     │ P4: Any rep globally with capacity?                 │     │
│     │   YES → Pick rep with lowest balance score          │     │
│     │   NO  → Continue to P5                              │     │
│     └─────────────────────────────────────────────────────┘     │
│                          │                                      │
│                          ▼                                      │
│     ┌─────────────────────────────────────────────────────┐     │
│     │ P5: FORCE - Assign to least loaded rep              │     │
│     │   (Guarantees 100% assignment)                      │     │
│     └─────────────────────────────────────────────────────┘     │
│                                                                 │
│  3. UPDATE workload tracking for assigned rep                   │
│                                                                 │
│  4. REPEAT for next account                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Balance Score Calculation

When multiple reps qualify at the same priority, the engine uses:

```typescript
balanceScore = average(
  workload.arr / targetARR,
  workload.cre / creTarget,      // if configured
  workload.atr / atrTarget,      // if configured
  workload.tier1 / tier1Target,  // if configured
  workload.tier2 / tier2Target   // if configured
)

// Lower score = more under-loaded = preferred
```

### 1.3 Key Limitations

| Issue | Impact | Example |
|-------|--------|---------|
| **Order dependence** | First accounts get optimal placement | High-ARR account takes all geo capacity, leaving smaller accounts stranded |
| **No backtracking** | Can't fix early suboptimal choices | Rep A gets 3 accounts early, can't redistribute when Rep B ends up overloaded |
| **Continuity > Balance** | Business rule trumps optimization | Rep keeps 10 accounts in their geo even if another rep is at 30% of target |
| **Simple averaging** | All metrics weighted equally | CRE risk may be more important than Tier 2 count |

---

## Phase 2: Measurement (Define "Good")

### 2.1 Proposed Quality Metrics

Create a new service to calculate these metrics **before and after** assignment:

```typescript
interface AssignmentQualityMetrics {
  // Distribution metrics (lower is better)
  arrStdDeviation: number;           // Std dev of rep ARR from mean
  arrCoeffOfVariation: number;       // CV = stdDev / mean (< 0.15 is good)
  maxArrDeviation: number;           // Worst rep's deviation from target
  
  // CRE risk distribution
  creStdDeviation: number;
  maxCrePerRep: number;
  repsOverCreLimit: number;
  
  // Business rule compliance
  continuityRate: number;            // % accounts staying with current owner
  geographyMatchRate: number;        // % accounts in home region
  strategicPoolCompliance: number;   // % strategic accounts with strategic reps
  
  // Tier distribution
  tier1StdDeviation: number;
  tier2StdDeviation: number;
  
  // Quarterly renewal balance
  quarterlyRenewalVariance: number;  // Max variance between quarters per rep
  
  // Composite score (weighted)
  overallBalanceScore: number;       // 0-100, higher is better
}
```

### 2.2 Quality Dashboard Requirements

Build a dashboard showing:
1. **Before vs After** comparison for all metrics
2. **Rep-level heatmap** showing who's over/under on each dimension
3. **Warning flags** for reps exceeding thresholds
4. **Historical tracking** across assignment runs

---

## Phase 3: Incremental Improvements

### 3.1 Quick Wins (Current Architecture)

#### A. Smarter Sorting
Instead of simple ARR sort, use multi-criteria:
```typescript
// Current
accounts.sort((a, b) => bARR - aARR);

// Improved: Sort by "assignment difficulty"
accounts.sort((a, b) => {
  const difficultyA = calculateDifficulty(a);  // geo scarcity, CRE, tier
  const difficultyB = calculateDifficulty(b);
  return difficultyB - difficultyA;  // Hard accounts first
});
```

#### B. Weighted Balance Score
```typescript
// Current: Simple average
balanceScore = (arr/target + cre/target + tier1/target) / 3;

// Improved: Business-weighted
balanceScore = 
  0.40 * (arr / targetARR) +
  0.30 * (cre / creTarget) +     // CRE risk matters more
  0.15 * (tier1 / tier1Target) +
  0.10 * (tier2 / tier2Target) +
  0.05 * (atr / atrTarget);
```

#### C. "Under-minimum First" Enhancement
Already partially implemented, but can be strengthened:
```typescript
// Priority: Fill reps below minimum BEFORE considering geography
if (repsBelowMinimum.length > 0) {
  // Relax geography constraint for these assignments
}
```

### 3.2 Medium-Term: Two-Pass Algorithm

```
PASS 1: Initial Assignment (Current Waterfall)
  - Respects all priorities
  - May leave some reps over/under

PASS 2: Rebalancing Pass
  - Identify reps > 1 stdDev from mean
  - Find "swappable" accounts (same priority level)
  - Execute beneficial swaps

SWAPPABILITY RULES:
  - Both accounts at same priority level (e.g., both P2)
  - Swap improves overall balance score
  - No constraint violations after swap
```

### 3.3 Long-Term: True Optimization

#### Option A: Constraint Satisfaction Problem (CSP)
- Model as CSP with soft constraints
- Use solver like OR-Tools or custom backtracking
- Guarantees optimal within constraint satisfaction

#### Option B: Linear Programming Relaxation
```
MINIMIZE: variance across all reps for all metrics

SUBJECT TO:
  - Each account assigned to exactly one rep
  - Capacity limits respected
  - Strategic accounts → strategic reps
  - Parent/child accounts → same rep

OBJECTIVE FUNCTION:
  sum(|repARR - targetARR|²) * w1 +
  sum(|repCRE - targetCRE|²) * w2 +
  ...
```

#### Option C: Iterative Local Search
- Start with current waterfall output
- Iteratively search for improving swaps
- Use simulated annealing to escape local optima

---

## Phase 4: Implementation Roadmap

### Sprint 1: Measurement Foundation (1-2 weeks)
- [ ] Create `AssignmentQualityService` with metrics calculation
- [ ] Add pre/post assignment metrics to generation flow
- [ ] Build basic quality dashboard component
- [ ] Log metrics to database for historical tracking

### Sprint 2: Quick Wins (1 week)
- [ ] Implement weighted balance scoring
- [ ] Add "assignment difficulty" sorting
- [ ] Strengthen under-minimum prioritization
- [ ] A/B test against current algorithm

### Sprint 3: Two-Pass Algorithm (2 weeks)
- [ ] Design swap detection logic
- [ ] Implement beneficial swap finder
- [ ] Add rebalancing pass after waterfall
- [ ] Validate with real data

### Sprint 4: Analytics & Refinement (1 week)
- [ ] Build comprehensive quality dashboard
- [ ] Add weight configuration UI
- [ ] Document optimization parameters
- [ ] Create runbook for ops team

### Future: True Optimization (TBD)
- Evaluate OR-Tools integration
- Consider serverless optimization function
- Benchmark against current approach

---

## Appendix: Key Files

| File | Purpose |
|------|---------|
| `simplifiedAssignmentEngine.ts` | Core waterfall logic |
| `balanceThresholdCalculator.ts` | Target calculation |
| `WaterfallLogicExplainer.tsx` | UI documentation |
| `EnhancedBalancingDashboard.tsx` | Current metrics display |
| `EnhancedAssignmentDebugger.tsx` | Debug tooling |

---

## Questions to Answer Before Optimization

1. **What's the acceptable variance?** Is 15% CV across reps acceptable?
2. **Continuity vs Balance trade-off?** How much imbalance is acceptable to preserve relationships?
3. **Metric weights?** Which dimensions matter most (ARR, CRE, Tiers)?
4. **Run time constraints?** How long can optimization take (seconds vs minutes)?
5. **Explainability requirements?** Must every assignment have a clear reason?

---

*Created: December 8, 2025*
*Status: Analysis Complete - Awaiting Decision on Implementation Path*
