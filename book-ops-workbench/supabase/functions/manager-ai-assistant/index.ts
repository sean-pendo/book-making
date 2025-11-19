import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question, buildId, managerUserId, managerName, managerLevel, conversationHistory = [] } = await req.json();
    
    if (!question || !buildId || !managerUserId || !managerName || !managerLevel) {
      throw new Error('Missing required parameters');
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch manager's profile to get their details
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', managerUserId)
      .single();

    // Fetch build details
    const { data: build } = await supabase
      .from('builds')
      .select('*')
      .eq('id', buildId)
      .single();

    // Fetch sales reps managed by this manager using the correct manager name
    let salesRepsQuery = supabase
      .from('sales_reps')
      .select('*')
      .eq('build_id', buildId);

    if (managerLevel === 'FLM') {
      salesRepsQuery = salesRepsQuery.eq('flm', managerName);
    } else if (managerLevel === 'SLM') {
      salesRepsQuery = salesRepsQuery.eq('slm', managerName);
    }

    const { data: salesReps } = await salesRepsQuery;

    const repIds = salesReps?.map(rep => rep.rep_id) || [];

    console.log(`Fetching accounts for ${repIds.length} sales reps in build ${buildId}`);

    // Fetch accounts with proper pagination - get both current and new owner assignments
    // Using the same pattern as the dashboard for consistency
    let allAccountsData: any[] = [];
    
    // Fetch in batches of 1000 (Supabase default limit)
    let hasMore = true;
    let offset = 0;
    const batchSize = 1000;
    
    while (hasMore) {
      const { data: batch, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('build_id', buildId)
        .eq('is_parent', true)
        .range(offset, offset + batchSize - 1);

      if (error) {
        console.error('Error fetching accounts:', error);
        throw error;
      }

      if (batch) {
        allAccountsData = [...allAccountsData, ...batch];
        hasMore = batch.length === batchSize;
        offset += batchSize;
      } else {
        hasMore = false;
      }
    }

    console.log(`Total accounts fetched: ${allAccountsData.length}`);
    const allAccounts = allAccountsData;

    // Fetch opportunities for all accounts
    const { data: allOpportunities } = await supabase
      .from('opportunities')
      .select('*')
      .eq('build_id', buildId);

    // Fetch manager reassignments
    const { data: reassignments } = await supabase
      .from('manager_reassignments')
      .select('*')
      .eq('build_id', buildId)
      .eq('manager_user_id', managerUserId);

    // Fetch manager notes
    const { data: notes } = await supabase
      .from('manager_notes')
      .select('*')
      .eq('build_id', buildId)
      .eq('manager_user_id', managerUserId);

    // Build detailed rep analysis with COMPLETE data
    const detailedReps = salesReps?.map(rep => {
      // Current owner assignments (before)
      const currentAccounts = allAccounts?.filter(acc => acc.owner_id === rep.rep_id && acc.is_parent) || [];
      const currentARR = currentAccounts.reduce((sum, acc) => sum + (Number(acc.calculated_arr) || 0), 0);
      const currentATR = currentAccounts.reduce((sum, acc) => sum + (Number(acc.calculated_atr) || 0), 0);
      const currentCRE = currentAccounts.reduce((sum, acc) => sum + (Number(acc.cre_count) || 0), 0);
      const currentCustomers = currentAccounts.filter(acc => acc.is_customer).length;
      const currentProspects = currentAccounts.filter(acc => !acc.is_customer).length;

      // New owner assignments (after) - THIS IS THE PRIMARY DATA FOR MANAGER QUESTIONS
      const newAccounts = allAccounts?.filter(acc => acc.new_owner_id === rep.rep_id && acc.is_parent) || [];
      const newARR = newAccounts.reduce((sum, acc) => sum + (Number(acc.calculated_arr) || 0), 0);
      const newATR = newAccounts.reduce((sum, acc) => sum + (Number(acc.calculated_atr) || 0), 0);
      const newCRE = newAccounts.reduce((sum, acc) => sum + (Number(acc.cre_count) || 0), 0);
      const newCustomers = newAccounts.filter(acc => acc.is_customer).length;
      const newProspects = newAccounts.filter(acc => !acc.is_customer).length;
      
      // Log detailed info for debugging
      console.log(`Rep ${rep.name} (${rep.rep_id}):`);
      console.log(`  - Current accounts: ${currentAccounts.length}, ARR: $${currentARR.toFixed(2)}`);
      console.log(`  - New accounts: ${newAccounts.length}, ARR: $${newARR.toFixed(2)}, ATR: $${newATR.toFixed(2)}`);

      // Calculate deltas (errors/changes)
      const arrDelta = newARR - currentARR;
      const atrDelta = newATR - currentATR;
      const creDelta = newCRE - currentCRE;
      const customerDelta = newCustomers - currentCustomers;
      const prospectDelta = newProspects - currentProspects;

      // Get opportunities for this rep's accounts
      const repOpportunities = allOpportunities?.filter(opp => 
        [...currentAccounts, ...newAccounts].some(acc => acc.sfdc_account_id === opp.sfdc_account_id)
      ) || [];

      // Group opportunities by renewal quarter
      const renewalsByQuarter = repOpportunities.reduce((acc, opp) => {
        const quarter = opp.renewal_quarter || 'Unknown';
        if (!acc[quarter]) acc[quarter] = [];
        acc[quarter].push({
          name: opp.opportunity_name,
          amount: opp.amount,
          atr: opp.available_to_renew,
          type: opp.opportunity_type,
        });
        return acc;
      }, {} as Record<string, any[]>);

      return {
        name: rep.name,
        rep_id: rep.rep_id,
        team: rep.team,
        region: rep.region,
        flm: rep.flm,
        slm: rep.slm,
        is_active: rep.is_active,
        is_strategic_rep: rep.is_strategic_rep,
        current_book: {
          total_accounts: currentAccounts.length,
          customers: currentCustomers,
          prospects: currentProspects,
          total_arr: currentARR,
          total_atr: currentATR,
          cre_count: currentCRE,
          top_accounts: currentAccounts.sort((a, b) => (b.calculated_arr || 0) - (a.calculated_arr || 0)).slice(0, 5).map(acc => ({
            name: acc.account_name,
            arr: acc.calculated_arr,
            atr: acc.calculated_atr,
            is_customer: acc.is_customer,
          })),
        },
        new_book: {
          total_accounts: newAccounts.length,
          customers: newCustomers,
          prospects: newProspects,
          total_arr: newARR,
          total_atr: newATR,
          cre_count: newCRE,
          top_accounts: newAccounts.sort((a, b) => (b.calculated_arr || 0) - (a.calculated_arr || 0)).slice(0, 5).map(acc => ({
            name: acc.account_name,
            arr: acc.calculated_arr,
            atr: acc.calculated_atr,
            is_customer: acc.is_customer,
          })),
        },
        deltas: {
          arr_change: arrDelta,
          atr_change: atrDelta,
          cre_change: creDelta,
          customer_change: customerDelta,
          prospect_change: prospectDelta,
          total_change: newAccounts.length - currentAccounts.length,
        },
        renewals_by_quarter: renewalsByQuarter,
        opportunity_count: repOpportunities.length,
      };
    }) || [];

    // Calculate overall team metrics
    const totalCurrentARR = detailedReps.reduce((sum, rep) => sum + rep.current_book.total_arr, 0);
    const totalNewARR = detailedReps.reduce((sum, rep) => sum + rep.new_book.total_arr, 0);
    const totalCurrentATR = detailedReps.reduce((sum, rep) => sum + rep.current_book.total_atr, 0);
    const totalNewATR = detailedReps.reduce((sum, rep) => sum + rep.new_book.total_atr, 0);
    const totalCurrentCRE = detailedReps.reduce((sum, rep) => sum + rep.current_book.cre_count, 0);
    const totalNewCRE = detailedReps.reduce((sum, rep) => sum + rep.new_book.cre_count, 0);

    // Prepare comprehensive context for OpenAI with COMPLETE data
    const contextData = {
      build: {
        name: build?.name,
        description: build?.description,
        target_date: build?.target_date,
        status: build?.status,
      },
      manager: {
        name: managerName,
        level: managerLevel,
        team: salesReps?.[0]?.team || 'Unknown',
        region: salesReps?.[0]?.region || 'Unknown',
      },
      team_summary: {
        rep_count: salesReps?.length || 0,
        current_total_arr: totalCurrentARR,
        new_total_arr: totalNewARR,
        arr_delta: totalNewARR - totalCurrentARR,
        current_total_atr: totalCurrentATR,
        new_total_atr: totalNewATR,
        atr_delta: totalNewATR - totalCurrentATR,
        current_total_cre: totalCurrentCRE,
        new_total_cre: totalNewCRE,
        cre_delta: totalNewCRE - totalCurrentCRE,
      },
      sales_reps: detailedReps,
      reassignments: {
        total: reassignments?.length || 0,
        pending: reassignments?.filter(r => r.status === 'pending').length || 0,
        approved: reassignments?.filter(r => r.status === 'approved').length || 0,
        details: reassignments?.map(r => ({
          account: r.account_name,
          from: r.current_owner_name,
          to: r.proposed_owner_name,
          status: r.status,
          rationale: r.rationale,
        })),
      },
      notes_count: notes?.length || 0,
    };

    const systemPrompt = `You are an AI assistant helping ${managerName}, a ${managerLevel} (${managerLevel === 'FLM' ? 'Front Line Manager' : 'Second Line Manager'}), understand their team's book of business in detail.

CRITICAL CONTEXT: The manager is reviewing NEW OWNER ASSIGNMENTS ("after" state). When they ask about someone's "book" or "error", they're asking about the NEW assignments.

You have access to COMPLETE data for each sales rep including:
- Current book (before assignments) - what they own NOW
- **New book (after assignments) - what they WILL own** ← THIS IS THE PRIMARY FOCUS
- Deltas/changes - the difference between current and new
- All account details, ARR, ATR, CRE counts
- Renewal breakdowns by quarter
- Opportunities

Context Data:
${JSON.stringify(contextData, null, 2)}

Guidelines:
- When asked about a sales rep's "book" or "assignments" (e.g., "how much was assigned to Ben?"), report the **NEW BOOK** data (new_book.total_arr, new_book.total_atr, etc.)
- When users say "error", they typically mean the new assignments or the delta/change
- For deltas: Show arr_change, atr_change, cre_change (positive = getting more, negative = getting less)
- ALWAYS check new_book data FIRST - this is what the manager sees on their dashboard
- If a rep has 130 new accounts with $1.9M ARR, say that explicitly
- Include account counts: new_book.total_accounts, customers, prospects
- Mention top accounts from new_book.top_accounts if relevant
- Use conversation history for context on follow-up questions
- The manager oversees ${contextData.team_summary.rep_count} sales reps
- Always be professional, detailed, and data-driven`;

    console.log('Calling OpenAI with question:', question);

    // Build messages array with conversation history
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: question }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const answer = data.choices[0].message.content;

    console.log('Generated answer:', answer);

    return new Response(JSON.stringify({ answer, contextData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in manager-ai-assistant function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
