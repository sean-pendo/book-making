DO $$
BEGIN
    -- 1. Update values inside territoryMappings (Value fix)
    -- Only run if territoryMappings exists and is not null
    IF EXISTS (
        SELECT 1 FROM assignment_rules 
        WHERE rule_type = 'GEO_FIRST' 
        AND conditions ? 'territoryMappings'
    ) THEN
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
        WHERE rule_type = 'GEO_FIRST'
          AND conditions ? 'territoryMappings';
    END IF;

    -- 2. Update keys of territoryMappings (Key fix)
    -- Only run if territoryMappings exists
    IF EXISTS (
        SELECT 1 FROM assignment_rules 
        WHERE rule_type = 'GEO_FIRST' 
        AND conditions ? 'territoryMappings'
    ) THEN
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
        WHERE rule_type = 'GEO_FIRST'
          AND conditions ? 'territoryMappings';
    END IF;
END $$;