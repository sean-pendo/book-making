-- Fix mark_split_ownership to properly handle NULL values when comparing owners
CREATE OR REPLACE FUNCTION public.mark_split_ownership(p_build_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Clear all split ownership flags first
  UPDATE accounts 
  SET has_split_ownership = false 
  WHERE build_id = p_build_id;
  
  -- Mark parents and children with split ownership
  -- Split ownership occurs when a child's effective owner differs from its parent's effective owner
  WITH split_pairs AS (
    SELECT DISTINCT
      parent.sfdc_account_id as parent_id,
      child.sfdc_account_id as child_id
    FROM accounts parent
    JOIN accounts child ON child.ultimate_parent_id = parent.sfdc_account_id 
      AND child.build_id = p_build_id
    WHERE parent.build_id = p_build_id
      AND parent.is_parent = true
      AND child.is_parent = false
      -- Compare effective owners using COALESCE (new_owner_id if it exists, otherwise owner_id)
      AND COALESCE(child.new_owner_id, child.owner_id) != COALESCE(parent.new_owner_id, parent.owner_id)
  )
  UPDATE accounts
  SET has_split_ownership = true
  WHERE build_id = p_build_id
    AND (
      sfdc_account_id IN (SELECT parent_id FROM split_pairs)
      OR sfdc_account_id IN (SELECT child_id FROM split_pairs)
    );
END;
$function$;