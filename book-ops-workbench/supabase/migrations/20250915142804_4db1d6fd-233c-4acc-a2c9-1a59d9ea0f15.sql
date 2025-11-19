-- Update the minimum threshold rule to use the user's preferred values
UPDATE assignment_rules 
SET conditions = jsonb_build_object(
  'minParentAccounts', 6,
  'minCustomerARR', 1500000,  -- $1.5M
  'maxVariancePercent', 15
)
WHERE rule_type = 'MIN_THRESHOLDS' 
AND build_id = '8fc766cc-b091-44b6-bd1c-4d5f9b8409dd';