-- Add new columns to sales_reps table for rep management
ALTER TABLE public.sales_reps 
ADD COLUMN is_active boolean DEFAULT true,
ADD COLUMN include_in_assignments boolean DEFAULT true,
ADD COLUMN is_manager boolean DEFAULT false,
ADD COLUMN status_notes text;

-- Auto-detect inactive reps based on name patterns
UPDATE public.sales_reps 
SET is_active = false, 
    include_in_assignments = false,
    status_notes = 'Auto-detected as inactive based on name'
WHERE UPPER(name) LIKE '%INACTIVE%' 
   OR UPPER(name) LIKE '%FORMER%'
   OR UPPER(name) LIKE '%EX-%';

-- Create function to get orphaned owners (accounts owned by people not in sales_reps)
CREATE OR REPLACE FUNCTION public.get_orphaned_owners_with_details(p_build_id uuid)
RETURNS TABLE(
    owner_id text,
    owner_name text,
    account_count bigint,
    total_arr numeric,
    is_in_sales_reps boolean
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    WITH owner_summary AS (
        SELECT 
            a.owner_id,
            a.owner_name,
            COUNT(*) as account_count,
            SUM(COALESCE(a.arr, a.calculated_arr, 0)) as total_arr
        FROM accounts a
        WHERE a.build_id = p_build_id
          AND a.owner_id IS NOT NULL
          AND a.owner_id != ''
        GROUP BY a.owner_id, a.owner_name
    )
    SELECT 
        os.owner_id,
        os.owner_name,
        os.account_count,
        os.total_arr,
        EXISTS(
            SELECT 1 FROM sales_reps sr 
            WHERE sr.rep_id = os.owner_id 
            AND sr.build_id = p_build_id
        ) as is_in_sales_reps
    FROM owner_summary os
    ORDER BY os.total_arr DESC;
END;
$$;