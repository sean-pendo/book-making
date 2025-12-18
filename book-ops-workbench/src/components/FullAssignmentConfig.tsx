import React, { useState, useEffect, useCallback } from 'react';
import { SALES_TOOLS_ARR_THRESHOLD, BALANCE_INTENSITY_PRESETS, BalanceIntensity } from '@/_domain';
import { Save, CheckCircle, MapPin, X, Loader2, Sparkles, Calculator, HelpCircle, Settings2, ChevronRight, Scale, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { 
  mapTerritoriesWithGemini, 
  NOT_APPLICABLE, 
  NOT_APPLICABLE_LABEL,
  isNotApplicable,
  getRegionDisplayLabel 
} from '@/services/geminiRegionMappingService';
import { 
  AssignmentMode, 
  PriorityConfig, 
  getDefaultPriorityConfig,
  getPriorityById
} from '@/config/priorityRegistry';
import { detectAssignmentMode, getModeLabel } from '@/services/modeDetectionService';
import { PriorityWaterfallConfig } from './PriorityWaterfallConfig';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ModelSelector } from '@/components/optimization/ModelSelector';

interface FullAssignmentConfigProps {
  buildId: string;
  onClose?: () => void;
  onConfigurationComplete?: () => void;
}

interface ConfigState {
  // Customer ARR
  customer_target_arr: number;
  customer_min_arr: number;
  customer_max_arr: number;
  capacity_variance_percent: number;
  // Customer ATR
  customer_target_atr: number;
  customer_min_atr: number;
  customer_max_atr: number;
  atr_variance: number;
  // Prospect Pipeline
  prospect_target_arr: number;  // Using arr naming for DB compatibility
  prospect_min_arr: number;
  prospect_max_arr: number;
  prospect_variance_percent: number;
  // Shared
  territory_mappings: Record<string, string>;
  max_cre_per_rep: number;
  // Optimization model
  optimization_model: 'waterfall' | 'relaxed_optimization';
  // Balance intensity: trade-off between continuity and balance @see MASTER_LOGIC.mdc §11.3.1
  balance_intensity: BalanceIntensity;
  // Priority configuration
  assignment_mode: AssignmentMode;
  priority_config: PriorityConfig[];
  rs_arr_threshold: number;
  is_custom_priority: boolean;
}

export const FullAssignmentConfig: React.FC<FullAssignmentConfigProps> = ({ 
  buildId, 
  onClose,
  onConfigurationComplete 
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [config, setConfig] = useState<ConfigState>({
    // Customer ARR
    customer_target_arr: 2000000,
    customer_min_arr: 1800000,  // target * (1 - 10%)
    customer_max_arr: 3000000,
    capacity_variance_percent: 10,
    // Customer ATR
    customer_target_atr: 500000,
    customer_min_atr: 425000,   // target * (1 - 15%)
    customer_max_atr: 750000,
    atr_variance: 15,
    // Prospect Pipeline
    prospect_target_arr: 2000000,
    prospect_min_arr: 1700000,  // target * (1 - 15%)
    prospect_max_arr: 3000000,
    prospect_variance_percent: 15,
    // Shared
    territory_mappings: {},
    max_cre_per_rep: 3,
    optimization_model: 'waterfall',  // Default: waterfall optimization
    balance_intensity: 'NORMAL',  // Default: balanced trade-off @see MASTER_LOGIC.mdc §11.3.1
    // Priority configuration
    assignment_mode: 'ENT',
    priority_config: getDefaultPriorityConfig('ENT'),
    rs_arr_threshold: SALES_TOOLS_ARR_THRESHOLD,
    is_custom_priority: false
  });
  
  const [accountTerritories, setAccountTerritories] = useState<string[]>([]);
  const [repRegions, setRepRegions] = useState<string[]>([]);
  const [prospectAccountCount, setProspectAccountCount] = useState(0);
  const [activeRepCount, setActiveRepCount] = useState(0);
  const [totalProspectNetARR, setTotalProspectNetARR] = useState(0);
  const [totalCustomerARR, setTotalCustomerARR] = useState(0);
  const [totalCustomerATR, setTotalCustomerATR] = useState(0);
  
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
  const [showPriorityConfig, setShowPriorityConfig] = useState(false);

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
          // Determine saved mode or detect from data
          const savedMode = (data.assignment_mode as AssignmentMode) || 'ENT';
          const savedPriorityConfig = (data.priority_config as PriorityConfig[]) || [];
          
          // Calculate default mins from target and variance
          // Note: DB uses atr_target/atr_min/atr_max, frontend uses customer_target_atr etc.
          const arrVariance = data.capacity_variance_percent || 10;
          const atrVariance = data.atr_variance || 15;
          const pipelineVariance = data.prospect_variance_percent || 15;
          const targetArr = data.customer_target_arr || 2000000;
          const targetAtr = data.atr_target || 500000;  // DB column is atr_target
          const targetPipeline = data.prospect_target_arr || 2000000;
          
          setConfig({
            // Customer ARR
            customer_target_arr: targetArr,
            customer_min_arr: data.customer_min_arr || Math.round(targetArr * (1 - arrVariance / 100)),
            customer_max_arr: data.customer_max_arr || 3000000,
            capacity_variance_percent: arrVariance,
            // Customer ATR - map from DB columns (atr_target, atr_min, atr_max)
            customer_target_atr: targetAtr,
            customer_min_atr: data.atr_min || Math.round(targetAtr * (1 - atrVariance / 100)),
            customer_max_atr: data.atr_max || 750000,
            atr_variance: atrVariance,
            // Prospect Pipeline
            prospect_target_arr: targetPipeline,
            prospect_min_arr: data.prospect_min_arr || Math.round(targetPipeline * (1 - pipelineVariance / 100)),
            prospect_max_arr: data.prospect_max_arr || 3000000,
            prospect_variance_percent: pipelineVariance,
            // Shared
            territory_mappings: (data.territory_mappings as Record<string, string>) || {},
            max_cre_per_rep: data.max_cre_per_rep || 3,
            optimization_model: ((data as any).optimization_model as 'waterfall' | 'relaxed_optimization') || 'waterfall',
            balance_intensity: ((data as any).balance_intensity as BalanceIntensity) || 'NORMAL',
            // Priority configuration
            assignment_mode: savedMode,
            priority_config: savedPriorityConfig.length > 0 
              ? savedPriorityConfig 
              : getDefaultPriorityConfig(savedMode === 'CUSTOM' ? 'ENT' : savedMode),
            rs_arr_threshold: data.rs_arr_threshold || SALES_TOOLS_ARR_THRESHOLD,
            is_custom_priority: data.is_custom_priority || false
          });
          setLastCalculatedAt(data.last_calculated_at);
        } else {
          // No saved config - auto-detect mode
          try {
            const detected = await detectAssignmentMode(buildId);
            setConfig(prev => ({
              ...prev,
              assignment_mode: detected.suggestedMode,
              priority_config: getDefaultPriorityConfig(detected.suggestedMode)
            }));
          } catch (e) {
            console.log('[Config] Mode detection failed, using ENT default');
          }
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
        
        // Calculate total ATR from renewal opportunities linked to customer parent accounts
        // Per MASTER_LOGIC.mdc §2.2: ATR = SUM(available_to_renew) WHERE opportunity_type = 'Renewals'
        // Note: ATR must be ≤ ARR (ATR is a subset of existing revenue)
        // First try accounts.calculated_atr, fall back to opportunities if empty
        const { data: accountAtrData } = await supabase
          .from('accounts')
          .select('calculated_atr')
          .eq('build_id', buildId)
          .eq('is_customer', true)
          .eq('is_parent', true)
          .gt('calculated_atr', 0);
        
        const accountATR = (accountAtrData || []).reduce((sum, acc) => sum + (acc.calculated_atr || 0), 0);
        
        if (accountATR > 0) {
          console.log('[Config] Total ATR from accounts.calculated_atr:', accountATR);
          setTotalCustomerATR(accountATR);
        } else {
          // Fallback: sum from opportunities (joined to customer parent accounts)
          const { data: oppAtrData, error: atrError } = await supabase
            .from('opportunities')
            .select('available_to_renew, sfdc_account_id')
            .eq('build_id', buildId)
            .ilike('opportunity_type', 'renewals')
            .gt('available_to_renew', 0);
          
          if (atrError) {
            console.error('[Config] ATR query error:', atrError);
            setTotalCustomerATR(0);
          } else {
            // Get customer parent account IDs to filter
            const { data: customerAccounts } = await supabase
              .from('accounts')
              .select('sfdc_account_id')
              .eq('build_id', buildId)
              .eq('is_customer', true)
              .eq('is_parent', true);
            
            const customerAccountIds = new Set((customerAccounts || []).map(a => a.sfdc_account_id));
            const totalATR = (oppAtrData || [])
              .filter(opp => customerAccountIds.has(opp.sfdc_account_id))
              .reduce((sum, opp) => sum + (opp.available_to_renew || 0), 0);
            console.log('[Config] Total ATR from opportunities:', totalATR);
            setTotalCustomerATR(totalATR);
          }
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
        // Get account data for balance limits calculation (including ARR for max account check)
        // Include sfdc_account_id to filter opportunities to customer accounts
        supabase
          .from('accounts')
          .select('sfdc_account_id, cre_count, calculated_atr, expansion_tier, renewal_quarter, arr')
          .eq('build_id', buildId)
          .eq('is_parent', true)
          .eq('is_customer', true)
          .limit(50000),
        // Get ATR from renewal opportunities (need sfdc_account_id to filter to customer accounts)
        supabase
          .from('opportunities')
          .select('available_to_renew, opportunity_type, sfdc_account_id')
          .eq('build_id', buildId)
          .ilike('opportunity_type', 'renewals')
          .gt('available_to_renew', 0)
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
      let maxAccountARR = 0; // Track largest individual customer account ARR
      let maxAccountATR = 0; // Track largest individual account ATR
      let maxCREPerAccount = 0; // Track max CRE count on any single account
      
      accounts.forEach(account => {
        const cre = account.cre_count || 0;
        totalCRE += cre;
        if (cre > maxCREPerAccount) maxCREPerAccount = cre;
        
        const atr = account.calculated_atr || 0;
        accountATR += atr;
        if (atr > maxAccountATR) maxAccountATR = atr;
        
        const accountArr = Number(account.arr) || 0;
        if (accountArr > maxAccountARR) maxAccountARR = accountArr;
        
        const tier = account.expansion_tier?.toLowerCase();
        if (tier === 'tier 1' || tier === 'tier1') totalTier1++;
        if (tier === 'tier 2' || tier === 'tier2') totalTier2++;
      });
      
      // Calculate total ATR: filter opportunities to customer parent accounts only
      // Per MASTER_LOGIC.mdc §2.2: ATR ≤ ARR (ATR is subset of customer revenue)
      const customerAccountIds = new Set(accounts.map(a => a.sfdc_account_id));
      let maxOppATR = 0;
      const oppsATR = renewalOpps
        .filter(opp => customerAccountIds.has(opp.sfdc_account_id))
        .reduce((sum, opp) => {
          const atr = opp.available_to_renew || 0;
          if (atr > maxOppATR) maxOppATR = atr;
          return sum + atr;
        }, 0);
      const totalATR = oppsATR > 0 ? oppsATR : accountATR;
      const maxATR = Math.max(maxAccountATR, maxOppATR);
      
      console.log('[CalculateTargets] Customer ARR:', totalCustomerARR, 'Prospect Pipeline:', totalProspectPipeline, 'Reps:', normalRepCount);
      console.log('[CalculateTargets] CRE:', totalCRE, 'ATR (from opps):', totalATR, 'Tier1:', totalTier1, 'Tier2:', totalTier2);
      console.log('[CalculateTargets] Max individual - ARR:', maxAccountARR, 'ATR:', maxATR, 'CRE:', maxCREPerAccount);
      
      // Calculate recommended ARR targets
      // Target = pure average (continuity will handle large accounts staying with current owner)
      const recommendedCustomerTarget = normalRepCount > 0 && totalCustomerARR > 0 
        ? Math.round(totalCustomerARR / normalRepCount) 
        : 2000000;
      // Max must be large enough to fit the biggest account
      // Use 150% of target OR largest account + 20% buffer, whichever is bigger
      const recommendedCustomerMax = Math.max(
        Math.round(recommendedCustomerTarget * 1.5),
        Math.round(maxAccountARR * 1.2)
      );
      
      // Prospect target = pure average
      const recommendedProspectTarget = normalRepCount > 0 && totalProspectPipeline > 0
        ? Math.round(totalProspectPipeline / normalRepCount)
        : 2000000;
      // Prospect max - for now use 150% of target (we don't have max prospect pipeline per account in this query)
      const recommendedProspectMax = Math.round(recommendedProspectTarget * 1.5);
      
      // Calculate balance limits
      // Target = pure average, Max = average * 1.2 OR largest individual value * 1.2 (whichever is bigger)
      const variance = 1.2;
      
      // ATR: average * 1.2 OR largest account ATR * 1.2
      const avgAtr = normalRepCount > 0 ? totalATR / normalRepCount : 150000;
      const maxAtr = Math.max(
        Math.ceil(avgAtr * variance),
        Math.ceil(maxATR * variance)
      );
      
      // CRE: average * 1.2 OR largest account CRE count * 1.2
      const avgCre = normalRepCount > 0 ? totalCRE / normalRepCount : 3;
      const maxCre = Math.max(
        Math.ceil(avgCre * variance),
        Math.ceil(maxCREPerAccount * variance)
      );
      
      // Tier counts - these are account counts, so average * 1.2 is fine
      const maxTier1 = normalRepCount > 0 ? Math.ceil((totalTier1 / normalRepCount) * variance) : 5;
      const maxTier2 = normalRepCount > 0 ? Math.ceil((totalTier2 / normalRepCount) * variance) : 8;
      
      // Update config with all calculated values
      const recommendedAtrTarget = normalRepCount > 0 && totalATR > 0
        ? Math.round(totalATR / normalRepCount)
        : 500000;
      
      setConfig(prev => ({
        ...prev,
        customer_target_arr: recommendedCustomerTarget,
        customer_max_arr: recommendedCustomerMax,
        customer_target_atr: recommendedAtrTarget,
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
      
      // Store totals for slider scaling
      setTotalCustomerATR(totalATR);
      
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

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };
  const formatNumber = (value: number) => value.toLocaleString();
  
  // Dynamic slider ranges based on actual totals
  const avgCustomerARR = totalCustomerARR / Math.max(activeRepCount, 1);
  const avgProspectARR = totalProspectNetARR / Math.max(activeRepCount, 1);
  
  // Customer slider: scale from 10% of average to 300% of average (or reasonable defaults)
  const customerSliderMin = Math.max(1000, Math.floor(avgCustomerARR * 0.1 / 1000) * 1000);
  const customerSliderMax = Math.max(100000, Math.ceil(avgCustomerARR * 3 / 1000) * 1000);
  const customerSliderStep = Math.max(1000, Math.round((customerSliderMax - customerSliderMin) / 100 / 1000) * 1000);
  
  // Prospect slider: similar scaling
  const prospectSliderMin = Math.max(1000, Math.floor(avgProspectARR * 0.1 / 1000) * 1000);
  const prospectSliderMax = Math.max(50000, Math.ceil(avgProspectARR * 3 / 1000) * 1000);
  const prospectSliderStep = Math.max(1000, Math.round((prospectSliderMax - prospectSliderMin) / 100 / 1000) * 1000);
  
  // ATR slider: scale based on totalCustomerATR
  const avgCustomerATR = totalCustomerATR / Math.max(activeRepCount, 1);
  const atrSliderMin = Math.max(1000, Math.floor(avgCustomerATR * 0.1 / 1000) * 1000);
  const atrSliderMax = Math.max(100000, Math.ceil(avgCustomerATR * 3 / 1000) * 1000);
  const atrSliderStep = Math.max(1000, Math.round((atrSliderMax - atrSliderMin) / 100 / 1000) * 1000);

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

  // Priority configuration handlers
  const handleModeChange = useCallback((mode: AssignmentMode) => {
    setConfig(prev => ({
      ...prev,
      assignment_mode: mode,
      is_custom_priority: mode === 'CUSTOM'
    }));
    setIsDirty(true);
    setShowSuccess(false);
  }, []);

  const handlePriorityConfigChange = useCallback((newConfig: PriorityConfig[]) => {
    setConfig(prev => ({
      ...prev,
      priority_config: newConfig,
      is_custom_priority: true
    }));
    setIsDirty(true);
    setShowSuccess(false);
  }, []);

  // Get priority display info
  const enabledPriorityCount = config.priority_config.filter(p => p.enabled).length;
  const priorityNames = config.priority_config
    .filter(p => p.enabled)
    .slice(0, 3)
    .map(p => getPriorityById(p.id)?.name || p.id)
    .join(', ');

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
      
      // Map frontend field names to database column names
      const configData = {
        build_id: buildId,
        account_scope: 'all',
        // Customer ARR - these match DB columns
        customer_target_arr: config.customer_target_arr,
        customer_min_arr: config.customer_min_arr,
        customer_max_arr: config.customer_max_arr,
        capacity_variance_percent: config.capacity_variance_percent,
        // Customer ATR - map to DB columns (atr_target, atr_min, atr_max)
        atr_target: config.customer_target_atr,
        atr_min: config.customer_min_atr,
        atr_max: config.customer_max_atr,
        atr_variance: config.atr_variance,
        // Prospect Pipeline - these match DB columns
        prospect_target_arr: config.prospect_target_arr,
        prospect_min_arr: config.prospect_min_arr,
        prospect_max_arr: config.prospect_max_arr,
        prospect_variance_percent: config.prospect_variance_percent,
        // Shared
        territory_mappings: config.territory_mappings,
        max_cre_per_rep: config.max_cre_per_rep,
        optimization_model: config.optimization_model,
        balance_intensity: config.balance_intensity,
        // Priority configuration
        assignment_mode: config.assignment_mode,
        priority_config: config.priority_config,
        rs_arr_threshold: config.rs_arr_threshold,
        is_custom_priority: config.is_custom_priority,
        // Metadata
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
        
        // Invalidate assignment config queries so other components (like WaterfallLogicExplainer) update
        queryClient.invalidateQueries({ queryKey: ['assignment-config-full', buildId] });
        
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
      {/* Optimization Model Selector */}
      <ModelSelector
        value={config.optimization_model}
        onChange={(value) => {
          setConfig(prev => ({ ...prev, optimization_model: value }));
          setIsDirty(true);
          setShowSuccess(false);
        }}
        disabled={isSaving}
      />
      
      {/* Balance Intensity Slider */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Scale className="h-4 w-4" />
                Balance Intensity
              </CardTitle>
              <CardDescription>
                How aggressively balance is enforced vs. other assignment factors
              </CardDescription>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs p-3">
                <p className="font-medium mb-2">What this controls:</p>
                <p className="text-xs text-muted-foreground mb-2">
                  Scales the penalty for imbalanced ARR/ATR/Pipeline. Higher values prioritize even distribution over continuity, geography, and strategic pools.
                </p>
                {config.optimization_model === 'waterfall' && (
                  <p className="text-xs text-amber-500 mt-2">
                    Note: In waterfall mode, this only affects ARR balance.
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current selection display */}
          <div className="text-center">
            <span className="text-lg font-semibold">
              {BALANCE_INTENSITY_PRESETS[config.balance_intensity].label}
            </span>
            <span className="text-sm text-muted-foreground ml-2">
              ({BALANCE_INTENSITY_PRESETS[config.balance_intensity].multiplier}x)
            </span>
            <p className="text-sm text-muted-foreground mt-1">
              {BALANCE_INTENSITY_PRESETS[config.balance_intensity].description}
            </p>
          </div>
          
          {/* 5-point slider */}
          <div className="px-2">
            <Slider
              value={[(['VERY_LIGHT', 'LIGHT', 'NORMAL', 'HEAVY', 'VERY_HEAVY'] as const).indexOf(config.balance_intensity)]}
              onValueChange={([value]) => {
                const intensities: BalanceIntensity[] = ['VERY_LIGHT', 'LIGHT', 'NORMAL', 'HEAVY', 'VERY_HEAVY'];
                setConfig(prev => ({ ...prev, balance_intensity: intensities[value] }));
                setIsDirty(true);
                setShowSuccess(false);
              }}
              min={0}
              max={4}
              step={1}
              disabled={isSaving}
              className="w-full"
            />
            
            {/* Labels under slider */}
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>Preserve Fit</span>
              <span>Balanced</span>
              <span>Force Even</span>
            </div>
          </div>
        </CardContent>
      </Card>
      
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
                value={[Math.max(customerSliderMin, Math.min(customerSliderMax, config.customer_target_arr))]}
                onValueChange={([value]) => handleChange('customer_target_arr', value)}
                min={customerSliderMin}
                max={customerSliderMax}
                step={customerSliderStep}
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

          {/* Min/Max ARR controls */}
          <div className="grid grid-cols-2 gap-4">
            {/* Minimum ARR */}
            <div className="space-y-2">
              {(() => {
                const preferredMin = Math.round(config.customer_target_arr * (1 - config.capacity_variance_percent / 100));
                const maxMinARR = preferredMin; // Can't be higher than preferred min
                
                if (config.customer_min_arr > maxMinARR) {
                  setTimeout(() => handleChange('customer_min_arr', maxMinARR), 0);
                }
                
                return (
                  <>
                    <Label className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1">
                        Minimum ARR
                        <Tooltip>
                          <TooltipTrigger>
                            <HelpCircle className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Hard floor for rep ARR. Must be ≤ {formatCurrency(preferredMin)} (preferred min from variance).</p>
                          </TooltipContent>
                        </Tooltip>
                      </span>
                      <span className="text-muted-foreground font-normal text-xs">
                        {formatCurrency(config.customer_min_arr)}
                      </span>
                    </Label>
                    <Input
                      type="text"
                      value={formatNumber(config.customer_min_arr)}
                      onChange={(e) => {
                        const value = parseInt(e.target.value.replace(/,/g, '')) || 0;
                        handleChange('customer_min_arr', Math.min(value, maxMinARR));
                      }}
                      className="h-9"
                    />
                  </>
                );
              })()}
            </div>

            {/* Maximum ARR */}
            <div className="space-y-2">
              {(() => {
                const preferredMax = Math.round(config.customer_target_arr * (1 + config.capacity_variance_percent / 100));
                const minMaxARR = preferredMax; // Can't be lower than preferred max
                
                if (config.customer_max_arr < minMaxARR) {
                  setTimeout(() => handleChange('customer_max_arr', minMaxARR), 0);
                }
                
                return (
                  <>
                    <Label className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1">
                        Maximum ARR
                        <Tooltip>
                          <TooltipTrigger>
                            <HelpCircle className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Hard cap for rep ARR. Must be ≥ {formatCurrency(preferredMax)} (preferred max from variance).</p>
                          </TooltipContent>
                        </Tooltip>
                      </span>
                      <span className="text-muted-foreground font-normal text-xs">
                        {formatCurrency(config.customer_max_arr)}
                      </span>
                    </Label>
                    <Input
                      type="text"
                      value={formatNumber(config.customer_max_arr)}
                      onChange={(e) => {
                        const value = parseInt(e.target.value.replace(/,/g, '')) || minMaxARR;
                        handleChange('customer_max_arr', Math.max(value, minMaxARR));
                      }}
                      className="h-9"
                    />
                  </>
                );
              })()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customer ATR Targets */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Customer ATR Targets</CardTitle>
              <CardDescription>Available to Renew (ATR) goals - revenue coming up for renewal</CardDescription>
            </div>
            {totalCustomerATR > 0 && activeRepCount > 0 && (
              <Badge variant="outline" className="text-xs">
                Total: {formatCurrency(totalCustomerATR)} across {activeRepCount} reps
              </Badge>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              Target ATR per Rep
              <span className="text-muted-foreground font-normal">
                {formatCurrency(config.customer_target_atr)}
              </span>
            </Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[Math.max(atrSliderMin, Math.min(atrSliderMax, config.customer_target_atr))]}
                onValueChange={([value]) => handleChange('customer_target_atr', value)}
                min={atrSliderMin}
                max={atrSliderMax}
                step={atrSliderStep}
                className="flex-1"
              />
              <Input
                type="text"
                value={formatNumber(config.customer_target_atr)}
                onChange={(e) => handleChange('customer_target_atr', parseInt(e.target.value.replace(/,/g, '')) || 0)}
                className="w-36"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                ATR Variance %
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p className="font-medium">How evenly should ATR be distributed?</p>
                    <p className="mt-2">Controls how closely reps should be to the target ATR.</p>
                    <p className="mt-2">• <strong>Lower %</strong> = Tighter ATR balance across reps</p>
                    <p className="mt-1">• <strong>Higher %</strong> = More variance allowed in ATR distribution</p>
                  </TooltipContent>
                </Tooltip>
              </span>
              <span className="text-muted-foreground font-normal">
                {config.atr_variance}%
              </span>
            </Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[config.atr_variance]}
                onValueChange={([value]) => handleChange('atr_variance', value)}
                min={5}
                max={30}
                step={1}
                className="flex-1"
              />
              <Input
                type="number"
                value={config.atr_variance}
                onChange={(e) => handleChange('atr_variance', parseInt(e.target.value) || 15)}
                className="w-20"
                min={5}
                max={30}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Band: {formatCurrency(config.customer_target_atr * (1 - config.atr_variance / 100))} – {formatCurrency(config.customer_target_atr * (1 + config.atr_variance / 100))}
            </p>
          </div>

          {/* Min/Max ATR controls */}
          <div className="grid grid-cols-2 gap-4">
            {/* Minimum ATR */}
            <div className="space-y-2">
              {(() => {
                const preferredMin = Math.round(config.customer_target_atr * (1 - config.atr_variance / 100));
                const maxMinATR = preferredMin;
                
                if (config.customer_min_atr > maxMinATR) {
                  setTimeout(() => handleChange('customer_min_atr', maxMinATR), 0);
                }
                
                return (
                  <>
                    <Label className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1">
                        Minimum ATR
                        <Tooltip>
                          <TooltipTrigger>
                            <HelpCircle className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Hard floor for rep ATR. Must be ≤ {formatCurrency(preferredMin)}.</p>
                          </TooltipContent>
                        </Tooltip>
                      </span>
                      <span className="text-muted-foreground font-normal text-xs">
                        {formatCurrency(config.customer_min_atr)}
                      </span>
                    </Label>
                    <Input
                      type="text"
                      value={formatNumber(config.customer_min_atr)}
                      onChange={(e) => {
                        const value = parseInt(e.target.value.replace(/,/g, '')) || 0;
                        handleChange('customer_min_atr', Math.min(value, maxMinATR));
                      }}
                      className="h-9"
                    />
                  </>
                );
              })()}
            </div>

            {/* Maximum ATR */}
            <div className="space-y-2">
              {(() => {
                const preferredMax = Math.round(config.customer_target_atr * (1 + config.atr_variance / 100));
                const minMaxATR = preferredMax;
                
                if (config.customer_max_atr < minMaxATR) {
                  setTimeout(() => handleChange('customer_max_atr', minMaxATR), 0);
                }
                
                return (
                  <>
                    <Label className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1">
                        Maximum ATR
                        <Tooltip>
                          <TooltipTrigger>
                            <HelpCircle className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Hard cap for rep ATR. Must be ≥ {formatCurrency(preferredMax)}.</p>
                          </TooltipContent>
                        </Tooltip>
                      </span>
                      <span className="text-muted-foreground font-normal text-xs">
                        {formatCurrency(config.customer_max_atr)}
                      </span>
                    </Label>
                    <Input
                      type="text"
                      value={formatNumber(config.customer_max_atr)}
                      onChange={(e) => {
                        const value = parseInt(e.target.value.replace(/,/g, '')) || minMaxATR;
                        handleChange('customer_max_atr', Math.max(value, minMaxATR));
                      }}
                      className="h-9"
                    />
                  </>
                );
              })()}
            </div>
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
            {totalProspectNetARR > 0 && activeRepCount > 0 && (
              <Badge variant="outline" className="text-xs">
                Total: {formatCurrency(totalProspectNetARR)} across {activeRepCount} reps
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
                value={[Math.max(prospectSliderMin, Math.min(prospectSliderMax, config.prospect_target_arr))]}
                onValueChange={([value]) => handleChange('prospect_target_arr', value)}
                min={prospectSliderMin}
                max={prospectSliderMax}
                step={prospectSliderStep}
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

          {/* Min/Max Pipeline controls */}
          <div className="grid grid-cols-2 gap-4">
            {/* Minimum Pipeline */}
            <div className="space-y-2">
              {(() => {
                const preferredMin = Math.round(config.prospect_target_arr * (1 - config.prospect_variance_percent / 100));
                const maxMinPipeline = preferredMin;
                
                if (config.prospect_min_arr > maxMinPipeline && config.prospect_target_arr > 0) {
                  setTimeout(() => handleChange('prospect_min_arr', maxMinPipeline), 0);
                }
                
                return (
                  <>
                    <Label className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1">
                        Minimum Pipeline
                        <Tooltip>
                          <TooltipTrigger>
                            <HelpCircle className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Hard floor for rep pipeline. Must be ≤ ${formatNumber(preferredMin)}.</p>
                          </TooltipContent>
                        </Tooltip>
                      </span>
                      <span className="text-muted-foreground font-normal text-xs">
                        ${formatNumber(config.prospect_min_arr)}
                      </span>
                    </Label>
                    <Input
                      type="text"
                      value={formatNumber(config.prospect_min_arr)}
                      onChange={(e) => {
                        const value = parseInt(e.target.value.replace(/,/g, '')) || 0;
                        handleChange('prospect_min_arr', Math.min(value, maxMinPipeline));
                      }}
                      className="h-9"
                    />
                  </>
                );
              })()}
            </div>

            {/* Maximum Pipeline */}
            <div className="space-y-2">
              {(() => {
                const preferredMax = Math.round(config.prospect_target_arr * (1 + config.prospect_variance_percent / 100));
                const minMaxPipeline = preferredMax;
                
                if (config.prospect_max_arr < minMaxPipeline && config.prospect_target_arr > 0) {
                  setTimeout(() => handleChange('prospect_max_arr', minMaxPipeline), 0);
                }
                
                return (
                  <>
                    <Label className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1">
                        Maximum Pipeline
                        <Tooltip>
                          <TooltipTrigger>
                            <HelpCircle className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Hard cap for rep pipeline. Must be ≥ ${formatNumber(preferredMax)}.</p>
                          </TooltipContent>
                        </Tooltip>
                      </span>
                      <span className="text-muted-foreground font-normal text-xs">
                        ${formatNumber(config.prospect_max_arr)}
                      </span>
                    </Label>
                    <Input
                      type="text"
                      value={formatNumber(config.prospect_max_arr)}
                      onChange={(e) => {
                        const value = parseInt(e.target.value.replace(/,/g, '')) || minMaxPipeline;
                        handleChange('prospect_max_arr', Math.max(value, minMaxPipeline));
                      }}
                      className="h-9"
                    />
                  </>
                );
              })()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Balance Limits removed - now handled by ARR/ATR/Pipeline min/max constraints in HIGHS optimization */}
      {/* Geographic Preference removed - handled internally by priority rules */}

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

      {/* Priority Configuration */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                Priority Configuration
              </CardTitle>
              <CardDescription>
                Assignment mode: <strong>{getModeLabel(config.assignment_mode)}</strong> • {enabledPriorityCount} priorities active
              </CardDescription>
            </div>
            <Badge variant={config.is_custom_priority ? 'default' : 'secondary'} className="text-xs">
              {config.is_custom_priority ? 'Customized' : 'Preset'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                {priorityNames}{enabledPriorityCount > 3 ? `, +${enabledPriorityCount - 3} more` : ''}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Configure the order and selection of assignment priorities used during generation.
              </p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowPriorityConfig(true)}
                  className="gap-2"
                >
                  Configure Priorities
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Reorder priorities or toggle them on/off</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </CardContent>
      </Card>

      </div>

      {/* Priority Configuration Dialog */}
      <Dialog open={showPriorityConfig} onOpenChange={setShowPriorityConfig}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" hideCloseButton>
          <PriorityWaterfallConfig
            buildId={buildId}
            currentMode={config.assignment_mode}
            currentConfig={config.priority_config}
            onModeChange={handleModeChange}
            onConfigChange={handlePriorityConfigChange}
            onClose={() => setShowPriorityConfig(false)}
          />
        </DialogContent>
      </Dialog>

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
