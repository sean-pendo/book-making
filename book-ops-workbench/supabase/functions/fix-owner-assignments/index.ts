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
    console.log('Starting fix-owner-assignments function');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { buildId } = await req.json();
    
    if (!buildId) {
      throw new Error('buildId is required');
    }

    console.log(`Fixing owner assignments for build: ${buildId}`);

    // Call the fix function
    const { data, error } = await supabase.rpc('fix_account_owner_assignments', {
      p_build_id: buildId
    });

    if (error) {
      console.error('Error fixing owner assignments:', error);
      throw error;
    }

    const updatedCount = data?.[0]?.updated_count || 0;
    console.log(`Successfully fixed ${updatedCount} account owner assignments`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        updatedCount,
        message: `Fixed ${updatedCount} account owner assignments`
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Fix owner assignments function error:', error);
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
