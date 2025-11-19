-- Add scoring_weights and rule_logic fields to assignment_rules table
ALTER TABLE assignment_rules 
ADD COLUMN IF NOT EXISTS scoring_weights jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS rule_logic jsonb DEFAULT '{}'::jsonb;

-- Add helpful comment
COMMENT ON COLUMN assignment_rules.scoring_weights IS 'Configurable scoring parameters for the rule (e.g., {"geoMatch": 100, "continuityBonus": 75, "balanceImpact": 50})';
COMMENT ON COLUMN assignment_rules.rule_logic IS 'Custom rule execution logic and parameters (e.g., {"aggressiveness": 0.8, "formula": "weighted_average"})';

-- Create default scoring weights for existing rules based on rule type
UPDATE assignment_rules 
SET scoring_weights = CASE 
  WHEN rule_type = 'GEO_FIRST' THEN '{"geoMatch": 100, "territoryAlignment": 80, "distancePenalty": -20}'::jsonb
  WHEN rule_type = 'CONTINUITY' THEN '{"continuityBonus": 75, "ownershipDuration": 50, "regionalOverride": 30}'::jsonb
  WHEN rule_type = 'SMART_BALANCE' THEN '{"balanceImpact": 50, "arrWeight": 0.6, "accountCountWeight": 0.4, "variancePenalty": -25}'::jsonb
  WHEN rule_type = 'MIN_THRESHOLDS' THEN '{"minimumEnforcement": 100, "thresholdPriority": 90}'::jsonb
  WHEN rule_type = 'ROUND_ROBIN' THEN '{"fairnessScore": 60, "sequentialBonus": 40}'::jsonb
  ELSE '{}'::jsonb
END
WHERE scoring_weights = '{}'::jsonb;