-- Step 1: Drop ALL policies that depend on the role column or functions
DROP POLICY IF EXISTS "RevOps can manage builds" ON builds;
DROP POLICY IF EXISTS "Managers can view builds" ON builds;
DROP POLICY IF EXISTS "Users can access accounts" ON accounts;
DROP POLICY IF EXISTS "RevOps can insert accounts" ON accounts;
DROP POLICY IF EXISTS "RevOps can update accounts" ON accounts;
DROP POLICY IF EXISTS "RevOps can insert sales reps" ON sales_reps;
DROP POLICY IF EXISTS "RevOps can manage sales reps" ON sales_reps;
DROP POLICY IF EXISTS "Users can view sales reps" ON sales_reps;
DROP POLICY IF EXISTS "RevOps can manage assignment configuration" ON assignment_configuration;
DROP POLICY IF EXISTS "Users can view assignment configuration" ON assignment_configuration;
DROP POLICY IF EXISTS "RevOps can manage assignment rules" ON assignment_rules;
DROP POLICY IF EXISTS "Users can view assignment rules" ON assignment_rules;
DROP POLICY IF EXISTS "Users can create export packages" ON export_packages;
DROP POLICY IF EXISTS "Users can view export packages" ON export_packages;
DROP POLICY IF EXISTS "RevOps can manage clashes" ON clashes;
DROP POLICY IF EXISTS "Users can view clashes" ON clashes;
DROP POLICY IF EXISTS "RevOps can manage assignments" ON assignments;
DROP POLICY IF EXISTS "RevOps can update assignments" ON assignments;
DROP POLICY IF EXISTS "Users can view assignments" ON assignments;
DROP POLICY IF EXISTS "RevOps can delete assignments" ON assignments;
DROP POLICY IF EXISTS "RevOps can insert opportunities" ON opportunities;
DROP POLICY IF EXISTS "RevOps can manage opportunities" ON opportunities;
DROP POLICY IF EXISTS "Users can view opportunities" ON opportunities;
DROP POLICY IF EXISTS "Users can create notes" ON notes;
DROP POLICY IF EXISTS "Users can update their own notes" ON notes;
DROP POLICY IF EXISTS "Users can view notes" ON notes;
DROP POLICY IF EXISTS "RevOps can manage balancing metrics" ON balancing_metrics;
DROP POLICY IF EXISTS "Users can view balancing metrics" ON balancing_metrics;
DROP POLICY IF EXISTS "Managers can create their own notes" ON manager_notes;
DROP POLICY IF EXISTS "Managers can update their own notes" ON manager_notes;
DROP POLICY IF EXISTS "Managers can view notes in their hierarchy" ON manager_notes;
DROP POLICY IF EXISTS "Managers and RevOps can view reassignments" ON manager_reassignments;
DROP POLICY IF EXISTS "Managers can create reassignments" ON manager_reassignments;
DROP POLICY IF EXISTS "RevOps can manage reassignments" ON manager_reassignments;
DROP POLICY IF EXISTS "Managers can update their review status" ON manager_reviews;
DROP POLICY IF EXISTS "Managers can view their own reviews" ON manager_reviews;
DROP POLICY IF EXISTS "RevOps can manage manager reviews" ON manager_reviews;
DROP POLICY IF EXISTS "Users can view audit log" ON audit_log;

-- Drop functions that depend on user_role enum
DROP FUNCTION IF EXISTS get_current_user_role() CASCADE;
DROP FUNCTION IF EXISTS create_user_profile(uuid, text, user_role, text) CASCADE;

-- Drop the trigger that uses the user_role dependent function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

-- Step 2: Create the new enum type
CREATE TYPE user_role_new AS ENUM ('SLM', 'FLM', 'REVOPS');

-- Step 3: Add a temporary column
ALTER TABLE profiles ADD COLUMN role_new user_role_new;

-- Step 4: Map old roles to new roles
UPDATE profiles SET role_new = 
  CASE 
    WHEN role::text = 'MANAGER' THEN 'SLM'::user_role_new
    WHEN role::text = 'LEADERSHIP' THEN 'FLM'::user_role_new
    WHEN role::text = 'VIEWER' THEN 'SLM'::user_role_new
    WHEN role::text = 'REVOPS' THEN 'REVOPS'::user_role_new
    ELSE 'SLM'::user_role_new
  END;

-- Step 5: Drop the old column
ALTER TABLE profiles DROP COLUMN role;

-- Step 6: Rename the new column
ALTER TABLE profiles RENAME COLUMN role_new TO role;

-- Step 7: Drop the old enum
DROP TYPE user_role;

-- Step 8: Rename the new enum
ALTER TYPE user_role_new RENAME TO user_role;

-- Step 9: Set default and NOT NULL
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'SLM'::user_role;
ALTER TABLE profiles ALTER COLUMN role SET NOT NULL;

-- Step 10: Recreate the get_current_user_role function
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid();
$$;

-- Step 11: Recreate the create_user_profile function
CREATE OR REPLACE FUNCTION public.create_user_profile(
  user_id uuid,
  user_email text,
  user_role user_role DEFAULT 'REVOPS'::user_role,
  user_region text DEFAULT 'GLOBAL'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, region, full_name, created_at, updated_at)
  VALUES (
    user_id,
    user_email,
    user_role,
    user_region,
    'Admin User',
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- Step 12: Recreate handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, region, full_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    'REVOPS'::user_role,
    'GLOBAL',
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    now(),
    now()
  );
  RETURN NEW;
END;
$$;

-- Step 13: Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Step 14: Recreate all the RLS policies with new role values

-- Builds policies
CREATE POLICY "RevOps can manage builds"
ON builds
FOR ALL
USING (EXISTS (
  SELECT 1 FROM profiles
  WHERE profiles.id = auth.uid() 
  AND profiles.role IN ('REVOPS'::user_role, 'FLM'::user_role)
));

CREATE POLICY "Managers can view builds"
ON builds
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM profiles
  WHERE profiles.id = auth.uid()
  AND profiles.role IN ('REVOPS'::user_role, 'SLM'::user_role, 'FLM'::user_role)
));

-- Accounts policies
CREATE POLICY "Users can access accounts"
ON accounts
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM profiles
  WHERE profiles.id = auth.uid()
  AND (profiles.region = 'GLOBAL' OR profiles.role IN ('REVOPS'::user_role, 'FLM'::user_role))
));

CREATE POLICY "RevOps can insert accounts"
ON accounts
FOR INSERT
WITH CHECK (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM']));

CREATE POLICY "RevOps can update accounts"
ON accounts
FOR UPDATE
USING (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM']));

-- Sales reps policies
CREATE POLICY "RevOps can insert sales reps"
ON sales_reps
FOR INSERT
WITH CHECK (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM']));

CREATE POLICY "RevOps can manage sales reps"
ON sales_reps
FOR ALL
USING (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM']));

CREATE POLICY "Users can view sales reps"
ON sales_reps
FOR SELECT
USING (
  (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM'])) OR
  (get_current_user_region() = 'GLOBAL') OR
  (get_current_user_role() = ANY (ARRAY['SLM']))
);

-- Assignment configuration policies
CREATE POLICY "RevOps can manage assignment configuration"
ON assignment_configuration
FOR ALL
USING (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM']));

CREATE POLICY "Users can view assignment configuration"
ON assignment_configuration
FOR SELECT
USING (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM', 'SLM']));

-- Assignment rules policies
CREATE POLICY "RevOps can manage assignment rules"
ON assignment_rules
FOR ALL
USING (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM']));

CREATE POLICY "Users can view assignment rules"
ON assignment_rules
FOR SELECT
USING (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM', 'SLM']));

-- Export packages policies
CREATE POLICY "Users can create export packages"
ON export_packages
FOR INSERT
WITH CHECK (
  (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM'])) AND
  (auth.uid() = generated_by)
);

CREATE POLICY "Users can view export packages"
ON export_packages
FOR SELECT
USING (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM', 'SLM']));

-- Clashes policies
CREATE POLICY "RevOps can manage clashes"
ON clashes
FOR ALL
USING (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM']));

CREATE POLICY "Users can view clashes"
ON clashes
FOR SELECT
USING (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM', 'SLM']));

-- Assignments policies
CREATE POLICY "RevOps can manage assignments"
ON assignments
FOR INSERT
WITH CHECK (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM']));

CREATE POLICY "RevOps can update assignments"
ON assignments
FOR UPDATE
USING (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM', 'SLM']));

CREATE POLICY "Users can view assignments"
ON assignments
FOR SELECT
USING (
  (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM'])) OR
  (get_current_user_region() = 'GLOBAL') OR
  (get_current_user_role() = ANY (ARRAY['SLM']))
);

CREATE POLICY "RevOps can delete assignments"
ON assignments
FOR DELETE
USING (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM']));

-- Opportunities policies
CREATE POLICY "RevOps can insert opportunities"
ON opportunities
FOR INSERT
WITH CHECK (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM']));

CREATE POLICY "RevOps can manage opportunities"
ON opportunities
FOR ALL
USING (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM']));

CREATE POLICY "Users can view opportunities"
ON opportunities
FOR SELECT
USING (
  (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM'])) OR
  (get_current_user_region() = 'GLOBAL')
);

-- Notes policies
CREATE POLICY "Users can create notes"
ON notes
FOR INSERT
WITH CHECK (
  (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM', 'SLM'])) AND
  (auth.uid() = created_by)
);

CREATE POLICY "Users can update their own notes"
ON notes
FOR UPDATE
USING (
  (auth.uid() = created_by) AND
  (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM', 'SLM']))
);

CREATE POLICY "Users can view notes"
ON notes
FOR SELECT
USING (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM', 'SLM']));

-- Balancing metrics policies
CREATE POLICY "RevOps can manage balancing metrics"
ON balancing_metrics
FOR ALL
USING (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM']));

CREATE POLICY "Users can view balancing metrics"
ON balancing_metrics
FOR SELECT
USING (
  (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM'])) OR
  (get_current_user_region() = 'GLOBAL') OR
  (get_current_user_role() = ANY (ARRAY['SLM']))
);

-- Manager notes policies
CREATE POLICY "Managers can create their own notes"
ON manager_notes
FOR INSERT
WITH CHECK (manager_user_id = auth.uid());

CREATE POLICY "Managers can update their own notes"
ON manager_notes
FOR UPDATE
USING (manager_user_id = auth.uid());

CREATE POLICY "Managers can view notes in their hierarchy"
ON manager_notes
FOR SELECT
USING (
  (manager_user_id = auth.uid()) OR
  (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM']))
);

-- Manager reassignments policies
CREATE POLICY "Managers and RevOps can view reassignments"
ON manager_reassignments
FOR SELECT
USING (
  (manager_user_id = auth.uid()) OR
  (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM']))
);

CREATE POLICY "Managers can create reassignments"
ON manager_reassignments
FOR INSERT
WITH CHECK (manager_user_id = auth.uid());

CREATE POLICY "RevOps can manage reassignments"
ON manager_reassignments
FOR ALL
USING (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM']));

-- Manager reviews policies
CREATE POLICY "Managers can update their review status"
ON manager_reviews
FOR UPDATE
USING (
  (manager_user_id = auth.uid()) OR
  (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM']))
);

CREATE POLICY "Managers can view their own reviews"
ON manager_reviews
FOR SELECT
USING (
  (manager_user_id = auth.uid()) OR
  (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM']))
);

CREATE POLICY "RevOps can manage manager reviews"
ON manager_reviews
FOR ALL
USING (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM']));

-- Audit log policy
CREATE POLICY "Users can view audit log"
ON audit_log
FOR SELECT
USING (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM', 'SLM']));