-- Update the update_account_calculated_values function to handle split ownership ARR correctly
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
  split_children_arr AS (
    -- Calculate total ARR of children that have been reassigned (split ownership)
    SELECT 
      parent_acc.sfdc_account_id as parent_id,
      SUM(COALESCE(child_acc.arr, 0)) as total_split_arr
    FROM public.accounts parent_acc
    JOIN public.accounts child_acc ON (
      child_acc.ultimate_parent_id = parent_acc.sfdc_account_id 
      AND child_acc.build_id = p_build_id
      AND child_acc.is_parent = false
    )
    WHERE parent_acc.build_id = p_build_id
      AND parent_acc.is_parent = true
      -- Split ownership: child has different new_owner_id than parent
      AND child_acc.new_owner_id IS NOT NULL
      AND parent_acc.new_owner_id IS NOT NULL
      AND child_acc.new_owner_id != parent_acc.new_owner_id
    GROUP BY parent_acc.sfdc_account_id
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
          -- Start with hierarchy_bookings_arr_converted and subtract split children ARR
          NULLIF(a.hierarchy_bookings_arr_converted, 0) - COALESCE(split_children_arr.total_split_arr, 0),
          hierarchy_opp_data.total_arr,
          a.arr,
          0
        )
      ELSE COALESCE(a.arr, 0)  -- Child accounts use their own arr
    END,
    calculated_atr = CASE
      WHEN a.is_parent = true THEN COALESCE(hierarchy_opp_data.total_atr, 0)
      ELSE COALESCE(opp_data.total_atr, 0)
    END,
    cre_count = CASE
      WHEN a.is_parent = true THEN COALESCE(hierarchy_opp_data.cre_count, 0)
      ELSE COALESCE(opp_data.cre_count, 0)
    END
  FROM opp_data
  LEFT JOIN split_children_arr ON (a.is_parent = true AND split_children_arr.parent_id = a.sfdc_account_id)
  LEFT JOIN hierarchy_opp_data ON (a.is_parent = true AND hierarchy_opp_data.parent_account_id = a.sfdc_account_id)
  WHERE a.build_id = p_build_id
    AND (opp_data.sfdc_account_id = a.sfdc_account_id OR (a.is_parent = true AND hierarchy_opp_data.parent_account_id = a.sfdc_account_id));
    
  -- Handle accounts that don't have opportunities but are customers with ARR
  UPDATE public.accounts a
  SET 
    calculated_arr = CASE 
      WHEN a.is_parent = true THEN 
        COALESCE(
          NULLIF(a.hierarchy_bookings_arr_converted, 0) - COALESCE(
            (SELECT SUM(COALESCE(child_acc.arr, 0))
             FROM public.accounts child_acc
             WHERE child_acc.ultimate_parent_id = a.sfdc_account_id
               AND child_acc.build_id = p_build_id
               AND child_acc.is_parent = false
               AND child_acc.new_owner_id IS NOT NULL
               AND a.new_owner_id IS NOT NULL
               AND child_acc.new_owner_id != a.new_owner_id
            ), 0
          ),
          a.arr, 
          0
        )
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