-- Create sandbox_runs table for optimization experiments
CREATE TABLE IF NOT EXISTS sandbox_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID REFERENCES builds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,  -- variance%, targets, toggles
  baseline_metrics JSONB DEFAULT '{}'::jsonb, -- metrics from current assignments
  optimized_metrics JSONB DEFAULT '{}'::jsonb, -- metrics from HiGHS solution
  assignments JSONB DEFAULT '[]'::jsonb,      -- optimized assignment results
  solve_time_ms INTEGER,                       -- how long optimization took
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Add indexes for common queries
CREATE INDEX idx_sandbox_runs_build_id ON sandbox_runs(build_id);
CREATE INDEX idx_sandbox_runs_created_at ON sandbox_runs(created_at DESC);
CREATE INDEX idx_sandbox_runs_status ON sandbox_runs(status);

-- Enable RLS
ALTER TABLE sandbox_runs ENABLE ROW LEVEL SECURITY;

-- RLS policies - users can see sandbox runs for builds they have access to
CREATE POLICY "Users can view sandbox runs for their builds"
  ON sandbox_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM builds b
      WHERE b.id = sandbox_runs.build_id
      AND b.created_by = auth.uid()
    )
    OR created_by = auth.uid()
  );

CREATE POLICY "Users can create sandbox runs for their builds"
  ON sandbox_runs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM builds b
      WHERE b.id = sandbox_runs.build_id
      AND b.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can update their own sandbox runs"
  ON sandbox_runs FOR UPDATE
  USING (created_by = auth.uid());

CREATE POLICY "Users can delete their own sandbox runs"
  ON sandbox_runs FOR DELETE
  USING (created_by = auth.uid());

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_sandbox_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sandbox_runs_updated_at
  BEFORE UPDATE ON sandbox_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_sandbox_runs_updated_at();

-- Add comment for documentation
COMMENT ON TABLE sandbox_runs IS 'Stores optimization sandbox experiments comparing different assignment configurations';
COMMENT ON COLUMN sandbox_runs.config IS 'Configuration used: target_arr, variance_pct, max_arr, max_cre, weights, toggles';
COMMENT ON COLUMN sandbox_runs.baseline_metrics IS 'Metrics calculated from current/existing assignments';
COMMENT ON COLUMN sandbox_runs.optimized_metrics IS 'Metrics calculated from HiGHS-optimized assignments';

