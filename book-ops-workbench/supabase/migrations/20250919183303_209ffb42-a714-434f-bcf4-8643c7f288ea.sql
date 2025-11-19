-- Fix the SQL structure in the batch function
CREATE OR REPLACE FUNCTION public.update_account_calculated_values_batch(p_build_id uuid, p_batch_size integer DEFAULT 500)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    batch_count integer := 0;
    total_processed integer := 0;
    accounts_cursor CURSOR FOR 
        SELECT sfdc_account_id FROM public.accounts 
        WHERE build_id = p_build_id 
        ORDER BY sfdc_account_id;
    account_batch text[] := '{}';
    account_rec RECORD;
BEGIN
    -- Process accounts in batches
    FOR account_rec IN accounts_cursor LOOP
        account_batch := array_append(account_batch, account_rec.sfdc_account_id);
        
        -- When we reach batch size, process the batch
        IF array_length(account_batch, 1) >= p_batch_size THEN
            -- Update this batch using a simpler approach
            UPDATE public.accounts 
            SET 
                calculated_arr = CASE 
                    WHEN is_parent = true THEN 
                        COALESCE(
                            NULLIF(hierarchy_bookings_arr_converted, 0),
                            (SELECT SUM(COALESCE(o.amount, 0)) 
                             FROM public.opportunities o 
                             LEFT JOIN public.accounts child_acc ON child_acc.ultimate_parent_id = accounts.sfdc_account_id AND child_acc.build_id = p_build_id
                             WHERE o.build_id = p_build_id 
                               AND (o.sfdc_account_id = accounts.sfdc_account_id OR o.sfdc_account_id = child_acc.sfdc_account_id)),
                            arr,
                            0
                        )
                    ELSE 
                        COALESCE(
                            (SELECT SUM(COALESCE(o.amount, 0)) 
                             FROM public.opportunities o 
                             WHERE o.build_id = p_build_id AND o.sfdc_account_id = accounts.sfdc_account_id),
                            arr, 
                            0
                        )
                END,
                calculated_atr = CASE
                    WHEN is_parent = true THEN 
                        COALESCE(
                            (SELECT SUM(CASE WHEN LOWER(TRIM(o.opportunity_type)) = 'renewals' THEN COALESCE(o.available_to_renew, 0) ELSE 0 END) 
                             FROM public.opportunities o 
                             LEFT JOIN public.accounts child_acc ON child_acc.ultimate_parent_id = accounts.sfdc_account_id AND child_acc.build_id = p_build_id
                             WHERE o.build_id = p_build_id 
                               AND (o.sfdc_account_id = accounts.sfdc_account_id OR o.sfdc_account_id = child_acc.sfdc_account_id)),
                            0
                        )
                    ELSE 
                        COALESCE(
                            (SELECT SUM(CASE WHEN LOWER(TRIM(o.opportunity_type)) = 'renewals' THEN COALESCE(o.available_to_renew, 0) ELSE 0 END) 
                             FROM public.opportunities o 
                             WHERE o.build_id = p_build_id AND o.sfdc_account_id = accounts.sfdc_account_id),
                            0
                        )
                END,
                cre_count = CASE
                    WHEN is_parent = true THEN 
                        COALESCE(
                            (SELECT COUNT(CASE WHEN o.cre_status IS NOT NULL AND o.cre_status != '' THEN 1 END) 
                             FROM public.opportunities o 
                             LEFT JOIN public.accounts child_acc ON child_acc.ultimate_parent_id = accounts.sfdc_account_id AND child_acc.build_id = p_build_id
                             WHERE o.build_id = p_build_id 
                               AND (o.sfdc_account_id = accounts.sfdc_account_id OR o.sfdc_account_id = child_acc.sfdc_account_id)),
                            0
                        )
                    ELSE 
                        COALESCE(
                            (SELECT COUNT(CASE WHEN o.cre_status IS NOT NULL AND o.cre_status != '' THEN 1 END) 
                             FROM public.opportunities o 
                             WHERE o.build_id = p_build_id AND o.sfdc_account_id = accounts.sfdc_account_id),
                            0
                        )
                END
            WHERE build_id = p_build_id
                AND sfdc_account_id = ANY(account_batch);

            total_processed := total_processed + array_length(account_batch, 1);
            batch_count := batch_count + 1;
            
            -- Reset batch
            account_batch := '{}';
            
            -- Add a small delay between batches to prevent overwhelming the database
            PERFORM pg_sleep(0.1);
        END IF;
    END LOOP;
    
    -- Process any remaining accounts in the last batch
    IF array_length(account_batch, 1) > 0 THEN
        UPDATE public.accounts 
        SET 
            calculated_arr = CASE 
                WHEN is_parent = true THEN 
                    COALESCE(
                        NULLIF(hierarchy_bookings_arr_converted, 0),
                        (SELECT SUM(COALESCE(o.amount, 0)) 
                         FROM public.opportunities o 
                         LEFT JOIN public.accounts child_acc ON child_acc.ultimate_parent_id = accounts.sfdc_account_id AND child_acc.build_id = p_build_id
                         WHERE o.build_id = p_build_id 
                           AND (o.sfdc_account_id = accounts.sfdc_account_id OR o.sfdc_account_id = child_acc.sfdc_account_id)),
                        arr,
                        0
                    )
                ELSE 
                    COALESCE(
                        (SELECT SUM(COALESCE(o.amount, 0)) 
                         FROM public.opportunities o 
                         WHERE o.build_id = p_build_id AND o.sfdc_account_id = accounts.sfdc_account_id),
                        arr, 
                        0
                    )
            END,
            calculated_atr = CASE
                WHEN is_parent = true THEN 
                    COALESCE(
                        (SELECT SUM(CASE WHEN LOWER(TRIM(o.opportunity_type)) = 'renewals' THEN COALESCE(o.available_to_renew, 0) ELSE 0 END) 
                         FROM public.opportunities o 
                         LEFT JOIN public.accounts child_acc ON child_acc.ultimate_parent_id = accounts.sfdc_account_id AND child_acc.build_id = p_build_id
                         WHERE o.build_id = p_build_id 
                           AND (o.sfdc_account_id = accounts.sfdc_account_id OR o.sfdc_account_id = child_acc.sfdc_account_id)),
                        0
                    )
                ELSE 
                    COALESCE(
                        (SELECT SUM(CASE WHEN LOWER(TRIM(o.opportunity_type)) = 'renewals' THEN COALESCE(o.available_to_renew, 0) ELSE 0 END) 
                         FROM public.opportunities o 
                         WHERE o.build_id = p_build_id AND o.sfdc_account_id = accounts.sfdc_account_id),
                        0
                    )
            END,
            cre_count = CASE
                WHEN is_parent = true THEN 
                    COALESCE(
                        (SELECT COUNT(CASE WHEN o.cre_status IS NOT NULL AND o.cre_status != '' THEN 1 END) 
                         FROM public.opportunities o 
                         LEFT JOIN public.accounts child_acc ON child_acc.ultimate_parent_id = accounts.sfdc_account_id AND child_acc.build_id = p_build_id
                         WHERE o.build_id = p_build_id 
                           AND (o.sfdc_account_id = accounts.sfdc_account_id OR o.sfdc_account_id = child_acc.sfdc_account_id)),
                        0
                    )
                ELSE 
                    COALESCE(
                        (SELECT COUNT(CASE WHEN o.cre_status IS NOT NULL AND o.cre_status != '' THEN 1 END) 
                         FROM public.opportunities o 
                         WHERE o.build_id = p_build_id AND o.sfdc_account_id = accounts.sfdc_account_id),
                        0
                    )
            END
        WHERE build_id = p_build_id
            AND sfdc_account_id = ANY(account_batch);

        total_processed := total_processed + array_length(account_batch, 1);
        batch_count := batch_count + 1;
    END IF;
    
    -- Handle accounts that don't have opportunities but are customers with ARR
    UPDATE public.accounts 
    SET 
        calculated_arr = CASE 
            WHEN is_parent = true THEN COALESCE(NULLIF(hierarchy_bookings_arr_converted, 0), arr, 0)
            ELSE COALESCE(arr, 0)
        END,
        calculated_atr = 0,
        cre_count = 0
    WHERE build_id = p_build_id
        AND calculated_arr = 0
        AND (
            (is_parent = true AND (hierarchy_bookings_arr_converted > 0 OR arr > 0)) OR
            (is_parent = false AND arr > 0)
        )
        AND NOT EXISTS (
            SELECT 1 FROM public.opportunities o 
            WHERE o.sfdc_account_id = accounts.sfdc_account_id 
                AND o.build_id = p_build_id
        );

    -- Log completion
    RAISE NOTICE 'Processed % accounts in % batches', total_processed, batch_count;
END;
$function$;