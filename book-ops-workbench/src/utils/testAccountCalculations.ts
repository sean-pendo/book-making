// Test utility to trigger account calculations and verify results
import { supabase } from '@/integrations/supabase/client';

export const triggerAccountRecalculation = async (buildId: string) => {
  console.log('Triggering account recalculation for build:', buildId);
  
  try {
    // Call the fixed edge function
    const { data, error } = await supabase.functions.invoke('recalculate-accounts', {
      body: { buildId }
    });
    
    if (error) {
      console.error('Error triggering recalculation:', error);
      throw error;
    }
    
    console.log('Recalculation started:', data);
    return data;
  } catch (error) {
    console.error('Failed to trigger recalculation:', error);
    throw error;
  }
};

export const checkAkamaiATR = async (buildId: string) => {
  const { data, error } = await supabase
    .from('accounts')
    .select('sfdc_account_id, account_name, calculated_arr, calculated_atr, cre_count')
    .eq('build_id', buildId)
    .ilike('account_name', '%akamai%');
    
  if (error) {
    console.error('Error checking Akamai ATR:', error);
    return null;
  }
  
  console.log('Akamai accounts:', data);
  return data;
};

// Import regeneration utility
import { regenerateAssignmentsWithNewRules } from './regenerateAssignments';

export const testAssignmentRegeneration = async (buildId: string) => {
  console.log('🧪 Testing GEO-FIRST assignment regeneration for build:', buildId);
  
  try {
    const result = await regenerateAssignmentsWithNewRules(buildId);
    console.log('🎉 GEO-FIRST assignment regeneration completed successfully!', result);
    return result;
  } catch (error) {
    console.error('💥 GEO-FIRST assignment regeneration failed:', error);
    throw error;
  }
};

// Test the new geo-first logic
export const testGeoFirstLogic = async (buildId: string) => {
  console.log('🗺️ Testing GEO-FIRST logic implementation...');
  
  try {
    // Check current assignment distribution before
    const { data: beforeData, error: beforeError } = await supabase
      .from('accounts')
      .select(`
        sfdc_account_id,
        account_name,
        sales_territory,
        owner_id,
        owner_name,
        new_owner_id,
        new_owner_name,
        calculated_arr
      `)
      .eq('build_id', buildId)
      .eq('is_parent', true)
      .eq('is_customer', true)
      .order('calculated_arr', { ascending: false })
      .limit(20);

    if (beforeError) throw beforeError;

    console.log('📊 Top 20 accounts before geo-first assignment:');
    beforeData?.forEach((acc, i) => {
      console.log(`${i+1}. ${acc.account_name} (${acc.sales_territory}) - Current: ${acc.owner_name || 'None'} -> New: ${acc.new_owner_name || 'None'} - $${((acc.calculated_arr || 0)/1000).toFixed(0)}K`);
    });

    // Test assignment regeneration
    const result = await testAssignmentRegeneration(buildId);
    
    // Check assignment distribution after
    const { data: afterData, error: afterError } = await supabase
      .from('accounts')
      .select(`
        sfdc_account_id,
        account_name,
        sales_territory,
        owner_id,
        owner_name,
        new_owner_id,
        new_owner_name,
        calculated_arr
      `)
      .eq('build_id', buildId)
      .eq('is_parent', true)
      .eq('is_customer', true)
      .order('calculated_arr', { ascending: false })
      .limit(20);

    if (afterError) throw afterError;

    console.log('\n📊 Top 20 accounts after geo-first assignment:');
    afterData?.forEach((acc, i) => {
      console.log(`${i+1}. ${acc.account_name} (${acc.sales_territory}) - Current: ${acc.owner_name || 'None'} -> New: ${acc.new_owner_name || 'None'} - $${((acc.calculated_arr || 0)/1000).toFixed(0)}K`);
    });

    return result;
  } catch (error) {
    console.error('💥 GEO-FIRST logic test failed:', error);
    throw error;
  }
};