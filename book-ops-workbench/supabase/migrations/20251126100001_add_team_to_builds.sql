-- Add team column to builds table for workspace isolation
-- Each build belongs to one team (AMER, EMEA, APAC)

-- Add the team column with default 'AMER'
ALTER TABLE builds ADD COLUMN IF NOT EXISTS team text NOT NULL DEFAULT 'AMER';

-- Add constraint to ensure valid team values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'builds_team_check'
  ) THEN
    ALTER TABLE builds ADD CONSTRAINT builds_team_check 
      CHECK (team IN ('AMER', 'EMEA', 'APAC'));
  END IF;
END $$;

-- Ensure all existing builds have AMER as team (redundant with default but explicit)
UPDATE builds SET team = 'AMER' WHERE team IS NULL;

-- Add index for faster team-based queries
CREATE INDEX IF NOT EXISTS idx_builds_team ON builds(team);

-- Comment for documentation
COMMENT ON COLUMN builds.team IS 'Regional team workspace: AMER, EMEA, or APAC. Builds are isolated by team.';

