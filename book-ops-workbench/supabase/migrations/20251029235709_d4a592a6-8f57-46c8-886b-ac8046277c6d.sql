-- Backfill geo field for existing accounts based on sales_territory
UPDATE accounts
SET geo = CASE
  -- North East territories
  WHEN sales_territory = 'BOSTON' THEN 'North East'
  WHEN sales_territory = 'NEW ENGLAND' THEN 'North East'
  WHEN sales_territory = 'NY E' THEN 'North East'
  WHEN sales_territory = 'NY S' THEN 'North East'
  
  -- South East territories
  WHEN sales_territory = 'CHESAPEAKE' THEN 'South East'
  WHEN sales_territory = 'MID-ATLANTIC' THEN 'South East'
  WHEN sales_territory = 'SOUTH EAST' THEN 'South East'
  WHEN sales_territory = 'GULF COAST' THEN 'South East'
  WHEN sales_territory = 'AUSTIN - HOUSTON' THEN 'South East'
  WHEN sales_territory = 'LATAM' THEN 'South East'
  
  -- Central territories
  WHEN sales_territory = 'CHICAGO' THEN 'Central'
  WHEN sales_territory = 'GREAT LAKES N-CA' THEN 'Central'
  WHEN sales_territory = 'GREAT LAKES N-US' THEN 'Central'
  WHEN sales_territory = 'GREAT LAKES S' THEN 'Central'
  WHEN sales_territory = 'GREATER ONTARIO-CA' THEN 'Central'
  WHEN sales_territory = 'MID-WEST' THEN 'Central'
  WHEN sales_territory = 'MOUNTAIN' THEN 'Central'
  WHEN sales_territory = 'SOUTHWEST' THEN 'Central'
  
  -- West territories (including international)
  WHEN sales_territory = 'LOS ANGELES' THEN 'West'
  WHEN sales_territory = 'NOR CAL' THEN 'West'
  WHEN sales_territory = 'PAC NW-CA' THEN 'West'
  WHEN sales_territory = 'PAC NW-US' THEN 'West'
  WHEN sales_territory = 'SAN FRANCISCO' THEN 'West'
  WHEN sales_territory = 'SO CAL' THEN 'West'
  WHEN sales_territory = 'Australia' THEN 'West'
  WHEN sales_territory = 'Benelux' THEN 'West'
  WHEN sales_territory = 'China' THEN 'West'
  WHEN sales_territory = 'DACH' THEN 'West'
  WHEN sales_territory = 'France' THEN 'West'
  WHEN sales_territory = 'Israel' THEN 'West'
  WHEN sales_territory = 'JAPAN' THEN 'West'
  WHEN sales_territory = 'Middle East' THEN 'West'
  WHEN sales_territory = 'Singapore' THEN 'West'
  WHEN sales_territory = 'UKI' THEN 'West'
  
  ELSE geo
END
WHERE build_id = '8b6c493f-23f4-4d96-94b4-c82f8db020e7'
  AND geo IS NULL
  AND sales_territory IS NOT NULL;