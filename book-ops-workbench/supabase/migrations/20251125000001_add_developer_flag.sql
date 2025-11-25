-- Migration: Add developer flag to profiles table
-- This flag controls access to the Role Permissions Manager panel
-- It should ONLY be set directly in Supabase, not through the UI

-- Add developer column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS developer boolean DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN profiles.developer IS 'Developer flag - grants access to Role Permissions Manager. Must be set directly in Supabase for security.';

-- Create a policy to prevent non-service-role updates to developer column
-- This ensures only direct database access can modify the developer flag
CREATE OR REPLACE FUNCTION prevent_developer_self_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If developer flag is being changed and it's not a service role
  IF OLD.developer IS DISTINCT FROM NEW.developer THEN
    -- Check if this is being done by the user themselves (not an admin operation)
    IF auth.uid() = NEW.id THEN
      RAISE EXCEPTION 'Users cannot modify their own developer status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS prevent_developer_self_update_trigger ON profiles;

-- Create trigger
CREATE TRIGGER prevent_developer_self_update_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_developer_self_update();

