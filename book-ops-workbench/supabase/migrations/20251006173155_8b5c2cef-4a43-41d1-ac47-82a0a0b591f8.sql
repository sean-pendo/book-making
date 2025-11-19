-- Phase 1: Database Schema Extensions for Dynamic Assignment Engine

-- Add behavior classification column
ALTER TABLE assignment_rules 
ADD COLUMN IF NOT EXISTS behavior_class TEXT DEFAULT 'STANDARD' 
CHECK (behavior_class IN ('CONSTRAINT', 'CONDITIONAL', 'OVERRIDE', 'TIEBREAKER', 'STANDARD'));

-- Add conditional modifiers (e.g., "reduce score by 80% if wrong region")
ALTER TABLE assignment_rules 
ADD COLUMN IF NOT EXISTS conditional_modifiers JSONB DEFAULT '[]'::jsonb;

-- Add cross-rule dependencies (e.g., "depends on GEO_FIRST result")
ALTER TABLE assignment_rules 
ADD COLUMN IF NOT EXISTS rule_dependencies JSONB DEFAULT '[]'::jsonb;

-- Add custom rule type metadata (for user-created rules)
ALTER TABLE assignment_rules 
ADD COLUMN IF NOT EXISTS is_custom_rule BOOLEAN DEFAULT false;

-- Add region capacity thresholds for balance overrides
ALTER TABLE assignment_rules 
ADD COLUMN IF NOT EXISTS region_capacity_config JSONB DEFAULT '{}'::jsonb;

-- Update existing rules with appropriate behavior classes
UPDATE assignment_rules 
SET behavior_class = 'CONSTRAINT'
WHERE rule_type = 'GEO_FIRST' AND behavior_class = 'STANDARD';

UPDATE assignment_rules 
SET behavior_class = 'CONDITIONAL'
WHERE rule_type = 'CONTINUITY' AND behavior_class = 'STANDARD';

UPDATE assignment_rules 
SET behavior_class = 'OVERRIDE'
WHERE rule_type = 'SMART_BALANCE' AND behavior_class = 'STANDARD';

UPDATE assignment_rules 
SET behavior_class = 'TIEBREAKER'
WHERE rule_type IN ('ROUND_ROBIN', 'TIER_BALANCE') AND behavior_class = 'STANDARD';

-- Create comment for documentation
COMMENT ON COLUMN assignment_rules.behavior_class IS 'Defines rule interaction: CONSTRAINT (must satisfy), CONDITIONAL (context-dependent), OVERRIDE (can break other rules), TIEBREAKER (last resort), STANDARD (normal scoring)';
COMMENT ON COLUMN assignment_rules.conditional_modifiers IS 'Array of conditional logic objects: {condition, action, value, description}';
COMMENT ON COLUMN assignment_rules.rule_dependencies IS 'Array of rule dependencies: {rule_id, dependency_type, description}';
COMMENT ON COLUMN assignment_rules.region_capacity_config IS 'Region overload thresholds: {region: {maxTotalARR, maxAvgARR}}';