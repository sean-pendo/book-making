import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting assignment sync function');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { buildId } = await req.json();
    
    if (!buildId) {
      throw new Error('buildId is required');
    }

    console.log(`Syncing missing assignments for build: ${buildId}`);

    // Call the sync function
    const { data, error } = await supabase.rpc('sync_missing_assignments', {
      p_build_id: buildId
    });

    if (error) {
      console.error('Error syncing assignments:', error);
      throw error;
    }

    const syncedCount = data?.[0]?.synced_count || 0;
    console.log(`Successfully synced ${syncedCount} missing assignment records`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        syncedCount,
        message: `Synced ${syncedCount} missing assignment records`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Assignment sync function error:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMsg 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})