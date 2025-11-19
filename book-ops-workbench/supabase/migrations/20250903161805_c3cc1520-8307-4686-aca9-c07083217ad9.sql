-- Add missing fields to accounts table for proper data mapping
ALTER TABLE public.accounts 
ADD COLUMN industry text,
ADD COLUMN account_type text;