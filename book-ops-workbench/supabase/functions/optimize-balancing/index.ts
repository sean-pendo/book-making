import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const BATCH_SIZE = 25; // Reduced to 25 for reliable completion (~20s per batch including reasoning)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Read the request body as text first to check size
    const bodyText = await req.text();
    console.log(`[optimize-balancing] 📦 Raw request size: ${(bodyText.length / 1024).toFixed(2)} KB`);
    
    // Check if body is truncated (ends abruptly without closing brace)
    const trimmedBody = bodyText.trim();
    if (trimmedBody.length > 0 && !trimmedBody.endsWith('}')) {
      console.error('[optimize-balancing] ❌ Request body appears truncated:', {
        length: bodyText.length,
        lastChars: trimmedBody.slice(-50)
      });
      throw new Error('Request payload too large - body truncated. Try with fewer accounts or smaller batches.');
    }
    
    let requestBody;
    try {
      requestBody = JSON.parse(bodyText);
    } catch (parseError) {
      console.error('[optimize-balancing] ❌ JSON Parse Error:', parseError);
      console.error('[optimize-balancing] Body preview (last 200 chars):', trimmedBody.slice(-200));
      throw new Error(`Invalid JSON in request: ${parseError.message}`);
    }
    
    const { 
      unassignedAccounts, 
      initialProposals,
      repWorkloads, 
      config, 
      buildId, 
      mode 
    } = requestBody;
    
    console.log(`[optimize-balancing] ✅ Request parsed successfully: ${(bodyText.length / 1024).toFixed(2)} KB`);
    
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const isAssignMode = mode === 'ASSIGN';
    const isFinalArbiter = mode === 'FINAL_ARBITER';

    console.log('[optimize-balancing] 🚀 Mode:', 
      isAssignMode ? 'PRIMARY ASSIGNMENT' : 
      isFinalArbiter ? 'FINAL ARBITER' : 
      'OPTIMIZATION', 
      {
        buildId,
        unassignedAccounts: unassignedAccounts?.length || 0,
        initialProposals: initialProposals?.length || 0,
        repWorkloads: repWorkloads?.length || 0,
        config: config?.description || 'No description'
      }
    );

    // BATCH PROCESSING for FINAL_ARBITER mode
    if (isFinalArbiter && initialProposals && initialProposals.length > BATCH_SIZE) {
      console.log(`[optimize-balancing] 📦 Starting batch processing: ${initialProposals.length} proposals in ${Math.ceil(initialProposals.length / BATCH_SIZE)} batches`);
      
      const batches = [];
      for (let i = 0; i < initialProposals.length; i += BATCH_SIZE) {
        batches.push(initialProposals.slice(i, i + BATCH_SIZE));
      }
      
      const allFinalAssignments = [];
      const batchSummaries = [];
      
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const batchNumber = batchIndex + 1;
        const totalBatches = batches.length;
        
        // Defensive batch size verification
        console.log(`[optimize-balancing] 🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} proposals)`);
        console.log(`[optimize-balancing] 🔍 Batch size check: actual=${batch.length}, expected=${BATCH_SIZE}`);
        if (batch.length > BATCH_SIZE) {
          console.warn(`[optimize-balancing] ⚠️ Batch size exceeded! ${batch.length} > ${BATCH_SIZE}`);
        }
        
        let batchResult = null;
        let retryCount = 0;
        const maxRetries = 2;
        
        // Retry logic with exponential backoff
        while (retryCount <= maxRetries) {
          try {
            if (retryCount > 0) {
              const waitTime = Math.pow(2, retryCount - 1) * 5000; // 5s, 10s
              console.log(`[optimize-balancing] ⏳ Retry ${retryCount}/${maxRetries} after ${waitTime}ms delay`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
            }
            
            batchResult = await processBatchWithGPT5(
              batch,
              repWorkloads,
              config,
              batchNumber,
              totalBatches,
              buildId,
              allFinalAssignments // Pass cumulative assignments
            );
            break; // Success, exit retry loop
          } catch (error) {
            retryCount++;
            console.error(`[optimize-balancing] ❌ Batch ${batchNumber} attempt ${retryCount} failed:`, error.message);
            
            if (retryCount > maxRetries) {
              console.error(`[optimize-balancing] 💥 Batch ${batchNumber} failed after ${maxRetries} retries`);
              throw new Error(`Batch processing failed: ${error.message}`);
            }
          }
        }
        
        if (batchResult && batchResult.finalAssignments) {
          allFinalAssignments.push(...batchResult.finalAssignments);
          if (batchResult.summary) {
            batchSummaries.push(`Batch ${batchNumber}/${totalBatches}: ${batchResult.summary}`);
          }
          console.log(`[optimize-balancing] ✅ Batch ${batchNumber}/${totalBatches} completed: ${batchResult.finalAssignments.length} assignments`);
        }
      }
      
      console.log(`[optimize-balancing] 🎉 All batches processed: ${allFinalAssignments.length}/${initialProposals.length} assignments`);
      
      // Validate completeness
      if (allFinalAssignments.length < initialProposals.length * 0.95) {
        throw new Error(`Incomplete batch processing: Only ${allFinalAssignments.length}/${initialProposals.length} assignments completed. Please try again.`);
      }

      // Post-batch validation: Check ARR limits
      console.log('[optimize-balancing] 🔍 Validating ARR limits...');
      const repARRTotals = new Map<string, number>();
      const repCRETotals = new Map<string, number>();
      
      allFinalAssignments.forEach((assignment: any) => {
        const repId = assignment.finalRepId || assignment.owner_id;
        const arr = assignment.arr || assignment.account_arr || 0;
        const cre = assignment.cre || assignment.account_cre_count || 0;
        
        repARRTotals.set(repId, (repARRTotals.get(repId) || 0) + arr);
        repCRETotals.set(repId, (repCRETotals.get(repId) || 0) + (cre > 0 ? 1 : 0));
      });

      const violators: string[] = [];
      repARRTotals.forEach((totalNewARR, repId) => {
        const rep = repWorkloads.find((r: any) => r.rep_id === repId);
        if (rep) {
          const totalARR = (rep.total_arr || 0) + totalNewARR;
          if (totalARR > (config?.customer_max_arr || 2500000)) {
            violators.push(`${rep.name}: $${(totalARR / 1000000).toFixed(2)}M (max: $${((config?.customer_max_arr || 2500000) / 1000000).toFixed(1)}M)`);
          }
        }
      });

      if (violators.length > 0) {
        console.warn('[optimize-balancing] ⚠️ ARR LIMIT VIOLATIONS DETECTED:', violators);
        batchSummaries.push(`⚠️ VIOLATIONS: ${violators.join('; ')}`);
      } else {
        console.log('[optimize-balancing] ✅ All reps within ARR limits');
      }
      
      return new Response(
        JSON.stringify({
          finalAssignments: allFinalAssignments,
          summary: `Batch processing complete: ${batches.length} batches processed. ${batchSummaries.join(' | ')}`,
          mode: 'FINAL_ARBITER'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let prompt;
    
    if (isFinalArbiter) {
      // FINAL ARBITER MODE - AI reviews ALL assignments with 5-PRIORITY SYSTEM
      prompt = `You are the FINAL ARBITER for ${initialProposals?.length || 0} account assignments using a 5-PRIORITY SYSTEM.
      
Previous rules have scored each account and generated INITIAL PROPOSALS.

**5-PRIORITY SCORING SYSTEM (in order of importance):**

**Priority 1 (100 points): Account in Region + Same Owner**
- Account's region matches rep's region AND rep is current owner
- HIGHEST priority - preserves existing relationships in correct geography

**Priority 2 (75 points): Account in Region (Geographic Match)**
- Account's region matches rep's region
- Even for new assignments, regional alignment is critical

**Priority 3 (50 points): Account Continuity (Owner Retention)**
- Rep is current owner (even if region mismatch)
- Preserves relationships but lower than regional priorities

**Priority 4 (40 points): Tier Balance**
- Distribute Tier 1, Tier 2, Tier 3, Tier 4 accounts evenly
- Prevents one rep from getting all high-tier accounts

**Priority 5 (30 points): CRE Balance**
- Distribute CRE (Customer Risk Escalation) accounts evenly
- Hard cap: MAX ${config?.max_cre_per_rep || 3} CRE accounts per rep
- If rep already at max CRE → ELIMINATE them from consideration

**ARR CONSTRAINTS (STRICTLY ENFORCED):**
- Target: $${(config?.customer_target_arr / 1000000 || 1.6).toFixed(1)}M ARR per rep
- Soft Maximum: $${(config?.customer_max_arr / 1000000 || 2.5).toFixed(1)}M ARR per rep
- Hard Maximum Exception: If a SINGLE account exceeds $${(config?.customer_max_arr / 1000000 || 2.5).toFixed(1)}M ARR, you can assign it to a rep, but then:
  * That rep gets NO additional customer assignments
  * Mark that rep as "AT CAPACITY - MEGA ACCOUNT" in your rationale
  
- ALWAYS prioritize reps closest to $${(config?.customer_target_arr / 1000000 || 1.6).toFixed(1)}M target (without exceeding $${(config?.customer_max_arr / 1000000 || 2.5).toFixed(1)}M limit)
- If all reps are above $${(config?.customer_max_arr / 1000000 || 2.5).toFixed(1)}M, assign to rep with most capacity remaining

**CURRENT REP WORKLOADS (BEFORE these assignments):**
${repWorkloads?.map((w: any) => {
  const status = w.total_arr > (config?.customer_max_arr || 2500000) ? 'FULL' : 
                 w.total_arr > 2000000 ? 'NEARLY FULL' : 
                 w.total_arr > (config?.customer_target_arr || 1600000) ? 'ON TARGET' : 'AVAILABLE';
  return `- ${w.name} (${w.region}): $${(w.total_arr / 1000000).toFixed(2)}M ARR - ${status} (${w.account_count} accounts, ${w.cre_count} CRE)`;
}).join('\n') || 'No workload data'}

**INITIAL PROPOSALS (from multi-criteria scoring):**
${initialProposals?.slice(0, 50).map((p: any) => 
  `- ${p.accountName} ($${((p.arr || 0) / 1000000).toFixed(2)}M, ${p.cre || 0} CRE): ${p.scoringReason} → ${p.proposedRepName} (${p.totalScore}pts, Rule: ${p.topRule || 'Unknown'})`
).join('\n') || 'None'}
${(initialProposals?.length || 0) > 50 ? `\n...and ${(initialProposals?.length || 0) - 50} more` : ''}

**DECISION GUIDELINES:**
1. ACCEPT proposals that follow 5-priority system and ARR constraints
2. OVERRIDE when necessary to enforce:
   - ARR limits (target $${(config?.customer_target_arr / 1000000 || 1.6).toFixed(1)}M, max $${(config?.customer_max_arr / 1000000 || 2.5).toFixed(1)}M)
   - CRE hard cap (max ${config?.max_cre_per_rep || 3} per rep)
   - Priority order (region+continuity > region > continuity > tier > CRE)
3. When overriding, assign to rep with:
   - Highest priority score (following 1→2→3→4→5)
   - Closest to $${(config?.customer_target_arr / 1000000 || 1.6).toFixed(1)}M target ARR
   - Not at CRE limit if account has CRE

**OUTPUT FORMAT - RETURN VALID JSON ONLY (USE RULE-BASED RATIONALE):**
{
  "finalAssignments": [
    {
      "accountId": "001...",
      "accountName": "Acme Corp",
      "finalRepId": "0053...",
      "finalRepName": "John Doe",
      "decision_type": "ACCEPT",
      "rationale": "Regional Match + Continuity (100pts) → John @ $1.5M",
      "assignment_type": "customer",
      "rule_applied": "Geo + Account Continuity"
    }
  ],
  "summary": "Accepted 380, overrode 30 for balance"
}

**RATIONALE FORMAT RULES:**
- Use RULE NAMES not codes: "Regional Match", "Continuity", "Tier Balance", "CRE Balance"
- Show combined rules: "Regional Match + Continuity" for P1
- Include score and rep ARR: "(100pts) → John @ $1.5M"
- Keep under 60 chars total
- Examples:
  * P1: "Regional Match + Continuity (100pts)"
  * P2: "Regional Match (75pts) → Sarah @ $1.2M"
  * P3: "Continuity (50pts) → Current owner Mike"
  * P4: "Tier Balance (40pts) → Needs Tier 1 accounts"
  * P5: "CRE Balance (30pts) → Below CRE limit"

**RULE_APPLIED FORMAT:**
- Set "rule_applied" to match the PRIMARY rule used
- For P1 (100pts): "Geo + Account Continuity"
- For P2 (75pts): "Geo"
- For P3 (50pts): "Account Continuity"
- For P4 (40pts): "Tier Balance Distribution"
- For P5 (30pts): "CRE Risk Distribution"
- If you override with AI logic: "AI"

**CRITICAL:** 
- Return ONLY valid JSON, no markdown or explanations
- Provide decision for EVERY account
- Use RULE-BASED rationale format (under 60 chars each)
- Follow 5-priority system strictly: P1(100) > P2(75) > P3(50) > P4(40) > P5(30)`;
    } else if (isAssignMode) {
      // PRIMARY ASSIGNMENT MODE - AI assigns unassigned accounts
      prompt = `You are the PRIMARY ASSIGNMENT ENGINE for unassigned accounts. Previous rules (Geo, Continuity) have already assigned some accounts.

**YOUR ROLE:**
Assign the REMAINING ${unassignedAccounts?.length || 0} unassigned accounts while balancing workload across reps.

**CURRENT REP WORKLOADS:**
${repWorkloads?.map((w: any) => `- ${w.name} (${w.region}): $${(w.total_arr / 1000000).toFixed(2)}M ARR, ${w.account_count} accounts, ${w.cre_count} CRE`).join('\n') || 'No workload data'}

**CONFIGURATION GOALS:**
${config?.description || 'Balance workload, minimize risk concentration, prefer geographic matches'}

**BALANCING TARGETS:**
- Min ARR per Rep: $${(config?.customer_min_arr / 1000000 || 1.2).toFixed(1)}M
- Target ARR per Rep: $${(config?.customer_target_arr / 1000000 || 1.5).toFixed(1)}M
- Max ARR per Rep: $${(config?.customer_max_arr / 1000000 || 2.5).toFixed(1)}M
- Max CRE per Rep: ${config?.max_cre_per_rep || 3}

**UNASSIGNED ACCOUNTS:**
${unassignedAccounts?.map((a: any) => `- ${a.account_name} (${a.sfdc_account_id}): $${((a.calculated_arr || 0) / 1000000).toFixed(2)}M ARR, ${a.cre_count || 0} CRE, Territory: ${a.sales_territory || 'N/A'}`).join('\n') || 'None'}

**YOUR TASK:**
Assign EACH unassigned account to a rep that:
1. Brings them closer to target ARR
2. Doesn't exceed max CRE (${config?.max_cre_per_rep || 3})
3. Doesn't exceed max ARR unless single account > max
4. Prefers regional match when possible
5. Balances workload across team

**OUTPUT FORMAT:**
{
  "assignments": [
    {
      "accountId": "001...",
      "accountName": "Account Name",
      "toRepId": "0053...",
      "toRepName": "Assigned Rep",
      "reasoning": "Why this rep (1 sentence)",
      "confidence": 0.9
    }
  ],
  "summary": "Overall strategy"
}

MUST provide assignment for EVERY unassigned account.`;
    } else {
      // OPTIMIZATION MODE (legacy - suggests moves to improve balance)
      const currentAssignments = unassignedAccounts; // In legacy mode, this is actually current assignments
      
      const repWorkloadsMap: Record<string, any> = {};
      for (const assignment of currentAssignments || []) {
        const repId = assignment.proposed_owner_id;
        if (!repWorkloadsMap[repId]) {
          repWorkloadsMap[repId] = {
            repId,
            repName: assignment.proposed_owner_name,
            accounts: [],
            totalARR: 0,
            creCount: 0
          };
        }
        repWorkloadsMap[repId].accounts.push(assignment);
        repWorkloadsMap[repId].totalARR += assignment.account_arr || 0;
        repWorkloadsMap[repId].creCount += assignment.account_cre_count || 0;
      }

      const workloadSummary = Object.values(repWorkloadsMap)
        .map((w: any) => `- ${w.repName}: $${(w.totalARR / 1000000).toFixed(2)}M ARR, ${w.accounts.length} accounts, ${w.creCount} CRE`)
        .join('\n');

      prompt = `You are a sales territory optimization expert. Review the current assignments and suggest 5-10 specific improvements.

**CURRENT ASSIGNMENTS:**
Total: ${currentAssignments?.length || 0}
${workloadSummary}

**GOALS:** ${config?.description || 'Balance workload'}
**TARGETS:** Target: $${(config?.customer_target_arr / 1000000 || 1.5).toFixed(1)}M, Max: $${(config?.customer_max_arr / 1000000 || 2.5).toFixed(1)}M, Max CRE: ${config?.max_cre_per_rep || 3}

Suggest 5-10 moves to improve balance. Return JSON:
{
  "suggestions": [{"accountId": "...", "accountName": "...", "fromRepId": "...", "fromRepName": "...", "toRepId": "...", "toRepName": "...", "reasoning": "...", "priority": 1}],
  "summary": "..."
}`;
    }

    const aiRequestBody: any = {
      model: 'gpt-4.1-mini-2025-04-14',  // Fast, reliable, 10x cheaper than GPT-5
      messages: [
        { role: 'system', content: 'You are a sales territory assignment expert. Always respond with ONLY valid JSON matching the requested format. No markdown, no explanations, just JSON. Use compact rationale format.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 4000,  // GPT-4 uses max_tokens (not max_completion_tokens)
      temperature: 0.3  // Low temperature for consistent structured output
    };

    // Note: Removed tool calling - GPT-5 reasoning mode doesn't reliably use tools
    // Instead, we explicitly request JSON format in the prompt and parse the response

    console.log('[optimize-balancing] 🤖 Calling OpenAI GPT-5');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(aiRequestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[optimize-balancing] ❌ AI API Error:', {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText
      });

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
      throw new Error(`AI API error: ${response.status} - ${errorText}`);
    }

    const aiResponse = await response.json();
    
    // Calculate and log cost (GPT-4.1 Mini pricing: ~$0.40 per 1M input, ~$1.60 per 1M output)
    const inputCost = (aiResponse.usage?.prompt_tokens || 0) * 0.40 / 1000000;
    const outputCost = (aiResponse.usage?.completion_tokens || 0) * 1.60 / 1000000;
    const totalCost = inputCost + outputCost;
    
    console.log('[optimize-balancing] ✅ AI Response received:', {
      model: aiResponse.model,
      usage: aiResponse.usage,
      estimatedCost: `$${totalCost.toFixed(4)}`
    });

    // Log raw response for debugging
    console.log('[optimize-balancing] 📝 Raw AI Response:', JSON.stringify({
      hasContent: !!aiResponse.choices[0].message.content,
      finishReason: aiResponse.choices[0].finish_reason,
      contentLength: aiResponse.choices[0].message.content?.length || 0,
      contentPreview: aiResponse.choices[0].message.content?.substring(0, 300)
    }));

    let parsedResult;

    // Parse JSON response directly (no tool calling)
    let aiContent = aiResponse.choices[0].message.content;
    
    if (!aiContent || aiContent.trim() === '') {
      console.error('[optimize-balancing] ❌ Empty response from AI');
      throw new Error('AI returned empty response');
    }
    
    // Strip markdown code blocks if present (```json ... ``` or ``` ... ```)
    aiContent = aiContent.trim();
    if (aiContent.startsWith('```')) {
      const codeBlockMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        aiContent = codeBlockMatch[1].trim();
      } else {
        aiContent = aiContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      }
    }
    
    // Try to find JSON if there's text before/after
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      aiContent = jsonMatch[0];
    }
    
    try {
      parsedResult = JSON.parse(aiContent);
      console.log('[optimize-balancing] ✅ JSON parsed successfully:', {
        hasAssignments: !!parsedResult.assignments || !!parsedResult.finalAssignments,
        count: parsedResult.assignments?.length || parsedResult.finalAssignments?.length || 0
      });
    } catch (parseError) {
      console.error('[optimize-balancing] ❌ JSON Parse Error:', parseError);
      console.error('[optimize-balancing] Cleaned AI Content:', aiContent.substring(0, 500));
      throw new Error(`AI returned invalid JSON format: ${parseError.message}`);
    }

    // Validate response completeness for FINAL_ARBITER mode
    if (isFinalArbiter) {
      const expectedCount = initialProposals?.length || 0;
      const receivedCount = parsedResult.finalAssignments?.length || 0;
      
      if (receivedCount < expectedCount) {
        console.warn(`[optimize-balancing] ⚠️ PARTIAL RESPONSE: ${receivedCount}/${expectedCount} assignments received`);
        console.warn('[optimize-balancing] Token limit may have been exceeded. Consider implementing batch processing.');
      } else {
        console.log(`[optimize-balancing] ✅ COMPLETE RESPONSE: ${receivedCount}/${expectedCount} assignments received`);
      }
    }
    
    console.log('[optimize-balancing] ✨ Parsed AI result:', {
      hasAssignments: !!parsedResult.assignments,
      assignmentsCount: parsedResult.assignments?.length || 0,
      hasFinalAssignments: !!parsedResult.finalAssignments,
      finalAssignmentsCount: parsedResult.finalAssignments?.length || 0,
      hasSuggestions: !!parsedResult.suggestions,
      suggestionsCount: parsedResult.suggestions?.length || 0,
      hasSummary: !!parsedResult.summary
    });

    // Handle all three modes
    if (isFinalArbiter) {
      const validAssignments = (parsedResult.finalAssignments || []).filter((a: any) => 
        a.accountId && a.finalRepId
      );

      console.log('[optimize-balancing] 🎯 Final Arbiter Results:', {
        totalAssignments: parsedResult.finalAssignments?.length || 0,
        validAssignments: validAssignments.length,
        accepted: validAssignments.filter((a: any) => a.decision_type === 'ACCEPT').length,
        overridden: validAssignments.filter((a: any) => a.decision_type === 'OVERRIDE').length
      });
      
      return new Response(JSON.stringify({
        finalAssignments: validAssignments,
        summary: parsedResult.summary,
        mode: 'FINAL_ARBITER'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else if (isAssignMode) {
      const validAssignments = (parsedResult.assignments || []).filter((a: any) => 
        a.accountId && a.toRepId
      );

      console.log('[optimize-balancing] 🎯 Assignment Results:', {
        totalAssignments: parsedResult.assignments?.length || 0,
        validAssignments: validAssignments.length
      });
      
      return new Response(JSON.stringify({
        assignments: validAssignments,
        summary: parsedResult.summary,
        mode: 'ASSIGN'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      const validSuggestions = (parsedResult.suggestions || []).filter((s: any) => 
        s.accountId && s.fromRepId && s.toRepId
      );

      console.log('[optimize-balancing] 🎯 Optimization Results:', {
        totalSuggestions: parsedResult.suggestions?.length || 0,
        validSuggestions: validSuggestions.length
      });
      
      return new Response(JSON.stringify({
        suggestions: validSuggestions,
        summary: parsedResult.summary,
        mode: 'OPTIMIZATION'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
  } catch (error) {
    console.error('Error in optimize-balancing:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      assignments: [],
      suggestions: [],
      summary: 'AI processing failed'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Helper function to process a single batch with GPT-5
async function processBatchWithGPT5(
  batch: any[],
  repWorkloads: any[],
  config: any,
  batchNumber: number,
  totalBatches: number,
  buildId: string,
  assignmentsSoFar: any[] = []
): Promise<{ finalAssignments: any[], summary: string }> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  try {
    console.log(`[processBatchWithGPT5] 🚀 Starting batch ${batchNumber}/${totalBatches} with ${batch.length} proposals (${assignmentsSoFar.length} assignments so far)`);
    
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.56.0');
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Fetch assignment rules from database
    const { data: rules, error: rulesError } = await supabase
      .from('assignment_rules')
      .select('*')
      .eq('build_id', buildId)
      .eq('enabled', true)
      .order('priority');

    if (rulesError) {
      console.error('[processBatchWithGPT5] Error fetching rules:', rulesError);
      throw rulesError;
    }

    console.log(`[processBatchWithGPT5] 📋 Loaded ${rules?.length || 0} assignment rules from database`);

    // Calculate updated rep workloads including assignments made in previous batches
    const updatedWorkloads = repWorkloads.map(rep => {
      const assignmentsForRep = assignmentsSoFar.filter((a: any) => 
        a.finalRepId === rep.rep_id || a.owner_id === rep.rep_id
      );
      const additionalARR = assignmentsForRep.reduce((sum: number, a: any) => 
        sum + (a.arr || a.account_arr || 0), 0
      );
      const additionalCRE = assignmentsForRep.filter((a: any) => 
        (a.cre || a.account_cre_count || 0) > 0
      ).length;
      
      return {
        ...rep,
        total_arr: (rep.total_arr || 0) + additionalARR,
        cre_count: (rep.cre_count || 0) + additionalCRE,
        account_count: (rep.account_count || 0) + assignmentsForRep.length
      };
    });

    // Extract ARR limits for pre-filtering
    const aiRule = rules?.find(r => r.rule_type === 'AI_BALANCER');
    const targetARR = aiRule?.conditions?.customers?.targetARRThreshold || config.customer_target_arr;
    const maxARR = aiRule?.conditions?.maxARRThreshold || config.customer_max_arr;
    const maxCRE = config.max_cre_per_rep;

    // ===== PART 1: PRE-FILTER ELIGIBLE REPS =====
    // Calculate average account ARR in this batch to use for capacity checks
    const avgBatchARR = batch.reduce((sum: number, p: any) => sum + (p.arr || 0), 0) / batch.length;
    
    // Filter reps with capacity BEFORE sending to AI
    const eligibleReps = updatedWorkloads.filter(rep => {
      const hasARRCapacity = (rep.total_arr + avgBatchARR) < maxARR;
      const hasCRECapacity = rep.cre_count < maxCRE;
      const notOverloaded = rep.total_arr < (maxARR * 0.9); // 90% threshold
      
      return hasARRCapacity && hasCRECapacity && notOverloaded;
    });

    // Track pre-filtering stats
    const filteredOutCount = updatedWorkloads.length - eligibleReps.length;
    console.log(`[processBatchWithGPT5] 🔍 Pre-filtering: ${eligibleReps.length}/${updatedWorkloads.length} reps have capacity (filtered ${filteredOutCount} overloaded reps)`);
    
    // If NO reps have capacity, allow overload but flag it
    const repsToUse = eligibleReps.length > 0 ? eligibleReps : updatedWorkloads;
    if (eligibleReps.length === 0) {
      console.warn(`[processBatchWithGPT5] ⚠️ ALL REPS AT CAPACITY - allowing overload for batch ${batchNumber}`);
    }

    // ===== PART 2: RESTRUCTURE PROMPT - CONSTRAINTS FIRST, THEN SCORING =====
    
    // Build scoring criteria from rules (non-AI rules)
    const priorityScores = [100, 75, 50, 40, 30];
    const scoringRules = rules?.filter(r => r.rule_type !== 'AI_BALANCER').map((rule, index) => {
      const score = priorityScores[index] || 20;
      return `- **${rule.name}** (${score} points): ${rule.description}`;
    }).join('\n') || 'No scoring rules configured';

    const systemPrompt = `You are an assignment engine that MUST follow hard constraints before applying scoring rules.

===== PHASE 1: HARD CONSTRAINTS (MUST PASS ALL) =====
These are NON-NEGOTIABLE. A rep MUST meet ALL constraints below to be eligible:

1. **ARR Constraint**: Rep must have < $${(maxARR / 1000000).toFixed(1)}M total ARR AFTER this assignment
2. **CRE Constraint**: Rep must have < ${maxCRE} CRE accounts if assigning a CRE account
3. **Active Status**: Rep must be active and accepting assignments
4. **Capacity Check**: Rep must be below 90% of max ARR threshold

🚨 **CRITICAL**: If a rep fails ANY constraint above, they are INELIGIBLE for assignment, regardless of scoring.

===== PHASE 2: SCORING (among eligible reps only) =====
Once a rep passes ALL Phase 1 constraints, score them using these criteria:

${scoringRules}

**Workload Balance (100 points)**: Prefer reps closer to target ARR ($${(targetARR / 1000000).toFixed(1)}M)

===== DECISION PROCESS =====
For each account:
1. Filter to reps passing ALL Phase 1 constraints
2. If NO reps pass constraints → FLAG as "OVERLOAD_NEEDED" and assign to least loaded rep
3. Score eligible reps using Phase 2 criteria
4. Assign to highest scoring eligible rep
5. Include detailed rationale explaining constraint checks and scoring

===== OUTPUT FORMAT =====
Return ONLY valid JSON (no markdown):
{
  "finalAssignments": [
    {
      "accountId": "001...",
      "accountName": "Account Name",
      "finalRepId": "005Pf000004RIY1",
      "finalRepName": "Rep Name",
      "decision_type": "ACCEPT" | "OVERRIDE" | "OVERLOAD_NEEDED",
      "rationale": "Constraints: ARR OK ($1.2M→$1.8M < $2.5M), CRE OK (2<3). Scored: Geo match (50pts), Continuity (75pts). Total: 125pts.",
      "assignment_type": "customer" | "prospect",
      "rule_applied": "Rule name from scoring system"
    }
  ],
  "summary": "Brief batch summary"
}

**Batch Context:** Processing batch ${batchNumber} of ${totalBatches} (${assignmentsSoFar.length} assignments already made)

**🚨 CRITICAL: finalRepId MUST be the exact Salesforce rep_id (starts with "005...") from the workload list, NOT the rep name! 🚨**`;

    const userPrompt = `Review these ${batch.length} account proposals and make final assignments following the PHASE 1 → PHASE 2 process:

**ACCOUNTS TO ASSIGN (Batch ${batchNumber}/${totalBatches}):**
${batch.map((p: any) => `- ${p.accountName} (${p.accountId}): $${((p.arr || 0) / 1000000).toFixed(2)}M ARR, ${p.cre || 0} CRE, Proposed: ${p.proposedRepName} [ID: ${p.proposedRepId}]`).join('\n')}

**AVAILABLE REPS (pre-filtered to ${repsToUse.length} with capacity, ${assignmentsSoFar.length} previous batch assignments included):**
${repsToUse.map((w: any) => {
  const arrAfterTypicalAssignment = w.total_arr + avgBatchARR;
  const canTakeMore = arrAfterTypicalAssignment < maxARR;
  const status = !canTakeMore ? '🚫 AT CAPACITY' : 
                 w.total_arr >= targetARR ? '✅ ON TARGET' : '⬆️ BELOW TARGET';
  return `- ${w.name} [ID: ${w.rep_id}] (${w.region}): Current ARR: $${(w.total_arr / 1000000).toFixed(2)}M ${status}, ${w.account_count} accts, ${w.cre_count}/${maxCRE} CRE`;
}).join('\n')}

**ASSIGNMENT INSTRUCTIONS:**
For EACH account:
1. Check PHASE 1 constraints for each rep (ARR < $${(maxARR / 1000000).toFixed(1)}M after assignment, CRE < ${maxCRE})
2. If proposed rep fails constraints → find alternative eligible rep
3. Score eligible reps using PHASE 2 criteria
4. Assign to highest scoring rep
5. Provide detailed rationale showing constraint checks + scoring breakdown`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
        body: JSON.stringify({
        model: 'gpt-4.1-mini-2025-04-14',  // Fast, reliable, 10x cheaper
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 4000,  // GPT-4 uses max_tokens
        temperature: 0.3,  // Low temperature for consistency
        response_format: { type: "json_object" }  // Enforce JSON output
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[processBatchWithGPT5] OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // Calculate batch cost
    const inputCost = (data.usage?.prompt_tokens || 0) * 0.40 / 1000000;
    const outputCost = (data.usage?.completion_tokens || 0) * 1.60 / 1000000;
    const batchCost = inputCost + outputCost;
    
    console.log('[processBatchWithGPT5] ✅ Received response from OpenAI');
    console.log('[processBatchWithGPT5] 📊 Token usage:', data.usage);
    console.log('[processBatchWithGPT5] 💰 Estimated cost:', `$${batchCost.toFixed(4)}`);

    // Extract JSON from response content
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error('[processBatchWithGPT5] ❌ No content in response:', JSON.stringify(data, null, 2));
      throw new Error('No valid JSON content in response from OpenAI');
    }

    // Parse the JSON response
    let result;
    try {
      // Strip markdown code blocks if present
      let cleanContent = content.trim();
      if (cleanContent.startsWith('```')) {
        const codeBlockMatch = cleanContent.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlockMatch) {
          cleanContent = codeBlockMatch[1].trim();
        } else {
          cleanContent = cleanContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
        }
      }
      
      // Try to extract JSON if it's wrapped in text
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanContent = jsonMatch[0];
      }
      
      result = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('[processBatchWithGPT5] ❌ JSON parse error:', parseError);
      console.error('[processBatchWithGPT5] Content was:', content.substring(0, 500));
      throw new Error('Failed to parse JSON from OpenAI response');
    }

    console.log(`[processBatchWithGPT5] 📊 Parsed ${result.finalAssignments?.length || 0} assignments`);

    // Validate and fix rep_ids in assignments
    const isValidRepId = (id: string) => /^005[A-Za-z0-9]+$/.test(id);
    
    result.finalAssignments = result.finalAssignments.map((assignment: any) => {
      if (!isValidRepId(assignment.finalRepId)) {
        console.warn(`[processBatchWithGPT5] ⚠️ Invalid rep_id: "${assignment.finalRepId}" - attempting to fix...`);
        
        // Try to look up correct rep_id from finalRepName
        const matchingRep = repWorkloads.find((r: any) => 
          r.name === assignment.finalRepId || r.name === assignment.finalRepName
        );
        
        if (matchingRep) {
          console.log(`[processBatchWithGPT5] ✅ Fixed: "${assignment.finalRepId}" → "${matchingRep.rep_id}"`);
          assignment.finalRepId = matchingRep.rep_id;
        } else {
          console.error(`[processBatchWithGPT5] ❌ Could not find rep_id for: "${assignment.finalRepId}"`);
          throw new Error(`AI returned invalid rep_id: "${assignment.finalRepId}" and no matching rep found`);
        }
      }
      return assignment;
    });

    // ===== PART 3: POST-BATCH VALIDATION =====
    // Check if any assignments violate hard constraints
    const violations: any[] = [];
    
    for (const assignment of result.finalAssignments) {
      const rep = updatedWorkloads.find((r: any) => r.rep_id === assignment.finalRepId);
      if (!rep) {
        violations.push({
          account: assignment.accountName,
          rep: assignment.finalRepName,
          issue: 'Rep not found in workload list'
        });
        continue;
      }
      
      // Find the account data to get its ARR and CRE
      const accountData = batch.find((p: any) => p.accountId === assignment.accountId);
      const accountARR = accountData?.arr || 0;
      const accountCRE = accountData?.cre || 0;
      
      const newTotalARR = rep.total_arr + accountARR;
      const newTotalCRE = rep.cre_count + (accountCRE > 0 ? 1 : 0);
      
      // Check ARR violation
      if (newTotalARR > maxARR) {
        violations.push({
          account: assignment.accountName,
          accountARR: `$${(accountARR / 1e6).toFixed(2)}M`,
          rep: assignment.finalRepName,
          issue: `Would EXCEED max ARR: $${(rep.total_arr / 1e6).toFixed(2)}M + $${(accountARR / 1e6).toFixed(2)}M = $${(newTotalARR / 1e6).toFixed(2)}M (max: $${(maxARR / 1e6).toFixed(1)}M)`,
          severity: 'CRITICAL'
        });
      }
      
      // Check CRE violation
      if (newTotalCRE > maxCRE) {
        violations.push({
          account: assignment.accountName,
          rep: assignment.finalRepName,
          issue: `Would EXCEED max CRE: ${rep.cre_count} + 1 = ${newTotalCRE} (max: ${maxCRE})`,
          severity: 'HIGH'
        });
      }
    }
    
    // If violations found, REJECT entire batch
    if (violations.length > 0) {
      console.error(`[processBatchWithGPT5] ❌ BATCH ${batchNumber} REJECTED - ${violations.length} constraint violations detected:`);
      violations.forEach((v, i) => {
        console.error(`  ${i + 1}. ${v.account} → ${v.rep}: ${v.issue}`);
      });
      
      throw new Error(
        `BATCH ${batchNumber} VIOLATED HARD CONSTRAINTS:\n` +
        violations.map(v => `- ${v.account} → ${v.rep}: ${v.issue}`).join('\n') +
        `\n\nThe AI must respect max ARR ($${(maxARR / 1e6).toFixed(1)}M) and max CRE (${maxCRE}) limits.`
      );
    }
    
    console.log(`[processBatchWithGPT5] ✅ Batch ${batchNumber} validation passed - no constraint violations`);

    // Validate batch completeness
    if (result.finalAssignments.length < batch.length) {
      console.warn(`[processBatchWithGPT5] ⚠️ Batch ${batchNumber} incomplete: ${result.finalAssignments.length}/${batch.length} assignments`);
    }

    return {
      finalAssignments: result.finalAssignments || [],
      summary: result.summary || 'Batch processed'
    };
  } catch (error) {
    console.error('[processBatchWithGPT5] Error:', error);
    throw error;
  }
}
