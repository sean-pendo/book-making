-- Create assignment_rules table for persistent rule management
CREATE TABLE public.assignment_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  build_id UUID REFERENCES public.builds(id),
  name TEXT NOT NULL,
  priority INTEGER NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('GEO_FIRST', 'CONTINUITY', 'TIER_BALANCE', 'ROUND_ROBIN', 'CUSTOM')),
  conditions JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.assignment_rules ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "RevOps can manage assignment rules" 
ON public.assignment_rules 
FOR ALL 
USING (get_current_user_role() = ANY (ARRAY['REVOPS'::text, 'LEADERSHIP'::text]));

CREATE POLICY "Users can view assignment rules" 
ON public.assignment_rules 
FOR SELECT 
USING (get_current_user_role() = ANY (ARRAY['REVOPS'::text, 'LEADERSHIP'::text, 'MANAGER'::text, 'VIEWER'::text]));

-- Create trigger for updated_at
CREATE TRIGGER update_assignment_rules_updated_at
BEFORE UPDATE ON public.assignment_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default US region-based assignment rules
INSERT INTO public.assignment_rules (name, priority, rule_type, conditions, description, enabled) VALUES
('US Region Matching', 1, 'GEO_FIRST', 
 '{"regions": ["South East", "North East", "West", "Central"], "geo_mapping": {"SE": "South East", "NE": "North East", "W": "West", "C": "Central"}}', 
 'Match accounts to reps based on US geographic regions', true),
('Continuity Bias', 2, 'CONTINUITY', 
 '{"preserve_existing": true, "same_region_only": true}', 
 'Preserve existing account-rep relationships when rep is still in same region', true),
('Tier 1 Account Balancing', 3, 'TIER_BALANCE', 
 '{"tier_levels": ["Tier 1", "Enterprise"], "balance_factor": 0.8}', 
 'Ensure even distribution of high-value accounts across reps', true),
('Multi-Factor Load Balancing', 4, 'ROUND_ROBIN', 
 '{"balance_by": ["account_count", "total_arr", "renewals", "tier_mix"]}', 
 'Balance workload by accounts, ARR, renewals, and account tier mix', true);