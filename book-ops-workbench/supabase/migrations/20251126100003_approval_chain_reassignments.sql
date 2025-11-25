-- Add approval chain tracking to manager_reassignments
-- Flow: FLM proposes → SLM approves → RevOps finalizes

-- Add approval_status column to track the chain
ALTER TABLE manager_reassignments 
ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'pending_slm';

-- Add SLM approval tracking
ALTER TABLE manager_reassignments 
ADD COLUMN IF NOT EXISTS slm_approved_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS slm_approved_at timestamptz;

-- Add RevOps approval tracking
ALTER TABLE manager_reassignments 
ADD COLUMN IF NOT EXISTS revops_approved_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS revops_approved_at timestamptz;

-- Add constraint for valid approval status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'manager_reassignments_approval_status_check'
  ) THEN
    ALTER TABLE manager_reassignments 
    ADD CONSTRAINT manager_reassignments_approval_status_check 
      CHECK (approval_status IN ('pending_slm', 'pending_revops', 'approved', 'rejected'));
  END IF;
END $$;

-- Migrate existing 'pending' status to 'pending_slm'
UPDATE manager_reassignments 
SET approval_status = 'pending_slm' 
WHERE status = 'pending' AND (approval_status IS NULL OR approval_status = 'pending_slm');

-- Migrate existing 'approved' to new approval_status
UPDATE manager_reassignments 
SET approval_status = 'approved' 
WHERE status = 'approved';

-- Migrate existing 'rejected' to new approval_status
UPDATE manager_reassignments 
SET approval_status = 'rejected' 
WHERE status = 'rejected';

-- Add index for faster approval queue queries
CREATE INDEX IF NOT EXISTS idx_reassignments_approval_status 
ON manager_reassignments(approval_status);

CREATE INDEX IF NOT EXISTS idx_reassignments_approval_status_build 
ON manager_reassignments(build_id, approval_status);

-- Comments for documentation
COMMENT ON COLUMN manager_reassignments.approval_status IS 'Approval chain status: pending_slm → pending_revops → approved/rejected';
COMMENT ON COLUMN manager_reassignments.slm_approved_by IS 'SLM user who approved/rejected this reassignment';
COMMENT ON COLUMN manager_reassignments.slm_approved_at IS 'Timestamp when SLM approved/rejected';
COMMENT ON COLUMN manager_reassignments.revops_approved_by IS 'RevOps user who gave final approval';
COMMENT ON COLUMN manager_reassignments.revops_approved_at IS 'Timestamp of final RevOps approval';

