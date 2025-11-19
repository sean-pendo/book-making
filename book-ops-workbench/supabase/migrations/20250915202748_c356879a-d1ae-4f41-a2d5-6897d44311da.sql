-- Add UPDATE RLS policy for accounts table to allow RevOps and Leadership to update assignment fields
CREATE POLICY "RevOps can update accounts" 
ON public.accounts 
FOR UPDATE 
USING (get_current_user_role() = ANY (ARRAY['REVOPS'::text, 'LEADERSHIP'::text]));