-- Create RPC function for batch updating account owners
-- This enables updating hundreds of accounts in a single transaction instead of one-by-one
CREATE OR REPLACE FUNCTION public.batch_update_account_owners(
  p_build_id UUID,
  p_updates JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  -- Perform bulk update using JSONB data
  UPDATE accounts
  SET 
    new_owner_id = (updates.value->>'new_owner_id')::TEXT,
    new_owner_name = (updates.value->>'new_owner_name')::TEXT,
    updated_at = NOW()
  FROM jsonb_each(p_updates) AS updates
  WHERE accounts.build_id = p_build_id
    AND accounts.sfdc_account_id = (updates.key)::TEXT;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RETURN updated_count;
END;
$$;