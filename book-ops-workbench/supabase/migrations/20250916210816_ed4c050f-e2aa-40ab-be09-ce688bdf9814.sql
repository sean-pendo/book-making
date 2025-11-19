-- Update the GEO_FIRST rule to map sales territories to regions properly
UPDATE assignment_rules 
SET conditions = '{
  "territoryMappings": {
    "West": ["NOR CAL", "SO CAL", "LOS ANGELES", "SAN FRANCISCO", "PAC NW-US", "PAC NW-CA", "MOUNTAIN"],
    "Central": ["AUSTIN - HOUSTON", "MID-WEST", "CHICAGO", "GULF COAST", "SOUTHWEST"],
    "North East": ["NEW ENGLAND", "BOSTON", "NY E", "NY S", "MID-ATLANTIC", "CHESAPEAKE"],
    "South East": ["SOUTH EAST", "GREAT LAKES S", "GREAT LAKES N-US", "GREAT LAKES N-CA"]
  },
  "priorityWeights": {
    "SAME_REGION": 100,
    "ADJACENT_REGION": 50,
    "ANY_REGION": 10
  },
  "fallbackStrategy": "NEAREST_REGION"
}'::jsonb
WHERE rule_type = 'GEO_FIRST' AND build_id = '8fc766cc-b091-44b6-bd1c-4d5f9b8409dd';