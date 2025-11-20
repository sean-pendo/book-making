-- CLEANUP: Ensure all rows have valid behavior_class before applying constraint
UPDATE assignment_rules
SET behavior_class = 'STANDARD'
WHERE behavior_class IS NULL 
   OR behavior_class NOT IN ('STANDARD', 'POST_PROCESSOR', 'PRE_PROCESSOR', 'PRIMARY_ASSIGNER', 'TIEBREAKER', 'CONDITIONAL', 'CONSTRAINT');

-- Add PRIMARY_ASSIGNER to behavior_class allowed values (include all existing values)
ALTER TABLE assignment_rules DROP CONSTRAINT IF EXISTS assignment_rules_behavior_class_check;

ALTER TABLE assignment_rules ADD CONSTRAINT assignment_rules_behavior_class_check 
CHECK (behavior_class IN ('STANDARD', 'POST_PROCESSOR', 'PRE_PROCESSOR', 'PRIMARY_ASSIGNER', 'TIEBREAKER', 'CONDITIONAL', 'CONSTRAINT'));

-- Configure the Single AI-Powered Assignment Rule
DO $$
DECLARE
    target_build_id UUID := 'e783d327-162a-4962-ba41-4f4df6f71eea';
BEGIN
    -- Only proceed if the build exists
    IF EXISTS (SELECT 1 FROM builds WHERE id = target_build_id) THEN
        
        -- Disable existing Geographic Assignment and Account Continuity rules
        UPDATE assignment_rules
        SET enabled = false
        WHERE rule_type IN ('GEO_FIRST', 'CONTINUITY')
          AND build_id = target_build_id;

        -- Update AI Balancer rule to be the primary assigner
        UPDATE assignment_rules
        SET 
          name = 'AI Balanced Assignment',
          priority = 1,
          behavior_class = 'PRIMARY_ASSIGNER',
          enabled = true,
          conditions = jsonb_build_object(
            'minARRThreshold', 1200000,
            'targetARRThreshold', 1300000,
            'maxARRThreshold', 3000000,
            'maxCREPerRep', 3,
            'geoPreference', true,
            'continuityPreference', true,
            'balancingMode', 'strict',
            'assignmentMode', 'FULL_ASSIGNMENT'
          ),
          description = 'AI-powered assignment that balances ARR ($1.2M-$1.3M minimum), limits CRE risk (max 3 per rep), and prefers geographic match and account continuity'
        WHERE rule_type = 'AI_BALANCER'
          AND build_id = target_build_id;
          
    END IF;
END $$;