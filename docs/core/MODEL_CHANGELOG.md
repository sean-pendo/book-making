# Optimization Model Changelog

Track all changes to the LP/Waterfall optimization model.
Use this to correlate `optimization_runs.model_version` with specific changes.

---

## v1.0.1 (2025-12-17)

**Type:** Patch - Penalty Value Change

### Changes

- Increased LP_PENALTY values by 10x:
  - ALPHA: 0.001 → 0.01
  - BETA: 0.01 → 0.1
  - BIG_M: 0.1 → 1.0

### Rationale

Previous penalties were too weak to enforce balance limits. At VERY_HEAVY intensity, reps still exceeded the $4M ARR max ceiling because BigM penalty (0.5) was still competitive with fit scores (~0.9).

### Expected Impact

- Stronger enforcement of min/max balance limits
- May reduce continuity rate slightly at high intensity
- Better ARR distribution across team

### Baseline Comparison

v1.0.0 (VERY_HEAVY, customer):
- ARR Variance: 43.7%
- Continuity Rate: 90.4%
- Exact Geo Match: 77.3%

### Telemetry Query

```sql
SELECT model_version, 
       AVG(arr_variance_percent) as avg_arr_cv,
       AVG(continuity_rate) as avg_continuity
FROM optimization_runs
WHERE assignment_type = 'customer'
GROUP BY model_version;
```

---

## v1.0.0 (2025-12-17)

**Type:** Initial Release

### Features

- Three-tier penalty system (Alpha/Beta/BigM)
- Balance intensity presets (Very Light to Very Heavy)
- Continuity, Geography, Team Alignment scoring
- HiGHS WASM + Cloud Run solver routing
- Optimization telemetry integration


