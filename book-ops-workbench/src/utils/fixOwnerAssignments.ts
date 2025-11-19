import { supabase } from "@/integrations/supabase/client";

export async function fixOwnerAssignments(buildId: string): Promise<number> {
  console.log('[FixOwnerAssignments] Starting fix for build:', buildId);
  
  try {
    const { data, error } = await supabase.functions.invoke('fix-owner-assignments', {
      body: { buildId }
    });

    if (error) {
      console.error('[FixOwnerAssignments] Error:', error);
      throw error;
    }

    const updatedCount = data?.updatedCount || 0;
    console.log(`[FixOwnerAssignments] Successfully fixed ${updatedCount} assignments`);
    
    return updatedCount;
  } catch (error) {
    console.error('[FixOwnerAssignments] Failed:', error);
    throw error;
  }
}
