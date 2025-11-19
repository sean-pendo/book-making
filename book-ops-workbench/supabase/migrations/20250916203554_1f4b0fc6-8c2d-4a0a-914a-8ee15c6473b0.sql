-- Update assignment rule priorities to implement optimal order
-- 1. US Region Priority (Priority 1) 
-- 2. Continuity Bias (Priority 2)
-- 3. Minimum Thresholds (Priority 3) 
-- 4. Tier Balance (Priority 4)

UPDATE assignment_rules 
SET priority = 1, updated_at = now()
WHERE id = '540b82c8-a579-4bcf-89f5-79858b5f0435' 
AND rule_type = 'GEO_FIRST';

UPDATE assignment_rules 
SET priority = 2, updated_at = now()
WHERE id = 'd6fe1543-9d70-49ef-b409-ef78b02d6e80' 
AND rule_type = 'CONTINUITY';

UPDATE assignment_rules 
SET priority = 3, 
    conditions = jsonb_set(conditions, '{maxVariancePercent}', '20'), -- Increase flexibility from 10% to 20%
    updated_at = now()
WHERE id = 'e999ad41-4a2f-433a-93ba-c6859b7356c3' 
AND rule_type = 'MIN_THRESHOLDS';

-- Tier Balance stays at priority 4

-- Create Round Robin rule if it doesn't exist
INSERT INTO assignment_rules (
    build_id,
    name,
    rule_type,
    priority,
    conditions,
    description,
    enabled,
    created_by
) 
SELECT 
    '8fc766cc-b091-44b6-bd1c-4d5f9b8409dd'::uuid,
    'Round Robin Distribution',
    'ROUND_ROBIN',
    5,
    '{"distributionMethod": "workload_balanced", "considerWorkload": true}'::jsonb,
    'Final balancing for any remaining unassigned accounts',
    true,
    auth.uid()
WHERE NOT EXISTS (
    SELECT 1 FROM assignment_rules 
    WHERE build_id = '8fc766cc-b091-44b6-bd1c-4d5f9b8409dd'::uuid 
    AND rule_type = 'ROUND_ROBIN'
);