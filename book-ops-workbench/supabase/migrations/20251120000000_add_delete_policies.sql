-- Add DELETE policies for accounts, opportunities, and sales_reps tables
-- This allows REVOPS and FLM users to delete records during data import cleanup

-- Accounts DELETE policy
CREATE POLICY "RevOps can delete accounts"
ON accounts
FOR DELETE
USING (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM']));

-- Opportunities DELETE policy
CREATE POLICY "RevOps can delete opportunities"
ON opportunities
FOR DELETE
USING (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM']));

-- Sales reps DELETE policy (if not already covered by the ALL policy)
CREATE POLICY "RevOps can delete sales reps"
ON sales_reps
FOR DELETE
USING (get_current_user_role() = ANY (ARRAY['REVOPS', 'FLM']));
