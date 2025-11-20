-- Fix territory mappings to use UPPERCASE keys matching database values
-- This ensures case-sensitive matching works correctly

DO $$
DECLARE
    target_build_id UUID := 'e783d327-162a-4962-ba41-4f4df6f71eea';
BEGIN
    -- Only proceed if the build exists
    IF EXISTS (SELECT 1 FROM builds WHERE id = target_build_id) THEN
        
        -- Update territory_mappings for direct access (removed value_mappings - column doesn't exist)
        UPDATE assignment_configuration
        SET territory_mappings = jsonb_build_object(
          'AUSTIN - HOUSTON', 'Central',
          'AUSTIN-HOUSTON', 'Central',
          'AUSTRALIA', 'West',
          'BOSTON', 'North East',
          'CALIFORNIA', 'West',
          'CHESAPEAKE', 'South East',
          'CHICAGO', 'Central',
          'CHINA', 'West',
          'DACH', 'West',
          'FLORIDA', 'South East',
          'FRANCE', 'West',
          'GREAT LAKES N-CA', 'Central',
          'GREAT LAKES N-US', 'Central',
          'GREAT LAKES S', 'Central',
          'GREATER ONTARIO-CA', 'North East',
          'GULF COAST', 'South East',
          'ISRAEL', 'West',
          'JAPAN', 'West',
          'LATAM', 'West',
          'LOS ANGELES', 'West',
          'MID-ATLANTIC', 'North East',
          'MID-WEST', 'Central',
          'MIDWEST', 'Central',
          'MOUNTAIN', 'West',
          'NEW ENGLAND', 'North East',
          'NEW YORK', 'North East',
          'NOR CAL', 'West',
          'NORTHEAST', 'North East',
          'NORTHERN CALIFORNIA', 'West',
          'NY E', 'North East',
          'NY S', 'North East',
          'PAC NW', 'West',
          'PAC NW-CA', 'West',
          'PAC NW-US', 'West',
          'PACIFIC NORTHWEST', 'West',
          'SAN FRANCISCO', 'West',
          'SINGAPORE', 'West',
          'SO CAL', 'West',
          'SOUTH EAST', 'South East',
          'SOUTHEAST', 'South East',
          'SOUTHERN CALIFORNIA', 'West',
          'SOUTHWEST', 'West',
          'TEXAS', 'Central',
          'UKI', 'West'
        )
        WHERE build_id = target_build_id;
        
    END IF;
END $$;