-- Add columns for Backfill and Open Headcount feature
-- is_backfill_source: true for reps leaving the business (excluded from assignments)
-- is_backfill_target: true for auto-created BF-{name} replacement reps
-- backfill_target_rep_id: references the rep_id (SFDC ID string) of the backfill rep
-- is_placeholder: true for open headcount reps with auto-generated IDs

ALTER TABLE sales_reps ADD COLUMN IF NOT EXISTS is_backfill_source boolean DEFAULT false;
ALTER TABLE sales_reps ADD COLUMN IF NOT EXISTS is_backfill_target boolean DEFAULT false;
ALTER TABLE sales_reps ADD COLUMN IF NOT EXISTS backfill_target_rep_id text;
ALTER TABLE sales_reps ADD COLUMN IF NOT EXISTS is_placeholder boolean DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN sales_reps.is_backfill_source IS 'True if this rep is leaving the business and their accounts should be migrated to a backfill rep';
COMMENT ON COLUMN sales_reps.is_backfill_target IS 'True if this rep was auto-created as a backfill replacement';
COMMENT ON COLUMN sales_reps.backfill_target_rep_id IS 'The rep_id (SFDC ID) of the backfill rep that will receive this leaving reps accounts';
COMMENT ON COLUMN sales_reps.is_placeholder IS 'True if this rep has an auto-generated ID (open headcount without SFDC ID)';

