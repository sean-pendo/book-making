# HiGHS Native Solver Service for Cloud Run

A simple HTTP service that runs the **native HiGHS binary** (not WASM), designed for Google Cloud Run.

## Why Native HiGHS?

| Version | Max Variables | Memory | Speed |
|---------|---------------|--------|-------|
| WASM (browser/npm) | ~20K | 256MB | Slow |
| **Native (this)** | **Millions** | **Unlimited** | **Fast** |

Your problem (366K variables) **requires native HiGHS**.

## Quick Deploy to Cloud Run (Personal Account)

### Prerequisites
1. Google Cloud account (personal is fine for free tier)
2. Install [Google Cloud CLI](https://cloud.google.com/sdk/docs/install)

### One-Time Setup (5 minutes)

```bash
# 1. Login to your personal Google account
gcloud auth login

# 2. Create a new project
gcloud projects create highs-solver-poc --name="HiGHS Solver"
# Note: If this fails, pick a unique name like highs-solver-YOURNAME

# 3. Set the project
gcloud config set project highs-solver-poc

# 4. Enable billing (required even for free tier)
# Go to: https://console.cloud.google.com/billing
# Link your project to a billing account

# 5. Enable required APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com
```

### Deploy (2 minutes)

```bash
# From this directory (cloud-run-solver/)
gcloud run deploy highs-solver \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 4Gi \
  --cpu 2 \
  --timeout 300 \
  --max-instances 3
```

When prompted:
- Allow unauthenticated invocations? **Yes** (for POC)

### Get Your Service URL

```bash
gcloud run services describe highs-solver --region us-central1 --format='value(status.url)'
```

You'll get something like: `https://highs-solver-abc123-uc.a.run.app`

## Test the Service

```bash
# Health check
curl https://YOUR-URL/health

# Solve a simple problem
curl -X POST https://YOUR-URL/solve \
  -H "Content-Type: text/plain" \
  -d 'Maximize
obj: + 0.5 x1 + 0.3 x2
Subject To
c1: x1 + x2 <= 1
Binary
x1 x2
End'
```

## Cost Estimate

**You should stay in the FREE TIER with typical usage.**

Cloud Run free tier (monthly):
- 180,000 vCPU-seconds ✅
- 360,000 GB-seconds ✅
- 2 million requests ✅

Your estimated usage (20 solves/day):
- ~36,000 vCPU-sec/month (20% of free)
- ~72,000 GB-sec/month (20% of free)

**Set a budget alert just in case:**
```bash
# In Google Cloud Console → Billing → Budgets & alerts
# Set a $5 alert to be safe
```

## API Reference

### POST /solve

Solve an LP/MIP problem.

**Request:**
```
Content-Type: text/plain
Body: LP string in CPLEX format
```

**Response:**
```json
{
  "status": "Optimal",
  "objectiveValue": 1.234,
  "columns": {
    "x1": { "Primal": 1.0 },
    "x2": { "Primal": 0.0 }
  },
  "solveTimeMs": 1500
}
```

### GET /health
Returns `{ "status": "healthy" }` if service is ready.

## Integrate with Book Building App

Add to your `highsWrapper.ts`:

```typescript
const CLOUD_RUN_SOLVER_URL = 'https://YOUR-URL';  // Set this after deploy

export async function solveWithCloudRun(lpString: string): Promise<{
  status: string;
  objectiveValue: number;
  columns: Record<string, { Primal: number }>;
}> {
  console.log('[CloudRun] Sending LP to solver...');
  
  const response = await fetch(`${CLOUD_RUN_SOLVER_URL}/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: lpString
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Cloud Run solver error: ${error.error}`);
  }
  
  const result = await response.json();
  console.log(`[CloudRun] Solved in ${result.solveTimeMs}ms, status: ${result.status}`);
  
  return result;
}
```

## Cleanup (if needed)

```bash
# Delete the service
gcloud run services delete highs-solver --region us-central1

# Delete the project entirely
gcloud projects delete highs-solver-poc
```
