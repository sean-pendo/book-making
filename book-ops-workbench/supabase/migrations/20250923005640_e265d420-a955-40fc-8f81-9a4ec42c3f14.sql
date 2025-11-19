-- Fix GEO_FIRST rule territory mappings completely
UPDATE assignment_rules 
SET conditions = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(
                        jsonb_set(
                          jsonb_set(
                            jsonb_set(
                              jsonb_set(
                                jsonb_set(
                                  jsonb_set(
                                    jsonb_set(
                                      jsonb_set(
                                        conditions,
                                        '{territoryMappings,BOSTON}', '"North East"'
                                      ),
                                      '{territoryMappings,"NY E"}', '"North East"'
                                    ),
                                    '{territoryMappings,"NY S"}', '"North East"'
                                  ),
                                  '{territoryMappings,"MID-ATLANTIC"}', '"North East"'
                                ),
                                '{territoryMappings,"NEW ENGLAND"}', '"North East"'
                              ),
                              '{territoryMappings,CHESAPEAKE}', '"South East"'
                            ),
                            '{territoryMappings,"GULF COAST"}', '"South East"'
                          ),
                          '{territoryMappings,"SOUTH EAST"}', '"South East"'
                        ),
                        '{territoryMappings,"GREAT LAKES N-CA"}', '"Central"'
                      ),
                      '{territoryMappings,"GREATER ONTARIO-CA"}', '"Central"'
                    ),
                    '{territoryMappings,"PAC NW-CA"}', '"West"'
                  ),
                  '{territoryMappings,"AUSTRALIA"}', '"Central"'
                ),
                '{territoryMappings,"CHINA"}', '"Central"'
              ),
              '{territoryMappings,"DACH"}', '"Central"'
            ),
            '{territoryMappings,"JAPAN"}', '"Central"'
          ),
          '{territoryMappings,"APAC"}', '"Central"'
        ),
        '{territoryMappings,"EMEA"}', '"Central"'
      ),
      '{territoryMappings,"UK & IRELAND"}', '"Central"'
    ),
    '{territoryMappings,"NORDICS"}', '"Central"'
  ),
  '{territoryMappings,"BENELUX"}', '"Central"'
)
WHERE rule_type = 'GEO_FIRST'
  AND build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea';