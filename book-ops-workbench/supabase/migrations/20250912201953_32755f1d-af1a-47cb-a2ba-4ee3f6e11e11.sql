-- Add MIN_THRESHOLDS to the rule_type check constraint
ALTER TABLE assignment_rules DROP CONSTRAINT IF EXISTS assignment_rules_rule_type_check;

-- Add the new constraint with MIN_THRESHOLDS included
ALTER TABLE assignment_rules ADD CONSTRAINT assignment_rules_rule_type_check 
CHECK (rule_type IN ('GEO_FIRST', 'CONTINUITY', 'TIER_BALANCE', 'ROUND_ROBIN', 'MIN_THRESHOLDS', 'CUSTOM', 'LOAD_BALANCE'));

-- Now create the default minimum thresholds rule
INSERT INTO assignment_rules (build_id, name, priority, rule_type, conditions, enabled, description, created_at, updated_at)
SELECT 
  b.id as build_id,
  'Minimum Thresholds - Default' as name,
  1 as priority,
  'MIN_THRESHOLDS' as rule_type,
  '{"minParentAccounts": 800, "minCustomerARR": 5000000, "maxVariancePercent": 15}' as conditions,
  true as enabled,
  'Default minimum thresholds: 800 min parent accounts per rep, $5M min customer ARR per rep, with ±15% variance tolerance' as description,
  now() as created_at,
  now() as updated_at
FROM builds b
WHERE NOT EXISTS (
  SELECT 1 FROM assignment_rules ar 
  WHERE ar.build_id = b.id AND ar.rule_type = 'MIN_THRESHOLDS'
);