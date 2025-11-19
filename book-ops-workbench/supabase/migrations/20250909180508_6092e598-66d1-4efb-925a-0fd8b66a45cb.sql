-- Function to automatically classify parent/child accounts based on ultimate_parent_id
CREATE OR REPLACE FUNCTION public.classify_parent_child_accounts(p_build_id uuid)
RETURNS TABLE(updated_count integer, parent_count integer, child_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
    result_count integer := 0;
    temp_count integer := 0;
    parent_result_count integer := 0;
    child_result_count integer := 0;
BEGIN
    -- Set is_parent = true for accounts where ultimate_parent_id is NULL
    UPDATE accounts 
    SET is_parent = true
    WHERE build_id = p_build_id
      AND (ultimate_parent_id IS NULL OR ultimate_parent_id = '')
      AND is_parent != true;

    GET DIAGNOSTICS temp_count = ROW_COUNT;
    result_count := temp_count;
    
    -- Set is_parent = false for accounts where ultimate_parent_id is NOT NULL and not empty
    UPDATE accounts 
    SET is_parent = false
    WHERE build_id = p_build_id
      AND ultimate_parent_id IS NOT NULL 
      AND ultimate_parent_id != ''
      AND is_parent != false;

    GET DIAGNOSTICS temp_count = ROW_COUNT;
    result_count := result_count + temp_count;
    
    -- Get final counts
    SELECT COUNT(*) INTO parent_result_count
    FROM accounts 
    WHERE build_id = p_build_id AND (ultimate_parent_id IS NULL OR ultimate_parent_id = '');
    
    SELECT COUNT(*) INTO child_result_count
    FROM accounts 
    WHERE build_id = p_build_id AND ultimate_parent_id IS NOT NULL AND ultimate_parent_id != '';
    
    RETURN QUERY SELECT result_count, parent_result_count, child_result_count;
END;
$function$;

-- Function to recover and fix existing data with incorrect empty string values
CREATE OR REPLACE FUNCTION public.fix_ultimate_parent_id_data(p_build_id uuid)
RETURNS TABLE(fixed_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
    result_count integer := 0;
BEGIN
    -- Convert empty string ultimate_parent_id values to NULL
    UPDATE accounts 
    SET ultimate_parent_id = NULL
    WHERE build_id = p_build_id
      AND ultimate_parent_id = '';

    GET DIAGNOSTICS result_count = ROW_COUNT;
    
    -- Also fix parent_id if it exists and has empty strings
    UPDATE accounts 
    SET parent_id = NULL
    WHERE build_id = p_build_id
      AND parent_id = '';
    
    -- Now reclassify parent/child status
    PERFORM public.classify_parent_child_accounts(p_build_id);
    
    RETURN QUERY SELECT result_count;
END;
$function$;

-- Function to validate parent-child relationships
CREATE OR REPLACE FUNCTION public.validate_parent_child_relationships(p_build_id uuid)
RETURNS TABLE(
    total_accounts integer,
    parent_accounts integer, 
    child_accounts integer,
    orphaned_children integer,
    self_referencing integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
    total_count integer := 0;
    parent_count integer := 0;
    child_count integer := 0;
    orphaned_count integer := 0;
    self_ref_count integer := 0;
BEGIN
    -- Total accounts
    SELECT COUNT(*) INTO total_count
    FROM accounts WHERE build_id = p_build_id;
    
    -- Parent accounts (ultimate_parent_id is NULL or empty)
    SELECT COUNT(*) INTO parent_count
    FROM accounts 
    WHERE build_id = p_build_id 
      AND (ultimate_parent_id IS NULL OR ultimate_parent_id = '');
    
    -- Child accounts (ultimate_parent_id is not NULL and not empty)
    SELECT COUNT(*) INTO child_count
    FROM accounts 
    WHERE build_id = p_build_id 
      AND ultimate_parent_id IS NOT NULL 
      AND ultimate_parent_id != '';
    
    -- Orphaned children (child accounts whose ultimate_parent_id doesn't exist)
    SELECT COUNT(*) INTO orphaned_count
    FROM accounts a1
    WHERE a1.build_id = p_build_id 
      AND a1.ultimate_parent_id IS NOT NULL 
      AND a1.ultimate_parent_id != ''
      AND NOT EXISTS (
        SELECT 1 FROM accounts a2 
        WHERE a2.build_id = p_build_id 
          AND a2.sfdc_account_id = a1.ultimate_parent_id
      );
    
    -- Self-referencing accounts (ultimate_parent_id points to itself)
    SELECT COUNT(*) INTO self_ref_count
    FROM accounts 
    WHERE build_id = p_build_id 
      AND ultimate_parent_id = sfdc_account_id;
    
    RETURN QUERY SELECT total_count, parent_count, child_count, orphaned_count, self_ref_count;
END;
$function$;