-- Fix NULL region for Jaime Pollara - assign to North East region
UPDATE sales_reps 
SET region = 'North East'
WHERE name = 'Jaime Pollara' 
  AND region IS NULL;

-- Update assignment rules to fix territory mappings and implement $2M cutoff
UPDATE assignment_rules 
SET conditions = jsonb_set(
  conditions,
  '{hardCutoffThreshold}',
  '2000000'::jsonb
)
WHERE rule_type = 'MIN_THRESHOLDS';

-- Also update any GEO_FIRST rules that might have old territory mappings
UPDATE assignment_rules 
SET conditions = jsonb_set(
  jsonb_set(
    jsonb_set(
      conditions,
      '{regionMappings,Northeast}',
      '"North East"'::jsonb
    ),
    '{regionMappings,Southeast}',
    '"South East"'::jsonb
  ),
  '{hardCutoffThreshold}',
  '2000000'::jsonb
)
WHERE rule_type = 'GEO_FIRST';