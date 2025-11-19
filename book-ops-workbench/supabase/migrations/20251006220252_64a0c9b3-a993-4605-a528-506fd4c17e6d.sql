-- Add AI_BALANCER to allowed rule types
ALTER TABLE assignment_rules 
DROP CONSTRAINT IF EXISTS assignment_rules_rule_type_check;

ALTER TABLE assignment_rules 
ADD CONSTRAINT assignment_rules_rule_type_check 
CHECK (rule_type IN (
  'GEO_FIRST', 
  'CONTINUITY', 
  'TIER_BALANCE', 
  'ROUND_ROBIN', 
  'MIN_THRESHOLDS', 
  'SMART_BALANCE', 
  'CUSTOM',
  'AI_BALANCER'
));

-- Add POST_PROCESSOR to behavior_class constraint (include CONDITIONAL which exists in data)
ALTER TABLE assignment_rules 
DROP CONSTRAINT IF EXISTS assignment_rules_behavior_class_check;

ALTER TABLE assignment_rules 
ADD CONSTRAINT assignment_rules_behavior_class_check 
CHECK (behavior_class IN (
  'STANDARD', 
  'CONSTRAINT', 
  'TIEBREAKER', 
  'OVERRIDE',
  'CONDITIONAL',
  'POST_PROCESSOR'
));