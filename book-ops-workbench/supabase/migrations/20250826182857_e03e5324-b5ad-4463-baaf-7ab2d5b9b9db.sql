-- Fix security warnings by adding comprehensive RLS policies

-- Fix the function search path issue first
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Security definer functions to avoid infinite recursion in RLS
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT 
SECURITY DEFINER
SET search_path = public
LANGUAGE SQL STABLE AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_region()
RETURNS TEXT 
SECURITY DEFINER  
SET search_path = public
LANGUAGE SQL STABLE AS $$
  SELECT region FROM public.profiles WHERE id = auth.uid();
$$;

-- Add missing RLS policies for opportunities table
CREATE POLICY "Users can view opportunities" ON public.opportunities
  FOR SELECT USING (
    public.get_current_user_role() IN ('REVOPS', 'LEADERSHIP') OR
    public.get_current_user_region() = 'GLOBAL'
  );

CREATE POLICY "RevOps can manage opportunities" ON public.opportunities
  FOR ALL USING (
    public.get_current_user_role() IN ('REVOPS', 'LEADERSHIP')
  );

-- Add missing RLS policies for assignments table  
CREATE POLICY "Users can view assignments" ON public.assignments
  FOR SELECT USING (
    public.get_current_user_role() IN ('REVOPS', 'LEADERSHIP') OR
    public.get_current_user_region() = 'GLOBAL' OR
    public.get_current_user_role() IN ('MANAGER', 'VIEWER')
  );

CREATE POLICY "RevOps can manage assignments" ON public.assignments
  FOR INSERT WITH CHECK (
    public.get_current_user_role() IN ('REVOPS', 'LEADERSHIP')
  );

CREATE POLICY "RevOps can update assignments" ON public.assignments
  FOR UPDATE USING (
    public.get_current_user_role() IN ('REVOPS', 'LEADERSHIP', 'MANAGER')
  );

CREATE POLICY "RevOps can delete assignments" ON public.assignments
  FOR DELETE USING (
    public.get_current_user_role() IN ('REVOPS', 'LEADERSHIP')
  );

-- Add missing RLS policies for balancing_metrics table
CREATE POLICY "Users can view balancing metrics" ON public.balancing_metrics
  FOR SELECT USING (
    public.get_current_user_role() IN ('REVOPS', 'LEADERSHIP') OR
    public.get_current_user_region() = 'GLOBAL' OR
    public.get_current_user_role() IN ('MANAGER', 'VIEWER')
  );

CREATE POLICY "RevOps can manage balancing metrics" ON public.balancing_metrics
  FOR ALL USING (
    public.get_current_user_role() IN ('REVOPS', 'LEADERSHIP')
  );

-- Add missing RLS policies for clashes table
CREATE POLICY "Users can view clashes" ON public.clashes
  FOR SELECT USING (
    public.get_current_user_role() IN ('REVOPS', 'LEADERSHIP', 'MANAGER')
  );

CREATE POLICY "RevOps can manage clashes" ON public.clashes
  FOR ALL USING (
    public.get_current_user_role() IN ('REVOPS', 'LEADERSHIP')
  );

-- Add missing RLS policies for notes table
CREATE POLICY "Users can view notes" ON public.notes
  FOR SELECT USING (
    public.get_current_user_role() IN ('REVOPS', 'LEADERSHIP', 'MANAGER', 'VIEWER')
  );

CREATE POLICY "Users can create notes" ON public.notes
  FOR INSERT WITH CHECK (
    public.get_current_user_role() IN ('REVOPS', 'LEADERSHIP', 'MANAGER') AND
    auth.uid() = created_by
  );

CREATE POLICY "Users can update their own notes" ON public.notes
  FOR UPDATE USING (
    auth.uid() = created_by AND
    public.get_current_user_role() IN ('REVOPS', 'LEADERSHIP', 'MANAGER')
  );

-- Add missing RLS policies for audit_log table
CREATE POLICY "Users can view audit log" ON public.audit_log
  FOR SELECT USING (
    public.get_current_user_role() IN ('REVOPS', 'LEADERSHIP', 'MANAGER', 'VIEWER')
  );

CREATE POLICY "System can create audit entries" ON public.audit_log
  FOR INSERT WITH CHECK (
    auth.uid() = created_by
  );

-- Add missing RLS policies for export_packages table
CREATE POLICY "Users can view export packages" ON public.export_packages
  FOR SELECT USING (
    public.get_current_user_role() IN ('REVOPS', 'LEADERSHIP', 'MANAGER', 'VIEWER')
  );

CREATE POLICY "Users can create export packages" ON public.export_packages
  FOR INSERT WITH CHECK (
    public.get_current_user_role() IN ('REVOPS', 'LEADERSHIP') AND
    auth.uid() = generated_by
  );