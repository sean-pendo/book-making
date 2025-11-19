-- Create a profile for the current authenticated user if none exists
-- This addresses the issue where users can't create builds due to missing profiles

-- First, let's create a function to safely create a profile for a user
CREATE OR REPLACE FUNCTION public.create_user_profile(
  user_id uuid,
  user_email text,
  user_role user_role DEFAULT 'REVOPS'::user_role,
  user_region text DEFAULT 'GLOBAL'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Create trigger function to automatically create profiles for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile with REVOPS role by default (can be changed later)
  INSERT INTO public.profiles (id, email, role, region, full_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    'REVOPS'::user_role,
    'GLOBAL',
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    now(),
    now()
  );
  RETURN NEW;
END;
$$;

-- Create trigger to automatically create profiles for new users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Update the profiles table to allow INSERT for the trigger
-- (The existing RLS policy only allows SELECT and UPDATE)
CREATE POLICY "Allow system to create profiles"
ON public.profiles
FOR INSERT
WITH CHECK (true);