-- Update existing rules with better balancing parameters
-- 1. Update CONTINUITY rule to be less aggressive
UPDATE assignment_rules 
SET conditions = jsonb_set(
  jsonb_set(
    conditions,
    '{minimumOwnershipDays}', '30'
  ),
  '{overrideThreshold}', '5'
)
WHERE build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea' 
  AND rule_type = 'CONTINUITY';

-- 2. Update MIN_THRESHOLDS to realistic targets
UPDATE assignment_rules 
SET conditions = jsonb_set(
  jsonb_set(
    jsonb_set(
      conditions,
      '{minParentAccounts}', '100'
    ),
    '{minCustomerARR}', '3000000'
  ),
  '{maxVariancePercent}', '15'
)
WHERE build_id = 'e783d327-162a-4962-ba41-4f4df6f71eea' 
  AND rule_type = 'MIN_THRESHOLDS';

-- 3. Add TIER_BALANCE rule (Priority 4)
INSERT INTO assignment_rules (
  build_id,
  name,
  rule_type,
  priority,
  conditions,
  enabled,
  description,
  created_at,
  updated_at
) VALUES (
  'e783d327-162a-4962-ba41-4f4df6f71eea',
  'Tier Balance',
  'TIER_BALANCE',
  4,
  '{"tierBalanceStrategy": "weighted_distribution", "maxVariancePercent": 15, "prioritizeTier1": true}',
  true,
  'Balance tier distribution across representatives for equitable opportunities',
  now(),
  now()
);

-- 4. Add ROUND_ROBIN rule (Priority 5) 
INSERT INTO assignment_rules (
  build_id,
  name,
  rule_type,
  priority,
  conditions,
  enabled,
  description,
  created_at,
  updated_at
) VALUES (
  'e783d327-162a-4962-ba41-4f4df6f71eea',
  'Round Robin Balance',
  'ROUND_ROBIN',
  5,
  '{"balancingCriteria": "hybrid", "maxVariancePercent": 10, "loadBalancingStrategy": "weighted_arr"}',
  true,
  'Final balancing for remaining accounts using hybrid account count and ARR distribution',
  now(),
  now()
);