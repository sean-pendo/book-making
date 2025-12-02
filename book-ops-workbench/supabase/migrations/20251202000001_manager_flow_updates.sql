-- Manager Flow Updates Migration
-- Adds scope tracking and late submission detection

-- Add scope tracking to manager_reviews
ALTER TABLE manager_reviews 
ADD COLUMN IF NOT EXISTS shared_scope text DEFAULT 'full';

-- Add visible_flms array to track which FLMs are visible when scope is limited
ALTER TABLE manager_reviews 
ADD COLUMN IF NOT EXISTS visible_flms text[];

-- Add constraint for valid shared_scope values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'manager_reviews_shared_scope_check'
  ) THEN
    ALTER TABLE manager_reviews 
    ADD CONSTRAINT manager_reviews_shared_scope_check 
      CHECK (shared_scope IN ('full', 'flm_only'));
  END IF;
END $$;

-- Add late submission flag to manager_reassignments
-- This flags proposals created after the SLM already submitted their review
ALTER TABLE manager_reassignments
ADD COLUMN IF NOT EXISTS is_late_submission boolean DEFAULT false;

-- Add index for faster queries on late submissions
CREATE INDEX IF NOT EXISTS idx_reassignments_late_submission 
ON manager_reassignments(is_late_submission) 
WHERE is_late_submission = true;

-- Add index for manager_reviews by manager_name for faster lookups
CREATE INDEX IF NOT EXISTS idx_manager_reviews_manager_name 
ON manager_reviews(build_id, manager_name);

-- Comments for documentation
COMMENT ON COLUMN manager_reviews.shared_scope IS 'Scope of visibility: full = entire hierarchy, flm_only = only specific FLMs';
COMMENT ON COLUMN manager_reviews.visible_flms IS 'Array of FLM names visible when scope is flm_only';
COMMENT ON COLUMN manager_reassignments.is_late_submission IS 'True if proposal was created after SLM already submitted review';

