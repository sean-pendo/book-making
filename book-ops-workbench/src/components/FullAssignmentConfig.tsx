import React, { useState, useEffect } from 'react';
import { Save, CheckCircle, MapPin, X, Loader2, Sparkles, Calculator, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  mapTerritoriesWithGemini, 
  NOT_APPLICABLE, 
  NOT_APPLICABLE_LABEL,
  isNotApplicable,
  getRegionDisplayLabel 
} from '@/services/geminiRegionMappingService';

interface FullAssignmentConfigProps {
  buildId: string;
  onClose?: () => void;
  onConfigurationComplete?: () => void;
}

interface ConfigState {
  customer_target_arr: number;
  customer_max_arr: number;
  prospect_target_arr: number;
  prospect_max_arr: number;
  capacity_variance_percent: number;
  prospect_variance_percent: number;
  territory_mappings: Record<string, string>;
  // Balance limits (using actual DB column names)
  max_cre_per_rep: number;
  atr_max: number;
  max_tier1_per_rep: number;
  max_tier2_per_rep: number;
  renewal_concentration_max: number;
}

export const FullAssignmentConfig: React.FC<FullAssignmentConfigProps> = ({ 
  buildId, 
  onClose,
  onConfigurationComplete 
}) => {
  const { toast } = useToast();
  
  const [config, setConfig] = useState<ConfigState>({
    customer_target_arr: 2000000,
    customer_max_arr: 3000000,
    prospect_target_arr: 2000000,
    prospect_max_arr: 3000000,
    capacity_variance_percent: 10,
    prospect_variance_percent: 10,
    territory_mappings: {},
    // Balance limits defaults
    max_cre_per_rep: 3,
    atr_max: 150000,
    max_tier1_per_rep: 5,
    max_tier2_per_rep: 8,
    renewal_concentration_max: 25
  });
  
  const [accountTerritories, setAccountTerritories] = useState<string[]>([]);
  const [repRegions, setRepRegions] = useState<string[]>([]);
  const [prospectAccountCount, setProspectAccountCount] = useState(0);
  const [activeRepCount, setActiveRepCount] = useState(0);
  const [totalProspectNetARR, setTotalProspectNetARR] = useState(0);
  const [totalCustomerARR, setTotalCustomerARR] = useState(0);
  
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isAiMapping, setIsAiMapping] = useState(false);
  const [lastCalculatedAt, setLastCalculatedAt] = useState<string | null>(null);
  const [aiMappingDetails, setAiMappingDetails] = useState<Array<{
    territory: string;
    region: string;
    confidence: 'high' | 'medium' | 'low';
    reasoning?: string;
  }>>([]);

  useEffect(() => {
    if (!buildId) return;
    
    const loadConfig = async () => {
      setIsLoading(true);
      
      try {
        // Load configuration
        const { data, error } = await supabase
          .from('assignment_configuration')
          .select('*')
          .eq('build_id', buildId)
          .maybeSingle();
        
        if (error) {
          console.error('Error loading config:', error);
        } else if (data) {
          setConfig({
            customer_target_arr: data.customer_target_arr || 2000000,
            customer_max_arr: data.customer_max_arr || 3000000,
            prospect_target_arr: data.prospect_target_arr || 2000000,
            prospect_max_arr: data.prospect_max_arr || 3000000,
            capacity_variance_percent: data.capacity_variance_percent || 10,
            prospect_variance_percent: data.prospect_variance_percent || 10,
            territory_mappings: (data.territory_mappings as Record<string, string>) || {},
            // Balance limits
            max_cre_per_rep: data.max_cre_per_rep || 3,
            atr_max: data.atr_max || 150000,
            max_tier1_per_rep: data.max_tier1_per_rep || 5,
            max_tier2_per_rep: data.max_tier2_per_rep || 8,
            renewal_concentration_max: data.renewal_concentration_max || 25
          });
          setLastCalculatedAt(data.last_calculated_at);
        }
        
        // Load unique account territories (just need sales_territory field)
        const { data: accounts, error: accountsError } = await supabase
          .from('accounts')
          .select('sales_territory')
          .eq('build_id', buildId)
          .not('sales_territory', 'is', null);
        
        if (accountsError) {
          console.error('Error loading accounts:', accountsError);
        }
        
        const uniqueTerritories = Array.from(
          new Set(
            accounts
              ?.map(a => a.sales_territory)
              .filter(t => t && t.trim() !== '') || []
          )
        ).sort();
        
        setAccountTerritories(uniqueTerritories);
        
        // Calculate total customer ARR using RPC to avoid row limits
        const { data: arrData, error: arrError } = await (supabase.rpc as any)('get_customer_arr_total', {
          p_build_id: buildId
        });
        
        if (arrError) {
          console.error('[Config] Customer ARR RPC error:', arrError);
          setTotalCustomerARR(0);
        } else {
          const totalARR = Number(arrData) || 0;
          console.log('[Config] Customer ARR from RPC:', totalARR);
          setTotalCustomerARR(totalARR);
        }
        
        // Count prospect accounts
        const { count: prospectCount } = await supabase
          .from('accounts')
          .select('*', { count: 'exact', head: true })
          .eq('build_id', buildId)
          .eq('is_customer', false)
          .eq('is_parent', true);
        
        setProspectAccountCount(prospectCount || 0);
        
        // Calculate total pipeline using RPC to avoid row limits
        // Join opportunities to prospect parent accounts and sum net_arr
        const { data: pipelineData, error: pipelineError } = await (supabase.rpc as any)('get_prospect_pipeline_total', {
          p_build_id: buildId
        });
        
        if (pipelineError) {
          console.error('[Config] Pipeline RPC error, falling back to estimate:', pipelineError);
          // Fallback: just use 0, user can click calculate
          setTotalProspectNetARR(0);
        } else {
          const totalPipeline = Number(pipelineData) || 0;
          console.log('[Config] Prospect Pipeline from RPC:', totalPipeline);
          setTotalProspectNetARR(totalPipeline);
        }
        
        // Load unique rep regions
        const { data: reps } = await supabase
          .from('sales_reps')
          .select('region, is_active, include_in_assignments, is_strategic_rep')
          .eq('build_id', buildId);
        
        const uniqueRegions = Array.from(
          new Set(
            reps
              ?.map(r => r.region)
              .filter(r => r && r.trim() !== '') || []
          )
        ).sort();
        
        setRepRegions(uniqueRegions);
        
        // Count active normal reps (non-strategic)
        const activeReps = reps?.filter(r => r.is_active && r.include_in_assignments && !r.is_strategic_rep).length || 0;
        setActiveRepCount(activeReps);
      } catch (err) {
        console.error('Error in loadConfig:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadConfig();
  }, [buildId]);

  // Auto-calculate recommended targets based on data
  const calculateRecommendedTargets = async () => {
    if (!buildId || activeRepCount === 0) return;
    
    setIsCalculating(true);
    
    try {
      // Get totals via RPC (avoids row limits)
      const [customerArrResult, prospectPipelineResult, repsResult, accountsResult, oppsResult] = await Promise.all([
        (supabase.rpc as any)('get_customer_arr_total', { p_build_id: buildId }),
        (supabase.rpc as any)('get_prospect_pipeline_total', { p_build_id: buildId }),
        supabase
          .from('sales_reps')
          .select('rep_id, is_strategic_rep, region')
          .eq('build_id', buildId)
          .eq('is_active', true)
          .eq('include_in_assignments', true),
        // Get account data for balance limits calculation
        supabase
          .from('accounts')
          .select('cre_count, calculated_atr, expansion_tier, renewal_quarter')
          .eq('build_id', buildId)
          .eq('is_parent', true)
          .eq('is_customer', true)
          .limit(50000),
        // Get ATR from renewal opportunities
        supabase
          .from('opportunities')
          .select('available_to_renew, opportunity_type')
          .eq('build_id', buildId)
          .ilike('opportunity_type', '%renewal%')
          .limit(50000)
      ]);
      
      const totalCustomerARR = Number(customerArrResult.data) || 0;
      const totalProspectPipeline = Number(prospectPipelineResult.data) || 0;
      const reps = repsResult.data || [];
      const accounts = accountsResult.data || [];
      const renewalOpps = oppsResult.data || [];
      
      if (reps.length === 0) {
        toast({
          title: "Cannot calculate",
          description: "No active reps found for calculation",
          variant: "destructive"
        });
        return;
      }
      
      const normalRepCount = reps.filter(r => !r.is_strategic_rep && r.region).length;
      
      // Calculate balance totals from accounts
      let totalCRE = 0;
      let totalTier1 = 0;
      let totalTier2 = 0;
      let accountATR = 0;
      
      accounts.forEach(account => {
        totalCRE += account.cre_count || 0;
        accountATR += account.calculated_atr || 0;
        const tier = account.expansion_tier?.toLowerCase();
        if (tier === 'tier 1' || tier === 'tier1') totalTier1++;
        if (tier === 'tier 2' || tier === 'tier2') totalTier2++;
      });
      
      // Calculate total ATR: use opportunities first, fall back to accounts
      const oppsATR = renewalOpps.reduce((sum, opp) => sum + (opp.available_to_renew || 0), 0);
      const totalATR = oppsATR > 0 ? oppsATR : accountATR;
      
      console.log('[CalculateTargets] Customer ARR:', totalCustomerARR, 'Prospect Pipeline:', totalProspectPipeline, 'Reps:', normalRepCount);
      console.log('[CalculateTargets] CRE:', totalCRE, 'ATR (from opps):', totalATR, 'Tier1:', totalTier1, 'Tier2:', totalTier2);
      
      // Calculate recommended ARR targets
      const recommendedCustomerTarget = normalRepCount > 0 && totalCustomerARR > 0 
        ? Math.round(totalCustomerARR / normalRepCount) 
        : 2000000;
      const recommendedCustomerMax = Math.round(recommendedCustomerTarget * 1.5);
      
      const recommendedProspectTarget = normalRepCount > 0 && totalProspectPipeline > 0
        ? Math.round(totalProspectPipeline / normalRepCount)
        : 2000000;
      const recommendedProspectMax = Math.round(recommendedProspectTarget * 1.5);
      
      // Calculate balance limits (target + 20% variance for max)
      const variance = 1.2;
      const maxCre = normalRepCount > 0 ? Math.ceil((totalCRE / normalRepCount) * variance) : 3;
      const maxAtr = normalRepCount > 0 ? Math.ceil((totalATR / normalRepCount) * variance) : 150000;
      const maxTier1 = normalRepCount > 0 ? Math.ceil((totalTier1 / normalRepCount) * variance) : 5;
      const maxTier2 = normalRepCount > 0 ? Math.ceil((totalTier2 / normalRepCount) * variance) : 8;
      
      // Update config with all calculated values
      setConfig(prev => ({
        ...prev,
        customer_target_arr: recommendedCustomerTarget,
        customer_max_arr: recommendedCustomerMax,
        prospect_target_arr: recommendedProspectTarget,
        prospect_max_arr: recommendedProspectMax,
        // Balance limits
        max_cre_per_rep: Math.max(maxCre, 1),
        atr_max: Math.max(maxAtr, 10000),
        max_tier1_per_rep: Math.max(maxTier1, 1),
        max_tier2_per_rep: Math.max(maxTier2, 1),
        renewal_concentration_max: 25 // Keep default for renewals
      }));
      
      setLastCalculatedAt(new Date().toISOString());
      setIsDirty(true);
      
      toast({
        title: "Targets calculated",
        description: `ARR & balance limits updated for ${normalRepCount} reps`
      });
      
    } catch (error) {
      console.error('Calculate error:', error);
      toast({
        title: "Calculation failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setIsCalculating(false);
    }
  };

  const formatCurrency = (value: number) => `$${(value / 1000000).toFixed(1)}M`;
  const formatNumber = (value: number) => value.toLocaleString();
  
  // Dynamic slider ranges based on actual totals
  const customerSliderMax = Math.max(5000000, Math.ceil((totalCustomerARR / Math.max(activeRepCount, 1)) * 2 / 100000) * 100000);
  const prospectSliderMax = Math.max(500000, Math.ceil((totalProspectNetARR / Math.max(activeRepCount, 1)) * 2 / 10000) * 10000);

  const handleChange = (field: keyof ConfigState, value: number | Record<string, string>) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
    setShowSuccess(false);
  };
  
  const handleTerritoryMapping = (accountTerritory: string, repRegion: string) => {
    setConfig(prev => ({
      ...prev,
      territory_mappings: {
        ...prev.territory_mappings,
        [accountTerritory]: repRegion
      }
    }));
    setIsDirty(true);
    setShowSuccess(false);
  };

  const clearTerritoryMapping = (accountTerritory: string) => {
    setConfig(prev => {
      const newMappings = { ...prev.territory_mappings };
      delete newMappings[accountTerritory];
      return {
        ...prev,
        territory_mappings: newMappings
      };
    });
    setIsDirty(true);
    setShowSuccess(false);
  };

  const aiMapTerritories = async () => {
    if (accountTerritories.length === 0 || repRegions.length === 0) {
      toast({
        title: "Cannot map territories",
        description: "No territories or regions available to map",
        variant: "destructive"
      });
      return;
    }

    setIsAiMapping(true);
    setAiMappingDetails([]);
    
    try {
      const result = await mapTerritoriesWithGemini(
        accountTerritories,
        repRegions
      );
      
      setConfig(prev => ({
        ...prev,
        territory_mappings: { ...prev.territory_mappings, ...result.mappings }
      }));
      
      setAiMappingDetails(result.details);
      setIsDirty(true);
      
      const mappedCount = Object.keys(result.mappings).length;
      const applicableCount = mappedCount - result.notApplicableCount;
      
      toast({
        title: "AI Mapping Complete",
        description: `Mapped ${applicableCount} territories to regions. ${result.notApplicableCount} marked as Not Applicable.`
      });
    } catch (error) {
      console.error('AI mapping error:', error);
      toast({
        title: "AI Mapping Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsAiMapping(false);
    }
  };

  const handleSave = async () => {
    if (!buildId) return;
    
    setIsSaving(true);
    
    try {
      const { data: existing } = await supabase
        .from('assignment_configuration')
        .select('id')
        .eq('build_id', buildId)
        .eq('account_scope', 'all')
        .maybeSingle();
      
      const configData = {
        build_id: buildId,
        account_scope: 'all',
        ...config,
        last_calculated_at: lastCalculatedAt,
        updated_at: new Date().toISOString()
      };
      
      let error;
      
      if (existing) {
        const result = await supabase
          .from('assignment_configuration')
          .update(configData)
          .eq('id', existing.id);
        error = result.error;
      } else {
        const result = await supabase
          .from('assignment_configuration')
          .insert(configData);
        error = result.error;
      }
      
      if (error) {
        toast({
          title: "Error saving configuration",
          description: error.message,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Configuration saved",
          description: "You can now generate assignments"
        });
        setShowSuccess(true);
        setIsDirty(false);
        
        onConfigurationComplete?.();
        
        setTimeout(() => {
          onClose?.();
        }, 500);
      }
    } catch (err) {
      toast({
        title: "Error saving configuration",
        description: String(err),
        variant: "destructive"
      });
    }
    
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading configuration...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-[80vh]">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-2">
      {/* Quick Actions Bar - Calculate Thresholds at top */}
      <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Calculator className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Auto-Calculate Targets</p>
                <p className="text-sm text-muted-foreground">
                  Analyze your data to recommend ARR targets and thresholds
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-sm">
                  <p className="font-semibold mb-1">What this does:</p>
                  <ul className="text-sm space-y-1">
                    <li>• Calculates total customer ARR ÷ active reps</li>
                    <li>• Sets recommended Target ARR per rep</li>
                    <li>• Sets Max ARR at 150% of target</li>
                    <li>• Calculates CRE, Tier 1, Tier 2 thresholds</li>
                  </ul>
                  <p className="text-xs text-muted-foreground mt-2">
                    You can still manually adjust values after calculation.
                  </p>
                </TooltipContent>
              </Tooltip>
              <Button 
                onClick={calculateRecommendedTargets} 
                disabled={isCalculating || activeRepCount === 0}
                className="gap-2"
              >
                {isCalculating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Calculating...
                  </>
                ) : (
                  <>
                    <Calculator className="h-4 w-4" />
                    Auto-Calculate Targets
                  </>
                )}
              </Button>
            </div>
          </div>
          {lastCalculatedAt && (
            <p className="text-xs text-muted-foreground mt-2">
              Last calculated: {new Date(lastCalculatedAt).toLocaleString()}
            </p>
          )}
          {activeRepCount === 0 && (
            <p className="text-xs text-amber-600 mt-2">
              ⚠️ No active reps with regions found. Import sales reps first.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Success Message */}
      {showSuccess && (
        <Alert className="border-green-600 bg-green-50 dark:bg-green-950">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription>
            <p className="font-medium">Configuration saved successfully</p>
          </AlertDescription>
        </Alert>
      )}

      {/* Customer ARR Targets */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Customer Account Targets</CardTitle>
              <CardDescription>ARR goals for customer assignments</CardDescription>
            </div>
            {totalCustomerARR > 0 && activeRepCount > 0 && (
              <Badge variant="outline" className="text-xs">
                Total: {formatCurrency(totalCustomerARR)} across {activeRepCount} reps
              </Badge>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              Target ARR per Rep
              <span className="text-muted-foreground font-normal">
                {formatCurrency(config.customer_target_arr)}
              </span>
            </Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[config.customer_target_arr]}
                onValueChange={([value]) => handleChange('customer_target_arr', value)}
                min={500000}
                max={customerSliderMax}
                step={100000}
                className="flex-1"
              />
              <Input
                type="text"
                value={formatNumber(config.customer_target_arr)}
                onChange={(e) => handleChange('customer_target_arr', parseInt(e.target.value.replace(/,/g, '')) || 0)}
                className="w-36"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                Capacity Variance %
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p className="font-medium">How close should reps be to each other?</p>
                    <p className="mt-2">This controls how evenly ARR is distributed across reps.</p>
                    <p className="mt-2">• <strong>Lower %</strong> (e.g., 10%) = Reps must be very close to each other in ARR. Tighter balance, but may break geographic assignments.</p>
                    <p className="mt-1">• <strong>Higher %</strong> (e.g., 25%) = More spread allowed between reps. Better geo matching, but less equal books.</p>
                  </TooltipContent>
                </Tooltip>
              </span>
              <span className="text-muted-foreground font-normal">
                {config.capacity_variance_percent}%
              </span>
            </Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[config.capacity_variance_percent]}
                onValueChange={([value]) => handleChange('capacity_variance_percent', value)}
                min={5}
                max={30}
                step={1}
                className="flex-1"
              />
              <Input
                type="number"
                value={config.capacity_variance_percent}
                onChange={(e) => handleChange('capacity_variance_percent', parseInt(e.target.value) || 10)}
                className="w-20"
                min={5}
                max={30}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Band: {formatCurrency(config.customer_target_arr * (1 - config.capacity_variance_percent / 100))} – {formatCurrency(config.customer_target_arr * (1 + config.capacity_variance_percent / 100))}
            </p>
          </div>

          <div className="space-y-2">
            {(() => {
              // Calculate the minimum allowed Maximum ARR (must be >= preferred max from variance band)
              const preferredMax = Math.round(config.customer_target_arr * (1 + config.capacity_variance_percent / 100));
              const minMaxARR = Math.max(preferredMax, 1000000); // At least the preferred max or $1M
              
              // Auto-adjust if current max is below the minimum
              if (config.customer_max_arr < minMaxARR) {
                // Use setTimeout to avoid state update during render
                setTimeout(() => handleChange('customer_max_arr', minMaxARR), 0);
              }
              
              return (
                <>
                  <Label className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      Maximum ARR per Rep
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Hard cap that reps cannot exceed. Must be at least {formatCurrency(preferredMax)} (the preferred max from your variance band).</p>
                        </TooltipContent>
                      </Tooltip>
                    </span>
                    <span className="text-muted-foreground font-normal">
                      {formatCurrency(config.customer_max_arr)}
                    </span>
                  </Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[Math.max(config.customer_max_arr, minMaxARR)]}
                      onValueChange={([value]) => handleChange('customer_max_arr', value)}
                      min={minMaxARR}
                      max={Math.round(customerSliderMax * 2)}
                      step={100000}
                      className="flex-1"
                    />
                    <Input
                      type="text"
                      value={formatNumber(config.customer_max_arr)}
                      onChange={(e) => {
                        const value = parseInt(e.target.value.replace(/,/g, '')) || minMaxARR;
                        handleChange('customer_max_arr', Math.max(value, minMaxARR));
                      }}
                      className="w-36"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Must be ≥ {formatCurrency(preferredMax)} (preferred max from variance band)
                  </p>
                </>
              );
            })()}
          </div>
        </CardContent>
      </Card>

      {/* Prospect Pipeline Targets */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Prospect Pipeline Targets</CardTitle>
              <CardDescription>Opportunity pipeline value goals (potential revenue from prospects)</CardDescription>
            </div>
            {totalProspectNetARR > 0 && (
              <Badge variant="outline" className="text-xs">
                Total Pipeline: {formatCurrency(totalProspectNetARR)} across {prospectAccountCount} prospects
              </Badge>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              Target Pipeline per Rep
              <span className="text-muted-foreground font-normal">
                ${formatNumber(config.prospect_target_arr)}
              </span>
            </Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[config.prospect_target_arr]}
                onValueChange={([value]) => handleChange('prospect_target_arr', value)}
                min={0}
                max={prospectSliderMax}
                step={10000}
                className="flex-1"
              />
              <Input
                type="text"
                value={formatNumber(config.prospect_target_arr)}
                onChange={(e) => handleChange('prospect_target_arr', parseInt(e.target.value.replace(/,/g, '')) || 0)}
                className="w-36"
              />
            </div>
          </div>

          {/* Prospect Variance % - separate from customers */}
          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                Capacity Variance %
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p className="font-medium">How close should reps be to each other?</p>
                    <p className="mt-2">Controls how evenly pipeline is distributed across reps.</p>
                    <p className="mt-2">• <strong>Lower %</strong> = Tighter balance, reps closer together</p>
                    <p className="mt-1">• <strong>Higher %</strong> = More spread allowed between reps</p>
                  </TooltipContent>
                </Tooltip>
              </span>
              <span className="text-muted-foreground font-normal">
                {config.prospect_variance_percent}%
              </span>
            </Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[config.prospect_variance_percent]}
                onValueChange={([value]) => handleChange('prospect_variance_percent', value)}
                min={5}
                max={30}
                step={1}
                className="flex-1"
              />
              <Input
                type="number"
                value={config.prospect_variance_percent}
                onChange={(e) => handleChange('prospect_variance_percent', parseInt(e.target.value) || 10)}
                className="w-20"
                min={5}
                max={30}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Band: ${formatNumber(Math.round(config.prospect_target_arr * (1 - config.prospect_variance_percent / 100)))} – ${formatNumber(Math.round(config.prospect_target_arr * (1 + config.prospect_variance_percent / 100)))}
            </p>
          </div>

          <div className="space-y-2">
            {(() => {
              // Calculate the minimum allowed Maximum Pipeline (must be >= preferred max from variance band)
              const preferredMax = Math.round(config.prospect_target_arr * (1 + config.prospect_variance_percent / 100));
              const minMaxPipeline = Math.max(preferredMax, 0);
              
              // Auto-adjust if current max is below the minimum
              if (config.prospect_max_arr < minMaxPipeline && config.prospect_target_arr > 0) {
                setTimeout(() => handleChange('prospect_max_arr', minMaxPipeline), 0);
              }
              
              return (
                <>
                  <Label className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      Maximum Pipeline per Rep
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Hard cap that reps cannot exceed. Must be at least ${formatNumber(preferredMax)} (the preferred max from your variance band).</p>
                        </TooltipContent>
                      </Tooltip>
                    </span>
                    <span className="text-muted-foreground font-normal">
                      ${formatNumber(config.prospect_max_arr)}
                    </span>
                  </Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[Math.max(config.prospect_max_arr, minMaxPipeline)]}
                      onValueChange={([value]) => handleChange('prospect_max_arr', value)}
                      min={minMaxPipeline}
                      max={Math.round(prospectSliderMax * 2)}
                      step={10000}
                      className="flex-1"
                    />
                    <Input
                      type="text"
                      value={formatNumber(config.prospect_max_arr)}
                      onChange={(e) => {
                        const value = parseInt(e.target.value.replace(/,/g, '')) || minMaxPipeline;
                        handleChange('prospect_max_arr', Math.max(value, minMaxPipeline));
                      }}
                      className="w-36"
                    />
                  </div>
                  {config.prospect_target_arr > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Must be ≥ ${formatNumber(preferredMax)} (preferred max from variance band)
                    </p>
                  )}
                </>
              );
            })()}
          </div>
        </CardContent>
      </Card>

      {/* Balance Limits - Compact inline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            Balance Limits
          </CardTitle>
          <CardDescription>Maximum values per rep to ensure fair distribution</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Max CRE per Rep</Label>
              <Input
                type="number"
                value={config.max_cre_per_rep}
                onChange={(e) => handleChange('max_cre_per_rep', parseInt(e.target.value) || 0)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Max ATR per Rep ($)</Label>
              <Input
                type="text"
                value={formatNumber(config.atr_max)}
                onChange={(e) => handleChange('atr_max', parseInt(e.target.value.replace(/,/g, '')) || 0)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Max Tier 1 Accounts</Label>
              <Input
                type="number"
                value={config.max_tier1_per_rep}
                onChange={(e) => handleChange('max_tier1_per_rep', parseInt(e.target.value) || 0)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Max Tier 2 Accounts</Label>
              <Input
                type="number"
                value={config.max_tier2_per_rep}
                onChange={(e) => handleChange('max_tier2_per_rep', parseInt(e.target.value) || 0)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Max Renewals/Qtr (%)</Label>
              <Input
                type="number"
                value={config.renewal_concentration_max}
                onChange={(e) => handleChange('renewal_concentration_max', parseInt(e.target.value) || 0)}
                className="h-9"
                max={100}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Territory Mapping */}
      <Card className="border-0 shadow-none bg-transparent">
        <CardHeader className="px-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Territory & Geography Mapping
              </CardTitle>
              <CardDescription>Map account territories to rep regions</CardDescription>
            </div>
            {accountTerritories.length > 0 && repRegions.length > 0 && (
              <Button
                onClick={aiMapTerritories}
                variant="default"
                size="sm"
                className="gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                disabled={isAiMapping}
              >
                {isAiMapping ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    AI Mapping...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    AI Auto-Map
                  </>
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="px-0">
          {accountTerritories.length === 0 || repRegions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No territory data available</p>
              <p className="text-sm">
                {accountTerritories.length === 0 && 'No account locations found. '}
                {repRegions.length === 0 && 'No sales rep regions found. '}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm bg-muted/50 p-3 rounded-lg">
                <div className="flex gap-4">
                  <span><strong>{accountTerritories.length}</strong> territories</span>
                  <span><strong>{repRegions.length}</strong> regions</span>
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-muted-foreground">
                    {Object.keys(config.territory_mappings).filter(k => !isNotApplicable(config.territory_mappings[k])).length} mapped
                  </span>
                  {Object.values(config.territory_mappings).filter(isNotApplicable).length > 0 && (
                    <Badge variant="secondary" className="bg-gray-200 text-gray-700">
                      {Object.values(config.territory_mappings).filter(isNotApplicable).length} N/A
                    </Badge>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-[1fr,1.5fr] gap-4 pb-2 border-b font-semibold text-sm">
                <div>Territory</div>
                <div>Rep Region</div>
              </div>
              
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {accountTerritories.map((territory) => {
                  const currentMapping = config.territory_mappings[territory];
                  const isNA = currentMapping && isNotApplicable(currentMapping);
                  const aiDetail = aiMappingDetails.find(d => d.territory === territory);
                  
                  return (
                    <div 
                      key={territory} 
                      className={`grid grid-cols-[1fr,1.5fr] gap-4 items-center p-2 rounded transition-colors ${
                        isNA 
                          ? 'bg-gray-100 dark:bg-gray-800' 
                          : currentMapping 
                            ? 'bg-green-50 dark:bg-green-950/30' 
                            : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`font-medium text-sm ${isNA ? 'text-gray-500' : ''}`}>{territory}</span>
                        {aiDetail && (
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${
                              aiDetail.confidence === 'high' 
                                ? 'border-green-500 text-green-700' 
                                : aiDetail.confidence === 'medium'
                                  ? 'border-yellow-500 text-yellow-700'
                                  : 'border-red-500 text-red-700'
                            }`}
                          >
                            {aiDetail.confidence}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={currentMapping || ''}
                          onValueChange={(value) => handleTerritoryMapping(territory, value)}
                        >
                          <SelectTrigger className={`bg-background flex-1 ${isNA ? 'text-gray-500' : ''}`}>
                            <SelectValue placeholder="Select region...">
                              {currentMapping ? getRegionDisplayLabel(currentMapping) : 'Select region...'}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="bg-popover z-50">
                            <SelectItem value={NOT_APPLICABLE} className="text-gray-500 italic">
                              ⊘ Not Applicable
                            </SelectItem>
                            <div className="border-b my-1" />
                            {repRegions.map((region) => (
                              <SelectItem key={region} value={region}>
                                {region}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {currentMapping && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => clearTerritoryMapping(territory)}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {Object.keys(config.territory_mappings).length < accountTerritories.length && (
                <p className="text-xs text-amber-600">
                  ⚠️ {accountTerritories.length - Object.keys(config.territory_mappings).length} unmapped territories will skip geography matching
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      </div>

      {/* Fixed Footer Actions - always at bottom */}
      <div className="flex-shrink-0 flex justify-between items-center pt-4 mt-4 border-t bg-background">
        <div className="text-sm text-muted-foreground">
          {isDirty ? (
            <span className="text-amber-600">You have unsaved changes</span>
          ) : (
            <span>Configure settings before generating assignments</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isDirty || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Configuration
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
