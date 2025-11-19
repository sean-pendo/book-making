-- Update assignment rules to standardize region names to match sales_reps table
UPDATE assignment_rules 
SET conditions = jsonb_set(
  jsonb_set(
    conditions,
    '{territoryMappings,Northeast}',
    to_jsonb((conditions->'territoryMappings'->>'Northeast')),
    false
  ),
  '{territoryMappings,"North East"}',
  conditions->'territoryMappings'->'Northeast',
  true
)
WHERE rule_type = 'GEO_FIRST' 
  AND conditions->'territoryMappings' ? 'Northeast';

UPDATE assignment_rules 
SET conditions = jsonb_set(
  jsonb_set(
    conditions,
    '{territoryMappings,Southeast}',
    to_jsonb((conditions->'territoryMappings'->>'Southeast')),
    false
  ),
  '{territoryMappings,"South East"}',
  conditions->'territoryMappings'->'Southeast',
  true
)
WHERE rule_type = 'GEO_FIRST' 
  AND conditions->'territoryMappings' ? 'Southeast';

-- Remove old keys
UPDATE assignment_rules 
SET conditions = conditions #- '{territoryMappings,Northeast}'
WHERE rule_type = 'GEO_FIRST' 
  AND conditions->'territoryMappings' ? 'Northeast';

UPDATE assignment_rules 
SET conditions = conditions #- '{territoryMappings,Southeast}'
WHERE rule_type = 'GEO_FIRST' 
  AND conditions->'territoryMappings' ? 'Southeast';