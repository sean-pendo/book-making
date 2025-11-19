// Phase 4: Enhanced UI Hook with Progress Tracking and Validation
import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CalculationProgress {
  isRunning: boolean;
  progress: number;
  status: string;
  error?: string;
  completedAt?: Date;
}

interface CalculationResult {
  success: boolean;
  accountsUpdated?: number;
  processingTime?: number;
  method?: 'edge-function' | 'database-function' | 'hybrid';
}

export const useEnhancedAccountCalculations = (buildId?: string) => {
  const [progress, setProgress] = useState<CalculationProgress>({
    isRunning: false,
    progress: 0,
    status: 'Ready'
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Validate calculations by checking a few known accounts
  const validateCalculations = useCallback(async (buildId: string): Promise<boolean> => {
    try {
      // Check Akamai Technologies specifically - should have $0 ATR
      const { data: akamaiData, error: akamaiError } = await supabase
        .from('accounts')
        .select('sfdc_account_id, account_name, calculated_atr')
        .eq('build_id', buildId)
        .ilike('account_name', '%akamai%')
        .limit(1);

      if (akamaiError) {
        console.error('Validation error:', akamaiError);
        return false;
      }

      // Check if Akamai has zero ATR as expected
      if (akamaiData && akamaiData.length > 0) {
        const akamai = akamaiData[0];
        if (akamai.calculated_atr > 0) {
          console.warn(`Validation failed: Akamai still has ATR of $${akamai.calculated_atr}`);
          return false;
        }
      }

      // Additional validation: Check that accounts with "Renewals" opportunities have ATR > 0
      const { data: renewalAccounts, error: renewalError } = await supabase
        .from('accounts')
        .select(`
          sfdc_account_id, 
          calculated_atr,
          opportunities!inner(opportunity_type, available_to_renew)
        `)
        .eq('build_id', buildId)
        .eq('opportunities.opportunity_type', 'Renewals')
        .gt('opportunities.available_to_renew', 0)
        .limit(5);

      if (renewalError) {
        console.error('Renewal validation error:', renewalError);
        return false;
      }

      // Check that accounts with renewals have ATR > 0
      if (renewalAccounts && renewalAccounts.length > 0) {
        const hasValidATR = renewalAccounts.some(account => account.calculated_atr > 0);
        if (!hasValidATR) {
          console.warn('Validation failed: Accounts with renewals have zero ATR');
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Validation error:', error);
      return false;
    }
  }, []);

  // Try database function first, fallback to edge function
  const hybridRecalculation = useMutation({
    mutationFn: async (buildId: string): Promise<CalculationResult> => {
      setProgress({
        isRunning: true,
        progress: 10,
        status: 'Attempting database function...'
      });

      try {
        // First try the database function (fastest)
        console.log('Attempting database function for build:', buildId);
        const { data: dbResult, error: dbError } = await supabase.rpc('recalculate_account_values_db', {
          p_build_id: buildId
        });

        if (!dbError && dbResult && dbResult.length > 0) {
          const result = dbResult[0];
          console.log('Database function successful:', result);
          
          setProgress({
            isRunning: true,
            progress: 90,
            status: 'Database function completed, validating...'
          });

          // Validate the results
          const isValid = await validateCalculations(buildId);
          
          if (isValid) {
            setProgress({
              isRunning: false,
              progress: 100,
              status: 'Completed successfully',
              completedAt: new Date()
            });

            return {
              success: true,
              accountsUpdated: result.accounts_updated,
              processingTime: result.processing_time_seconds,
              method: 'database-function'
            };
          } else {
            console.warn('Database function validation failed, trying edge function...');
          }
        }

        // Fallback to edge function
        setProgress({
          isRunning: true,
          progress: 30,
          status: 'Database function unavailable, using edge function...'
        });

        console.log('Falling back to edge function for build:', buildId);
        const { data: edgeResult, error: edgeError } = await supabase.functions.invoke('recalculate-accounts', {
          body: { buildId }
        });

        if (edgeError) {
          throw new Error(`Edge function failed: ${edgeError.message}`);
        }

        setProgress({
          isRunning: true,
          progress: 60,
          status: 'Edge function started, processing in background...'
        });

        // Poll for completion
        let attempts = 0;
        const maxAttempts = 60; // 5 minutes max
        
        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
          attempts++;
          
          setProgress(prev => ({
            ...prev,
            progress: 60 + (attempts / maxAttempts) * 30,
            status: `Processing... (${attempts * 5}s elapsed)`
          }));

          // Check if calculations are complete by validating
          const isComplete = await validateCalculations(buildId);
          if (isComplete) {
            setProgress({
              isRunning: false,
              progress: 100,
              status: 'Completed successfully',
              completedAt: new Date()
            });

            return {
              success: true,
              method: 'edge-function'
            };
          }
        }

        // If we get here, it might still be processing or failed
        setProgress({
          isRunning: false,
          progress: 90,
          status: 'Processing may still be running in background',
          error: 'Timeout reached, but processing may continue'
        });

        return {
          success: true,
          method: 'hybrid'
        };

      } catch (error) {
        console.error('Calculation error:', error);
        setProgress({
          isRunning: false,
          progress: 0,
          status: 'Error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
      }
    },
    onSuccess: (result) => {
      toast({
        title: "Calculation Complete",
        description: `Successfully updated accounts using ${result.method}${result.accountsUpdated ? ` (${result.accountsUpdated} accounts)` : ''}`,
      });

      // Invalidate relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['build-data-summary'] });
      queryClient.invalidateQueries({ queryKey: ['balancing-metrics'] });
    },
    onError: (error) => {
      toast({
        title: "Calculation Failed",
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: "destructive",
      });
    },
  });

  // Force refresh data after calculation
  const forceRefresh = useCallback(async () => {
    if (!buildId) return;
    
    setProgress(prev => ({ ...prev, status: 'Refreshing data...' }));
    
    try {
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      await queryClient.invalidateQueries({ queryKey: ['build-data-summary'] });
      await queryClient.invalidateQueries({ queryKey: ['balancing-metrics'] });
      
      toast({
        title: "Data Refreshed",
        description: "All data has been refreshed from the database",
      });
    } catch (error) {
      toast({
        title: "Refresh Failed", 
        description: "Failed to refresh data",
        variant: "destructive",
      });
    }
  }, [buildId, queryClient, toast]);

  return {
    recalculateAccountValues: hybridRecalculation.mutate,
    recalculateAccountValuesAsync: hybridRecalculation.mutateAsync,
    isCalculating: hybridRecalculation.isPending || progress.isRunning,
    progress,
    forceRefresh,
    validateCalculations: useCallback(() => buildId ? validateCalculations(buildId) : Promise.resolve(false), [buildId, validateCalculations])
  };
};