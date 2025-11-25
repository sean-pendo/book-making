import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Settings, Save, AlertCircle, Info, CheckCircle, MapPin, X, Loader2, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { BalanceThresholdConfig } from '@/components/BalanceThresholdConfig';
import { 
  mapTerritoriesWithGemini, 
  NOT_APPLICABLE, 
  NOT_APPLICABLE_LABEL,
  isNotApplicable,
  getRegionDisplayLabel 
} from '@/services/geminiRegionMappingService';

interface ConfigState {
  customer_target_arr: number;
  customer_max_arr: number;
  prospect_target_arr: number;
  prospect_max_arr: number;
  capacity_variance_percent: number;
  max_cre_per_rep: number;
  max_tier1_per_rep: number;
  max_tier2_per_rep: number;
  territory_mappings: Record<string, string>;
}

export const SimplifiedAssignmentConfig: React.FC = () => {
  const { id: buildId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [config, setConfig] = useState<ConfigState>({
    customer_target_arr: 2000000,
    customer_max_arr: 3000000,
    prospect_target_arr: 2000000,
    prospect_max_arr: 3000000,
    capacity_variance_percent: 10,
    max_cre_per_rep: 3,
    max_tier1_per_rep: 5,
    max_tier2_per_rep: 8,
    territory_mappings: {}
  });
  
  const [accountTerritories, setAccountTerritories] = useState<string[]>([]);
  const [repRegions, setRepRegions] = useState<string[]>([]);
  const [prospectAccountCount, setProspectAccountCount] = useState(0);
  const [activeRepCount, setActiveRepCount] = useState(0);
  const [totalProspectNetARR, setTotalProspectNetARR] = useState(0);
  
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isAiMapping, setIsAiMapping] = useState(false);
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
            max_cre_per_rep: data.max_cre_per_rep || 3,
            max_tier1_per_rep: data.max_tier1_per_rep || 5,
            max_tier2_per_rep: data.max_tier2_per_rep || 8,
            territory_mappings: (data.territory_mappings as Record<string, string>) || {}
          });
        }
        
        // Load unique account locations/territories (from sales_territory field)
        const { data: accounts, error: accountsError } = await supabase
          .from('accounts')
          .select('sales_territory, is_customer, is_parent, sfdc_account_id')
          .eq('build_id', buildId);
        
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
        
        console.log('Loaded account territories:', uniqueTerritories);
        setAccountTerritories(uniqueTerritories);
        
        // Count prospect accounts using database aggregate (more accurate)
        const { count: prospectCount, error: prospectCountError } = await supabase
          .from('accounts')
          .select('*', { count: 'exact', head: true })
          .eq('build_id', buildId)
          .eq('is_customer', false)
          .eq('is_parent', true);
        
        if (prospectCountError) {
          console.error('Error counting prospects:', prospectCountError);
        } else {
          console.log('Prospect account count:', prospectCount);
          setProspectAccountCount(prospectCount || 0);
        }
        
        // Calculate total Net ARR for prospects
        const prospectAccountIds = new Set(
          accounts?.filter(a => !a.is_customer && a.is_parent).map(a => a.sfdc_account_id) || []
        );
        
        const { data: opportunities, error: oppsError } = await supabase
          .from('opportunities')
          .select('net_arr, sfdc_account_id')
          .eq('build_id', buildId)
          .gt('net_arr', 0);
        
        if (oppsError) {
          console.error('Error loading opportunities:', oppsError);
        } else {
          const totalNetARR = opportunities
            ?.filter(o => prospectAccountIds.has(o.sfdc_account_id))
            .reduce((sum, o) => sum + (o.net_arr || 0), 0) || 0;
          console.log('Total prospect Net ARR:', totalNetARR);
          setTotalProspectNetARR(totalNetARR);
        }
        
        // Load unique rep regions (with proper filtering)
        const { data: reps, error: repsError } = await supabase
          .from('sales_reps')
          .select('region, is_active, include_in_assignments')
          .eq('build_id', buildId);
        
        if (repsError) {
          console.error('Error loading reps:', repsError);
        }
        
        const uniqueRegions = Array.from(
          new Set(
            reps
              ?.map(r => r.region)
              .filter(r => r && r.trim() !== '') || []
          )
        ).sort();
        
        console.log('Loaded rep regions:', uniqueRegions);
        setRepRegions(uniqueRegions);
        
        // Count active reps
        const activeReps = reps?.filter(r => r.is_active && r.include_in_assignments).length || 0;
        setActiveRepCount(activeReps);
      } catch (err) {
        console.error('Error in loadConfig:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadConfig();
  }, [buildId]);

  const formatCurrency = (value: number) => `$${(value / 1000000).toFixed(1)}M`;
  
  const calculateCapacityLimit = (target: number, variance: number) => {
    return target * (1 + variance / 100);
  };

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
      // Call via secure edge function (API key stored server-side)
      const result = await mapTerritoriesWithGemini(
        accountTerritories,
        repRegions
      );
      
      // Apply the AI mappings to our config
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

  // Legacy rules-based auto-mapping (fallback option)
  const autoMapTerritories = () => {
    const autoMappings: Record<string, string> = {};
    
    // Use sophisticated auto-mapping logic
    accountTerritories.forEach(territory => {
      const territoryUpper = territory.toUpperCase().trim();
      
      // North East territories
      const northEastTerritories = ['BOSTON', 'NEW ENGLAND', 'NY E', 'NY S'];
      if (northEastTerritories.some(t => territoryUpper.includes(t))) {
        const match = repRegions.find(r => r.toLowerCase().includes('north east') || r.toLowerCase() === 'northeast');
        if (match) {
          autoMappings[territory] = match;
          return;
        }
      }
      
      // South East territories
      const southEastTerritories = ['CHESAPEAKE', 'MID-ATLANTIC', 'SOUTH EAST', 'SOUTHEAST', 'GULF COAST', 'AUSTIN – HOUSTON', 'AUSTIN - HOUSTON'];
      if (southEastTerritories.some(t => territoryUpper.includes(t))) {
        const match = repRegions.find(r => r.toLowerCase().includes('south east') || r.toLowerCase() === 'southeast');
        if (match) {
          autoMappings[territory] = match;
          return;
        }
      }
      
      // Central territories
      const centralTerritories = [
        'CHICAGO', 'GREAT LAKES N-CA', 'GREAT LAKES N-US', 'GREAT LAKES S', 
        'GREATER ONTARIO-CA', 'MID-WEST', 'MIDWEST', 'MOUNTAIN', 'SOUTHWEST'
      ];
      if (centralTerritories.some(t => territoryUpper.includes(t))) {
        const match = repRegions.find(r => r.toLowerCase().includes('central'));
        if (match) {
          autoMappings[territory] = match;
          return;
        }
      }
      
      // West territories
      const westTerritories = [
        'LOS ANGELES', 'NOR CAL', 'PAC NW-CA', 'PAC NW-US', 
        'SAN FRANCISCO', 'SO CAL'
      ];
      if (westTerritories.some(t => territoryUpper.includes(t))) {
        const match = repRegions.find(r => r.toLowerCase().includes('west'));
        if (match) {
          autoMappings[territory] = match;
          return;
        }
      }
      
      // Other (International) territories - mark as NOT_APPLICABLE
      const internationalTerritories = [
        'AUSTRALIA', 'BENELUX', 'CHINA', 'DACH', 'FRANCE', 'ISRAEL', 'JAPAN', 
        'LATAM', 'MIDDLE EAST', 'NEW ZEALAND', 'NZ', 'NORDICS', 'RO-APAC', 
        'RO-EMEA', 'SINGAPORE', 'UKI'
      ];
      if (internationalTerritories.some(t => territoryUpper.includes(t))) {
        // First check if there's an "Other" or "International" region
        const match = repRegions.find(r => r.toLowerCase() === 'other' || r.toLowerCase() === 'international');
        if (match) {
          autoMappings[territory] = match;
        } else {
          // No matching region - mark as Not Applicable
          autoMappings[territory] = NOT_APPLICABLE;
        }
        return;
      }
      
      // Find exact match
      const exactMatch = repRegions.find(r => r.toLowerCase() === territory.toLowerCase());
      if (exactMatch) {
        autoMappings[territory] = exactMatch;
        return;
      }
    });
    
    setConfig(prev => ({
      ...prev,
      territory_mappings: { ...prev.territory_mappings, ...autoMappings }
    }));
    setIsDirty(true);
    
    const notApplicableCount = Object.values(autoMappings).filter(v => v === NOT_APPLICABLE).length;
    const mappedCount = Object.keys(autoMappings).length - notApplicableCount;
    
    toast({
      title: "Rules-based mapping complete",
      description: `Mapped ${mappedCount} territories. ${notApplicableCount} marked as Not Applicable.`
    });
  };

  const handleSave = async () => {
    if (!buildId) return;
    
    setIsSaving(true);
    
    try {
      // First, check if a configuration already exists for this build
      const { data: existing } = await supabase
        .from('assignment_configuration')
        .select('id')
        .eq('build_id', buildId)
        .eq('account_scope', 'all')
        .maybeSingle();
      
      console.log('Existing config:', existing);
      
      const configData = {
        build_id: buildId,
        account_scope: 'all',
        ...config,
        updated_at: new Date().toISOString()
      };
      
      let error;
      
      if (existing) {
        // Update existing record
        console.log('Updating existing config with ID:', existing.id);
        const result = await supabase
          .from('assignment_configuration')
          .update(configData)
          .eq('id', existing.id);
        error = result.error;
      } else {
        // Insert new record
        console.log('Inserting new config');
        const result = await supabase
          .from('assignment_configuration')
          .insert(configData);
        error = result.error;
      }
      
      if (error) {
        console.error('Save error:', error);
        toast({
          title: "Error saving configuration",
          description: error.message,
          variant: "destructive"
        });
      } else {
        console.log('Configuration saved successfully');
        toast({
          title: "Configuration saved",
          description: "Redirecting back to Assignment Engine..."
        });
        setIsDirty(false);
        
        // Redirect back to the build page (Assignments tab) after a brief delay
        setTimeout(() => {
          navigate(`/build/${buildId}`);
        }, 500);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
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
        <div className="text-muted-foreground">Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-2xl font-bold">Assignment Configuration</h2>
            <p className="text-sm text-muted-foreground">Configure waterfall logic and capacity constraints</p>
          </div>
        </div>
        
        <Button
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          size="lg"
        >
          {isSaving ? (
            <>Saving...</>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      {/* Success Message */}
      {showSuccess && (
        <Alert className="border-green-600 bg-green-50 dark:bg-green-950">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription>
            <p className="font-medium">Configuration saved successfully</p>
            <p className="text-sm">Changes will apply to the next assignment generation</p>
          </AlertDescription>
        </Alert>
      )}

      {/* How It Works */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <p className="font-semibold mb-2">How Assignment Works (Waterfall Logic):</p>
          
          <div className="mb-3">
            <p className="font-semibold text-sm mb-1">Customer Accounts (ARR {'>'} $0):</p>
            <ol className="space-y-1.5 ml-4 list-decimal text-sm">
              <li><strong>Priority 1:</strong> Keep account with current owner if same region + has capacity</li>
              <li><strong>Priority 2:</strong> Assign to any rep in same region with most available capacity</li>
              <li><strong>Priority 3:</strong> Assign to any rep (any region) with most available capacity</li>
              <li><strong>Global Rule:</strong> No rep can exceed capacity limit (target + variance %)</li>
              <li><strong>Special Rules:</strong> Strategic accounts stay with strategic reps, parent/child accounts stay together</li>
            </ol>
          </div>

          <div>
            <p className="font-semibold text-sm mb-1">Prospect Accounts (ARR = $0):</p>
            <ol className="space-y-1.5 ml-4 list-decimal text-sm">
              <li><strong>Net ARR Based:</strong> Prospects are assigned based on opportunity Net ARR, not account ARR</li>
              <li><strong>Territory Match:</strong> Prospects are assigned to reps in their geographic territory first</li>
              <li><strong>Capacity Balancing:</strong> Assignments prioritize reps below their target Net ARR threshold</li>
              <li><strong>Even Distribution:</strong> System ensures balanced distribution of prospect accounts and Net ARR</li>
              <li><strong>Net ARR Target:</strong> Each rep has a target Net ARR from opportunities (default: $2M)</li>
            </ol>
          </div>
        </AlertDescription>
      </Alert>

      {/* Capacity Settings */}
      <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950 dark:to-blue-950">
        <CardHeader>
          <CardTitle>Capacity Management</CardTitle>
          <CardDescription>Control how much workload each rep can handle</CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
            <Label className="mb-2 flex items-center justify-between">
              <span>Capacity Variance</span>
              <span className="text-purple-600 font-medium">
                {config.capacity_variance_percent}% over target allowed
              </span>
            </Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[config.capacity_variance_percent]}
                onValueChange={([value]) => handleChange('capacity_variance_percent', value)}
                min={0}
                max={25}
                step={1}
                className="flex-1"
              />
              <Input
                type="number"
                value={config.capacity_variance_percent}
                onChange={(e) => handleChange('capacity_variance_percent', parseInt(e.target.value) || 0)}
                className="w-20"
                min={0}
                max={25}
              />
              <span className="text-sm font-medium">%</span>
            </div>
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded border">
              <p className="text-xs font-semibold mb-2">What this means:</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Customer Target:</p>
                  <p className="font-semibold">{formatCurrency(config.customer_target_arr)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Customer Capacity Limit:</p>
                  <p className="font-semibold text-purple-700 dark:text-purple-400">
                    {formatCurrency(calculateCapacityLimit(config.customer_target_arr, config.capacity_variance_percent))}
                  </p>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              <strong>Hard cap:</strong> Reps cannot be assigned accounts that would push them beyond this limit. 
              Higher variance = more flexibility but less balance.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Customer ARR Targets */}
      <Card>
        <CardHeader>
          <CardTitle>Customer Account Targets</CardTitle>
          <CardDescription>ARR goals for customer assignments</CardDescription>
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
                max={5000000}
                step={100000}
                className="flex-1"
              />
              <Input
                type="number"
                value={config.customer_target_arr}
                onChange={(e) => handleChange('customer_target_arr', parseInt(e.target.value) || 0)}
                className="w-32"
                step={100000}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The ideal ARR each normal rep should manage. Strategic reps have dynamic targets.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              Maximum ARR per Rep
              <span className="text-muted-foreground font-normal">
                {formatCurrency(config.customer_max_arr)}
              </span>
            </Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[config.customer_max_arr]}
                onValueChange={([value]) => handleChange('customer_max_arr', value)}
                min={1000000}
                max={6000000}
                step={100000}
                className="flex-1"
              />
              <Input
                type="number"
                value={config.customer_max_arr}
                onChange={(e) => handleChange('customer_max_arr', parseInt(e.target.value) || 0)}
                className="w-32"
                step={100000}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Prospect ARR Targets */}
      <Card>
        <CardHeader>
          <CardTitle>Prospect Account Targets</CardTitle>
          <CardDescription>Net ARR goals for prospect assignments (from opportunity pipeline)</CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>What is Net ARR?</strong> For prospects (accounts with $0 ARR), Net ARR represents the total value from the opportunity pipeline. Prospects are assigned based on Net ARR capacity to ensure even distribution of potential revenue.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              Total Prospect Net ARR
              <span className="text-muted-foreground font-normal">
                {formatCurrency(totalProspectNetARR)}
              </span>
            </Label>
            <div className="p-3 border rounded-md bg-muted/50">
              <p className="text-sm text-muted-foreground">
                Sum of all opportunities with Net ARR &gt; $0 across {prospectAccountCount.toLocaleString()} prospect accounts
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              Target Accounts per Rep
              <span className="text-muted-foreground font-normal">
                {prospectAccountCount > 0 && activeRepCount > 0 
                  ? Math.round(prospectAccountCount / activeRepCount).toLocaleString()
                  : '0'} accounts
              </span>
            </Label>
            <div className="p-3 border rounded-md bg-muted/50">
              <p className="text-sm text-muted-foreground">
                Calculated average: {prospectAccountCount.toLocaleString()} total prospect accounts ÷ {activeRepCount} active reps
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              Target Net ARR per Rep
              <span className="text-muted-foreground font-normal">
                {formatCurrency(config.prospect_target_arr)}
              </span>
            </Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[config.prospect_target_arr]}
                onValueChange={([value]) => handleChange('prospect_target_arr', value)}
                min={500000}
                max={5000000}
                step={100000}
                className="flex-1"
              />
              <Input
                type="number"
                value={config.prospect_target_arr}
                onChange={(e) => handleChange('prospect_target_arr', parseInt(e.target.value) || 0)}
                className="w-32"
                step={100000}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The ideal Net ARR from opportunities each rep should manage. Used to balance prospect assignments.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              Maximum Net ARR per Rep
              <span className="text-muted-foreground font-normal">
                {formatCurrency(config.prospect_max_arr)}
              </span>
            </Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[config.prospect_max_arr]}
                onValueChange={([value]) => handleChange('prospect_max_arr', value)}
                min={1000000}
                max={6000000}
                step={100000}
                className="flex-1"
              />
              <Input
                type="number"
                value={config.prospect_max_arr}
                onChange={(e) => handleChange('prospect_max_arr', parseInt(e.target.value) || 0)}
                className="w-32"
                step={100000}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Maximum Net ARR from opportunities allowed per rep (hard limit). Prevents overloading.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Territory Mapping */}
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Territory & Geography Mapping
              </CardTitle>
              <CardDescription>Map account sales territories to sales rep regions for geography matching</CardDescription>
            </div>
            {accountTerritories.length > 0 && repRegions.length > 0 && (
              <div className="flex gap-2">
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
              </div>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="bg-white dark:bg-gray-900 rounded-lg p-4">
          <Alert className="mb-4">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>AI Auto-Map</strong> uses Gemini AI to intelligently match territories to regions.
              Each mapping includes a confidence score (<span className="text-green-600">high</span>, <span className="text-yellow-600">medium</span>, or <span className="text-red-600">low</span>) — review low-confidence mappings manually.
              <br />
              <span className="text-muted-foreground">
                Select "Not Applicable" for territories outside your sales rep regions (e.g., international territories when all reps are US-based).
              </span>
            </AlertDescription>
          </Alert>
          
          {accountTerritories.length === 0 || repRegions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No territory data available</p>
              <p className="text-sm">
                {accountTerritories.length === 0 && 'No account locations found. '}
                {repRegions.length === 0 && 'No sales rep regions found. '}
                Import accounts with Location/Territory and sales reps with Region data.
              </p>
              <div className="mt-4 text-xs space-y-1">
                <p>• Account Locations loaded: {accountTerritories.length}</p>
                <p>• Sales Rep Regions loaded: {repRegions.length}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm bg-muted/50 p-3 rounded-lg">
                <div className="flex gap-4">
                  <span><strong>{accountTerritories.length}</strong> unique account locations</span>
                  <span><strong>{repRegions.length}</strong> unique rep regions</span>
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
                <div>Account Location/Territory ({accountTerritories.length})</div>
                <div>Maps to Rep Region</div>
              </div>
              
              <div className="space-y-2 max-h-96 overflow-y-auto">
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
                        <span className={`font-medium ${isNA ? 'text-gray-500' : ''}`}>{territory}</span>
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
                            title={aiDetail.reasoning}
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
                            <SelectValue placeholder="Select rep region...">
                              {currentMapping ? getRegionDisplayLabel(currentMapping) : 'Select rep region...'}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="bg-popover z-50">
                            <SelectItem value={NOT_APPLICABLE} className="text-gray-500 italic">
                              ⊘ Not Applicable (Exclude)
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
                            title="Clear mapping"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <Alert className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  <strong>Progress:</strong> {Object.keys(config.territory_mappings).filter(k => !isNotApplicable(config.territory_mappings[k])).length} / {accountTerritories.length} territories mapped to regions
                  {Object.values(config.territory_mappings).filter(isNotApplicable).length > 0 && (
                    <span className="text-gray-600 ml-2">
                      ({Object.values(config.territory_mappings).filter(isNotApplicable).length} marked Not Applicable)
                    </span>
                  )}
                  {Object.keys(config.territory_mappings).length < accountTerritories.length && (
                    <span className="text-amber-600 block mt-1">
                      ⚠️ Unmapped territories will skip Priority 1 & 2 (continuity/geography matching)
                    </span>
                  )}
                  {Object.keys(config.territory_mappings).length === accountTerritories.length && (
                    <span className="text-green-600 block mt-1">
                      ✓ All territories configured! Geography matching is fully set up.
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Balance Threshold Configuration */}
      {buildId && <BalanceThresholdConfig buildId={buildId} />}

    </div>
  );
};
