-- Build-specific data updates (only if build exists)
DO $$
DECLARE
    target_build_id UUID := 'e783d327-162a-4962-ba41-4f4df6f71eea';
BEGIN
    -- Only proceed if the build exists
    IF EXISTS (SELECT 1 FROM builds WHERE id = target_build_id) THEN
        
        -- Add TIER_BALANCE rule (Priority 4)
        INSERT INTO assignment_rules (
          id,
          build_id,
          name,
          rule_type,
          priority,
          description,
          account_scope,
          conditions,
          scoring_weights,
          enabled,
          created_by
        )
        VALUES (
          gen_random_uuid(),
          target_build_id,
          'Tier Balance Distribution',
          'TIER_BALANCE',
          4,
          'Distributes enterprise vs commercial accounts evenly across reps',
          'all',
          '{"tierField": "enterprise_vs_commercial", "targetEnterpriseRatio": 0.6}'::jsonb,
          '{"tierBalanceWeight": 40, "tierMismatchPenalty": 15}'::jsonb,
          true,
          (SELECT id FROM auth.users LIMIT 1)
        );

        -- Add CRE_BALANCE rule (Priority 5)
        INSERT INTO assignment_rules (
          id,
          build_id,
          name,
          rule_type,
          priority,
          description,
          account_scope,
          conditions,
          scoring_weights,
          enabled,
          created_by
        )
        VALUES (
          gen_random_uuid(),
          target_build_id,
          'CRE Risk Distribution',
          'CRE_BALANCE',
          5,
          'Distributes high-risk CRE accounts evenly to prevent overload',
          'all',
          '{"maxCREPerRep": 3, "creField": "cre_count"}'::jsonb,
          '{"creBalanceWeight": 30, "creOverloadPenalty": 50}'::jsonb,
          true,
          (SELECT id FROM auth.users LIMIT 1)
        );

        -- Update AI_BALANCER rule to include ARR thresholds
        UPDATE assignment_rules
        SET 
          conditions = jsonb_set(
            jsonb_set(
              conditions,
              '{maxARRThreshold}',
              '2500000'::jsonb
            ),
            '{allowMegaAccounts}',
            'true'::jsonb
          ),
          updated_at = now()
        WHERE build_id = target_build_id
          AND rule_type = 'AI_BALANCER';
          
    END IF;
END $$;