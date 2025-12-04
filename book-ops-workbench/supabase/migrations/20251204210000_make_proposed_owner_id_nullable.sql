-- Make proposed_owner_id nullable to support out-of-scope reassignments
-- Out-of-scope accounts have no proposed owner - they need RevOps to assign outside the hierarchy

ALTER TABLE manager_reassignments 
ALTER COLUMN proposed_owner_id DROP NOT NULL;

