import { Button } from "@/components/ui/button";
import { Calculator } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BalanceThresholdCalculator } from "@/services/balanceThresholdCalculator";

interface CalculateThresholdsButtonProps {
  buildId: string;
  onCalculated?: () => void;
}

export const CalculateThresholdsButton = ({ buildId, onCalculated }: CalculateThresholdsButtonProps) => {
  const [isCalculating, setIsCalculating] = useState(false);

  const handleCalculate = async () => {
    setIsCalculating(true);
    
    try {
      toast.info("Calculating balance thresholds...");

      // Fetch customer accounts
      const { data: customerAccounts, error: accountsError } = await supabase
        .from('accounts')
        .select('*')
        .eq('build_id', buildId)
        .eq('is_parent', true)
        .eq('is_customer', true);

      if (accountsError) throw accountsError;
      if (!customerAccounts || customerAccounts.length === 0) {
        throw new Error('No customer accounts found');
      }

      // Fetch active reps with regions
      const { data: activeReps, error: repsError } = await supabase
        .from('sales_reps')
        .select('*')
        .eq('build_id', buildId)
        .eq('is_active', true)
        .eq('is_strategic_rep', false)
        .not('region', 'is', null)
        .neq('region', '');

      if (repsError) throw repsError;
      if (!activeReps || activeReps.length === 0) {
        throw new Error('No active reps with regions found');
      }

      // Fetch current config for variances
      const { data: config } = await supabase
        .from('assignment_configuration')
        .select('cre_variance, atr_variance, tier1_variance, tier2_variance, renewal_concentration_max')
        .eq('build_id', buildId)
        .eq('account_scope', 'all')
        .single();

      // Calculate thresholds
      const calculated = BalanceThresholdCalculator.calculateThresholds(
        customerAccounts as any,
        activeReps as any,
        {
          cre_variance: config?.cre_variance || 20,
          atr_variance: config?.atr_variance || 20,
          tier1_variance: config?.tier1_variance || 25,
          tier2_variance: config?.tier2_variance || 25,
          renewal_concentration_max: config?.renewal_concentration_max || 35
        }
      );

      console.log('📊 Calculated thresholds:', calculated);

      // Update database
      const { error: updateError } = await supabase
        .from('assignment_configuration')
        .update(calculated)
        .eq('build_id', buildId)
        .eq('account_scope', 'all');

      if (updateError) throw updateError;

      toast.success(
        `Balance thresholds calculated!`,
        {
          description: `CRE: ${calculated.cre_target}, ATR: $${(calculated.atr_target/1000000).toFixed(2)}M, Tier1: ${calculated.tier1_target}, Tier2: ${calculated.tier2_target}`
        }
      );

      onCalculated?.();
    } catch (error) {
      console.error('Error calculating thresholds:', error);
      toast.error("Failed to calculate thresholds", {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <Button
      onClick={handleCalculate}
      disabled={isCalculating}
      variant="outline"
      size="sm"
      className="gap-2"
    >
      <Calculator className="h-4 w-4" />
      {isCalculating ? "Calculating..." : "Calculate Balance Thresholds"}
    </Button>
  );
};
