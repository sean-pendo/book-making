-- First, drop the existing check constraint
ALTER TABLE assignment_rules DROP CONSTRAINT IF EXISTS assignment_rules_rule_type_check;

-- Add the updated constraint with new rule types
ALTER TABLE assignment_rules ADD CONSTRAINT assignment_rules_rule_type_check 
CHECK (rule_type IN (
  'GEO_FIRST',
  'MIN_THRESHOLDS',
  'CONTINUITY',
  'SMART_BALANCE',
  'ROUND_ROBIN',
  'AI_BALANCER',
  'TIER_BALANCE',
  'CRE_BALANCE'
));

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
  'e783d327-162a-4962-ba41-4f4df6f71eea'::uuid,
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
  'e783d327-162a-4962-ba41-4f4df6f71eea'::uuid,
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
WHERE build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea'::uuid
  AND rule_type = 'AI_BALANCER';