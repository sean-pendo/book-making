/**
 * LP Solver Edge Function
 *
 * Runs HiGHS LP solver in a Deno edge function environment.
 * This provides a fresh WASM context for each invocation, avoiding
 * the state corruption issues seen in browser WASM.
 *
 * NOTE: Deno edge functions have stricter WASM memory limits than browsers.
 * This function only works reliably for small problems (~50 binary vars max).
 * For larger problems, use browser HiGHS or GLPK fallback.
 *
 * IMPORTANT: Do NOT pass options object to highs.solve() - it causes
 * "Unable to parse solution. Too few lines." error in Deno.
 *
 * Input: LP problem in CPLEX format (string)
 * Output: Solution with status, objective value, and variable assignments
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Load HiGHS using Deno's npm compatibility
async function loadHiGHS(): Promise<any> {
  try {
    console.log('[lp-solver] Loading HiGHS...');
    const highsModule = await import("npm:highs@1.8.0");
    const highs = await highsModule.default();
    console.log('[lp-solver] HiGHS loaded successfully');
    return highs;
  } catch (error: any) {
    console.error('[lp-solver] Failed to load HiGHS:', error.message);
    throw new Error(`Failed to load HiGHS solver: ${error.message}`);
  }
}

interface SolveResult {
  status: 'optimal' | 'feasible' | 'infeasible' | 'unbounded' | 'timeout' | 'error';
  objectiveValue: number;
  variables: Record<string, number>;
  solveTimeMs: number;
  solver: 'highs';
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const body = await req.json();
    const { lpString } = body;

    if (!lpString || typeof lpString !== 'string') {
      return new Response(JSON.stringify({
        error: 'Missing or invalid lpString parameter'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[lp-solver] Received LP problem:', {
      length: lpString.length,
      lines: lpString.split('\n').length
    });

    // Validate LP format
    const hasObjective = lpString.includes('Maximize') || lpString.includes('Minimize');
    const hasSubjectTo = lpString.includes('Subject To');
    const hasEnd = lpString.includes('End');

    if (!hasObjective || !hasSubjectTo || !hasEnd) {
      return new Response(JSON.stringify({
        error: 'Invalid LP format',
        details: { hasObjective, hasSubjectTo, hasEnd }
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Load HiGHS (fresh instance for each request in edge function)
    const highs = await loadHiGHS();

    // Solve WITHOUT options - options cause "Unable to parse solution. Too few lines." error in Deno
    console.log('[lp-solver] Starting solve...');
    const solveStart = Date.now();

    let solution;
    try {
      solution = highs.solve(lpString);
    } catch (solveError: any) {
      console.error('[lp-solver] Solve error:', solveError.message);

      return new Response(JSON.stringify({
        status: 'error',
        error: solveError.message,
        solveTimeMs: Date.now() - solveStart,
        solver: 'highs'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const solveTimeMs = Date.now() - solveStart;
    console.log('[lp-solver] Solve completed:', {
      status: solution.Status,
      objectiveValue: solution.ObjectiveValue,
      solveTimeMs
    });

    // Map HiGHS status to our status
    let status: SolveResult['status'];
    switch (solution.Status) {
      case 'Optimal':
        status = 'optimal';
        break;
      case 'Infeasible':
        status = 'infeasible';
        break;
      case 'Unbounded':
        status = 'unbounded';
        break;
      case 'Time limit reached':
        status = 'timeout';
        break;
      default:
        status = 'feasible';
    }

    // Extract variable values
    const variables: Record<string, number> = {};
    if (solution.Columns) {
      for (const [varName, col] of Object.entries(solution.Columns)) {
        variables[varName] = (col as any).Primal || 0;
      }
    }

    const result: SolveResult = {
      status,
      objectiveValue: solution.ObjectiveValue || 0,
      variables,
      solveTimeMs,
      solver: 'highs'
    };

    console.log('[lp-solver] Returning result:', {
      status: result.status,
      objectiveValue: result.objectiveValue,
      variableCount: Object.keys(result.variables).length,
      totalTimeMs: Date.now() - startTime
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[lp-solver] Error:', error);

    return new Response(JSON.stringify({
      status: 'error',
      error: error.message || 'Unknown error',
      solveTimeMs: Date.now() - startTime,
      solver: 'highs'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
