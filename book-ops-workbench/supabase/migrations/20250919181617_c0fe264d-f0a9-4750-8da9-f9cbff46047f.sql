-- Update the account calculated values function to use opportunity_type instead of renewal_event_date for ATR calculation
CREATE OR REPLACE FUNCTION public.update_account_calculated_values(p_build_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- First, update calculated values for all accounts (both parent and child)
  UPDATE public.accounts a
  SET 
    calculated_arr = CASE 
      -- For parent accounts, use hierarchy_bookings_arr_converted if available, otherwise calculate from opportunities
      WHEN a.is_parent = true THEN 
        COALESCE(
          NULLIF(a.hierarchy_bookings_arr_converted, 0),
          hierarchy_opp_data.total_arr,
          a.arr,
          0
        )
      -- For child accounts, use individual calculation
      ELSE COALESCE(opp_data.total_arr, a.arr, 0)
    END,
    calculated_atr = CASE
      -- For parent accounts, roll up ATR from all opportunities in the hierarchy
      WHEN a.is_parent = true THEN COALESCE(hierarchy_opp_data.total_atr, 0)
      -- For child accounts, use individual opportunities
      ELSE COALESCE(opp_data.total_atr, 0)
    END,
    cre_count = CASE
      -- For parent accounts, count CRE across hierarchy
      WHEN a.is_parent = true THEN COALESCE(hierarchy_opp_data.cre_count, 0)
      -- For child accounts, use individual count
      ELSE COALESCE(opp_data.cre_count, 0)
    END
  FROM (
    -- Individual account opportunity data
    SELECT 
      o.sfdc_account_id,
      SUM(COALESCE(o.amount, 0)) as total_arr,
      -- ATR: Only sum available_to_renew for 'Renewals' opportunity type
      SUM(CASE WHEN LOWER(TRIM(o.opportunity_type)) = 'renewals' THEN COALESCE(o.available_to_renew, 0) ELSE 0 END) as total_atr,
      COUNT(CASE WHEN o.cre_status IS NOT NULL AND o.cre_status != '' THEN 1 END) as cre_count
    FROM public.opportunities o
    WHERE o.build_id = p_build_id
    GROUP BY o.sfdc_account_id
  ) opp_data
  LEFT JOIN (
    -- Hierarchy opportunity data (for parent accounts)
    SELECT 
      parent_acc.sfdc_account_id as parent_account_id,
      SUM(COALESCE(o.amount, 0)) as total_arr,
      -- ATR: Only sum available_to_renew for 'Renewals' opportunity type
      SUM(CASE WHEN LOWER(TRIM(o.opportunity_type)) = 'renewals' THEN COALESCE(o.available_to_renew, 0) ELSE 0 END) as total_atr,
      COUNT(CASE WHEN o.cre_status IS NOT NULL AND o.cre_status != '' THEN 1 END) as cre_count
    FROM public.accounts parent_acc
    LEFT JOIN public.accounts child_acc ON (
      child_acc.ultimate_parent_id = parent_acc.sfdc_account_id 
      AND child_acc.build_id = p_build_id
    )
    LEFT JOIN public.opportunities o ON (
      (o.sfdc_account_id = parent_acc.sfdc_account_id OR o.sfdc_account_id = child_acc.sfdc_account_id)
      AND o.build_id = p_build_id
    )
    WHERE parent_acc.build_id = p_build_id 
      AND parent_acc.is_parent = true
    GROUP BY parent_acc.sfdc_account_id
  ) hierarchy_opp_data ON (
    a.sfdc_account_id = hierarchy_opp_data.parent_account_id 
    AND a.is_parent = true
  )
  WHERE a.build_id = p_build_id
    AND (opp_data.sfdc_account_id = a.sfdc_account_id OR a.is_parent = true);
    
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
$function$