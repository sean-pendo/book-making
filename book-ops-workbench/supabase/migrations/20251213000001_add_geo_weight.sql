-- Add geo_weight column to assignment_configuration
-- Controls how strongly geographic proximity is weighted in assignment optimization
-- 0.0 = ignore geography entirely (pure balancing)
-- 1.0 = geography is critical (strongly prefer exact geo matches)
-- Default 0.3 = moderate preference for geographic match

ALTER TABLE assignment_configuration 
ADD COLUMN IF NOT EXISTS geo_weight NUMERIC DEFAULT 0.3;

-- Add comment for documentation
COMMENT ON COLUMN assignment_configuration.geo_weight IS 
  'Weight for geographic scoring in assignment optimization (0.0-1.0). Higher values prefer exact geo matches.';





