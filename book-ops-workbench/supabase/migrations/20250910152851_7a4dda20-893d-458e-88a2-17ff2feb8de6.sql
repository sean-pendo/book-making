-- Create default assignment rules using the correct rule_type values (wrapped in DO block)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'assignment_rules') THEN
    -- Note: This migration already handled by 20250910150752, skipping duplicate inserts
    NULL;
  END IF;
END $$;