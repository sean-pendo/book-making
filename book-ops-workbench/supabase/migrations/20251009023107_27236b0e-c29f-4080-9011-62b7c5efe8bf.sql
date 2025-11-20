-- Add high-priority SMART_BALANCE rule to enforce ARR balance across reps
-- Check if build exists first, then check if a SMART_BALANCE rule already exists for this build
DO $$
DECLARE
    target_build_id UUID := 'e783d327-162a-4962-ba41-4f4df6f71eea';
BEGIN
    -- Only proceed if the build exists
    IF EXISTS (SELECT 1 FROM builds WHERE id = target_build_id) THEN
        
        IF NOT EXISTS (
          SELECT 1 FROM assignment_rules 
          WHERE build_id = target_build_id
          AND rule_type = 'SMART_BALANCE'
        ) THEN
          INSERT INTO assignment_rules (
            build_id,
            rule_type,
            name,
            description,
            priority,
            enabled,
            account_scope,
            conditions,
            scoring_weights
          )
          VALUES (
            target_build_id,
            'SMART_BALANCE',
            'Workload Balance (Primary)',
            'Enforces balanced ARR distribution across all reps. Target: $2M per rep with ±20% variance. Heavily penalizes overloaded reps and rewards underloaded reps to achieve fair distribution.',
            1,  -- Highest priority (lower number = higher weight in scoring)
            true,
            'all',
            jsonb_build_object(
              'targetARR', 2000000,
              'minARR', 1500000,
              'maxARR', 2800000,
              'idealRange', jsonb_build_object('min', 1600000, 'max', 2400000)
            ),
            jsonb_build_object(
              'balanceWeight', 100,
              'underloadBonus', 20,
              'overloadPenalty', 50,
              'arrWeight', 0.7,
              'accountWeight', 0.3
            )
          );
        ELSE
          -- Update existing SMART_BALANCE rule to priority 1 and update weights
          UPDATE assignment_rules
          SET 
            priority = 1,
            enabled = true,
            scoring_weights = jsonb_build_object(
              'balanceWeight', 100,
              'underloadBonus', 20,
              'overloadPenalty', 50,
              'arrWeight', 0.7,
              'accountWeight', 0.3
            ),
            conditions = jsonb_build_object(
              'targetARR', 2000000,
              'minARR', 1500000,
              'maxARR', 2800000,
              'idealRange', jsonb_build_object('min', 1600000, 'max', 2400000)
            )
          WHERE build_id = target_build_id 
          AND rule_type = 'SMART_BALANCE';
        END IF;
        
    END IF;
END $$;