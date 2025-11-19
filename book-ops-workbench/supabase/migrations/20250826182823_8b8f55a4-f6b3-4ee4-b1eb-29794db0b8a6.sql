-- Book Builder App Database Schema

-- Enable RLS globally
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User roles enum
CREATE TYPE user_role AS ENUM ('REVOPS', 'MANAGER', 'LEADERSHIP', 'VIEWER');

-- Build status enum  
CREATE TYPE build_status AS ENUM ('DRAFT', 'IN_REVIEW', 'FINALIZED');

-- Users profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  role user_role NOT NULL DEFAULT 'VIEWER',
  team TEXT,
  region TEXT CHECK (region IN ('AMER', 'EMEA', 'GLOBAL')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Builds table (main workflow context)
CREATE TABLE public.builds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  status build_status DEFAULT 'DRAFT',
  version_tag TEXT DEFAULT 'v0',
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  target_date DATE,
  enterprise_threshold INTEGER DEFAULT 1000,
  apply_50k_rule BOOLEAN DEFAULT true,
  holdover_policy JSONB DEFAULT '{"accounts_and_opps": true, "cutoff_days": 30}'::jsonb,
  geo_emea_mappings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.builds ENABLE ROW LEVEL SECURITY;

-- Accounts table (imported data)
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  build_id UUID REFERENCES public.builds(id) ON DELETE CASCADE,
  sfdc_account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  parent_id TEXT,
  ultimate_parent_id TEXT,
  ultimate_parent_name TEXT,
  hq_country TEXT,
  sales_territory TEXT,
  geo TEXT,
  employees INTEGER,
  ultimate_parent_employee_size INTEGER,
  is_customer BOOLEAN DEFAULT false,
  arr DECIMAL(15,2),
  atr DECIMAL(15,2),
  renewal_date DATE,
  owner_id TEXT,
  owner_name TEXT,
  owners_lifetime_count INTEGER DEFAULT 0,
  expansion_tier TEXT,
  expansion_score DECIMAL(5,2),
  cre_risk BOOLEAN DEFAULT false,
  risk_flag BOOLEAN DEFAULT false,
  idr_count INTEGER DEFAULT 0,
  inbound_count INTEGER DEFAULT 0,
  is_2_0 BOOLEAN DEFAULT false,
  -- Derived fields
  is_parent BOOLEAN DEFAULT false,
  include_in_emea BOOLEAN DEFAULT false,
  enterprise_vs_commercial TEXT,
  has_customer_hierarchy BOOLEAN DEFAULT false,
  in_customer_hierarchy BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(build_id, sfdc_account_id)
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- Opportunities table (imported data)
CREATE TABLE public.opportunities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  build_id UUID REFERENCES public.builds(id) ON DELETE CASCADE,
  sfdc_opportunity_id TEXT NOT NULL,
  sfdc_account_id TEXT NOT NULL,
  stage TEXT,
  amount DECIMAL(15,2),
  close_date DATE,
  created_date DATE,
  owner_id TEXT,
  owner_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(build_id, sfdc_opportunity_id)
);

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

-- Assignments table (proposed assignments)
CREATE TABLE public.assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  build_id UUID REFERENCES public.builds(id) ON DELETE CASCADE,
  sfdc_account_id TEXT NOT NULL,
  proposed_owner_id TEXT,
  proposed_owner_name TEXT,
  proposed_team TEXT,
  assignment_type TEXT CHECK (assignment_type IN ('AUTO_COMMERCIAL', 'MANUAL_ENTERPRISE', 'MANAGER_OVERRIDE')),
  rationale TEXT,
  is_approved BOOLEAN DEFAULT false,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(build_id, sfdc_account_id)
);

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

-- Balancing metrics table
CREATE TABLE public.balancing_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  build_id UUID REFERENCES public.builds(id) ON DELETE CASCADE,
  owner_name TEXT NOT NULL,
  team TEXT,
  region TEXT,
  arr DECIMAL(15,2) DEFAULT 0,
  atr DECIMAL(15,2) DEFAULT 0,
  renewals_q1 INTEGER DEFAULT 0,
  renewals_q2 INTEGER DEFAULT 0,
  renewals_q3 INTEGER DEFAULT 0,
  renewals_q4 INTEGER DEFAULT 0,
  customer_count INTEGER DEFAULT 0,
  prospect_count INTEGER DEFAULT 0,
  tier1_count INTEGER DEFAULT 0,
  cre_risk_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(build_id, owner_name)
);

ALTER TABLE public.balancing_metrics ENABLE ROW LEVEL SECURITY;

-- Clashes table (cross-region duplicates)
CREATE TABLE public.clashes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  build_id UUID REFERENCES public.builds(id) ON DELETE CASCADE,
  sfdc_account_id TEXT NOT NULL,
  account_name TEXT,
  amer_owner TEXT,
  emea_owner TEXT,
  proposed_resolution TEXT,
  resolution_rationale TEXT,
  is_resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.clashes ENABLE ROW LEVEL SECURITY;

-- Notes table (manager reviews and comments)
CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  build_id UUID REFERENCES public.builds(id) ON DELETE CASCADE,
  sfdc_account_id TEXT NOT NULL,
  note_text TEXT NOT NULL,
  note_type TEXT CHECK (note_type IN ('APPROVAL', 'REJECTION', 'SWAP_REQUEST', 'GENERAL')),
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- Audit log table (governance and changes)
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  build_id UUID REFERENCES public.builds(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT')),
  old_values JSONB,
  new_values JSONB,
  rationale TEXT,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Export packages table
CREATE TABLE public.export_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  build_id UUID REFERENCES public.builds(id) ON DELETE CASCADE,
  package_type TEXT CHECK (package_type IN ('SALESFORCE_UPLOAD', 'MANAGER_DECKS', 'REP_SHEETS', 'HOLDOVER_REPORT')),
  file_path TEXT,
  generated_by UUID REFERENCES auth.users(id) NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.export_packages ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Profiles: Users can see all profiles but only update their own
CREATE POLICY "Users can view all profiles" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Builds: RevOps can manage, others can view
CREATE POLICY "RevOps can manage builds" ON public.builds
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('REVOPS', 'LEADERSHIP')
    )
  );

CREATE POLICY "Managers can view builds" ON public.builds
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('REVOPS', 'MANAGER', 'LEADERSHIP', 'VIEWER')
    )
  );

-- Accounts: Regional access based on user's region or global access
CREATE POLICY "Users can access accounts" ON public.accounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
      AND (profiles.region = 'GLOBAL' OR profiles.role IN ('REVOPS', 'LEADERSHIP'))
    )
  );

-- Similar patterns for other tables...

-- Create indexes for performance
CREATE INDEX idx_accounts_build_id ON public.accounts(build_id);
CREATE INDEX idx_accounts_sfdc_id ON public.accounts(sfdc_account_id);
CREATE INDEX idx_assignments_build_id ON public.assignments(build_id);
CREATE INDEX idx_assignments_account_id ON public.assignments(sfdc_account_id);
CREATE INDEX idx_opportunities_build_id ON public.opportunities(build_id);
CREATE INDEX idx_opportunities_account_id ON public.opportunities(sfdc_account_id);
CREATE INDEX idx_notes_build_id ON public.notes(build_id);
CREATE INDEX idx_audit_log_build_id ON public.audit_log(build_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_builds_updated_at BEFORE UPDATE ON public.builds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_balancing_metrics_updated_at BEFORE UPDATE ON public.balancing_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();