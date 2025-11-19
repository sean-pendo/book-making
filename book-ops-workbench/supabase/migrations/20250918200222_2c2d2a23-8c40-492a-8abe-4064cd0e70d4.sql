-- Create function to sync missing assignment records
CREATE OR REPLACE FUNCTION public.sync_missing_assignments(p_build_id uuid)
RETURNS TABLE(synced_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    result_count integer := 0;
BEGIN
    -- Insert assignment records for accounts that have new_owner_id but no assignment record
    INSERT INTO assignments (
        build_id,
        sfdc_account_id,
        proposed_owner_id,
        proposed_owner_name,
        assignment_type,
        rationale,
        created_by,
        created_at,
        updated_at
    )
    SELECT 
        a.build_id,
        a.sfdc_account_id,
        a.new_owner_id,
        a.new_owner_name,
        CASE WHEN a.is_customer THEN 'customer' ELSE 'prospect' END,
        'DATA_SYNC: Assignment record created to match account owner assignment',
        (SELECT id FROM auth.users LIMIT 1), -- Use first available user as creator
        now(),
        now()
    FROM accounts a
    WHERE a.build_id = p_build_id
      AND a.new_owner_id IS NOT NULL
      AND a.new_owner_id != ''
      AND a.is_parent = true
      AND NOT EXISTS (
        SELECT 1 FROM assignments ass 
        WHERE ass.sfdc_account_id = a.sfdc_account_id 
        AND ass.build_id = p_build_id
      );

    GET DIAGNOSTICS result_count = ROW_COUNT;
    
    RETURN QUERY SELECT result_count;
END;
$function$;