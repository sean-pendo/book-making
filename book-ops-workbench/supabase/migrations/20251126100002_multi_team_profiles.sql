-- Add teams array column to profiles for multi-team membership
-- Users can belong to multiple teams (AMER, EMEA, APAC)

-- Add the teams array column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS teams text[] DEFAULT ARRAY['AMER'];

-- Migrate existing team value to teams array
UPDATE profiles 
SET teams = ARRAY[COALESCE(team, 'AMER')]
WHERE teams IS NULL OR teams = '{}';

-- Add index for faster team membership queries
CREATE INDEX IF NOT EXISTS idx_profiles_teams ON profiles USING GIN(teams);

-- Comment for documentation
COMMENT ON COLUMN profiles.teams IS 'Array of team memberships. Users can belong to multiple teams: AMER, EMEA, APAC.';

-- Note: We keep the old 'team' column for backward compatibility
-- but 'teams' array is now the source of truth for multi-team support

