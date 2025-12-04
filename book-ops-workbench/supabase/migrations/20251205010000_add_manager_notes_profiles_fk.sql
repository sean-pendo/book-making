-- Add foreign key from manager_notes.manager_user_id to profiles.id
-- This enables PostgREST joins with profiles table

ALTER TABLE manager_notes
ADD CONSTRAINT manager_notes_manager_user_id_profiles_fkey
FOREIGN KEY (manager_user_id) REFERENCES profiles(id) ON DELETE CASCADE;

