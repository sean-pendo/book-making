-- Create optimized bulk reset function for assignments
CREATE OR REPLACE FUNCTION public.reset_build_assignments_bulk(p_build_id uuid)
RETURNS TABLE(accounts_reset integer, opportunities_reset integer, assignments_deleted integer, processing_time_seconds numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  accounts_count integer := 0;
  opportunities_count integer := 0;
  assignments_count integer := 0;
  start_time timestamp := now();
BEGIN
  -- Reset all account assignments in one operation
  UPDATE accounts 
  SET new_owner_id = NULL, new_owner_name = NULL
  WHERE build_id = p_build_id
    AND (new_owner_id IS NOT NULL OR new_owner_name IS NOT NULL);
  
  GET DIAGNOSTICS accounts_count = ROW_COUNT;
  
  -- Reset all opportunity assignments in one operation
  UPDATE opportunities 
  SET new_owner_id = NULL, new_owner_name = NULL
  WHERE build_id = p_build_id
    AND (new_owner_id IS NOT NULL OR new_owner_name IS NOT NULL);
  
  GET DIAGNOSTICS opportunities_count = ROW_COUNT;
  
  -- Delete all assignment records
  DELETE FROM assignments WHERE build_id = p_build_id;
  
  GET DIAGNOSTICS assignments_count = ROW_COUNT;
  
  RETURN QUERY SELECT 
    accounts_count, 
    opportunities_count, 
    assignments_count,
    EXTRACT(EPOCH FROM (now() - start_time))::numeric;
    
  -- Log completion
  RAISE NOTICE 'Bulk reset % accounts, % opportunities, % assignments for build % in %.2f seconds', 
    accounts_count, opportunities_count, assignments_count, p_build_id, 
    EXTRACT(EPOCH FROM (now() - start_time));
END;
$function$;