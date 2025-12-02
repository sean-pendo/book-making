import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
}

// Build the prompt for Gemini to map territories to regions
function buildMappingPrompt(territories: string[], availableRegions: string[]): string {
  return `You are an expert at mapping sales territories to geographic regions for a territory assignment system.

## Task
Map each sales territory to the most appropriate region from the available options. If a territory doesn't logically belong to ANY of the available regions (e.g., international territories when only US regions are available), mark it as "NOT_APPLICABLE".

## Available Regions (from sales rep data)
${availableRegions.map(r => `- ${r}`).join('\n')}

## Important Guidelines
1. Consider geographic proximity and business naming conventions
2. US city names map to their respective US regions
3. State abbreviations (CA, NY, TX, etc.) map to their US regions
4. Some Canadian provinces are included in US regions (see mappings below)
5. International territories (Australia, EMEA, APAC, DACH, LATAM, etc.) should be marked as "NOT_APPLICABLE" if no matching international region exists
6. If a territory could match multiple regions, choose the most specific match
7. Use "NOT_APPLICABLE" for territories that clearly don't fit any available region

## Territory to Region Mappings (exact regional breakdown)

### West (includes British Columbia, Canada)
States: WA, OR, CA, NV, UT, AZ, ID, AK, HI
Cities/Areas: Seattle, Portland, San Francisco, Los Angeles, San Diego, Sacramento, Las Vegas, Phoenix, Tucson, Salt Lake City, Vancouver, Pacific Northwest, NorCal, SoCal, Bay Area

### Central (includes Alberta, Canada)
States: MT, ND, SD, NE, KS, MO, IA, MN, WI, IL, IN, MI, OH, CO, WY, NM, ID
Cities/Areas: Chicago, Minneapolis, St Louis, Kansas City, Cleveland, Columbus, Detroit, Denver, Calgary, Edmonton, Great Lakes, Midwest, Mountain

### South East
States: TX, OK, AR, LA, MS, AL, GA, FL, SC, NC, TN, KY, VA, WV, MD, DC, DE
Cities/Areas: Atlanta, Miami, Orlando, Tampa, Charlotte, Raleigh, Nashville, New Orleans, Birmingham, Dallas, Austin, Houston, San Antonio, Chesapeake, Gulf Coast, Mid-Atlantic

### North East (includes Quebec and Ontario, Canada)
States: ME, NH, VT, MA, RI, CT, NY, NJ, PA
Cities/Areas: Boston, New York, Philadelphia, Buffalo, Pittsburgh, Toronto, Montreal, Quebec, Ottawa, New England, Tri-State

## Territories to Map
${territories.map((t, i) => `${i + 1}. ${t}`).join('\n')}

## Response Format
Respond ONLY with a valid JSON array. Each object should have:
- "territory": the exact territory name from the input
- "region": the matched region (MUST be exactly one from the available regions list, or "NOT_APPLICABLE")
- "confidence": "high", "medium", or "low"
- "reasoning": brief explanation (1 sentence)

Example response:
[
  {"territory": "BOSTON", "region": "North East", "confidence": "high", "reasoning": "Boston is a major city in the northeastern US."},
  {"territory": "Australia", "region": "NOT_APPLICABLE", "confidence": "high", "reasoning": "No Australian or APAC region available in the options."}
]

Respond ONLY with the JSON array, no additional text.`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { territories, availableRegions } = await req.json();

    if (!territories || !Array.isArray(territories) || territories.length === 0) {
      return new Response(JSON.stringify({
        error: 'territories array is required and must not be empty'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!availableRegions || !Array.isArray(availableRegions) || availableRegions.length === 0) {
      return new Response(JSON.stringify({
        error: 'availableRegions array is required and must not be empty'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY not configured in environment');
      return new Response(JSON.stringify({
        error: 'Gemini API key not configured. Please contact administrator.'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const prompt = buildMappingPrompt(territories, availableRegions);
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 8192,
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
      ]
    };

    console.log(`Processing ${territories.length} territories with ${availableRegions.length} available regions`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({
          error: 'Rate limit exceeded. Please wait a moment and try again.',
          retryAfter: '60 seconds'
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data: GeminiResponse = await response.json();

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('No response from Gemini API');
    }

    const responseText = data.candidates[0].content.parts[0].text;

    // Clean up the response - remove markdown code blocks if present
    let cleanedResponse = responseText.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.slice(7);
    }
    if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.slice(3);
    }
    if (cleanedResponse.endsWith('```')) {
      cleanedResponse = cleanedResponse.slice(0, -3);
    }
    cleanedResponse = cleanedResponse.trim();

    // Parse and validate the response
    let mappingsArray;
    try {
      mappingsArray = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', cleanedResponse);
      throw new Error('Failed to parse AI response. Please try again.');
    }

    // Build the final result
    const mappings: Record<string, string> = {};
    const details: Array<{ territory: string; region: string; confidence: string; reasoning?: string }> = [];
    let notApplicableCount = 0;
    let unmappedCount = 0;

    // Create a map for quick lookup by territory name (case-insensitive)
    const responseMap = new Map();
    for (const mapping of mappingsArray) {
      if (mapping.territory) {
        responseMap.set(mapping.territory.toLowerCase().trim(), mapping);
      }
    }

    // Process each original territory
    for (const territory of territories) {
      const aiMapping = responseMap.get(territory.toLowerCase().trim());

      if (aiMapping) {
        const region = aiMapping.region === 'NOT_APPLICABLE' ? '__NOT_APPLICABLE__' : aiMapping.region;

        mappings[territory] = region;
        details.push({
          territory,
          region,
          confidence: aiMapping.confidence || 'medium',
          reasoning: aiMapping.reasoning
        });

        if (region === '__NOT_APPLICABLE__') {
          notApplicableCount++;
        }
      } else {
        unmappedCount++;
        details.push({
          territory,
          region: '',
          confidence: 'low',
          reasoning: 'Not processed by AI'
        });
      }
    }

    console.log(`Mapped ${Object.keys(mappings).length} territories, ${notApplicableCount} not applicable, ${unmappedCount} unmapped`);

    return new Response(JSON.stringify({
      mappings,
      details,
      unmappedCount,
      notApplicableCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in gemini-territory-mapping:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});


