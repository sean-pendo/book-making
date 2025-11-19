-- Fix assignment rule priority order for build e783d327-162a-4962-ba41-4f4df6f71eea
-- Target order: GEO_FIRST(1), CRE_BALANCE(2), TIER_BALANCE(3), CONTINUITY(4), AI_BALANCER(5)

-- Step 1: Move CONTINUITY to temporary priority to avoid conflicts
UPDATE assignment_rules 
SET priority = 999 
WHERE id = '23bd4ca9-b5a9-4838-a3fd-556e5dc4fbd7' 
  AND build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea';

-- Step 2: Move CRE_BALANCE from Priority 3 to Priority 2
UPDATE assignment_rules 
SET priority = 2 
WHERE id = '320568ba-4b1c-4807-8728-df99a9e68633' 
  AND build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea';

-- Step 3: Move TIER_BALANCE from Priority 4 to Priority 3
UPDATE assignment_rules 
SET priority = 3 
WHERE id = '27096c11-684f-4919-929a-1db14f171479' 
  AND build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea';

-- Step 4: Move CONTINUITY from Priority 999 to Priority 4
UPDATE assignment_rules 
SET priority = 4 
WHERE id = '23bd4ca9-b5a9-4838-a3fd-556e5dc4fbd7' 
  AND build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea';

-- Verify final order
SELECT id, name, rule_type, priority, enabled
FROM assignment_rules 
WHERE build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea'
ORDER BY priority ASC;