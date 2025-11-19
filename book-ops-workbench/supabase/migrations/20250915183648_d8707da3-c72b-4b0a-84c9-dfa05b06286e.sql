-- Add new owner fields to opportunities table for assignment results
ALTER TABLE public.opportunities 
ADD COLUMN new_owner_id text,
ADD COLUMN new_owner_name text;

-- Add index for performance on new owner fields  
CREATE INDEX idx_opportunities_new_owner_id ON public.opportunities(new_owner_id) WHERE new_owner_id IS NOT NULL;

-- Add comments to clarify the purpose of these fields
COMMENT ON COLUMN public.opportunities.new_owner_id IS 'Owner ID assigned through territory assignment engine';
COMMENT ON COLUMN public.opportunities.new_owner_name IS 'Owner name assigned through territory assignment engine';