// Utility to regenerate assignments with ORIGINAL working waterfall logic
import { supabase } from '@/integrations/supabase/client';
import { generateSimplifiedAssignments } from '@/services/simplifiedAssignmentEngine';

export const regenerateAssignmentsWithNewRules = async (buildId: string) => {
  console.log('🔄 Starting assignment regeneration with original waterfall logic...');

  try {
    // Step 1: Clear existing assignments using bulk SQL operation
    console.log('Step 1: Clearing existing assignments with bulk operation...');
    
    const { data: resetResult, error: resetError } = await supabase
      .rpc('reset_build_assignments_bulk', { p_build_id: buildId });
    
    if (resetError) {
      console.warn('⚠️ Bulk reset failed, falling back to individual operations:', resetError);
      
      // Fallback: Clear assignments table
      const { error: assignmentsError } = await supabase
        .from('assignments')
        .delete()
        .eq('build_id', buildId);
      
      if (assignmentsError) throw assignmentsError;

      // Fallback: Clear new_owner assignments from accounts
      const { error: accountsError } = await supabase
        .from('accounts')
        .update({ new_owner_id: null, new_owner_name: null })
        .eq('build_id', buildId);
      
      if (accountsError) throw accountsError;

      // Fallback: Clear new_owner assignments from opportunities
      const { error: opportunitiesError } = await supabase
        .from('opportunities')
        .update({ new_owner_id: null, new_owner_name: null })
        .eq('build_id', buildId);
      
      if (opportunitiesError) throw opportunitiesError;
      
      console.log('✅ Step 1 complete: All assignments cleared (fallback method)');
    } else {
      const result = resetResult?.[0];
      console.log(`✅ Step 1 complete: Bulk reset cleared ${result?.accounts_reset} accounts, ${result?.opportunities_reset} opportunities, ${result?.assignments_deleted} assignments in ${result?.processing_time_seconds}s`);
    }

    // Step 2: Fetch data for assignment generation
    console.log('Step 2: Fetching accounts, reps, and configuration...');
    
    const [accountsData, repsData, configData] = await Promise.all([
      supabase
        .from('accounts')
        .select('*')
        .eq('build_id', buildId)
        .eq('is_parent', true),
      supabase
        .from('sales_reps')
        .select('*')
        .eq('build_id', buildId),
      supabase
        .from('assignment_configuration' as any)
        .select('*')
        .eq('build_id', buildId)
        .maybeSingle()
    ]);

    if (accountsData.error) throw accountsData.error;
    if (repsData.error) throw repsData.error;
    if (configData.error) console.warn('Config error:', configData.error);

    const accounts = accountsData.data || [];
    const reps = repsData.data || [];
    
    // Ensure config has proper type
    const defaultConfig = {
      customer_target_arr: 2000000,
      customer_max_arr: 3000000,
      prospect_target_arr: 500000,
      prospect_max_arr: 2000000,
      max_cre_per_rep: 3,
      capacity_variance_percent: 10
    };
    
    const config = (configData.data && typeof configData.data === 'object') 
      ? { ...defaultConfig, ...configData.data as any }
      : defaultConfig;

    console.log(`Loaded ${accounts.length} accounts and ${reps.length} reps`);

    // Step 3: Generate customer assignments using ORIGINAL waterfall logic
    console.log('Step 3: Generating CUSTOMER assignments with original waterfall logic...');
    const customerAccounts = accounts.filter((a: any) => a.is_customer);
    const customerResult = await generateSimplifiedAssignments(
      buildId,
      'customer',
      customerAccounts,
      reps,
      config
    );

    console.log(`✅ Customer assignments: ${customerResult.proposals.length} assigned, ${customerResult.warnings.length} warnings`);

    // Step 4: Generate prospect assignments using ORIGINAL waterfall logic
    console.log('Step 4: Generating PROSPECT assignments with original waterfall logic...');
    const prospectAccounts = accounts.filter((a: any) => !a.is_customer);
    
    // Fetch opportunities for Net ARR calculation
    const { data: opportunities } = await supabase
      .from('opportunities')
      .select('sfdc_account_id, net_arr')
      .eq('build_id', buildId)
      .gt('net_arr', 0);
    
    console.log(`📊 Loaded ${opportunities?.length || 0} opportunities with Net ARR > 0 for prospects`);
    
    const prospectResult = await generateSimplifiedAssignments(
      buildId,
      'prospect',
      prospectAccounts,
      reps,
      config,
      opportunities || []
    );

    console.log(`✅ Prospect assignments: ${prospectResult.proposals.length} assigned, ${prospectResult.warnings.length} warnings`);
    console.log('✅ Assignment generation complete using ORIGINAL working logic!');

    // Convert format to match expected return structure
    return {
      customers: {
        totalAccounts: customerAccounts.length,
        assignedAccounts: customerResult.proposals.length,
        unassignedAccounts: customerAccounts.length - customerResult.proposals.length,
      },
      prospects: {
        totalAccounts: prospectAccounts.length,
        assignedAccounts: prospectResult.proposals.length,
        unassignedAccounts: prospectAccounts.length - prospectResult.proposals.length,
      },
      totalAssigned: customerResult.proposals.length + prospectResult.proposals.length,
      totalConflicts: customerResult.warnings.filter((w: any) => w.severity === 'high').length + prospectResult.warnings.filter((w: any) => w.severity === 'high').length
    };

  } catch (error) {
    console.error('❌ Assignment regeneration failed:', error);
    throw error;
  }
};