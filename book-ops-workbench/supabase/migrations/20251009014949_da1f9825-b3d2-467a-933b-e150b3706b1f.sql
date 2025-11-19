-- Phase 2A: Update TIER_BALANCE rule to use initial_sale_tier instead of enterprise_vs_commercial
UPDATE assignment_rules 
SET conditions = jsonb_set(
  conditions, 
  '{fieldMappings}', 
  '{
    "tierField": "initial_sale_tier",
    "tier1Value": "Tier 1",
    "tier2Value": "Tier 2", 
    "tier3Value": "Tier 3",
    "tier4Value": "Tier 4"
  }'::jsonb
)
WHERE id = '27096c11-684f-4919-929a-1db14f171479'
  AND build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea';

-- Verify the update
SELECT id, name, rule_type, priority, 
       conditions->'fieldMappings' as field_mappings
FROM assignment_rules 
WHERE id = '27096c11-684f-4919-929a-1db14f171479'
  AND build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea';