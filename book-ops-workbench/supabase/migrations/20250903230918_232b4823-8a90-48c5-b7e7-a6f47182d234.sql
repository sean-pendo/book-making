-- Add unique constraint to sales_reps table for proper upsert handling
ALTER TABLE public.sales_reps ADD CONSTRAINT unique_build_rep UNIQUE (build_id, rep_id);