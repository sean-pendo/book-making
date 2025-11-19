-- Create debug function to fetch accounts without RLS restrictions
CREATE OR REPLACE FUNCTION public.debug_get_accounts(p_build_id uuid)
RETURNS TABLE(
  sfdc_account_id text,
  account_name text,
  is_parent boolean,
  arr numeric,
  owner_id text,
  owner_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.sfdc_account_id,
    a.account_name,
    a.is_parent,
    a.arr,
    a.owner_id,
    a.owner_name
  FROM accounts a
  WHERE a.build_id = p_build_id
    AND a.is_parent = true
  ORDER BY a.account_name
  LIMIT 10000;
END;
$$;