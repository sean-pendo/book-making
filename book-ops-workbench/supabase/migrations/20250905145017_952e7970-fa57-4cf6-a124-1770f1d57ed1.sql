-- Add missing fields to opportunities table
ALTER TABLE public.opportunities 
ADD COLUMN IF NOT EXISTS opportunity_name text,
ADD COLUMN IF NOT EXISTS opportunity_type text,
ADD COLUMN IF NOT EXISTS available_to_renew numeric DEFAULT 0;

-- Add calculated fields to accounts table
ALTER TABLE public.accounts 
ADD COLUMN IF NOT EXISTS calculated_arr numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS calculated_atr numeric DEFAULT 0,  
ADD COLUMN IF NOT EXISTS cre_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS initial_sale_tier text;

-- Create function to update account calculated values
CREATE OR REPLACE FUNCTION public.update_account_calculated_values(p_build_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Update accounts with calculated values from their opportunities
  UPDATE accounts a
  SET 
    calculated_arr = COALESCE(opp_data.total_arr, 0),
    calculated_atr = COALESCE(opp_data.total_atr, 0),
    cre_count = COALESCE(opp_data.cre_count, 0)
  FROM (
    SELECT 
      o.sfdc_account_id,
      SUM(COALESCE(o.amount, 0)) as total_arr,
      SUM(COALESCE(o.available_to_renew, 0)) as total_atr,
      COUNT(CASE WHEN o.cre_status IS NOT NULL AND o.cre_status != '' THEN 1 END) as cre_count
    FROM opportunities o
    WHERE o.build_id = p_build_id
    GROUP BY o.sfdc_account_id
  ) opp_data
  WHERE a.sfdc_account_id = opp_data.sfdc_account_id 
    AND a.build_id = p_build_id;
END;
$$;

-- Create trigger to automatically update calculated values when opportunities change
CREATE OR REPLACE FUNCTION public.update_account_calculated_values_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Update the account for the modified opportunity
  IF TG_OP = 'DELETE' THEN
    PERFORM public.update_account_calculated_values(OLD.build_id);
    RETURN OLD;
  ELSE
    PERFORM public.update_account_calculated_values(NEW.build_id);
    RETURN NEW;
  END IF;
END;
$$;

-- Create trigger on opportunities table
DROP TRIGGER IF EXISTS trigger_update_account_calculated_values ON opportunities;
CREATE TRIGGER trigger_update_account_calculated_values
  AFTER INSERT OR UPDATE OR DELETE ON opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_account_calculated_values_trigger();