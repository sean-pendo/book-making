# Solver Architecture Plan

> **Status**: DRAFT - Awaiting Review  
> **Author**: AI Assistant  
> **Date**: 2024-12-16  
> **Purpose**: Wisely architect the Cloud Run HiGHS solver integration

---

## 1. Problem Statement

### Current State
- **Browser HiGHS (WASM)**: Crashes at ~20K variables (`RuntimeError: Aborted()`)
- **Supabase Edge Functions**: Hard 256MB memory limit - cannot be increased on any plan
- **GLPK fallback**: Works but slow, times out on large problems

### Your Production Workload
| Solve Type | Accounts | Reps | Variables | Current Status |
|------------|----------|------|-----------|----------------|
| Customer | 432 | 48 | ~21K | ❌ HiGHS crashes |
| Prospect | 7,619 | 48 | ~366K | ❌ Both crash |

### Goal
Run HiGHS natively (not WASM) for reliable solving at any scale, while:
- Staying in free tier where possible
- Maintaining graceful fallbacks
- Following SSOT principles
- Keeping the system debuggable

---

## 2. Architecture Options Considered

| Option | Cost | Latency | Reliability | Complexity |
|--------|------|---------|-------------|------------|
| **Cloud Run** | Free* | ~30-60s | High | Medium |
| NEOS Server | Free | ~60-180s | Medium | Low |
| Railway | $5/mo | ~30-60s | High | Medium |
| Chunked client-side | Free | ~60-120s | Medium | High |

*Free within typical usage (~20 solves/day)

**Recommendation**: **Cloud Run** - best balance of cost, speed, and reliability.

---

## 3. Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser Client                            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   highsWrapper.ts                            ││
│  │  ┌──────────────────────────────────────────────────────┐   ││
│  │  │              Solver Strategy Layer                    │   ││
│  │  │                                                       │   ││
│  │  │  1. Check problem size                                │   ││
│  │  │     ├─ Small (<5K vars): Try Browser HiGHS first     │   ││
│  │  │     └─ Large (≥5K vars): Go directly to Cloud Run    │   ││
│  │  │                                                       │   ││
│  │  │  2. Fallback chain:                                   │   ││
│  │  │     Browser HiGHS → Cloud Run → GLPK → Waterfall     │   ││
│  │  └──────────────────────────────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS POST /solve
                              │ (LP string in body)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Google Cloud Run                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              highs-solver-service                            ││
│  │                                                              ││
│  │  • Node.js + Express                                        ││
│  │  • Native HiGHS binary (apt install highs)                  ││
│  │  • Stateless - fresh context per request                    ││
│  │  • Auto-scales 0-3 instances                                ││
│  │  • 4GB RAM, 2 vCPU per instance                            ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Solver Fallback Strategy

### 4.1 Decision Tree

```
Problem arrives (N variables, M constraints)
│
├─ N < 5,000 (small problem)
│   │
│   ├─ Try Browser HiGHS (fast, no network)
│   │   ├─ Success → Return solution
│   │   └─ Fail → Go to Cloud Run
│   │
│   └─ Cloud Run
│       ├─ Success → Return solution
│       └─ Fail → Go to GLPK
│
├─ N ≥ 5,000 AND N < 50,000 (medium problem)
│   │
│   └─ Cloud Run (skip browser HiGHS - known to fail)
│       ├─ Success → Return solution
│       └─ Fail → Go to GLPK
│
├─ N ≥ 50,000 (large problem)
│   │
│   └─ Cloud Run with extended timeout
│       ├─ Success → Return solution
│       └─ Fail → Waterfall mode (no GLPK - too slow)
│
└─ Cloud Run unavailable (network error, 503, etc.)
    │
    └─ GLPK with 120s timeout
        ├─ Success → Return solution (with warning)
        └─ Fail → Waterfall mode
```

### 4.2 Thresholds (configurable in `_domain/constants.ts`)

```typescript
export const SOLVER_THRESHOLDS = {
  // When to skip browser HiGHS and go directly to Cloud Run
  BROWSER_HIGHS_MAX_VARS: 5_000,
  
  // When to skip GLPK fallback (too slow for large problems)
  GLPK_MAX_VARS: 50_000,
  
  // Timeout settings (seconds)
  BROWSER_HIGHS_TIMEOUT: 30,
  CLOUD_RUN_TIMEOUT: 120,
  CLOUD_RUN_LARGE_TIMEOUT: 300,  // For 50K+ vars
  GLPK_TIMEOUT: 120,
  
  // Retry settings
  CLOUD_RUN_MAX_RETRIES: 2,
  CLOUD_RUN_RETRY_DELAY_MS: 1000,
} as const;
```

### 4.3 User Feedback During Solve

| Stage | Message |
|-------|---------|
| Starting | "Optimizing assignments..." |
| Browser HiGHS | "Running local solver..." |
| Cloud Run | "Running cloud solver (large problem)..." |
| GLPK fallback | "Falling back to alternate solver..." |
| Waterfall | "Using priority-based assignment (solver unavailable)..." |
| Success | "Optimization complete in {N}s" |
| Partial | "Optimization complete (solver hit time limit)" |

---

## 5. Cloud Run Service Design

### 5.1 API Contract

```typescript
// Request
POST /solve
Content-Type: text/plain
Body: <LP string in CPLEX format>

// Response (success)
{
  "status": "Optimal" | "Time limit" | "Infeasible",
  "objectiveValue": number,
  "columns": {
    "x0_5": { "Primal": 1.0 },
    "x1_3": { "Primal": 1.0 },
    // ... only non-zero values
  },
  "solveTimeMs": number,
  "timestamp": string
}

// Response (error)
{
  "status": "error",
  "error": string,
  "solveTimeMs": number
}
```

### 5.2 Service Configuration

```yaml
# Cloud Run settings
memory: 4Gi          # Enough for 500K+ vars
cpu: 2               # Parallel presolve benefits
timeout: 300s        # 5 min max
max-instances: 3     # Cost control
min-instances: 0     # Scale to zero when idle
concurrency: 1       # One solve per instance (memory-intensive)
```

### 5.3 Health Check

```
GET /health
Response: { "status": "healthy", "solver": "native-highs" }
```

Cloud Run uses this for readiness probes.

---

## 6. Security Plan

### 6.1 Authentication Options

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **No auth (public)** | Simple, no key management | Anyone can call | ✅ For POC |
| API key in header | Simple, revocable | Key in client code | For production |
| Supabase JWT | Reuses existing auth | More complex | Future option |
| Cloud Run IAM | Google-native | Requires GCP client | Overkill |

**POC Plan**: Start with public endpoint, add API key before production.

### 6.2 Rate Limiting

Implement in Cloud Run service:

```javascript
const rateLimit = {
  windowMs: 60_000,      // 1 minute
  maxRequests: 30,       // 30 requests per minute
  message: 'Too many requests, please wait'
};
```

### 6.3 CORS Configuration

```javascript
app.use(cors({
  origin: [
    'https://book-ops-workbench-eosin.vercel.app',  // Production
    'http://localhost:8080',                         // Dev
    'http://localhost:5173'                          // Vite dev
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'X-API-Key']
}));
```

### 6.4 Input Validation

```javascript
// In Cloud Run service
const MAX_LP_SIZE_MB = 50;
const MAX_SOLVE_TIME_SEC = 300;

if (lpString.length > MAX_LP_SIZE_MB * 1024 * 1024) {
  return res.status(413).json({ error: 'LP too large' });
}
```

---

## 7. Cost Controls

### 7.1 Estimated Monthly Cost

| Usage | vCPU-sec | GB-sec | Cost |
|-------|----------|--------|------|
| 20 solves/day × 60s × 2 vCPU | 72,000 | 144,000 | **$0** (free tier) |
| 50 solves/day × 60s × 2 vCPU | 180,000 | 360,000 | **$0** (at limit) |
| 100 solves/day × 60s × 2 vCPU | 360,000 | 720,000 | **~$5** |

### 7.2 Budget Alerts

Set in GCP Console:
1. **$1 alert**: Early warning
2. **$5 hard limit**: Auto-shutdown if exceeded

### 7.3 Client-Side Cost Protection

```typescript
// In highsWrapper.ts - prevent runaway usage
const DAILY_CLOUD_RUN_LIMIT = 50;
let dailyCloudRunCalls = 0;
const lastResetDate = new Date().toDateString();

function canUseCloudRun(): boolean {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    dailyCloudRunCalls = 0;
  }
  return dailyCloudRunCalls < DAILY_CLOUD_RUN_LIMIT;
}
```

---

## 8. Monitoring & Observability

### 8.1 Logging Strategy

**Cloud Run logs** (automatic via console.log):
```
[{requestId}] Received LP: 2203KB, 33120 lines
[{requestId}] Binary variables: ~22224
[{requestId}] Running: highs problem.lp --mip_rel_gap 0.01
[{requestId}] HiGHS exited with code 0
[{requestId}] Completed in 45230ms, status: Optimal
```

**Client-side logs** (browser console):
```
[Solver] Problem: 22224 vars, 733 constraints
[Solver] Strategy: Cloud Run (large problem)
[CloudRun] Sending LP to solver...
[CloudRun] Solved in 45230ms, status: Optimal
[Solver] Total time: 46.1s (including network)
```

### 8.2 Metrics to Track

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| Solve success rate | Cloud Run logs | < 95% |
| Average solve time | Cloud Run logs | > 120s |
| Cloud Run errors | GCP Monitoring | > 5/hour |
| Daily API calls | Client counter | > 100 |
| Memory usage | GCP Monitoring | > 3.5GB |

### 8.3 Error Reporting

Errors flow to existing Slack notification:
```typescript
// In highsWrapper.ts
if (cloudRunError) {
  console.error('[CloudRun] Solver error:', error);
  // Existing error handler sends to Slack
}
```

---

## 9. Integration with Existing Code

### 9.1 Files to Modify

| File | Changes |
|------|---------|
| `_domain/constants.ts` | Add `SOLVER_THRESHOLDS`, `CLOUD_RUN_URL` |
| `_domain/MASTER_LOGIC.mdc` | Document Cloud Run architecture (§11.11) |
| `highsWrapper.ts` | Add `solveWithCloudRun()`, update fallback logic |
| `pureOptimizationEngine.ts` | Remove scale guard (Cloud Run handles large problems) |

### 9.2 New Constants (SSOT)

```typescript
// _domain/constants.ts

export const SOLVER_CONFIG = {
  // Cloud Run endpoint (set after deployment)
  CLOUD_RUN_URL: process.env.VITE_CLOUD_RUN_SOLVER_URL || '',
  
  // Thresholds
  BROWSER_HIGHS_MAX_VARS: 5_000,
  GLPK_MAX_VARS: 50_000,
  
  // Timeouts (seconds)
  BROWSER_TIMEOUT: 30,
  CLOUD_RUN_TIMEOUT: 120,
  CLOUD_RUN_LARGE_TIMEOUT: 300,
  GLPK_TIMEOUT: 120,
  
  // Retry
  MAX_RETRIES: 2,
  RETRY_DELAY_MS: 1000,
} as const;
```

### 9.3 Environment Variables

```bash
# .env.local (development)
VITE_CLOUD_RUN_SOLVER_URL=http://localhost:8080

# Vercel (production)
VITE_CLOUD_RUN_SOLVER_URL=https://highs-solver-xxx.run.app
```

---

## 10. Deployment Plan

### Phase 1: POC (Personal GCP Account)
1. Create GCP project `highs-solver-poc`
2. Deploy Cloud Run service (public, no auth)
3. Test with production-sized LP
4. Verify free tier usage

### Phase 2: Integration
1. Add `SOLVER_CONFIG` to `_domain/constants.ts`
2. Implement `solveWithCloudRun()` in `highsWrapper.ts`
3. Update fallback logic
4. Test end-to-end in dev

### Phase 3: Production
1. Add API key authentication
2. Set up budget alerts
3. Deploy to Vercel with env var
4. Monitor for 1 week

### Phase 4: Hardening (if needed)
1. Move to company GCP account
2. Add Supabase JWT auth
3. Set up proper monitoring dashboard
4. Document runbook

---

## 11. Rollback Plan

### If Cloud Run fails in production:

1. **Immediate**: Set `CLOUD_RUN_URL = ''` in Vercel env vars
   - Redeploy takes ~60s
   - Falls back to GLPK → Waterfall

2. **Temporary**: Lower `BROWSER_HIGHS_MAX_VARS` to force more GLPK usage

3. **Debug**: Check Cloud Run logs in GCP Console

### If costs exceed budget:

1. GCP auto-shuts down at hard limit
2. App falls back to GLPK → Waterfall automatically
3. No user-facing outage

---

## 12. Open Questions

1. **GCP Account**: Use personal for POC, or get company account now?
2. **API Key**: Generate random key, or use Supabase service role?
3. **Monitoring**: Use GCP native, or integrate with existing Slack alerts?
4. **Multi-region**: Deploy to us-central1 only, or add eu-west1?

---

## 13. Next Steps

- [ ] Review and approve this plan
- [ ] Decide on open questions
- [ ] Set up GCP project
- [ ] Deploy Cloud Run service
- [ ] Integrate with app
- [ ] Test with production data
- [ ] Document in MASTER_LOGIC.mdc

---

## Appendix: File Structure

```
cloud-run-solver/
├── Dockerfile           # Ubuntu + native HiGHS
├── server-native.js     # Express server
├── package-native.json  # Dependencies
├── README.md            # Deployment instructions
└── test-*.js            # Local tests

book-ops-workbench/src/
├── _domain/
│   ├── constants.ts     # + SOLVER_CONFIG
│   └── MASTER_LOGIC.mdc # + §11.11 Cloud Run
└── services/optimization/solver/
    └── highsWrapper.ts  # + solveWithCloudRun()
```





