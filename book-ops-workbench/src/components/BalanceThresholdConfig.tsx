import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RefreshCw, Calculator, RotateCcw, AlertCircle, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { BalanceThresholdCalculator } from '@/services/balanceThresholdCalculator';

interface BalanceThresholdConfigProps {
  buildId: string;
}

export function BalanceThresholdConfig({ buildId }: BalanceThresholdConfigProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  
  const [config, setConfig] = useState<any>(null);
  const [variances, setVariances] = useState({
    cre_variance: 20,
    atr_variance: 20,
    tier1_variance: 25,
    tier2_variance: 25,
    renewal_concentration_max: 35
  });
  
  const [overrides, setOverrides] = useState<{
    cre_max_override: number | null;
    atr_max_override: number | null;
    tier1_max_override: number | null;
    tier2_max_override: number | null;
    renewal_concentration_max_override: number | null;
    q1_renewal_max_override: number | null;
    q2_renewal_max_override: number | null;
    q3_renewal_max_override: number | null;
    q4_renewal_max_override: number | null;
  }>({
    cre_max_override: null,
    atr_max_override: null,
    tier1_max_override: null,
    tier2_max_override: null,
    renewal_concentration_max_override: null,
    q1_renewal_max_override: null,
    q2_renewal_max_override: null,
    q3_renewal_max_override: null,
    q4_renewal_max_override: null
  });

  const [totals, setTotals] = useState({
    totalCRE: 0,
    totalATR: 0,
    totalTier1: 0,
    totalTier2: 0,
    totalQ1: 0,
    totalQ2: 0,
    totalQ3: 0,
    totalQ4: 0
  });

  useEffect(() => {
    loadConfiguration();
  }, [buildId]);

  const loadConfiguration = async () => {
    setLoading(true);
    try {
      // Get the configuration with account_scope='all' (main config)
      const { data, error } = await supabase
        .from('assignment_configuration')
        .select('*')
        .eq('build_id', buildId)
        .eq('account_scope', 'all')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setConfig(data);
        setVariances({
          cre_variance: data.cre_variance || 20,
          atr_variance: data.atr_variance || 20,
          tier1_variance: data.tier1_variance || 25,
          tier2_variance: data.tier2_variance || 25,
          renewal_concentration_max: data.renewal_concentration_max || 35
        });
        setOverrides({
          cre_max_override: data.cre_max_override,
          atr_max_override: data.atr_max_override,
          tier1_max_override: data.tier1_max_override,
          tier2_max_override: data.tier2_max_override,
          renewal_concentration_max_override: data.renewal_concentration_max_override,
          q1_renewal_max_override: data.q1_renewal_max_override,
          q2_renewal_max_override: data.q2_renewal_max_override,
          q3_renewal_max_override: data.q3_renewal_max_override,
          q4_renewal_max_override: data.q4_renewal_max_override
        });
      }

      // Also load totals from accounts
      await loadTotals();
    } catch (error: any) {
      toast({
        title: 'Error loading configuration',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadTotals = async () => {
    try {
      const { data: accounts, error } = await supabase
        .from('accounts')
        .select('cre_count, calculated_atr, expansion_tier, renewal_quarter')
        .eq('build_id', buildId)
        .eq('is_parent', true)
        .eq('is_customer', true);

      if (error) throw error;

      if (accounts) {
        let totalCRE = 0;
        let totalATR = 0;
        let totalTier1 = 0;
        let totalTier2 = 0;
        let totalQ1 = 0;
        let totalQ2 = 0;
        let totalQ3 = 0;
        let totalQ4 = 0;

        accounts.forEach(account => {
          totalCRE += account.cre_count || 0;
          totalATR += account.calculated_atr || 0;
          
          const tier = account.expansion_tier?.toLowerCase();
          if (tier === 'tier 1' || tier === 'tier1') totalTier1++;
          if (tier === 'tier 2' || tier === 'tier2') totalTier2++;
          
          const quarter = account.renewal_quarter?.toUpperCase();
          if (quarter === 'Q1') totalQ1++;
          if (quarter === 'Q2') totalQ2++;
          if (quarter === 'Q3') totalQ3++;
          if (quarter === 'Q4') totalQ4++;
        });

        setTotals({
          totalCRE,
          totalATR,
          totalTier1,
          totalTier2,
          totalQ1,
          totalQ2,
          totalQ3,
          totalQ4
        });
      }
    } catch (error: any) {
      console.error('Error loading totals:', error);
    }
  };

  const calculateThresholds = async () => {
    setCalculating(true);
    try {
      // Fetch ONLY CUSTOMER parent accounts and active reps
      const [accountsRes, repsRes] = await Promise.all([
        supabase
          .from('accounts')
          .select('*')
          .eq('build_id', buildId)
          .eq('is_parent', true)
          .eq('is_customer', true), // ONLY CUSTOMERS
        supabase
          .from('sales_reps')
          .select('*')
          .eq('build_id', buildId)
          .eq('is_active', true) // ONLY ACTIVE REPS
      ]);

      if (accountsRes.error) throw accountsRes.error;
      if (repsRes.error) throw repsRes.error;

      const accounts = accountsRes.data || [];
      const reps = repsRes.data || [];

      // Calculate thresholds
      const calculated = BalanceThresholdCalculator.calculateThresholds(
        accounts,
        reps,
        variances
      );

      // Store totals in state
      setTotals({
        totalCRE: calculated.totalCRE || 0,
        totalATR: calculated.totalATR || 0,
        totalTier1: calculated.totalTier1 || 0,
        totalTier2: calculated.totalTier2 || 0,
        totalQ1: calculated.totalQ1 || 0,
        totalQ2: calculated.totalQ2 || 0,
        totalQ3: calculated.totalQ3 || 0,
        totalQ4: calculated.totalQ4 || 0
      });

      // Save to database (don't touch overrides) - only save fields that exist in schema
      const { error: updateError } = await supabase
        .from('assignment_configuration')
        .update({
          ...variances,
          cre_target: calculated.cre_target,
          cre_min: calculated.cre_min,
          cre_max: calculated.cre_max,
          atr_target: calculated.atr_target,
          atr_min: calculated.atr_min,
          atr_max: calculated.atr_max,
          tier1_target: calculated.tier1_target,
          tier1_min: calculated.tier1_min,
          tier1_max: calculated.tier1_max,
          tier2_target: calculated.tier2_target,
          tier2_min: calculated.tier2_min,
          tier2_max: calculated.tier2_max,
          q1_renewal_target: calculated.q1_renewal_target,
          q1_renewal_min: calculated.q1_renewal_min,
          q1_renewal_max: calculated.q1_renewal_max,
          q2_renewal_target: calculated.q2_renewal_target,
          q2_renewal_min: calculated.q2_renewal_min,
          q2_renewal_max: calculated.q2_renewal_max,
          q3_renewal_target: calculated.q3_renewal_target,
          q3_renewal_min: calculated.q3_renewal_min,
          q3_renewal_max: calculated.q3_renewal_max,
          q4_renewal_target: calculated.q4_renewal_target,
          q4_renewal_min: calculated.q4_renewal_min,
          q4_renewal_max: calculated.q4_renewal_max,
          last_calculated_at: calculated.last_calculated_at,
          based_on_account_count: calculated.based_on_account_count,
          based_on_rep_count: calculated.based_on_rep_count,
        })
        .eq('build_id', buildId);

      if (updateError) throw updateError;

      toast({
        title: 'Thresholds calculated',
        description: `Based on ${calculated.based_on_account_count} accounts and ${calculated.based_on_rep_count} normal reps`
      });

      await loadConfiguration();
    } catch (error: any) {
      toast({
        title: 'Calculation failed',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setCalculating(false);
    }
  };

  const saveOverride = async (field: string, value: number | null) => {
    try {
      const { error } = await supabase
        .from('assignment_configuration')
        .update({ [field]: value })
        .eq('build_id', buildId);

      if (error) throw error;

      toast({
        title: 'Override saved',
        description: value === null ? 'Reset to calculated value' : 'Custom value applied'
      });

      await loadConfiguration();
    } catch (error: any) {
      toast({
        title: 'Save failed',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  if (loading || !config) {
    return <div className="p-4">Loading configuration...</div>;
  }

  const ThresholdRow = ({ 
    label, 
    calculated, 
    overrideField, 
    overrideValue,
    total,
    isCurrency = false
  }: { 
    label: string; 
    calculated: { min: number; target: number; max: number }; 
    overrideField: string;
    overrideValue: number | null;
    total: number;
    isCurrency?: boolean;
  }) => {
    const effectiveMax = overrideValue ?? calculated.max;
    const isOverridden = overrideValue !== null;

    const formatValue = (value: number) => {
      if (isCurrency) {
        return new Intl.NumberFormat('en-US', { 
          style: 'currency', 
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(value);
      }
      return value;
    };

    return (
      <div className="grid grid-cols-7 gap-4 items-center py-3 border-b">
        <div className="font-medium">{label}</div>
        <div className="text-center">
          <div className="text-xs text-muted-foreground mb-1">Total</div>
          <div className="font-mono font-semibold text-primary">{formatValue(total)}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-muted-foreground mb-1">Min</div>
          <div className="font-mono">{formatValue(calculated.min)}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-muted-foreground mb-1">Target</div>
          <div className="font-mono font-semibold">{formatValue(calculated.target)}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-muted-foreground mb-1">Calculated Max</div>
          <div className="font-mono">{formatValue(calculated.max)}</div>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Override Max</Label>
          <Input
            type="number"
            value={effectiveMax}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              setOverrides(prev => ({ ...prev, [overrideField]: val }));
            }}
            className={isOverridden ? 'border-amber-500' : ''}
          />
          {isOverridden && <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 text-xs">Custom</Badge>}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => saveOverride(overrideField, overrides[overrideField as keyof typeof overrides])}
            disabled={!isOverridden && overrides[overrideField as keyof typeof overrides] === calculated.max}
          >
            Save
          </Button>
          {isOverridden && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setOverrides(prev => ({ ...prev, [overrideField]: null }));
                saveOverride(overrideField, null);
              }}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Balance Thresholds
            </CardTitle>
            <CardDescription>
              Auto-calculated targets for workload balancing. Override specific values as needed.
            </CardDescription>
          </div>
          <Button onClick={calculateThresholds} disabled={calculating}>
            <RefreshCw className={`h-4 w-4 mr-2 ${calculating ? 'animate-spin' : ''}`} />
            Recalculate
          </Button>
        </div>
        
        {/* Calculation Explanation */}
        <Alert className="mt-4">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <p className="font-semibold mb-2">How Calculation Works:</p>
            <ol className="space-y-1 ml-4 list-decimal">
              <li>Sums <strong>total CREs</strong> across all customer parent accounts</li>
              <li>Sums <strong>total ATR</strong> across all customer parent accounts</li>
              <li>Counts <strong>Tier 1</strong> and <strong>Tier 2</strong> customer accounts</li>
              <li>Counts <strong>quarterly renewals</strong> (Q1, Q2, Q3, Q4)</li>
              <li>Divides each total by <strong>active normal reps</strong> (excludes strategic reps)</li>
              <li>Applies variance % to create Min/Max ranges</li>
            </ol>
            <p className="mt-2 text-xs text-muted-foreground">
              Example: 410 accounts, 100 total CREs, 50 normal reps → Target = 2.0, Min = 1.6 (20% variance), Max = 2.4
            </p>
          </AlertDescription>
        </Alert>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Variance Settings */}
        <div className="space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Variance Settings
          </h3>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <Label>CRE Variance (%)</Label>
              <Input
                type="number"
                value={variances.cre_variance}
                onChange={(e) => setVariances(prev => ({ ...prev, cre_variance: parseInt(e.target.value) }))}
              />
            </div>
            <div>
              <Label>ATR Variance (%)</Label>
              <Input
                type="number"
                value={variances.atr_variance}
                onChange={(e) => setVariances(prev => ({ ...prev, atr_variance: parseInt(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Tier 1 Variance (%)</Label>
              <Input
                type="number"
                value={variances.tier1_variance}
                onChange={(e) => setVariances(prev => ({ ...prev, tier1_variance: parseInt(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Renewal Variance (%)</Label>
              <Input
                type="number"
                value={variances.renewal_concentration_max}
                onChange={(e) => setVariances(prev => ({ ...prev, renewal_concentration_max: parseInt(e.target.value) }))}
              />
            </div>
          </div>
        </div>

        {/* Calculated Thresholds */}
        <div className="space-y-2">
          <h3 className="font-semibold">Calculated Thresholds (Normal Reps Only)</h3>
          {config.last_calculated_at && (
            <p className="text-sm text-muted-foreground">
              Last calculated: {new Date(config.last_calculated_at).toLocaleString()} 
              <br />
              <strong>Based on:</strong> {config.based_on_account_count} customer parent accounts ÷ {config.based_on_rep_count} active normal reps
            </p>
          )}
          
          <div className="space-y-2">
            <ThresholdRow
              label="CRE Count"
              calculated={{ min: config.cre_min || 0, target: config.cre_target || 0, max: config.cre_max || 0 }}
              overrideField="cre_max_override"
              overrideValue={overrides.cre_max_override}
              total={totals.totalCRE}
            />
            <ThresholdRow
              label="ATR"
              calculated={{ min: config.atr_min || 0, target: config.atr_target || 0, max: config.atr_max || 0 }}
              overrideField="atr_max_override"
              overrideValue={overrides.atr_max_override}
              total={totals.totalATR}
              isCurrency={true}
            />
            <ThresholdRow
              label="Tier 1 Accounts"
              calculated={{ min: config.tier1_min || 0, target: config.tier1_target || 0, max: config.tier1_max || 0 }}
              overrideField="tier1_max_override"
              overrideValue={overrides.tier1_max_override}
              total={totals.totalTier1}
            />
            <ThresholdRow
              label="Tier 2 Accounts"
              calculated={{ min: config.tier2_min || 0, target: config.tier2_target || 0, max: config.tier2_max || 0 }}
              overrideField="tier2_max_override"
              overrideValue={overrides.tier2_max_override}
              total={totals.totalTier2}
            />
            <ThresholdRow
              label="Q1 Renewals (Feb-Apr)"
              calculated={{ min: config.q1_renewal_min || 0, target: config.q1_renewal_target || 0, max: config.q1_renewal_max || 0 }}
              overrideField="q1_renewal_max_override"
              overrideValue={overrides.q1_renewal_max_override}
              total={totals.totalQ1}
            />
            <ThresholdRow
              label="Q2 Renewals (May-Jul)"
              calculated={{ min: config.q2_renewal_min || 0, target: config.q2_renewal_target || 0, max: config.q2_renewal_max || 0 }}
              overrideField="q2_renewal_max_override"
              overrideValue={overrides.q2_renewal_max_override}
              total={totals.totalQ2}
            />
            <ThresholdRow
              label="Q3 Renewals (Aug-Oct)"
              calculated={{ min: config.q3_renewal_min || 0, target: config.q3_renewal_target || 0, max: config.q3_renewal_max || 0 }}
              overrideField="q3_renewal_max_override"
              overrideValue={overrides.q3_renewal_max_override}
              total={totals.totalQ3}
            />
            <ThresholdRow
              label="Q4 Renewals (Nov-Jan)"
              calculated={{ min: config.q4_renewal_min || 0, target: config.q4_renewal_target || 0, max: config.q4_renewal_max || 0 }}
              overrideField="q4_renewal_max_override"
              overrideValue={overrides.q4_renewal_max_override}
              total={totals.totalQ4}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
