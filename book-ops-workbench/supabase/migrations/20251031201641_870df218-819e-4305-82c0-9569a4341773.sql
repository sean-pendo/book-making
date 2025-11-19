-- Fix the update_account_calculated_values function with proper CTE scoping
CREATE OR REPLACE FUNCTION public.update_account_calculated_values(p_build_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Update all accounts in a single operation
  -- Calculate split children ARR and apply to parent accounts
  WITH split_children_arr AS (
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
  )
  UPDATE public.accounts a
  SET calculated_arr = CASE 
    WHEN a.is_parent = true THEN 
      -- For parents: hierarchy_bookings_arr_converted minus split children ARR
      COALESCE(
        NULLIF(a.hierarchy_bookings_arr_converted, 0) - COALESCE(s.total_split_arr, 0),
        a.hierarchy_bookings_arr_converted,
        a.arr,
        0
      )
    ELSE 
      -- For children: use their own ARR
      COALESCE(a.arr, 0)
  END
  FROM split_children_arr s
  WHERE a.build_id = p_build_id
    AND (a.is_parent = false OR s.parent_id = a.sfdc_account_id);
  
  -- Update parent accounts that don't have split children
  UPDATE public.accounts a
  SET calculated_arr = COALESCE(
    NULLIF(a.hierarchy_bookings_arr_converted, 0),
    a.arr,
    0
  )
  WHERE a.build_id = p_build_id
    AND a.is_parent = true
    AND calculated_arr = COALESCE(a.hierarchy_bookings_arr_converted, a.arr, 0); -- Only update if not already modified by split logic
    
  RAISE NOTICE 'Updated calculated_arr for all accounts in build %', p_build_id;
END;
$function$;