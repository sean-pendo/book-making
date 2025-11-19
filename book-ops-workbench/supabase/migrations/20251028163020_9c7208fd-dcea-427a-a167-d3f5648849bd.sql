-- Add is_orphaned flag to opportunities table
ALTER TABLE opportunities 
ADD COLUMN is_orphaned boolean NOT NULL DEFAULT false;

-- Add index for faster queries on orphaned opportunities
CREATE INDEX idx_opportunities_orphaned ON opportunities(build_id, is_orphaned) WHERE is_orphaned = true;

-- Add comment
COMMENT ON COLUMN opportunities.is_orphaned IS 'Indicates if the opportunity references an account that does not exist in the build';