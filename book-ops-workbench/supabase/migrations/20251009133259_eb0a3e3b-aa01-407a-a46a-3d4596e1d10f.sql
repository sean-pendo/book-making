-- Create manager_reviews table to track which managers have been sent builds
CREATE TABLE public.manager_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id uuid REFERENCES builds(id) ON DELETE CASCADE NOT NULL,
  manager_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  manager_name text NOT NULL,
  manager_level text NOT NULL CHECK (manager_level IN ('FLM', 'SLM')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'in_review')),
  sent_by uuid REFERENCES auth.users(id) NOT NULL,
  sent_at timestamp with time zone DEFAULT now() NOT NULL,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE (build_id, manager_user_id)
);

-- Create manager_notes table for manager-specific notes
CREATE TABLE public.manager_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id uuid REFERENCES builds(id) ON DELETE CASCADE NOT NULL,
  sfdc_account_id text NOT NULL,
  manager_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  note_text text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Create manager_reassignments table for proposed account moves
CREATE TABLE public.manager_reassignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id uuid REFERENCES builds(id) ON DELETE CASCADE NOT NULL,
  sfdc_account_id text NOT NULL,
  account_name text NOT NULL,
  current_owner_id text NOT NULL,
  current_owner_name text NOT NULL,
  proposed_owner_id text NOT NULL,
  proposed_owner_name text NOT NULL,
  manager_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  rationale text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  capacity_warnings jsonb DEFAULT '[]'::jsonb,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.manager_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manager_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manager_reassignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for manager_reviews
CREATE POLICY "RevOps can manage manager reviews"
ON manager_reviews FOR ALL
USING (get_current_user_role() = ANY (ARRAY['REVOPS'::text, 'LEADERSHIP'::text]));

CREATE POLICY "Managers can view their own reviews"
ON manager_reviews FOR SELECT
USING (
  manager_user_id = auth.uid() OR 
  get_current_user_role() = ANY (ARRAY['REVOPS'::text, 'LEADERSHIP'::text])
);

CREATE POLICY "Managers can update their review status"
ON manager_reviews FOR UPDATE
USING (
  manager_user_id = auth.uid() OR 
  get_current_user_role() = ANY (ARRAY['REVOPS'::text, 'LEADERSHIP'::text])
);

-- RLS Policies for manager_notes
CREATE POLICY "Managers can create their own notes"
ON manager_notes FOR INSERT
WITH CHECK (manager_user_id = auth.uid());

CREATE POLICY "Managers can view notes in their hierarchy"
ON manager_notes FOR SELECT
USING (
  manager_user_id = auth.uid() OR 
  get_current_user_role() = ANY (ARRAY['REVOPS'::text, 'LEADERSHIP'::text])
);

CREATE POLICY "Managers can update their own notes"
ON manager_notes FOR UPDATE
USING (manager_user_id = auth.uid());

-- RLS Policies for manager_reassignments
CREATE POLICY "Managers can create reassignments"
ON manager_reassignments FOR INSERT
WITH CHECK (manager_user_id = auth.uid());

CREATE POLICY "Managers and RevOps can view reassignments"
ON manager_reassignments FOR SELECT
USING (
  manager_user_id = auth.uid() OR 
  get_current_user_role() = ANY (ARRAY['REVOPS'::text, 'LEADERSHIP'::text])
);

CREATE POLICY "RevOps can manage reassignments"
ON manager_reassignments FOR ALL
USING (get_current_user_role() = ANY (ARRAY['REVOPS'::text, 'LEADERSHIP'::text]));

-- Triggers for updated_at
CREATE TRIGGER update_manager_reviews_updated_at
  BEFORE UPDATE ON manager_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_manager_notes_updated_at
  BEFORE UPDATE ON manager_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_manager_reassignments_updated_at
  BEFORE UPDATE ON manager_reassignments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();