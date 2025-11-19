-- Add constraints to ensure owner_id consistency across tables
-- This migration adds indexes and constraints to maintain data integrity

-- Add indexes for better query performance on owner relationships
CREATE INDEX IF NOT EXISTS idx_accounts_owner_id ON accounts(owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_owner_id ON opportunities(owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_reps_rep_id ON sales_reps(rep_id);

-- Add indexes for build_id relationships 
CREATE INDEX IF NOT EXISTS idx_accounts_build_id ON accounts(build_id) WHERE build_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_build_id ON opportunities(build_id) WHERE build_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_reps_build_id ON sales_reps(build_id) WHERE build_id IS NOT NULL;

-- Add indexes for account-opportunity relationships
CREATE INDEX IF NOT EXISTS idx_opportunities_account_id ON opportunities(sfdc_account_id);

-- Add a comment to document the owner ID relationship
COMMENT ON COLUMN accounts.owner_id IS 'Must match sales_reps.rep_id for valid assignments';
COMMENT ON COLUMN opportunities.owner_id IS 'Must match sales_reps.rep_id for valid assignments';

-- Create a function to validate owner assignments
CREATE OR REPLACE FUNCTION validate_owner_assignment(p_build_id UUID, p_owner_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if the owner_id exists in sales_reps for the same build
  RETURN EXISTS (
    SELECT 1 
    FROM sales_reps 
    WHERE rep_id = p_owner_id 
    AND build_id = p_build_id
  );
END;
$$ LANGUAGE plpgsql;

-- Add a function to get orphaned accounts (accounts with invalid owner_ids)
CREATE OR REPLACE FUNCTION get_orphaned_accounts(p_build_id UUID)
RETURNS TABLE (
  account_id TEXT,
  account_name TEXT,
  owner_id TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.sfdc_account_id,
    a.account_name,
    a.owner_id
  FROM accounts a
  WHERE a.build_id = p_build_id
    AND a.owner_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 
      FROM sales_reps sr 
      WHERE sr.rep_id = a.owner_id 
      AND sr.build_id = p_build_id
    );
END;
$$ LANGUAGE plpgsql;

-- Add a function to get orphaned opportunities
CREATE OR REPLACE FUNCTION get_orphaned_opportunities(p_build_id UUID)
RETURNS TABLE (
  opportunity_id TEXT,
  account_id TEXT,
  owner_id TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.sfdc_opportunity_id,
    o.sfdc_account_id,
    o.owner_id
  FROM opportunities o
  WHERE o.build_id = p_build_id
    AND o.owner_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 
      FROM sales_reps sr 
      WHERE sr.rep_id = o.owner_id 
      AND sr.build_id = p_build_id
    );
END;
$$ LANGUAGE plpgsql;