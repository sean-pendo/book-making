-- Replace team with region for workspace isolation
-- Builds will be filtered by region (GLOBAL, AMER, EMEA, APAC)

-- Add region column to builds if it doesn't exist
ALTER TABLE builds ADD COLUMN IF NOT EXISTS region text DEFAULT 'GLOBAL';

-- Copy team values to region (if team exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'builds' AND column_name = 'team') THEN
    UPDATE builds SET region = COALESCE(team, 'GLOBAL') WHERE region IS NULL OR region = 'GLOBAL';
  END IF;
END $$;

-- Drop team column from builds
ALTER TABLE builds DROP COLUMN IF EXISTS team;

-- Drop teams array from profiles
ALTER TABLE profiles DROP COLUMN IF EXISTS teams;

-- Ensure all builds have a region
UPDATE builds SET region = 'GLOBAL' WHERE region IS NULL;

-- Ensure builds.region has a NOT NULL constraint
ALTER TABLE builds ALTER COLUMN region SET NOT NULL;
ALTER TABLE builds ALTER COLUMN region SET DEFAULT 'GLOBAL';

-- Add comment for documentation
COMMENT ON COLUMN builds.region IS 'Regional workspace: GLOBAL (all users), AMER, EMEA, or APAC. Non-REVOPS users only see builds matching their profile region.';

