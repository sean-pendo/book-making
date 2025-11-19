-- Drop existing check constraint
ALTER TABLE assignment_rules 
DROP CONSTRAINT IF EXISTS assignment_rules_behavior_class_check;

-- Add new check constraint that includes all existing values plus FINAL_ARBITER
ALTER TABLE assignment_rules
ADD CONSTRAINT assignment_rules_behavior_class_check 
CHECK (behavior_class IN ('STANDARD', 'PRIMARY_ASSIGNER', 'POST_PROCESSOR', 'FINAL_ARBITER', 'CONDITIONAL', 'CONSTRAINT', 'TIEBREAKER'));

-- Update the AI rule from POST_PROCESSOR to FINAL_ARBITER
UPDATE assignment_rules
SET behavior_class = 'FINAL_ARBITER',
    updated_at = now()
WHERE rule_type = 'AI_BALANCER' 
  AND behavior_class = 'POST_PROCESSOR';