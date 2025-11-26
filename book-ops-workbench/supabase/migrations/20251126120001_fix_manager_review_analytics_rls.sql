-- Fix RLS policy for manager_review_analytics to allow trigger inserts
-- The trigger function needs to be able to insert/update records for any manager

-- Drop existing restrictive policy
DROP POLICY IF EXISTS "System can manage analytics" ON manager_review_analytics;

-- Create a more permissive policy that allows all authenticated users to manage their own records
-- This is needed because the trigger runs in the context of the user who added the note
CREATE POLICY "Managers can manage their own analytics"
ON manager_review_analytics
FOR ALL
USING (manager_user_id = auth.uid())
WITH CHECK (manager_user_id = auth.uid());

-- Also allow RevOps to manage all analytics
CREATE POLICY "RevOps can manage all analytics"
ON manager_review_analytics
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'REVOPS'
  )
);

