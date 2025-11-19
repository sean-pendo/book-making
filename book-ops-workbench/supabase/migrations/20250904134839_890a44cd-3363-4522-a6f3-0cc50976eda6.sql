-- Fix security warnings for function search paths
-- Update the functions created in the previous migration to have proper search_path

CREATE OR REPLACE FUNCTION validate_owner_assignment(p_build_id UUID, p_owner_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the owner_id exists in sales_reps for the same build
  RETURN EXISTS (
    SELECT 1 
    FROM sales_reps 
    WHERE rep_id = p_owner_id 
    AND build_id = p_build_id
  );
END;
$$;

-- Add a function to get orphaned accounts (accounts with invalid owner_ids)
CREATE OR REPLACE FUNCTION get_orphaned_accounts(p_build_id UUID)
RETURNS TABLE (
  account_id TEXT,
  account_name TEXT,
  owner_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Add a function to get orphaned opportunities
CREATE OR REPLACE FUNCTION get_orphaned_opportunities(p_build_id UUID)
RETURNS TABLE (
  opportunity_id TEXT,
  account_id TEXT,
  owner_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;