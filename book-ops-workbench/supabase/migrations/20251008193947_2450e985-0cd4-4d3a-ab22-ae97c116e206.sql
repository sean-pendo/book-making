-- Fix batch_update_account_owners function to remove non-existent updated_at column
CREATE OR REPLACE FUNCTION public.batch_update_account_owners(p_build_id uuid, p_updates jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  -- Perform bulk update using JSONB data (removed updated_at reference)
  UPDATE accounts
  SET 
    new_owner_id = (updates.value->>'new_owner_id')::TEXT,
    new_owner_name = (updates.value->>'new_owner_name')::TEXT
  FROM jsonb_each(p_updates) AS updates
  WHERE accounts.build_id = p_build_id
    AND accounts.sfdc_account_id = (updates.key)::TEXT;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RETURN updated_count;
END;
$function$;