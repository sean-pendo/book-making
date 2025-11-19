-- Update the MIN_THRESHOLDS rule for this build to have realistic minimum thresholds
-- that will force proper distribution (around 120-150 accounts per rep)
UPDATE assignment_rules 
SET 
  conditions = jsonb_build_object(
    'minParentAccounts', 120,          -- Minimum ~120 parent accounts per rep (vs current 6)
    'minCustomerARR', 50000000,        -- Minimum $50M customer ARR per rep (vs current $1.5M)  
    'maxVariancePercent', 15           -- Keep 15% variance tolerance
  ),
  description = 'Realistic minimum thresholds: 120 min parent accounts per rep, $50M min customer ARR per rep, with ±15% variance tolerance',
  updated_at = now()
WHERE build_id = '8fc766cc-b091-44b6-bd1c-4d5f9b8409dd' 
  AND rule_type = 'MIN_THRESHOLDS';