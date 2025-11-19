import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { buildId } = await req.json()
    
    if (!buildId) {
      throw new Error('buildId is required')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log(`Calculating balance thresholds for build: ${buildId}`)

    // Fetch customer accounts
    const { data: customerAccounts, error: accountsError } = await supabase
      .from('accounts')
      .select('cre_count, calculated_atr, expansion_tier, renewal_quarter')
      .eq('build_id', buildId)
      .eq('is_parent', true)
      .eq('is_customer', true)

    if (accountsError) throw accountsError
    if (!customerAccounts || customerAccounts.length === 0) {
      throw new Error('No customer accounts found')
    }

    // Fetch active normal reps with regions
    const { data: activeReps, error: repsError } = await supabase
      .from('sales_reps')
      .select('rep_id, region, is_strategic_rep, is_active')
      .eq('build_id', buildId)
      .eq('is_active', true)
      .eq('is_strategic_rep', false)
      .not('region', 'is', null)
      .neq('region', '')

    if (repsError) throw repsError
    if (!activeReps || activeReps.length === 0) {
      throw new Error('No active normal reps with regions found')
    }

    const normalRepCount = activeReps.length

    // Aggregate totals
    let totalCRE = 0
    let totalATR = 0
    let totalTier1 = 0
    let totalTier2 = 0
    let q1Count = 0, q2Count = 0, q3Count = 0, q4Count = 0

    customerAccounts.forEach(account => {
      totalCRE += account.cre_count || 0
      totalATR += account.calculated_atr || 0
      
      const tier = account.expansion_tier?.toLowerCase()
      if (tier === 'tier 1' || tier === 'tier1') totalTier1++
      if (tier === 'tier 2' || tier === 'tier2') totalTier2++
      
      const quarter = account.renewal_quarter?.toUpperCase()
      if (quarter === 'Q1') q1Count++
      if (quarter === 'Q2') q2Count++
      if (quarter === 'Q3') q3Count++
      if (quarter === 'Q4') q4Count++
    })

    // Fetch current variances from config
    const { data: currentConfig } = await supabase
      .from('assignment_configuration')
      .select('cre_variance, atr_variance, tier1_variance, tier2_variance')
      .eq('build_id', buildId)
      .eq('account_scope', 'all')
      .single()

    const creVariance = (currentConfig?.cre_variance || 20) / 100
    const atrVariance = (currentConfig?.atr_variance || 20) / 100
    const tier1Variance = (currentConfig?.tier1_variance || 25) / 100
    const tier2Variance = (currentConfig?.tier2_variance || 25) / 100

    // Calculate targets and ranges
    const creTarget = totalCRE / normalRepCount
    const atrTarget = totalATR / normalRepCount
    const tier1Target = totalTier1 / normalRepCount
    const tier2Target = totalTier2 / normalRepCount

    const calculated = {
      cre_target: parseFloat(creTarget.toFixed(2)),
      cre_min: Math.floor(creTarget * (1 - creVariance)),
      cre_max: Math.ceil(creTarget * (1 + creVariance)),
      
      atr_target: parseFloat(atrTarget.toFixed(2)),
      atr_min: Math.floor(atrTarget * (1 - atrVariance)),
      atr_max: Math.ceil(atrTarget * (1 + atrVariance)),
      
      tier1_target: parseFloat(tier1Target.toFixed(2)),
      tier1_min: Math.floor(tier1Target * (1 - tier1Variance)),
      tier1_max: Math.ceil(tier1Target * (1 + tier1Variance)),
      
      tier2_target: parseFloat(tier2Target.toFixed(2)),
      tier2_min: Math.floor(tier2Target * (1 - tier2Variance)),
      tier2_max: Math.ceil(tier2Target * (1 + tier2Variance)),
      
      q1_renewal_target: parseFloat((q1Count / normalRepCount).toFixed(2)),
      q2_renewal_target: parseFloat((q2Count / normalRepCount).toFixed(2)),
      q3_renewal_target: parseFloat((q3Count / normalRepCount).toFixed(2)),
      q4_renewal_target: parseFloat((q4Count / normalRepCount).toFixed(2)),
      
      last_calculated_at: new Date().toISOString(),
      based_on_account_count: customerAccounts.length,
      based_on_rep_count: normalRepCount
    }

    console.log('Calculated thresholds:', calculated)

    // Update assignment_configuration
    const { error: updateError } = await supabase
      .from('assignment_configuration')
      .update(calculated)
      .eq('build_id', buildId)
      .eq('account_scope', 'all')

    if (updateError) throw updateError

    return new Response(
      JSON.stringify({ 
        success: true, 
        thresholds: calculated,
        message: `Thresholds calculated for ${customerAccounts.length} accounts across ${normalRepCount} reps`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error calculating thresholds:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
