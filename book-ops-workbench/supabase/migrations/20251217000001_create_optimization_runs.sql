-- Create optimization_runs table for telemetry
-- Captures comprehensive data about every optimization run for analysis
-- @see MASTER_LOGIC.mdc §14 - Optimization Telemetry

CREATE TABLE IF NOT EXISTS optimization_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Run Context
  build_id UUID NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
  config_id UUID REFERENCES assignment_configuration(id) ON DELETE SET NULL,
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('customer', 'prospect')),
  engine_type TEXT NOT NULL CHECK (engine_type IN ('waterfall', 'relaxed_optimization')),
  model_version TEXT NOT NULL,
  
  -- Config Snapshot (for historical analysis even if config changes)
  weights_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  balance_intensity TEXT,
  priority_config_snapshot JSONB,
  
  -- Problem Size
  num_accounts INTEGER NOT NULL,
  num_reps INTEGER NOT NULL,
  num_locked_accounts INTEGER,
  num_strategic_accounts INTEGER,
  num_variables INTEGER,      -- LP only, NULL for waterfall
  num_constraints INTEGER,    -- LP only, NULL for waterfall
  lp_size_kb REAL,            -- LP only, NULL for waterfall
  
  -- Solver Performance
  solver_type TEXT CHECK (solver_type IN ('highs-wasm', 'cloud-run', 'glpk') OR solver_type IS NULL),
  solver_status TEXT NOT NULL CHECK (solver_status IN ('optimal', 'feasible', 'infeasible', 'timeout', 'error', 'complete')),
  solve_time_ms INTEGER NOT NULL,
  objective_value REAL,       -- LP only, NULL for waterfall
  
  -- Success Metrics (all optional - waterfall may not have all)
  -- Balance
  arr_variance_percent REAL,
  atr_variance_percent REAL,
  pipeline_variance_percent REAL,
  max_overload_percent REAL,
  
  -- Continuity
  continuity_rate REAL,
  high_value_continuity_rate REAL,
  arr_stayed_percent REAL,
  
  -- Geography
  exact_geo_match_rate REAL,
  sibling_geo_match_rate REAL,
  cross_region_rate REAL,
  
  -- Team Alignment
  exact_tier_match_rate REAL,
  one_level_mismatch_rate REAL,
  
  -- Feasibility
  feasibility_slack_total REAL,
  reps_over_capacity INTEGER,
  
  -- Error Handling
  warnings TEXT[],
  error_message TEXT,
  error_category TEXT CHECK (error_category IN ('data_validation', 'solver_timeout', 'solver_infeasible', 'solver_crash', 'network', 'unknown') OR error_category IS NULL),
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Indexes for common queries
CREATE INDEX idx_optimization_runs_build ON optimization_runs(build_id);
CREATE INDEX idx_optimization_runs_created ON optimization_runs(created_at DESC);
CREATE INDEX idx_optimization_runs_version_engine ON optimization_runs(model_version, engine_type);

-- Enable RLS
ALTER TABLE optimization_runs ENABLE ROW LEVEL SECURITY;

-- RLS policies - users can see runs for builds they have access to
CREATE POLICY "Users can view optimization runs for their builds"
  ON optimization_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM builds b
      WHERE b.id = optimization_runs.build_id
      AND b.created_by = auth.uid()
    )
    OR created_by = auth.uid()
  );

CREATE POLICY "Users can create optimization runs for their builds"
  ON optimization_runs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM builds b
      WHERE b.id = optimization_runs.build_id
      AND b.created_by = auth.uid()
    )
  );

-- No UPDATE/DELETE policies - telemetry is append-only

-- Documentation
COMMENT ON TABLE optimization_runs IS 'Telemetry for optimization runs. Captures metrics and configuration for each assignment generation. Consider archiving runs older than 6 months.';
COMMENT ON COLUMN optimization_runs.model_version IS 'Semantic version of the optimization model (MAJOR.MINOR.PATCH)';
COMMENT ON COLUMN optimization_runs.weights_snapshot IS 'Frozen config snapshot: { objectives: {wC, wG, wT}, balance: {arr_penalty, atr_penalty, pipeline_penalty}, intensity_multiplier }';
COMMENT ON COLUMN optimization_runs.engine_type IS 'waterfall = priority-based cascade, relaxed_optimization = global LP solve';
COMMENT ON COLUMN optimization_runs.solver_type IS 'highs-wasm = browser WASM, cloud-run = native server, glpk = fallback. NULL for waterfall engine.';


