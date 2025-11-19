-- Create new simplified assignment_configuration table
CREATE TABLE assignment_configuration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID REFERENCES builds(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Natural language description of assignment goals
  description TEXT NOT NULL DEFAULT 'Balance workload, minimize risk concentration, prefer geographic matches',
  
  -- Customer configuration
  customer_min_arr NUMERIC DEFAULT 1200000,
  customer_target_arr NUMERIC DEFAULT 1300000,
  customer_max_arr NUMERIC DEFAULT 3000000,
  max_cre_per_rep INTEGER DEFAULT 3,
  
  -- Prospect configuration
  assign_prospects BOOLEAN DEFAULT false,
  prospect_min_arr NUMERIC DEFAULT 300000,
  prospect_target_arr NUMERIC DEFAULT 500000,
  prospect_max_arr NUMERIC DEFAULT 2000000,
  
  -- Assignment preferences
  prefer_geographic_match BOOLEAN DEFAULT true,
  prefer_continuity BOOLEAN DEFAULT true,
  continuity_days_threshold INTEGER DEFAULT 90,
  use_ai_optimization BOOLEAN DEFAULT true,
  
  -- Territory mappings (JSON object mapping sales_territory -> region)
  territory_mappings JSONB DEFAULT '{}'::jsonb,
  
  -- Unique constraint: one configuration per build
  UNIQUE(build_id)
);

-- Enable RLS
ALTER TABLE assignment_configuration ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "RevOps can manage assignment configuration"
ON assignment_configuration
FOR ALL
USING (get_current_user_role() = ANY(ARRAY['REVOPS', 'LEADERSHIP']));

CREATE POLICY "Users can view assignment configuration"
ON assignment_configuration
FOR SELECT
USING (
  get_current_user_role() = ANY(ARRAY['REVOPS', 'LEADERSHIP', 'MANAGER', 'VIEWER'])
);

-- Migrate existing AI_BALANCER rules to new configuration
INSERT INTO assignment_configuration (
  build_id,
  created_by,
  description,
  customer_min_arr,
  customer_target_arr,
  customer_max_arr,
  max_cre_per_rep,
  territory_mappings
)
SELECT DISTINCT ON (ar.build_id)
  ar.build_id,
  ar.created_by,
  COALESCE(ar.name, 'AI-Powered Assignment'),
  COALESCE((ar.conditions->>'minARRThreshold')::numeric, 1200000),
  COALESCE((ar.conditions->>'targetARRThreshold')::numeric, 1300000),
  COALESCE((ar.conditions->>'maxARRThreshold')::numeric, 3000000),
  COALESCE((ar.conditions->>'maxCREPerRep')::integer, 3),
  COALESCE(
    (SELECT conditions FROM assignment_rules WHERE build_id = ar.build_id AND rule_type = 'GEO_FIRST' LIMIT 1),
    '{}'::jsonb
  )
FROM assignment_rules ar
WHERE ar.rule_type = 'AI_BALANCER'
  AND ar.enabled = true
ON CONFLICT (build_id) DO NOTHING;

-- Add trigger for updated_at
CREATE TRIGGER update_assignment_configuration_updated_at
BEFORE UPDATE ON assignment_configuration
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();