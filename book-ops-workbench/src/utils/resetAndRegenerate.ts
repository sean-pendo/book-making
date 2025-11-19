import { supabase } from '@/integrations/supabase/client';

/**
 * Simple utility to reset assignments and trigger fresh regeneration
 * This will use the FIXED optimize-balancing edge function
 */
export async function resetAndRegenerate(buildId: string): Promise<void> {
  console.log('🔄 [RESET] Starting complete reset and regeneration...');
  
  try {
    // Step 1: Reset all assignments to clean slate
    console.log('🧹 [RESET] Step 1: Clearing old assignments...');
    
    const { error: resetError } = await supabase
      .rpc('reset_build_assignments_bulk', { p_build_id: buildId });
    
    if (resetError) {
      console.error('❌ [RESET] Reset failed:', resetError);
      throw new Error(`Failed to reset assignments: ${resetError.message}`);
    }
    
    console.log('✅ [RESET] Step 1 complete: All old assignments cleared');
    
    // Step 2: The user can now manually trigger assignment generation
    // through the UI, which will use the FIXED edge function
    console.log('✅ [RESET] Ready for fresh assignment generation');
    console.log('💡 [RESET] Please use the Assignment Engine to generate new assignments');
    
  } catch (error) {
    console.error('❌ [RESET] Failed:', error);
    throw error;
  }
}
