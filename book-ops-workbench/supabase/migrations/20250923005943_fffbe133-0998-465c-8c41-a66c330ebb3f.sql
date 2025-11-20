-- Add missing territory mappings to GEO_FIRST rule (UKI, Singapore, LATAM, and NULL handling)
-- Wrapped in DO block to avoid errors on fresh database
DO $$
DECLARE
    target_build_id UUID := 'e783d327-162a-4962-ba41-4f4df6f71eea';
BEGIN
    -- Only proceed if the build exists
    IF EXISTS (SELECT 1 FROM builds WHERE id = target_build_id) THEN
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
          AND build_id = target_build_id;
    END IF;
END $$;
