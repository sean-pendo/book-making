-- Create a secure function to toggle account lock status
CREATE OR REPLACE FUNCTION public.toggle_account_lock(
  p_account_id text,
  p_build_id uuid,
  p_is_locking boolean,
  p_owner_id text DEFAULT NULL,
  p_owner_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role text;
BEGIN
  -- Check user has permission
  SELECT role::text INTO v_user_role
  FROM profiles
  WHERE id = auth.uid();
  
  IF v_user_role NOT IN ('REVOPS', 'FLM', 'SLM') THEN
    RAISE EXCEPTION 'Insufficient permissions to lock/unlock accounts';
  END IF;
  
  -- Perform the lock/unlock operation
  IF p_is_locking THEN
    -- Lock: Set exclude flag, copy owner to new_owner
    UPDATE accounts
    SET 
      exclude_from_reassignment = true,
      new_owner_id = p_owner_id,
      new_owner_name = p_owner_name
    WHERE sfdc_account_id = p_account_id
      AND build_id = p_build_id;
      
    -- Create or update assignment record
    INSERT INTO assignments (
      sfdc_account_id,
      build_id,
      proposed_owner_id,
      proposed_owner_name,
      rationale,
      assignment_type,
      is_approved,
      created_by
    )
    VALUES (
      p_account_id,
      p_build_id,
      p_owner_id,
      p_owner_name,
      'Locked to current owner',
      'customer',
      true,
      auth.uid()
    )
    ON CONFLICT (sfdc_account_id, build_id)
    DO UPDATE SET
      proposed_owner_id = EXCLUDED.proposed_owner_id,
      proposed_owner_name = EXCLUDED.proposed_owner_name,
      is_approved = true,
      updated_at = now();
  ELSE
    -- Unlock: Clear exclude flag and new_owner fields
    UPDATE accounts
    SET 
      exclude_from_reassignment = false,
      new_owner_id = NULL,
      new_owner_name = NULL
    WHERE sfdc_account_id = p_account_id
      AND build_id = p_build_id;
      
    -- Delete assignment record for unlocked accounts
    DELETE FROM assignments
    WHERE sfdc_account_id = p_account_id
      AND build_id = p_build_id
      AND rationale = 'Locked to current owner';
  END IF;
END;
$$;