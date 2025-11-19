-- Phase 1 & 2: Update existing Smart Balance rule to be more aggressive with customer balancing
UPDATE assignment_rules 
SET conditions = jsonb_set(
  jsonb_set(
    jsonb_set(conditions, '{maxAccountsPerRep}', '15'),
    '{maxARRPerRep}', '8000000'
  ),
  '{maxVariance}', '10'
)
WHERE build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea' 
  AND rule_type = 'SMART_BALANCE';

-- Phase 3: Add Round Robin Distribution Rule (Priority 4) using existing ROUND_ROBIN type
INSERT INTO assignment_rules (
  id,
  build_id,
  name,
  rule_type,
  priority,
  conditions,
  enabled,
  account_scope,
  description,
  created_by
) VALUES (
  gen_random_uuid(),
  'e783d327-162a-4962-ba41-4f4df6f71eea',
  'Round Robin Balance',
  'ROUND_ROBIN',
  4,
  '{"distributeEvenly": true, "respectMaxLimits": true, "ensureMinimum": 3, "maxAccountsPerRep": 15}',
  true,
  'customers',
  'Ensures even distribution of customer accounts with minimum 3 per active rep',
  (SELECT id FROM auth.users LIMIT 1)
);

-- Phase 4: Add a final MIN_THRESHOLDS rule to catch any remaining imbalances
INSERT INTO assignment_rules (
  id,
  build_id,
  name,
  rule_type,
  priority,
  conditions,
  enabled,
  account_scope,
  description,
  created_by
) VALUES (
  gen_random_uuid(),
  'e783d327-162a-4962-ba41-4f4df6f71eea',
  'Balance Enforcement',
  'MIN_THRESHOLDS',
  5,
  '{"minCustomerARR": 500000, "customersOnly": true, "forceRebalance": true, "maxAccountsPerRep": 15}',
  true,
  'customers',
  'Final enforcement to prevent extreme imbalances in customer assignments',
  (SELECT id FROM auth.users LIMIT 1)
);