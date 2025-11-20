-- Wrap in DO block to avoid errors on fresh database
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
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(
                        conditions,
                        '{territory_mappings,BOSTON}', '"North East"'
                      ),
                      '{territory_mappings,"NY E"}', '"North East"'
                    ),
                    '{territory_mappings,"NY S"}', '"North East"'
                  ),
                  '{territory_mappings,"MID-ATLANTIC"}', '"North East"'
                ),
                '{territory_mappings,"NEW ENGLAND"}', '"North East"'
              ),
              '{territory_mappings,CHESAPEAKE}', '"South East"'
            ),
            '{territory_mappings,"GULF COAST"}', '"South East"'
          ),
          '{territory_mappings,"SOUTH EAST"}', '"South East"'
        )
        WHERE rule_type = 'GEO_FIRST'
          AND build_id = target_build_id;
    END IF;
END $$;