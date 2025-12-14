-- Add RLS policies for manager_reviews table

-- Enable RLS if not already enabled
ALTER TABLE manager_reviews ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own reviews
CREATE POLICY "Users can view their own reviews"
ON manager_reviews FOR SELECT
USING (manager_user_id = auth.uid());

-- Allow RevOps to view all reviews
CREATE POLICY "RevOps can view all reviews"
ON manager_reviews FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'REVOPS'
  )
);

-- Allow RevOps to insert reviews (when sharing builds)
CREATE POLICY "RevOps can create reviews"
ON manager_reviews FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'REVOPS'
  )
);

-- Allow users to update their own reviews
CREATE POLICY "Users can update their own reviews"
ON manager_reviews FOR UPDATE
USING (manager_user_id = auth.uid());

-- Allow users to delete their own reviews
CREATE POLICY "Users can delete their own reviews"
ON manager_reviews FOR DELETE
USING (manager_user_id = auth.uid());

-- Allow RevOps to delete any review
CREATE POLICY "RevOps can delete any review"
ON manager_reviews FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'REVOPS'
  )
);






