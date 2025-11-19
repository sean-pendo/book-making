-- Add is_strategic_rep column to sales_reps table
ALTER TABLE public.sales_reps 
ADD COLUMN is_strategic_rep boolean NOT NULL DEFAULT false;

-- Add comment explaining the column
COMMENT ON COLUMN public.sales_reps.is_strategic_rep IS 'Strategic reps can only have their accounts assigned to other strategic reps';

-- Create index for faster queries
CREATE INDEX idx_sales_reps_strategic ON public.sales_reps(is_strategic_rep, build_id) WHERE is_strategic_rep = true;