-- Fix customer classification and calculated ARR values

-- First, update customer classification based on account_type
UPDATE accounts 
SET is_customer = true
WHERE account_type = 'Customer' 
  AND is_customer = false;

-- Update the function to properly handle customer ARR calculations
CREATE OR REPLACE FUNCTION public.update_account_calculated_values(p_build_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Update accounts with calculated values
  UPDATE accounts a
  SET 
    calculated_arr = CASE 
      -- For customer accounts, use the base ARR value if available, otherwise use opportunity data
      WHEN a.is_customer = true THEN COALESCE(a.arr, opp_data.total_arr, 0)
      -- For prospect accounts, use opportunity-based calculation
      ELSE COALESCE(opp_data.total_arr, 0)
    END,
    calculated_atr = COALESCE(opp_data.total_atr, 0),
    cre_count = COALESCE(opp_data.cre_count, 0)
  FROM (
    SELECT 
      o.sfdc_account_id,
      SUM(COALESCE(o.amount, 0)) as total_arr,
      SUM(COALESCE(o.available_to_renew, 0)) as total_atr,
      COUNT(CASE WHEN o.cre_status IS NOT NULL AND o.cre_status != '' THEN 1 END) as cre_count
    FROM opportunities o
    WHERE o.build_id = p_build_id
    GROUP BY o.sfdc_account_id
  ) opp_data
  WHERE a.sfdc_account_id = opp_data.sfdc_account_id 
    AND a.build_id = p_build_id;
    
  -- Handle accounts that don't have opportunities but are customers
  UPDATE accounts a
  SET 
    calculated_arr = COALESCE(a.arr, 0),
    calculated_atr = 0,
    cre_count = 0
  WHERE a.build_id = p_build_id
    AND a.is_customer = true
    AND a.calculated_arr = 0
    AND a.arr > 0
    AND NOT EXISTS (
      SELECT 1 FROM opportunities o 
      WHERE o.sfdc_account_id = a.sfdc_account_id 
        AND o.build_id = p_build_id
    );
END;
$function$

-- Run the updated calculation for the current build
SELECT public.update_account_calculated_values('8fc766cc-b091-44b6-bd1c-4d5f9b8409dd');