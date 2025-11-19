// Phase 2 & 3: Robust Edge Function with Comprehensive Error Handling
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Configuration constants
const BATCH_SIZE = 10; // Smaller batch size to prevent timeouts
const BATCH_DELAY = 200; // ms between batches
const MAX_EXECUTION_TIME = 4 * 60 * 1000; // 4 minutes max execution time
const PROGRESS_LOG_INTERVAL = 5; // Log progress every N batches

serve(async (req) => {
  console.log(`[Recalculate Accounts] Request received: ${req.method}`);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use POST.' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { buildId } = await req.json();
    
    if (!buildId) {
      return new Response(
        JSON.stringify({ error: 'buildId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Recalculate Accounts] Processing build: ${buildId}`);

    // Initialize Supabase client with service role for full access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log(`[Recalculate Accounts] Supabase client initialized`);

    // Start background recalculation but don't await it
    backgroundRecalculation(supabase, buildId).catch(err => {
      console.error('Background recalculation failed:', err);
    });
    
    // Return immediate response
    return new Response(
      JSON.stringify({ 
        message: 'Account recalculation started',
        buildId: buildId,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[Recalculate Accounts] Error parsing request:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ 
        error: 'Invalid request format',
        details: errorMsg 
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Background recalculation function with comprehensive error handling
async function backgroundRecalculation(supabase: any, buildId: string) {
  const startTime = Date.now();
  console.log(`[Recalculate Accounts] Starting background recalculation for build: ${buildId}`);
  
  try {
    // First, try to use the database function with split ownership logic
    console.log(`[Recalculate Accounts] Calling update_account_calculated_values with split ownership logic...`);
    
    const { error: dbError } = await supabase.rpc('update_account_calculated_values', {
      p_build_id: buildId
    });
    
    if (!dbError) {
      const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[Recalculate Accounts] Database function completed successfully with split ownership adjustments in ${processingTime}s`);
      return;
    }
    
    if (dbError) {
      console.log(`[Recalculate Accounts] Database function failed: ${dbError.message}. Falling back to edge function processing...`);
    }
    
    // Fallback to manual processing if database function fails
    console.log(`[Recalculate Accounts] Processing accounts manually for build: ${buildId}`);
    
    // Get all accounts for the build
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('sfdc_account_id, account_name, is_parent, hierarchy_bookings_arr_converted, arr')
      .eq('build_id', buildId);

    if (accountsError) {
      throw new Error(`Failed to fetch accounts: ${accountsError.message}`);
    }

    if (!accounts || accounts.length === 0) {
      console.log(`[Recalculate Accounts] No accounts found for build: ${buildId}`);
      return;
    }

    console.log(`[Recalculate Accounts] Found ${accounts.length} accounts to process`);
    
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    
    // Process accounts in batches
    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
      const currentTime = Date.now();
      const elapsedTime = Math.floor((currentTime - startTime) / 1000);
      
      // Check for timeout
      if (currentTime - startTime > MAX_EXECUTION_TIME) {
        console.log(`[Recalculate Accounts] Timeout reached after ${elapsedTime}s. Processed ${successCount}/${accounts.length} accounts.`);
        break;
      }
      
      const batch = accounts.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(accounts.length / BATCH_SIZE);
      
      if (batchNum % PROGRESS_LOG_INTERVAL === 1 || batchNum === totalBatches) {
        console.log(`[Recalculate Accounts] Processing batch ${batchNum}/${totalBatches}, accounts ${i + 1}-${Math.min(i + BATCH_SIZE, accounts.length)} (${elapsedTime}s elapsed)`);
      }
      
      let batchSuccessCount = 0;
      
      // Process each account in the batch
      for (const account of batch) {
        try {
          await processAccount(supabase, buildId, account);
          batchSuccessCount++;
          successCount++;
        } catch (error) {
          console.error(`[Recalculate Accounts] Error processing account ${account.sfdc_account_id}:`, error);
          errorCount++;
        }
        processedCount++;
      }
      
      if (batchNum % PROGRESS_LOG_INTERVAL === 0 || batchNum === totalBatches) {
        console.log(`[Recalculate Accounts] Batch ${batchNum} completed: ${batchSuccessCount}/${batch.length} accounts updated successfully`);
      }
      
      // Add delay between batches to prevent overwhelming the database
      if (i + BATCH_SIZE < accounts.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }
    
    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    console.log(`[Recalculate Accounts] Recalculation completed for build ${buildId}: ${successCount} successful, ${errorCount} errors, ${totalTime}s total time`);
    
  } catch (error) {
    const totalTime = Math.floor((Date.now() - startTime) / 1000);
    console.error(`[Recalculate Accounts] Fatal error in background recalculation after ${totalTime}s:`, error);
    throw error;
  }
}

// Process individual account with robust error handling
async function processAccount(supabase: any, buildId: string, account: any) {
  const { sfdc_account_id } = account;
  
  try {
    // Get opportunities for this account
    const { data: opportunities, error: oppError } = await supabase
      .from('opportunities')
      .select('amount, available_to_renew, opportunity_type, cre_status')
      .eq('build_id', buildId)
      .eq('sfdc_account_id', sfdc_account_id);

    if (oppError) {
      throw new Error(`Failed to fetch opportunities: ${oppError.message}`);
    }

    // Calculate values
    let calculated_arr = 0;
    let calculated_atr = 0;
    let cre_count = 0;

    // ARR calculation
    if (account.is_parent && account.hierarchy_bookings_arr_converted > 0) {
      calculated_arr = account.hierarchy_bookings_arr_converted;
    } else if (opportunities && opportunities.length > 0) {
      // Sum unique opportunity amounts
      const uniqueAmounts = new Set();
      opportunities.forEach((opp: any) => {
        if (opp.amount && opp.amount > 0) {
          uniqueAmounts.add(opp.amount);
        }
      });
      calculated_arr = Array.from(uniqueAmounts).reduce((sum: number, amount: any) => sum + amount, 0);
    } else {
      calculated_arr = account.arr || 0;
    }

    // ATR calculation - ONLY from "Renewals" opportunities
    if (opportunities && opportunities.length > 0) {
      const renewalOpps = opportunities.filter((opp: any) => opp.opportunity_type === 'Renewals');
      const uniqueATRAmounts = new Set();
      renewalOpps.forEach((opp: any) => {
        if (opp.available_to_renew && opp.available_to_renew > 0) {
          uniqueATRAmounts.add(opp.available_to_renew);
        }
      });
      calculated_atr = Array.from(uniqueATRAmounts).reduce((sum: number, amount: any) => sum + amount, 0);
    }

    // CRE count
    if (opportunities && opportunities.length > 0) {
      cre_count = opportunities.filter((opp: any) => opp.cre_status && opp.cre_status.trim() !== '').length;
    }

    // Update the account
    const { error: updateError } = await supabase
      .from('accounts')
      .update({
        calculated_arr: calculated_arr,
        calculated_atr: calculated_atr,
        cre_count: cre_count
      })
      .eq('build_id', buildId)
      .eq('sfdc_account_id', sfdc_account_id);

    if (updateError) {
      throw new Error(`Failed to update account: ${updateError.message}`);
    }

  } catch (error) {
    console.error(`[Recalculate Accounts] Error processing account ${sfdc_account_id}:`, error);
    throw error;
  }
}

// Handle shutdown events
addEventListener('beforeunload', (ev: any) => {
  console.log(`[Recalculate Accounts] Function shutdown due to: ${ev.detail?.reason || 'unknown'}`);
});