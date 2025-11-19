-- Add initial_sale_score column to accounts table
ALTER TABLE public.accounts 
ADD COLUMN initial_sale_score numeric;