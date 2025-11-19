-- Fix the security warning by updating function search paths
CREATE OR REPLACE FUNCTION public.create_user_profile(
  user_id uuid,
  user_email text,
  user_role user_role DEFAULT 'REVOPS'::user_role,
  user_region text DEFAULT 'GLOBAL'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert profile if it doesn't exist
  INSERT INTO public.profiles (id, email, role, region, full_name, created_at, updated_at)
  VALUES (
    user_id,
    user_email,
    user_role,
    user_region,
    'Admin User', -- Default name
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING; -- Don't update if already exists
END;
$$;