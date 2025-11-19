-- Create functions to disable/enable the account calculation trigger during bulk imports
-- This dramatically improves bulk import performance

CREATE OR REPLACE FUNCTION public.disable_opportunity_trigger()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  ALTER TABLE opportunities DISABLE TRIGGER trigger_update_account_calculated_values;
  RAISE NOTICE 'Disabled opportunity trigger for bulk import';
END;
$$;

CREATE OR REPLACE FUNCTION public.enable_opportunity_trigger()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  ALTER TABLE opportunities ENABLE TRIGGER trigger_update_account_calculated_values;
  RAISE NOTICE 'Re-enabled opportunity trigger';
END;
$$;

COMMENT ON FUNCTION public.disable_opportunity_trigger() IS 'Temporarily disables the trigger that recalculates account values on each opportunity insert. Use before bulk imports.';
COMMENT ON FUNCTION public.enable_opportunity_trigger() IS 'Re-enables the account calculation trigger after bulk import. Should be followed by manual calculation.';