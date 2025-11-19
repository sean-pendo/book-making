-- Add missing fields to opportunities table
ALTER TABLE public.opportunities 
ADD COLUMN cre_status text,
ADD COLUMN renewal_event_date date,
ADD COLUMN net_arr numeric;

-- Add missing fields to sales_reps table  
ALTER TABLE public.sales_reps
ADD COLUMN flm text,
ADD COLUMN slm text;