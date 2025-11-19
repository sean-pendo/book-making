-- Create function to fix account owner assignments
-- This function updates accounts.new_owner_id by matching owner names to sales_reps
CREATE OR REPLACE FUNCTION public.fix_account_owner_assignments(p_build_id uuid)
RETURNS TABLE(updated_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result_count integer := 0;
BEGIN
  -- Update accounts.new_owner_id by matching new_owner_name to sales_reps.name
  UPDATE accounts a 
  SET new_owner_id = sr.rep_id
  FROM sales_reps sr
  WHERE a.build_id = p_build_id
    AND a.new_owner_id IS NOT NULL
    AND a.new_owner_name IS NOT NULL
    AND LOWER(TRIM(a.new_owner_name)) = LOWER(TRIM(sr.name))
    AND sr.build_id = p_build_id;

  GET DIAGNOSTICS result_count = ROW_COUNT;
  
  RETURN QUERY SELECT result_count;
END;
$function$;