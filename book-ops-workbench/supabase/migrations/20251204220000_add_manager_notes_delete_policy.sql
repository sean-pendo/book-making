-- Add DELETE policy so managers can delete their own notes (for undo approval)
CREATE POLICY "Managers can delete their own notes"
ON manager_notes
FOR DELETE
TO public
USING (manager_user_id = auth.uid());

