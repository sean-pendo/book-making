-- Phase 1: Update SMART_BALANCE rule configuration with more aggressive thresholds
-- This migration updates existing SMART_BALANCE rules to use lower ARR thresholds
-- that will trigger rebalancing more effectively

UPDATE assignment_rules
SET 
  conditions = jsonb_set(
    jsonb_set(
      jsonb_set(
        COALESCE(conditions, '{}'::jsonb),
        '{maxARRPerRep}',
        '3000000'::jsonb
      ),
      '{minARRThreshold}',
      '1500000'::jsonb
    ),
    '{targetARRPerRep}',
    '2500000'::jsonb
  ),
  updated_at = now()
WHERE rule_type = 'SMART_BALANCE';

-- Add comment explaining the threshold values
COMMENT ON TABLE assignment_rules IS 'Assignment rules with dynamic thresholds. SMART_BALANCE uses: maxARRPerRep=$3M, minARRThreshold=$1.5M, targetARRPerRep=$2.5M';