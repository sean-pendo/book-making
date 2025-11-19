import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { mode, repWorkloads, goals, constraints, availableAccounts, imbalancedRegions, movableAccounts, targetUnderloadedReps } = body;

    // Handle rebalancing mode
    if (mode === 'rebalance') {
      return await handleRebalanceMode(imbalancedRegions, movableAccounts, targetUnderloadedReps);
    }

    // Handle FINAL_ARBITER mode
    if (mode === 'FINAL_ARBITER') {
      return await handleFinalArbiterMode(body.proposals, body.repWorkloads, body.constraints);
    }

    // Handle original optimization mode
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const prompt = `You are an expert at multi-dimensional sales territory balancing. Analyze the current state and suggest optimal account moves.

**CURRENT REP WORKLOADS:**
${repWorkloads.map((rep: any) => `
- ${rep.repName} (${rep.region}):
  - ARR: $${(rep.arr / 1000000).toFixed(2)}M
  - ATR: $${(rep.atr / 1000000).toFixed(2)}M
  - Customer Count: ${rep.customerCount}
  - CRE Risk Accounts: ${rep.creRiskCount}
  - Q1 Renewals: ${rep.renewalsQ1}, Q2: ${rep.renewalsQ2}, Q3: ${rep.renewalsQ3}, Q4: ${rep.renewalsQ4}
  - Enterprise: ${rep.enterpriseCount}, Commercial: ${rep.commercialCount}
`).join('')}

**OPTIMIZATION GOALS (by priority):**
1. ARR Balance (priority ${goals.arrBalance.priority}): Target $${(goals.arrBalance.minARR / 1000000).toFixed(1)}M - $${(goals.arrBalance.maxARR / 1000000).toFixed(1)}M, max ${goals.arrBalance.targetVariance}% variance
2. Customer Count (priority ${goals.customerCountBalance.priority}): Within ±${goals.customerCountBalance.maxDeviation} accounts
3. Risk Distribution (priority ${goals.riskDistribution.priority}): Max ${goals.riskDistribution.maxCREPerRep} CRE risk accounts per rep
4. ATR Balance (priority ${goals.atrBalance.priority}): Within ${goals.atrBalance.targetVariance}% of average
5. Renewal Timing (priority ${goals.renewalTiming.priority}): Even quarterly distribution (${goals.renewalTiming.targetQuarterlyVariance}% variance)
6. Tier Mix (priority ${goals.tierMix.priority}): Target ${(goals.tierMix.enterpriseCommercialRatio * 100).toFixed(0)}% enterprise

**CONSTRAINTS:**
- Must stay in same region: ${constraints.mustStayInRegion}
- Maintain continuity (>90 days): ${constraints.maintainContinuity}
- Max moves per rep: ${constraints.maxMovesPerRep}
- Max total moves: ${constraints.maxTotalMoves}

**AVAILABLE ACCOUNTS FOR MOVES:**
${availableAccounts.slice(0, 50).map((acc: any) => 
  `- ${acc.name}: $${(acc.arr / 1000000).toFixed(2)}M ARR, $${(acc.atr / 1000000).toFixed(2)}M ATR, ${acc.isHighRisk ? 'HIGH RISK' : 'normal'}, ${acc.tier}, current owner: ${acc.currentOwner}`
).join('\n')}
${availableAccounts.length > 50 ? `... and ${availableAccounts.length - 50} more accounts` : ''}

Suggest 5-15 account moves that optimize ALL dimensions. Consider trade-offs between goals based on their priorities.

**OUTPUT FORMAT (JSON):**
{
  "suggestions": [
    {
      "accountName": "Account Name",
      "accountARR": 500000,
      "accountATR": 200000,
      "isHighRisk": false,
      "renewalQuarter": "Q2",
      "tier": "Enterprise",
      "fromRepName": "Current Owner",
      "toRepName": "New Owner",
      "reasoning": "Moves $0.5M ARR to underloaded rep, reduces risk concentration, balances Q2 renewals",
      "dimensionImpacts": {
        "arrBalance": "+12%",
        "customerCount": "+1 to target",
        "riskDistribution": "+15%",
        "atrBalance": "+8%",
        "renewalTiming": "+5%",
        "tierMix": "neutral"
      },
      "priority": 1
    }
  ],
  "overallStrategy": "2-3 sentence explanation of the balancing approach"
}

Return ONLY valid JSON, no markdown formatting.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a territory balancing expert. Always return valid JSON with practical, executable suggestions.' },
          { role: 'user', content: prompt }
        ],
        max_completion_tokens: 4000  // Fix 4: Increased token limit
      })
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits depleted. Please add credits to your workspace.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const aiContent = aiResponse.choices[0].message.content;
    
    let parsedSuggestions;
    try {
      const jsonMatch = aiContent.match(/```json\n([\s\S]*?)\n```/) || aiContent.match(/```\n([\s\S]*?)\n```/);
      const jsonString = jsonMatch ? jsonMatch[1] : aiContent;
      parsedSuggestions = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiContent);
      throw new Error('AI returned invalid JSON format');
    }
    
    return new Response(JSON.stringify({
      suggestions: parsedSuggestions.suggestions || [],
      overallStrategy: parsedSuggestions.overallStrategy || 'AI optimization completed'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error in ai-balance-optimizer:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      suggestions: [],
      overallStrategy: 'Optimization failed'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

/**
 * Handle rebalancing mode - suggest account moves to balance regions
 */
async function handleRebalanceMode(
  imbalancedRegions: any[],
  movableAccounts: any[],
  targetUnderloadedReps: any[]
) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const prompt = `You are a sales territory rebalancing expert. Analyze the regional imbalances and suggest optimal account moves.

**IMBALANCED REGIONS:**
${imbalancedRegions.map((region: any) => `
Region: ${region.region}
- Target ARR per rep: $${(region.targetARR / 1000000).toFixed(2)}M
- Overloaded reps: ${region.overloaded.map((r: any) => `${r.name} ($${(r.arr / 1000000).toFixed(2)}M, +${r.variance.toFixed(1)}%)`).join(', ')}
- Underloaded reps: ${region.underloaded.map((r: any) => `${r.name} ($${(r.arr / 1000000).toFixed(2)}M, ${r.variance.toFixed(1)}%)`).join(', ')}
`).join('\n')}

**MOVABLE ACCOUNTS (from overloaded reps):**
${movableAccounts.slice(0, 20).map((acc: any) => 
  `- ${acc.account_name}: $${(acc.arr / 1000000).toFixed(2)}M ARR, current owner: ${acc.current_owner_name} (${acc.region})`
).join('\n')}

**TARGET UNDERLOADED REPS:**
${targetUnderloadedReps.map((rep: any) =>
  `- ${rep.name} (${rep.region}): $${(rep.arr / 1000000).toFixed(2)}M ARR (${rep.variance.toFixed(1)}% below target)`
).join('\n')}

**GUIDELINES:**
1. Prioritize moving smallest accounts first (easier to balance)
2. Keep accounts within the same region when possible
3. Aim to bring all reps within ±10% of target ARR
4. Suggest 3-8 moves maximum
5. Calculate estimated impact on both source and target reps

**OUTPUT FORMAT (JSON):**
{
  "suggestions": [
    {
      "accountId": "account_sfdc_id",
      "accountName": "Account Name",
      "accountARR": 500000,
      "fromRepName": "Overloaded Rep",
      "toRepName": "Underloaded Rep",
      "reason": "Moving $0.5M from overloaded rep (currently +15% over target) to underloaded rep (currently -12% under target)",
      "estimatedImpact": "Brings source rep to +10% and target rep to -5%, improving overall balance by 7%"
    }
  ]
}

Return ONLY valid JSON, no markdown formatting.`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'You are a territory rebalancing expert. Always return valid JSON with practical, executable suggestions.' },
        { role: 'user', content: prompt }
      ],
      max_completion_tokens: 2000
    })
  });

  if (!response.ok) {
    if (response.status === 429) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.', suggestions: [] }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: 'AI credits depleted. Please add credits to your workspace.', suggestions: [] }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`AI API error: ${response.status}`);
  }

  const aiResponse = await response.json();
  const aiContent = aiResponse.choices[0].message.content;
  
  let parsedSuggestions;
  try {
    const jsonMatch = aiContent.match(/```json\n([\s\S]*?)\n```/) || aiContent.match(/```\n([\s\S]*?)\n```/);
    const jsonString = jsonMatch ? jsonMatch[1] : aiContent;
    parsedSuggestions = JSON.parse(jsonString);
  } catch (parseError) {
    console.error('Failed to parse AI response:', aiContent);
    throw new Error('AI returned invalid JSON format');
  }
  
  return new Response(JSON.stringify({
    suggestions: parsedSuggestions.suggestions || []
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

/**
 * Handle FINAL_ARBITER mode - AI reviews initial proposals and decides ACCEPT or OVERRIDE
 */
async function handleFinalArbiterMode(
  proposals: any[],
  repWorkloads: any[],
  constraints: any
) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const prompt = `You are reviewing initial account assignment proposals generated by a multi-criteria scoring system. Your job is to cross-check for balance issues and override assignments when necessary.

**INITIAL PROPOSALS (${proposals.length} accounts):**
${proposals.map((p: any) => `
- ${p.accountName}: $${(p.accountARR / 1000000).toFixed(2)}M ARR, CRE: ${p.creCount}, Tier: ${p.tier}
  → Proposed: ${p.proposedOwner}
  → Current: ${p.currentOwner || 'None'}
  → Rationale: ${p.rationale}
`).join('')}

**CURRENT REP WORKLOADS:**
${repWorkloads.map((rep: any) => `
- ${rep.repName} (${rep.region}): $${(rep.currentARR / 1000000).toFixed(2)}M ARR, ${rep.currentAccounts} accounts
`).join('')}

**HARD CONSTRAINTS:**
- Target ARR per rep: $${(constraints.targetARR / 1000000).toFixed(1)}M (must stay within $1.2M-$3M)
- Max CRE per rep: ${constraints.maxCREPerRep}

**YOUR TASK:**
For each proposal, decide:
1. **ACCEPT** - If the assignment is optimal and maintains balance
2. **OVERRIDE** - If you can find a better rep that improves overall balance

**OVERRIDE ONLY IF:**
- The proposed rep is approaching capacity (>$2.8M) and another rep has <$2M
- The assignment would exceed max CRE limit
- Moving to another rep would significantly improve balance (>15% improvement)

**OUTPUT FORMAT (JSON):**
{
  "decisions": [
    {
      "accountId": "sfdc_account_id",
      "decision": "ACCEPT" | "OVERRIDE",
      "proposedOwner": "rep_id_or_name",
      "rationale": "Why this decision improves balance"
    }
  ],
  "summary": "Overall balancing strategy and % of overrides"
}

**IMPORTANT:** Be conservative - only override if there's a clear 15%+ balance improvement. Most proposals should be ACCEPTED.

Return ONLY valid JSON, no markdown formatting.`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'You are a conservative territory balancing arbiter. Only override assignments when there is clear (>15%) balance improvement. Most proposals should be ACCEPTED.' },
        { role: 'user', content: prompt }
      ],
      max_completion_tokens: 8000  // Fix 4: Increased from 3000 to handle large proposal sets
    })
  });

  if (!response.ok) {
    if (response.status === 429) {
      return new Response(JSON.stringify({ 
        error: 'Rate limit exceeded. Please try again in a moment.', 
        decisions: proposals.map((p: any) => ({ accountId: p.accountId, decision: 'ACCEPT' })) 
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ 
        error: 'AI credits depleted. Please add credits to your workspace.', 
        decisions: proposals.map((p: any) => ({ accountId: p.accountId, decision: 'ACCEPT' }))
      }), {
        status: 402,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`AI API error: ${response.status}`);
  }

  const aiResponse = await response.json();
  const aiContent = aiResponse.choices[0].message.content;
  
  let parsedDecisions;
  try {
    // Fix 4: Enhanced parsing with truncation fallback
    const jsonMatch = aiContent.match(/```json\n([\s\S]*?)\n```/) || aiContent.match(/```\n([\s\S]*?)\n```/);
    const jsonString = jsonMatch ? jsonMatch[1] : aiContent;
    parsedDecisions = JSON.parse(jsonString);
  } catch (parseError) {
    console.error('Failed to parse AI response:', aiContent);
    
    // Try to extract partial JSON if response was truncated
    try {
      // Look for the decisions array specifically
      const decisionsMatch = aiContent.match(/"decisions":\s*\[([\s\S]*)\]/);
      if (decisionsMatch) {
        // Try to parse just the decisions array
        const decisionsStr = decisionsMatch[1];
        // Find complete decision objects (those ending with })
        const completeDecisions = decisionsStr.match(/\{[^}]*\}/g) || [];
        const parsed = completeDecisions.map((d: string) => JSON.parse(d));
        
        console.log(`Parsed ${parsed.length} decisions from truncated response`);
        parsedDecisions = { 
          decisions: parsed,
          summary: `Partial parsing: recovered ${parsed.length} decisions from truncated AI response`
        };
      } else {
        throw new Error('Could not extract decisions from truncated response');
      }
    } catch (fallbackError) {
      console.error('Fallback parsing also failed:', fallbackError);
      // Last resort: accept all proposals
      return new Response(JSON.stringify({
        decisions: proposals.map((p: any) => ({ accountId: p.accountId, decision: 'ACCEPT' })),
        summary: 'AI parsing failed completely, accepted all proposals'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
  
  return new Response(JSON.stringify({
    decisions: parsedDecisions.decisions || [],
    summary: parsedDecisions.summary || 'AI arbitration completed'
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
