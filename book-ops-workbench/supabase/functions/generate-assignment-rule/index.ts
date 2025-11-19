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
    const { description, existingRules } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const prompt = `You are an expert at creating sales territory assignment rules. Convert this natural language description into a structured assignment rule.

**USER REQUEST:**
"${description}"

**EXISTING RULES CONTEXT:**
${existingRules.map((r: any) => `- ${r.name} (${r.rule_type}, priority ${r.priority})`).join('\n')}

**AVAILABLE RULE TYPES:**
- GEO_FIRST: Geographic routing based on account location (region/territory matching)
- CONTINUITY: Keep existing ownership relationships (maintain current rep assignments)
- SMART_BALANCE: Balance workload across reps (distribute ARR, customer count, renewals)
- TIER_BALANCE: Balance account tiers across reps (enterprise vs commercial distribution)
- ROUND_ROBIN: Distribute accounts evenly in rotation
- MIN_THRESHOLDS: Enforce minimum thresholds (e.g., every rep must have $1M ARR)
- CUSTOM: For complex custom logic that doesn't fit other types

**OUTPUT FORMAT (JSON):**
{
  "name": "Clear rule name",
  "rule_type": "One of the types above",
  "description": "What this rule does",
  "priority": 50,
  "account_scope": "customers" | "prospects" | "all",
  "conditions": {
    "accountFilters": [
      {
        "field": "industry" | "geo" | "arr" | "sales_territory" | "enterprise_vs_commercial",
        "operator": "equals" | "greaterThan" | "lessThan" | "contains" | "in",
        "value": "appropriate value"
      }
    ],
    "repFilters": [
      {
        "field": "region" | "team" | "is_manager",
        "operator": "equals" | "in",
        "value": "appropriate value"
      }
    ]
  },
  "scoring_weights": {
    "geography_match": 100,
    "continuity_bonus": 75,
    "workload_penalty": 50,
    "tier_match": 25
  }
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
          { role: 'system', content: 'You are an assignment rule generator. Always return valid JSON matching the exact format requested.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1500
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
    
    let parsedRule;
    try {
      const jsonMatch = aiContent.match(/```json\n([\s\S]*?)\n```/) || aiContent.match(/```\n([\s\S]*?)\n```/);
      const jsonString = jsonMatch ? jsonMatch[1] : aiContent;
      parsedRule = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiContent);
      throw new Error('AI returned invalid JSON format');
    }
    
    return new Response(JSON.stringify({
      rule: parsedRule,
      originalDescription: description
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error in generate-assignment-rule:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
