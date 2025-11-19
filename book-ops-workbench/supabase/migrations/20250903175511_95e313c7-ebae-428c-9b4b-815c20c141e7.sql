-- Add INSERT policies for accounts table
CREATE POLICY "RevOps can insert accounts" 
ON public.accounts 
FOR INSERT 
WITH CHECK (get_current_user_role() = ANY (ARRAY['REVOPS'::text, 'LEADERSHIP'::text]));

-- Add INSERT policies for opportunities table
CREATE POLICY "RevOps can insert opportunities" 
ON public.opportunities 
FOR INSERT 
WITH CHECK (get_current_user_role() = ANY (ARRAY['REVOPS'::text, 'LEADERSHIP'::text]));

-- Add INSERT policies for sales_reps table
CREATE POLICY "RevOps can insert sales reps" 
ON public.sales_reps 
FOR INSERT 
WITH CHECK (get_current_user_role() = ANY (ARRAY['REVOPS'::text, 'LEADERSHIP'::text]));