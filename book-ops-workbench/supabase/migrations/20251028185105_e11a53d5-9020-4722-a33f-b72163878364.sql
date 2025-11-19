-- First, clean up orphaned data (records referencing non-existent builds)
-- Then add CASCADE delete constraints

-- Step 1: Delete orphaned records
DELETE FROM assignment_rules WHERE build_id NOT IN (SELECT id FROM builds);
DELETE FROM accounts WHERE build_id NOT IN (SELECT id FROM builds);
DELETE FROM opportunities WHERE build_id NOT IN (SELECT id FROM builds);
DELETE FROM sales_reps WHERE build_id NOT IN (SELECT id FROM builds);
DELETE FROM assignments WHERE build_id NOT IN (SELECT id FROM builds);
DELETE FROM assignment_configuration WHERE build_id NOT IN (SELECT id FROM builds);
DELETE FROM balancing_metrics WHERE build_id NOT IN (SELECT id FROM builds);
DELETE FROM clashes WHERE build_id NOT IN (SELECT id FROM builds);
DELETE FROM export_packages WHERE build_id NOT IN (SELECT id FROM builds);
DELETE FROM notes WHERE build_id NOT IN (SELECT id FROM builds);
DELETE FROM manager_notes WHERE build_id NOT IN (SELECT id FROM builds);
DELETE FROM manager_reassignments WHERE build_id NOT IN (SELECT id FROM builds);
DELETE FROM manager_reviews WHERE build_id NOT IN (SELECT id FROM builds);
DELETE FROM audit_log WHERE build_id NOT IN (SELECT id FROM builds);

-- Step 2: Add CASCADE delete constraints
-- assignment_rules
ALTER TABLE assignment_rules 
DROP CONSTRAINT IF EXISTS assignment_rules_build_id_fkey;
ALTER TABLE assignment_rules
ADD CONSTRAINT assignment_rules_build_id_fkey 
FOREIGN KEY (build_id) REFERENCES builds(id) ON DELETE CASCADE;

-- accounts
ALTER TABLE accounts 
DROP CONSTRAINT IF EXISTS accounts_build_id_fkey;
ALTER TABLE accounts
ADD CONSTRAINT accounts_build_id_fkey 
FOREIGN KEY (build_id) REFERENCES builds(id) ON DELETE CASCADE;

-- opportunities
ALTER TABLE opportunities 
DROP CONSTRAINT IF EXISTS opportunities_build_id_fkey;
ALTER TABLE opportunities
ADD CONSTRAINT opportunities_build_id_fkey 
FOREIGN KEY (build_id) REFERENCES builds(id) ON DELETE CASCADE;

-- sales_reps
ALTER TABLE sales_reps 
DROP CONSTRAINT IF EXISTS sales_reps_build_id_fkey;
ALTER TABLE sales_reps
ADD CONSTRAINT sales_reps_build_id_fkey 
FOREIGN KEY (build_id) REFERENCES builds(id) ON DELETE CASCADE;

-- assignments
ALTER TABLE assignments 
DROP CONSTRAINT IF EXISTS assignments_build_id_fkey;
ALTER TABLE assignments
ADD CONSTRAINT assignments_build_id_fkey 
FOREIGN KEY (build_id) REFERENCES builds(id) ON DELETE CASCADE;

-- assignment_configuration
ALTER TABLE assignment_configuration 
DROP CONSTRAINT IF EXISTS assignment_configuration_build_id_fkey;
ALTER TABLE assignment_configuration
ADD CONSTRAINT assignment_configuration_build_id_fkey 
FOREIGN KEY (build_id) REFERENCES builds(id) ON DELETE CASCADE;

-- balancing_metrics
ALTER TABLE balancing_metrics 
DROP CONSTRAINT IF EXISTS balancing_metrics_build_id_fkey;
ALTER TABLE balancing_metrics
ADD CONSTRAINT balancing_metrics_build_id_fkey 
FOREIGN KEY (build_id) REFERENCES builds(id) ON DELETE CASCADE;

-- clashes
ALTER TABLE clashes 
DROP CONSTRAINT IF EXISTS clashes_build_id_fkey;
ALTER TABLE clashes
ADD CONSTRAINT clashes_build_id_fkey 
FOREIGN KEY (build_id) REFERENCES builds(id) ON DELETE CASCADE;

-- export_packages
ALTER TABLE export_packages 
DROP CONSTRAINT IF EXISTS export_packages_build_id_fkey;
ALTER TABLE export_packages
ADD CONSTRAINT export_packages_build_id_fkey 
FOREIGN KEY (build_id) REFERENCES builds(id) ON DELETE CASCADE;

-- notes
ALTER TABLE notes 
DROP CONSTRAINT IF EXISTS notes_build_id_fkey;
ALTER TABLE notes
ADD CONSTRAINT notes_build_id_fkey 
FOREIGN KEY (build_id) REFERENCES builds(id) ON DELETE CASCADE;

-- manager_notes
ALTER TABLE manager_notes 
DROP CONSTRAINT IF EXISTS manager_notes_build_id_fkey;
ALTER TABLE manager_notes
ADD CONSTRAINT manager_notes_build_id_fkey 
FOREIGN KEY (build_id) REFERENCES builds(id) ON DELETE CASCADE;

-- manager_reassignments
ALTER TABLE manager_reassignments 
DROP CONSTRAINT IF EXISTS manager_reassignments_build_id_fkey;
ALTER TABLE manager_reassignments
ADD CONSTRAINT manager_reassignments_build_id_fkey 
FOREIGN KEY (build_id) REFERENCES builds(id) ON DELETE CASCADE;

-- manager_reviews
ALTER TABLE manager_reviews 
DROP CONSTRAINT IF EXISTS manager_reviews_build_id_fkey;
ALTER TABLE manager_reviews
ADD CONSTRAINT manager_reviews_build_id_fkey 
FOREIGN KEY (build_id) REFERENCES builds(id) ON DELETE CASCADE;

-- audit_log
ALTER TABLE audit_log 
DROP CONSTRAINT IF EXISTS audit_log_build_id_fkey;
ALTER TABLE audit_log
ADD CONSTRAINT audit_log_build_id_fkey 
FOREIGN KEY (build_id) REFERENCES builds(id) ON DELETE CASCADE;