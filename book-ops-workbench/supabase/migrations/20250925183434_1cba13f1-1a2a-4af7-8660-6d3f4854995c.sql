-- Add owner_id field to builds table
ALTER TABLE public.builds 
ADD COLUMN owner_id uuid REFERENCES public.profiles(id);

-- Add index for better query performance
CREATE INDEX idx_builds_owner_id ON public.builds(owner_id);