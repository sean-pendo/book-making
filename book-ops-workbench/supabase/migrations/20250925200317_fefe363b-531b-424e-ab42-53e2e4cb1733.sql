-- Drop the existing constraint that doesn't include SMART_BALANCE
ALTER TABLE assignment_rules 
DROP CONSTRAINT assignment_rules_rule_type_check;

-- Add the updated constraint that includes SMART_BALANCE
ALTER TABLE assignment_rules 
ADD CONSTRAINT assignment_rules_rule_type_check 
CHECK (rule_type = ANY (ARRAY['GEO_FIRST'::text, 'CONTINUITY'::text, 'TIER_BALANCE'::text, 'ROUND_ROBIN'::text, 'MIN_THRESHOLDS'::text, 'SMART_BALANCE'::text, 'CUSTOM'::text]));