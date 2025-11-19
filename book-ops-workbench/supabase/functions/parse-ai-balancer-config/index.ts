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
    const { naturalLanguageInput } = await req.json();
    
    if (!naturalLanguageInput || typeof naturalLanguageInput !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Natural language input is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Parsing AI Balancer config from natural language:', naturalLanguageInput);

    // Use tool calling to extract structured configuration
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an AI Balancer Configuration Parser. Extract balancing parameters from natural language requests.

WEIGHTED PRIORITY PARSING:
- "slightly prefer", "lean towards" → soft constraint (set flag but priority is lower)
- "prefer", "prioritize" → medium constraint (normal priority)
- "strongly prefer", "heavily favor" → high constraint (increase related threshold/importance)
- "must", "required", "critical" → hard constraint (set to true/required)
- "flexible", "optional", "not critical" → low/no constraint (set to false or permissive threshold)

COMPLEX CONSTRAINT PARSING:
- "no more than X unless Y" → parse conditional logic (e.g., "max 3 CREs unless EMEA" → maxCREPerRep: 3, with EMEA exception)
- "balance X but prioritize Y" → multiple goals with priority order
- "target X ±Y%" → relative goals with acceptable variance (e.g., "target $2M ±20%" → min: 1.6M, max: 2.4M)

NUANCED REQUIREMENT PARSING:
- Extract specific thresholds with units ("$1.5M" → 1500000)
- Understand regional references (AMER, EMEA, APAC, etc.)
- Parse temporal constraints ("accounts owned >90 days")
- Extract count-based limits ("±5 accounts", "max 3 CREs")
- Identify ratio requirements ("60% enterprise, 40% commercial")

INTELLIGENT DEFAULTS:
- If ARR range mentioned, set both minARRThreshold and maxARRThreshold
- If only "balance ARR" mentioned without specifics, use reasonable defaults (min: 1M, max: 3M)
- If continuity mentioned, set maintainContinuity appropriately
- If region/geography mentioned, set mustStayInRegion flag

Be precise but flexible. If a parameter isn't mentioned, don't include it (let defaults apply).`
          },
          {
            role: 'user',
            content: naturalLanguageInput
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_ai_balancer_config',
              description: 'Extract AI Balancer configuration parameters from natural language',
              parameters: {
                type: 'object',
                properties: {
                  minARRThreshold: {
                    type: 'number',
                    description: 'Minimum ARR threshold in dollars (e.g., 1500000 for $1.5M)'
                  },
                  maxARRThreshold: {
                    type: 'number',
                    description: 'Maximum ARR cap in dollars (e.g., 3000000 for $3M)'
                  },
                  targetVariance: {
                    type: 'number',
                    description: 'Target variance percentage (e.g., 15 for 15%)'
                  },
                  maxCREPerRep: {
                    type: 'number',
                    description: 'Maximum CRE (Customer Risk Events) per rep (e.g., 3)'
                  },
                  maxCustomerDeviation: {
                    type: 'number',
                    description: 'Maximum customer count deviation (e.g., 5 for ±5 accounts)'
                  },
                  mustStayInRegion: {
                    type: 'boolean',
                    description: 'Whether accounts must stay in their current region'
                  },
                  maintainContinuity: {
                    type: 'boolean',
                    description: 'Whether to maintain ownership continuity (avoid moving long-held accounts)'
                  },
                  maxMovesPerRep: {
                    type: 'number',
                    description: 'Maximum number of account moves per rep'
                  },
                  maxTotalMoves: {
                    type: 'number',
                    description: 'Maximum total number of account moves across all reps'
                  }
                },
                required: [],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_ai_balancer_config' } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits depleted. Please add credits to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Failed to parse configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('AI response:', JSON.stringify(data, null, 2));

    // Extract the function call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function?.name !== 'extract_ai_balancer_config') {
      console.error('No valid tool call found in response');
      return new Response(
        JSON.stringify({ error: 'Failed to extract configuration from input' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const config = JSON.parse(toolCall.function.arguments);
    console.log('Extracted config:', config);

    // Return the parsed configuration
    return new Response(
      JSON.stringify({ 
        success: true,
        config,
        originalInput: naturalLanguageInput
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in parse-ai-balancer-config:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
