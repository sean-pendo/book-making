-- Fix the handle_new_user trigger to use role/region from user metadata
-- Previously it was hardcoding 'REVOPS' role, ignoring user selection

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role_value user_role;
BEGIN
  -- Get role from metadata, default to REVOPS if not provided
  -- Also ensure it's uppercase
  BEGIN
    user_role_value := UPPER(COALESCE(NEW.raw_user_meta_data->>'role', 'REVOPS'))::user_role;
  EXCEPTION WHEN OTHERS THEN
    user_role_value := 'REVOPS'::user_role;
  END;

  -- Create profile using metadata values
  INSERT INTO public.profiles (id, email, role, region, full_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    user_role_value,
    UPPER(COALESCE(NEW.raw_user_meta_data->>'region', 'GLOBAL')),
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    now(),
    now()
  );
  RETURN NEW;
END;
$$;

