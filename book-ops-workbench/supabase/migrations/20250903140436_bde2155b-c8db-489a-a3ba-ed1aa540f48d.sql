-- Create sales_reps table for importing sales representative data
CREATE TABLE public.sales_reps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rep_id TEXT NOT NULL,
  name TEXT NOT NULL,
  manager TEXT,
  team TEXT,
  region TEXT,
  build_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.sales_reps ENABLE ROW LEVEL SECURITY;

-- Create policies for sales_reps access
CREATE POLICY "RevOps can manage sales reps" 
ON public.sales_reps 
FOR ALL 
USING (get_current_user_role() = ANY (ARRAY['REVOPS'::text, 'LEADERSHIP'::text]));

CREATE POLICY "Users can view sales reps" 
ON public.sales_reps 
FOR SELECT 
USING ((get_current_user_role() = ANY (ARRAY['REVOPS'::text, 'LEADERSHIP'::text])) OR (get_current_user_region() = 'GLOBAL'::text) OR (get_current_user_role() = ANY (ARRAY['MANAGER'::text, 'VIEWER'::text])));

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_sales_reps_updated_at
BEFORE UPDATE ON public.sales_reps
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for better performance
CREATE INDEX idx_sales_reps_build_id ON public.sales_reps(build_id);
CREATE INDEX idx_sales_reps_rep_id ON public.sales_reps(rep_id);
CREATE INDEX idx_sales_reps_team ON public.sales_reps(team);
CREATE INDEX idx_sales_reps_region ON public.sales_reps(region);