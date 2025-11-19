-- Fix 1: Make SMART_BALANCE dominant by adjusting priorities
-- Set SMART_BALANCE to priority 0.5 (highest priority)
UPDATE assignment_rules 
SET priority = 0.5
WHERE build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea'::uuid 
AND rule_type = 'SMART_BALANCE';

-- Set GEO_FIRST to priority 3 (lower priority)
UPDATE assignment_rules
SET priority = 3
WHERE build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea'::uuid 
AND rule_type = 'GEO_FIRST';

-- Verify the changes
DO $$
DECLARE
  smart_priority integer;
  geo_priority integer;
BEGIN
  SELECT priority INTO smart_priority 
  FROM assignment_rules 
  WHERE build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea'::uuid 
  AND rule_type = 'SMART_BALANCE';
  
  SELECT priority INTO geo_priority 
  FROM assignment_rules 
  WHERE build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea'::uuid 
  AND rule_type = 'GEO_FIRST';
  
  RAISE NOTICE 'Updated priorities - SMART_BALANCE: %, GEO_FIRST: %', smart_priority, geo_priority;
END $$;