-- Fix all remaining territory mappings that still use old region names
-- Update individual territory mappings that point to "Northeast" to use "North East"
UPDATE assignment_rules 
SET conditions = jsonb_set(
  conditions,
  '{territoryMappings}',
  (
    SELECT jsonb_object_agg(
      key,
      CASE 
        WHEN value::text = '"Northeast"' THEN '"North East"'
        WHEN value::text = '"Southeast"' THEN '"South East"'
        ELSE value
      END
    )
    FROM jsonb_each(conditions->'territoryMappings')
  )
)
WHERE rule_type = 'GEO_FIRST';

-- Also update any region-based mapping arrays that might exist
UPDATE assignment_rules 
SET conditions = jsonb_set(
  conditions,
  '{territoryMappings}',
  (
    SELECT jsonb_object_agg(
      CASE 
        WHEN key = 'Northeast' THEN 'North East'
        WHEN key = 'Southeast' THEN 'South East'
        ELSE key
      END,
      value
    )
    FROM jsonb_each(conditions->'territoryMappings')
  )
)
WHERE rule_type = 'GEO_FIRST';