-- Re-create get_customer_arr_total to ensure it exists and uses correct logic
CREATE OR REPLACE FUNCTION get_customer_arr_total(p_build_id uuid)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  total_arr numeric;
BEGIN
  -- Sum ARR for customer accounts
  -- Priority: hierarchy_bookings_arr_converted > calculated_arr > arr
  SELECT COALESCE(SUM(
    COALESCE(hierarchy_bookings_arr_converted, calculated_arr, arr, 0)
  ), 0)
  INTO total_arr
  FROM accounts
  WHERE build_id = p_build_id
  AND is_customer = true;
  
  RETURN total_arr;
END;
$$;

-- Re-create get_prospect_pipeline_total to ensure it exists
CREATE OR REPLACE FUNCTION get_prospect_pipeline_total(p_build_id uuid)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  total_pipeline numeric;
BEGIN
  -- Calculate total pipeline from opportunities linked to prospect accounts
  -- We look for prospect parent accounts and sum the net_arr of their opportunities
  SELECT COALESCE(SUM(o.net_arr), 0)
  INTO total_pipeline
  FROM opportunities o
  JOIN accounts a ON o.sfdc_account_id = a.sfdc_account_id
  WHERE a.build_id = p_build_id
  AND o.build_id = p_build_id
  AND a.is_customer = false
  AND a.is_parent = true;
  
  RETURN total_pipeline;
END;
$$;

