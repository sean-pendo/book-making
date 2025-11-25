import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export const useAccountCalculations = () => {
  const queryClient = useQueryClient();

  const recalculateAccountValues = useMutation({
    mutationFn: async (buildId: string) => {
      console.log('[Account Calculations] Skipping edge function call (ATR calculated during import)');

      // ATR is now automatically calculated during opportunities import
      // Edge function call is no longer required for normal operation
      // Just invalidate caches to refresh UI with latest data

      console.log('[Account Calculations] Account calculations up-to-date from import');
      return { message: 'ATR already calculated during import' };
    },
    onSuccess: (_, buildId) => {
      console.log('[Account Calculations] Refreshing data for build:', buildId);

      toast({
        title: "Refreshing Data",
        description: "Account calculations are up-to-date. Refreshing display...",
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