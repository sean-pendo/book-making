-- Add missing territory mappings to GEO_FIRST rule (UKI, Singapore, LATAM, and NULL handling)
UPDATE assignment_rules 
SET conditions = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        conditions,
        '{territoryMappings,UKI}', '"Central"'
      ),
      '{territoryMappings,Singapore}', '"Central"'
    ),
    '{territoryMappings,LATAM}', '"Central"'
  ),
  '{territoryMappings,null}', '"Central"'
)
WHERE rule_type = 'GEO_FIRST'
  AND build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea';