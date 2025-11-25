-- Add cre_status field to accounts table
-- This stores the worst CRE status from opportunities (with hierarchy rollup for parent accounts)

-- Add the column
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS cre_status text;

-- Create function to sync CRE status from opportunities with hierarchy logic
CREATE OR REPLACE FUNCTION public.sync_cre_status_from_opportunities(p_build_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Priority order for CRE status (worst wins):
  -- 1. Confirmed Churn (worst)
  -- 2. At Risk
  -- 3. Pre-Risk Discovery
  -- 4. Monitoring
  -- 5. Closed (resolved, least severe)
  
  -- First, update child accounts (non-parent) with their own worst CRE status
  UPDATE accounts a
  SET cre_status = (
    SELECT CASE 
      WHEN EXISTS (SELECT 1 FROM opportunities o WHERE o.sfdc_account_id = a.sfdc_account_id AND o.build_id = a.build_id AND o.cre_status = 'Confirmed Churn') THEN 'Confirmed Churn'
      WHEN EXISTS (SELECT 1 FROM opportunities o WHERE o.sfdc_account_id = a.sfdc_account_id AND o.build_id = a.build_id AND o.cre_status = 'At Risk') THEN 'At Risk'
      WHEN EXISTS (SELECT 1 FROM opportunities o WHERE o.sfdc_account_id = a.sfdc_account_id AND o.build_id = a.build_id AND o.cre_status = 'Pre-Risk Discovery') THEN 'Pre-Risk Discovery'
      WHEN EXISTS (SELECT 1 FROM opportunities o WHERE o.sfdc_account_id = a.sfdc_account_id AND o.build_id = a.build_id AND o.cre_status = 'Monitoring') THEN 'Monitoring'
      WHEN EXISTS (SELECT 1 FROM opportunities o WHERE o.sfdc_account_id = a.sfdc_account_id AND o.build_id = a.build_id AND o.cre_status = 'Closed') THEN 'Closed'
      ELSE NULL
    END
  )
  WHERE a.build_id = p_build_id
    AND a.is_parent = false;

  -- Then, update parent accounts with worst CRE status from self + all children
  UPDATE accounts a
  SET cre_status = (
    SELECT CASE 
      WHEN EXISTS (
        SELECT 1 FROM opportunities o 
        WHERE o.build_id = a.build_id 
          AND o.cre_status = 'Confirmed Churn'
          AND (o.sfdc_account_id = a.sfdc_account_id 
               OR o.sfdc_account_id IN (SELECT sfdc_account_id FROM accounts WHERE ultimate_parent_id = a.sfdc_account_id AND build_id = a.build_id))
      ) THEN 'Confirmed Churn'
      WHEN EXISTS (
        SELECT 1 FROM opportunities o 
        WHERE o.build_id = a.build_id 
          AND o.cre_status = 'At Risk'
          AND (o.sfdc_account_id = a.sfdc_account_id 
               OR o.sfdc_account_id IN (SELECT sfdc_account_id FROM accounts WHERE ultimate_parent_id = a.sfdc_account_id AND build_id = a.build_id))
      ) THEN 'At Risk'
      WHEN EXISTS (
        SELECT 1 FROM opportunities o 
        WHERE o.build_id = a.build_id 
          AND o.cre_status = 'Pre-Risk Discovery'
          AND (o.sfdc_account_id = a.sfdc_account_id 
               OR o.sfdc_account_id IN (SELECT sfdc_account_id FROM accounts WHERE ultimate_parent_id = a.sfdc_account_id AND build_id = a.build_id))
      ) THEN 'Pre-Risk Discovery'
      WHEN EXISTS (
        SELECT 1 FROM opportunities o 
        WHERE o.build_id = a.build_id 
          AND o.cre_status = 'Monitoring'
          AND (o.sfdc_account_id = a.sfdc_account_id 
               OR o.sfdc_account_id IN (SELECT sfdc_account_id FROM accounts WHERE ultimate_parent_id = a.sfdc_account_id AND build_id = a.build_id))
      ) THEN 'Monitoring'
      WHEN EXISTS (
        SELECT 1 FROM opportunities o 
        WHERE o.build_id = a.build_id 
          AND o.cre_status = 'Closed'
          AND (o.sfdc_account_id = a.sfdc_account_id 
               OR o.sfdc_account_id IN (SELECT sfdc_account_id FROM accounts WHERE ultimate_parent_id = a.sfdc_account_id AND build_id = a.build_id))
      ) THEN 'Closed'
      ELSE NULL
    END
  )
  WHERE a.build_id = p_build_id
    AND a.is_parent = true;

  -- Also update cre_count to ensure it's correct
  -- For child accounts: count their own opportunities with cre_status
  UPDATE accounts a
  SET cre_count = (
    SELECT COUNT(*) 
    FROM opportunities o 
    WHERE o.sfdc_account_id = a.sfdc_account_id 
      AND o.build_id = a.build_id 
      AND o.cre_status IS NOT NULL 
      AND o.cre_status != ''
  )
  WHERE a.build_id = p_build_id
    AND a.is_parent = false;

  -- For parent accounts: count opportunities from self + all children
  UPDATE accounts a
  SET cre_count = (
    SELECT COUNT(*) 
    FROM opportunities o 
    WHERE o.build_id = a.build_id 
      AND o.cre_status IS NOT NULL 
      AND o.cre_status != ''
      AND (o.sfdc_account_id = a.sfdc_account_id 
           OR o.sfdc_account_id IN (SELECT sfdc_account_id FROM accounts WHERE ultimate_parent_id = a.sfdc_account_id AND build_id = a.build_id))
  )
  WHERE a.build_id = p_build_id
    AND a.is_parent = true;
END;
$function$;

-- Note: The initial sync for existing builds was skipped to avoid timeout.
-- Run SELECT sync_cre_status_from_opportunities(build_id) manually per build if needed.

-- Add comment for documentation
COMMENT ON COLUMN accounts.cre_status IS 'Worst CRE status from opportunities: Confirmed Churn > At Risk > Pre-Risk Discovery > Monitoring > Closed';

