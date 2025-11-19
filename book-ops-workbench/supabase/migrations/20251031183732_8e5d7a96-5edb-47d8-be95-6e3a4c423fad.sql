-- Add split ownership tracking columns
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS has_split_ownership BOOLEAN DEFAULT false;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS previous_owner_id TEXT;

-- Function to mark split ownership between parents and children
CREATE OR REPLACE FUNCTION public.mark_split_ownership(p_build_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Clear all split ownership flags first
  UPDATE accounts 
  SET has_split_ownership = false 
  WHERE build_id = p_build_id;
  
  -- Mark parents and children with split ownership
  -- Split ownership occurs when a child's new_owner differs from its parent's new_owner
  WITH split_pairs AS (
    SELECT DISTINCT
      parent.sfdc_account_id as parent_id,
      child.sfdc_account_id as child_id
    FROM accounts parent
    JOIN accounts child ON child.ultimate_parent_id = parent.sfdc_account_id 
      AND child.build_id = p_build_id
    WHERE parent.build_id = p_build_id
      AND parent.is_parent = true
      AND child.is_parent = false
      -- Check if owners differ (comparing new_owner_id if it exists, otherwise owner_id)
      AND COALESCE(child.new_owner_id, child.owner_id) != COALESCE(parent.new_owner_id, parent.owner_id)
  )
  UPDATE accounts
  SET has_split_ownership = true
  WHERE build_id = p_build_id
    AND (
      sfdc_account_id IN (SELECT parent_id FROM split_pairs)
      OR sfdc_account_id IN (SELECT child_id FROM split_pairs)
    );
END;
$function$;

-- Update ARR calculation to exclude children with different owners from parent ARR rollup
CREATE OR REPLACE FUNCTION public.update_account_calculated_values(p_build_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- First, update calculated values for all accounts (both parent and child)
  WITH opp_data AS (
    -- Individual account opportunity data
    SELECT 
      o.sfdc_account_id,
      SUM(COALESCE(o.amount, 0)) as total_arr,
      SUM(CASE WHEN LOWER(TRIM(o.opportunity_type)) = 'renewals' THEN COALESCE(o.available_to_renew, 0) ELSE 0 END) as total_atr,
      COUNT(CASE WHEN o.cre_status IS NOT NULL AND o.cre_status != '' THEN 1 END) as cre_count
    FROM public.opportunities o
    WHERE o.build_id = p_build_id
    GROUP BY o.sfdc_account_id
  ),
  hierarchy_opp_data AS (
    -- Hierarchy opportunity data (for parent accounts)
    -- ONLY include children that have the same owner as parent or no new owner assignment
    SELECT 
      parent_acc.sfdc_account_id as parent_account_id,
      SUM(COALESCE(o.amount, 0)) as total_arr,
      SUM(CASE WHEN LOWER(TRIM(o.opportunity_type)) = 'renewals' THEN COALESCE(o.available_to_renew, 0) ELSE 0 END) as total_atr,
      COUNT(CASE WHEN o.cre_status IS NOT NULL AND o.cre_status != '' THEN 1 END) as cre_count
    FROM public.accounts parent_acc
    LEFT JOIN public.accounts child_acc ON (
      child_acc.ultimate_parent_id = parent_acc.sfdc_account_id 
      AND child_acc.build_id = p_build_id
      -- CRITICAL: Only include children with same owner or no new owner assignment
      AND (
        child_acc.new_owner_id IS NULL 
        OR child_acc.new_owner_id = COALESCE(parent_acc.new_owner_id, parent_acc.owner_id)
      )
    )
    LEFT JOIN public.opportunities o ON (
      (o.sfdc_account_id = parent_acc.sfdc_account_id OR o.sfdc_account_id = child_acc.sfdc_account_id)
      AND o.build_id = p_build_id
    )
    WHERE parent_acc.build_id = p_build_id 
      AND parent_acc.is_parent = true
    GROUP BY parent_acc.sfdc_account_id
  )
  UPDATE public.accounts a
  SET 
    calculated_arr = CASE 
      WHEN a.is_parent = true THEN 
        COALESCE(
          NULLIF(a.hierarchy_bookings_arr_converted, 0),
          hierarchy_opp_data.total_arr,
          a.arr,
          0
        )
      ELSE COALESCE(opp_data.total_arr, a.arr, 0)
    END,
    calculated_atr = CASE
      WHEN a.is_parent = true THEN COALESCE(hierarchy_opp_data.total_atr, 0)
      ELSE COALESCE(opp_data.total_atr, 0)
    END,
    cre_count = CASE
      WHEN a.is_parent = true THEN COALESCE(hierarchy_opp_data.cre_count, 0)
      ELSE COALESCE(opp_data.cre_count, 0)
    END
  FROM opp_data, hierarchy_opp_data
  WHERE a.build_id = p_build_id
    AND (opp_data.sfdc_account_id = a.sfdc_account_id OR (a.is_parent = true AND hierarchy_opp_data.parent_account_id = a.sfdc_account_id));
    
  -- Handle accounts that don't have opportunities but are customers with ARR
  UPDATE public.accounts a
  SET 
    calculated_arr = CASE 
      WHEN a.is_parent = true THEN COALESCE(NULLIF(a.hierarchy_bookings_arr_converted, 0), a.arr, 0)
      ELSE COALESCE(a.arr, 0)
    END,
    calculated_atr = 0,
    cre_count = 0
  WHERE a.build_id = p_build_id
    AND a.calculated_arr = 0
    AND (
      (a.is_parent = true AND (a.hierarchy_bookings_arr_converted > 0 OR a.arr > 0)) OR
      (a.is_parent = false AND a.arr > 0)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.opportunities o 
      WHERE o.sfdc_account_id = a.sfdc_account_id 
        AND o.build_id = p_build_id
    );
END;
$function$;