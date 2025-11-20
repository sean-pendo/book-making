-- Drop the existing constraint that doesn't include SMART_BALANCE
ALTER TABLE assignment_rules 
DROP CONSTRAINT assignment_rules_rule_type_check;

-- CLEANUP: Migrate deprecated 'LOAD_BALANCE' rules to 'SMART_BALANCE' to prevent constraint violation
UPDATE assignment_rules 
SET rule_type = 'SMART_BALANCE' 
WHERE rule_type = 'LOAD_BALANCE';

-- CLEANUP: Migrate any unknown types to CUSTOM to be safe
UPDATE assignment_rules 
SET rule_type = 'CUSTOM'
WHERE rule_type NOT IN ('GEO_FIRST', 'CONTINUITY', 'TIER_BALANCE', 'ROUND_ROBIN', 'MIN_THRESHOLDS', 'SMART_BALANCE', 'CUSTOM');

-- Add the updated constraint that includes SMART_BALANCE
ALTER TABLE assignment_rules 
ADD CONSTRAINT assignment_rules_rule_type_check 
CHECK (rule_type = ANY (ARRAY['GEO_FIRST'::text, 'CONTINUITY'::text, 'TIER_BALANCE'::text, 'ROUND_ROBIN'::text, 'MIN_THRESHOLDS'::text, 'SMART_BALANCE'::text, 'CUSTOM'::text]));