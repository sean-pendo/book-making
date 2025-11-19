-- Create a database function to recalculate account values efficiently
-- This serves as a backup to the edge function and can handle the calculation in PostgreSQL

CREATE OR REPLACE FUNCTION public.recalculate_account_values_db(p_build_id uuid)
RETURNS TABLE(
  accounts_updated integer,
  processing_time_seconds numeric
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  start_time timestamp := now();
  update_count integer := 0;
BEGIN
  -- Update calculated_arr, calculated_atr, and cre_count for all accounts in the build
  WITH account_calculations AS (
    SELECT 
      a.sfdc_account_id,
      -- ARR calculation: Use hierarchy_bookings_arr_converted for parents if available, otherwise sum opportunities
      CASE 
        WHEN a.is_parent = true AND a.hierarchy_bookings_arr_converted > 0 THEN 
          a.hierarchy_bookings_arr_converted
        ELSE 
          COALESCE(
            (SELECT SUM(DISTINCT o.amount) 
             FROM opportunities o 
             WHERE o.build_id = p_build_id 
               AND o.sfdc_account_id = a.sfdc_account_id
               AND o.amount IS NOT NULL),
            a.arr,
            0
          )
      END as new_calculated_arr,
      
      -- ATR calculation: ONLY sum available_to_renew for opportunities with opportunity_type = 'Renewals' (exact match)
      COALESCE(
        (SELECT SUM(DISTINCT o.available_to_renew) 
         FROM opportunities o 
         WHERE o.build_id = p_build_id 
           AND o.sfdc_account_id = a.sfdc_account_id
           AND o.opportunity_type = 'Renewals'  -- Exact match only
           AND o.available_to_renew IS NOT NULL),
        0
      ) as new_calculated_atr,
      
      -- CRE count: Count opportunities with non-null, non-empty cre_status
      COALESCE(
        (SELECT COUNT(DISTINCT o.sfdc_opportunity_id)
         FROM opportunities o 
         WHERE o.build_id = p_build_id 
           AND o.sfdc_account_id = a.sfdc_account_id
           AND o.cre_status IS NOT NULL 
           AND o.cre_status != ''),
        0
      ) as new_cre_count
    FROM accounts a
    WHERE a.build_id = p_build_id
  )
  UPDATE accounts 
  SET 
    calculated_arr = ac.new_calculated_arr,
    calculated_atr = ac.new_calculated_atr,
    cre_count = ac.new_cre_count
  FROM account_calculations ac
  WHERE accounts.sfdc_account_id = ac.sfdc_account_id
    AND accounts.build_id = p_build_id;

  GET DIAGNOSTICS update_count = ROW_COUNT;
  
  RETURN QUERY SELECT 
    update_count,
    EXTRACT(EPOCH FROM (now() - start_time))::numeric;
    
  -- Log the completion
  RAISE NOTICE 'Recalculated values for % accounts in build % (%.2f seconds)', 
    update_count, p_build_id, EXTRACT(EPOCH FROM (now() - start_time));
END;
$$;