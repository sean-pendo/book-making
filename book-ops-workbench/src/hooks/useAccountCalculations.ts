import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export const useAccountCalculations = () => {
  const queryClient = useQueryClient();

  const recalculateAccountValues = useMutation({
    mutationFn: async (buildId: string) => {
      console.log('[Account Calculations] Starting background recalculation for build:', buildId);
      
      // Use edge function for background processing to avoid timeouts
      const { data, error } = await supabase.functions.invoke('recalculate-accounts', {
        body: { buildId }
      });
      
      if (error) {
        console.error('[Account Calculations] Edge function error:', error);
        throw error;
      }
      
      console.log('[Account Calculations] Background recalculation started:', data);
    },
    onSuccess: (_, buildId) => {
      console.log('[Account Calculations] Background recalculation started for build:', buildId);
      
      toast({
        title: "Processing Started",
        description: "Account calculations are being updated in the background. Data will refresh automatically when complete.",
      });
      
      // Set up polling to check when processing is complete
      const pollInterval = setInterval(async () => {
        try {
          // Invalidate queries to check for updated data
          queryClient.invalidateQueries({ queryKey: ['accounts-detail'] });
          queryClient.invalidateQueries({ queryKey: ['build-data-summary'] });
          queryClient.invalidateQueries({ queryKey: ['build-data-relationships'] });
          queryClient.invalidateQueries({ queryKey: ['balancing-metrics'] });
          
          // Stop polling after 2 minutes (background task should be done by then)
          setTimeout(() => {
            clearInterval(pollInterval);
          }, 120000);
        } catch (error) {
          console.error('Polling error:', error);
          clearInterval(pollInterval);
        }
      }, 5000); // Poll every 5 seconds
    },
    onError: (error) => {
      console.error('[Account Calculations] Error starting background recalculation:', error);
      toast({
        title: "Error",
        description: "Failed to start account calculations. Please try again.",
        variant: "destructive",
      });
    },
  });

  return {
    recalculateAccountValues,
    isCalculating: recalculateAccountValues.isPending,
  };
};