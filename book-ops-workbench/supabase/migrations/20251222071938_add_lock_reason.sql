-- Migration: add_lock_reason_column
-- Purpose: Add lock_reason field for manual account locks and update toggle_account_lock RPC

-- 1. Add the column with length constraint
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS lock_reason VARCHAR(500);

-- 2. Update the RPC function to accept and clear lock_reason
CREATE OR REPLACE FUNCTION public.toggle_account_lock(
  p_account_id text,
  p_build_id uuid,
  p_is_locking boolean,
  p_owner_id text DEFAULT NULL,
  p_owner_name text DEFAULT NULL,
  p_lock_reason text DEFAULT NULL  -- NEW parameter
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
  
  IF p_is_locking THEN
    -- Lock: Set exclude flag, copy owner to new_owner, store reason
    UPDATE accounts
    SET 
      exclude_from_reassignment = true,
      new_owner_id = p_owner_id,
      new_owner_name = p_owner_name,
      lock_reason = p_lock_reason  -- NEW: store reason
    WHERE sfdc_account_id = p_account_id
      AND build_id = p_build_id;
      
    -- Create or update assignment record
    -- NOTE: Keep rationale simple "Locked to current owner" - don't include lock_reason
    -- This prevents breaking the DELETE match below
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
    -- Unlock: Clear exclude flag, new_owner fields, AND lock_reason
    UPDATE accounts
    SET 
      exclude_from_reassignment = false,
      new_owner_id = NULL,
      new_owner_name = NULL,
      lock_reason = NULL  -- CRITICAL: Clear reason on unlock!
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

