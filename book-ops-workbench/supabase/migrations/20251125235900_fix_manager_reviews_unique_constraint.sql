-- Fix manager_reviews unique constraint to allow multiple SLM assignments per user
-- The previous constraint (build_id, manager_user_id) only allowed ONE manager per user per build
-- This caused "ON CONFLICT DO UPDATE command cannot affect a row a second time" error
-- when sending all SLM books to all users (multiple SLMs per user)

-- Drop the old unique constraint
ALTER TABLE public.manager_reviews 
DROP CONSTRAINT IF EXISTS manager_reviews_build_id_manager_user_id_key;

-- Create new unique constraint including manager_name
-- This allows each user to have multiple manager assignments (one per SLM/FLM)
ALTER TABLE public.manager_reviews 
ADD CONSTRAINT manager_reviews_build_manager_user_manager_name_unique 
UNIQUE (build_id, manager_user_id, manager_name);

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_manager_reviews_build_user 
ON public.manager_reviews(build_id, manager_user_id);

