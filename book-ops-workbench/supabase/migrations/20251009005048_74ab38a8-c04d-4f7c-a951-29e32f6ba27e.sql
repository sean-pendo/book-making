-- Fix assignment rule priorities: Swap CRE and CONTINUITY
-- This ensures CRE_BALANCE runs before TIER_BALANCE, and CONTINUITY runs last

-- Move CRE_BALANCE from Priority 4 → Priority 2
UPDATE assignment_rules 
SET priority = 2 
WHERE id = '320568ba-4b1c-4807-8728-df99a9e68633'
  AND build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea';

-- Move CONTINUITY from Priority 2 → Priority 4
UPDATE assignment_rules 
SET priority = 4 
WHERE id = '23bd4ca9-b5a9-4838-a3fd-556e5dc4fbd7'
  AND build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea';