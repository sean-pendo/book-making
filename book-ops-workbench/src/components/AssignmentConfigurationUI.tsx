import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Settings, Save, AlertCircle, DollarSign, Users, CheckCircle, Target } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CalculateThresholdsButton } from '@/components/CalculateThresholdsButton';

interface AssignmentConfig {
  customer_target_arr: number;
  customer_max_arr: number;
  prospect_target_arr: number;
  prospect_max_arr: number;
  max_cre_per_rep: number;
  capacity_variance_percent: number;
  atr_min?: number | null;
  cre_min?: number | null;
  tier1_min?: number | null;
  last_calculated_at?: string | null;
}

export const AssignmentConfigurationUI: React.FC = () => {
  const { id: buildId } = useParams<{ id: string }>();
  const { toast } = useToast();
  
  const [config, setConfig] = useState<AssignmentConfig>({
    customer_target_arr: 1500000,
    customer_max_arr: 2500000,
    prospect_target_arr: 1500000,
    prospect_max_arr: 2500000,
    max_cre_per_rep: 5,
    capacity_variance_percent: 10,
    last_calculated_at: null
  });
  
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [repsWithoutRegions, setRepsWithoutRegions] = useState<string[]>([]);

  // Load existing configuration
  useEffect(() => {
    if (!buildId) return;
    
    const loadConfig = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('assignment_configuration')
        .select('*')
        .eq('build_id', buildId)
        .maybeSingle();
      
      if (error) {
        console.error('Error loading config:', error);
      } else if (data) {
        setConfig({
          customer_target_arr: data.customer_target_arr || 1500000,
          customer_max_arr: data.customer_max_arr || 2500000,
          prospect_target_arr: data.prospect_target_arr || 1500000,
          prospect_max_arr: data.prospect_max_arr || 2500000,
          max_cre_per_rep: data.max_cre_per_rep || 3,
          capacity_variance_percent: data.capacity_variance_percent || 10,
          atr_min: data.atr_min,
          cre_min: data.cre_min,
          tier1_min: data.tier1_min,
          last_calculated_at: data.last_calculated_at
        });
      }

      // Check for reps without regions
      const { data: repsData } = await supabase
        .from('sales_reps')
        .select('name, region, is_active, include_in_assignments, is_strategic_rep')
        .eq('build_id', buildId)
        .eq('is_active', true)
        .eq('include_in_assignments', true)
        .eq('is_strategic_rep', false)
        .or('region.is.null,region.eq.');

      if (repsData && repsData.length > 0) {
        setRepsWithoutRegions(repsData.map(r => r.name));
      }

      setIsLoading(false);
    };
    
    loadConfig();
  }, [buildId]);

  const formatCurrency = (value: number) => {
    return `$${(value / 1000000).toFixed(1)}M`;
  };

  const handleChange = (field: keyof AssignmentConfig, value: number) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
    setIsDirty(true);
    setShowSuccess(false);
  };

  const handleSave = async () => {
    if (!buildId) return;
    
    setIsSaving(true);
    
    const { error } = await supabase
      .from('assignment_configuration')
      .upsert({
        build_id: buildId,
        ...config,
        updated_at: new Date().toISOString()
      });
    
    if (error) {
      toast({
        title: "Error saving configuration",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Configuration saved",
        description: "Changes will apply to the next assignment generation"
      });
      setShowSuccess(true);
      setIsDirty(false);
      setTimeout(() => setShowSuccess(false), 3000);
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
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-2xl font-bold">Assignment Configuration</h2>
            <p className="text-sm text-muted-foreground">Configure workload thresholds for the assignment engine</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          {buildId && (
            <CalculateThresholdsButton 
              buildId={buildId}
              onCalculated={() => {
                toast({
                  title: "Thresholds calculated",
                  description: "Now regenerate assignments to apply multi-dimensional balance"
                });
              }}
            />
          )}
          <Button
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            size="lg"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Success Message */}
      {showSuccess && (
        <Alert className="border-green-600 bg-green-50 dark:bg-green-950">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-900 dark:text-green-100">
            <p className="font-medium">Configuration saved successfully</p>
            <p className="text-sm">Changes will apply to the next assignment generation</p>
          </AlertDescription>
        </Alert>
      )}

      {/* Reps Without Regions Warning */}
      {repsWithoutRegions.length > 0 && (
        <Alert variant="destructive" className="border-red-600 bg-red-50 dark:bg-red-950">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-900 dark:text-red-100">
            <p className="font-medium">⚠️ Reps without regions detected</p>
            <p className="text-sm mt-2">
              The following {repsWithoutRegions.length} rep{repsWithoutRegions.length > 1 ? 's have' : ' has'} no region assigned and will <strong>NOT match Priority 1 & 2 geography rules</strong>:
            </p>
            <p className="text-sm mt-2 font-mono bg-red-100 dark:bg-red-900 p-2 rounded">
              {repsWithoutRegions.join(', ')}
            </p>
            <p className="text-sm mt-2">
              <strong>Fix:</strong> Go to <strong>Data Import</strong> and re-upload sales rep data with region assignments.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Missing Thresholds Warning */}
      {!config.last_calculated_at && (
        <Alert variant="destructive" className="border-amber-600 bg-amber-50 dark:bg-amber-950">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-900 dark:text-amber-100">
            <p className="font-medium">Balance thresholds not calculated</p>
            <p className="text-sm mt-1">
              Workload balancing requires calculated thresholds for CRE, ATR, and Tier distribution.
              Go to <strong>Territory Balancing Dashboard</strong> and click "Recalculate" in the Balance Thresholds section.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Capacity Management Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Capacity Management</CardTitle>
          <CardDescription>Configure the variance percentage to define your capacity range</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              Capacity Variance Percentage
              <span className="text-muted-foreground font-normal">{config.capacity_variance_percent}%</span>
            </Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[config.capacity_variance_percent]}
                onValueChange={([value]) => handleChange('capacity_variance_percent', value)}
                min={5}
                max={25}
                step={1}
                className="flex-1"
              />
              <Input
                type="number"
                value={config.capacity_variance_percent}
                onChange={(e) => handleChange('capacity_variance_percent', parseInt(e.target.value) || 10)}
                className="w-20"
                min={5}
                max={25}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              This percentage determines how much flexibility reps have above/below the target ARR
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Resulting Capacity Range Display */}
      <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="w-4 h-4" />
            Resulting Capacity Range (Normal Reps Only)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Minimum ARR:</span>
              <Badge variant="outline">
                {formatCurrency(config.customer_target_arr * (1 - (config.capacity_variance_percent || 10) / 100))}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Target ARR:</span>
              <Badge variant="outline">
                {formatCurrency(config.customer_target_arr)}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Maximum ARR (Preferred):</span>
              <Badge variant="outline">
                {formatCurrency(config.customer_target_arr * (1 + (config.capacity_variance_percent || 10) / 100))}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Absolute Hard Cap:</span>
              <Badge variant="destructive">
                {formatCurrency(config.customer_max_arr)}
              </Badge>
            </div>
          </div>
          <Alert className="mt-3">
            <AlertDescription className="text-xs">
              <strong>How it works:</strong> Reps below minimum can accept accounts to reach target. 
              Reps at/above target cannot exceed preferred max. Hard cap is never exceeded.
              <br /><br />
              <strong>Strategic reps are exempt</strong> from all these limits.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Multi-Dimensional Balancing Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="w-4 h-4" />
            Multi-Dimensional Balancing
          </CardTitle>
          <CardDescription className="text-xs">
            Balance not just ARR, but also ATR, CRE, Tiers, and Quarterly Renewals
          </CardDescription>
        </CardHeader>
        <CardContent>
          {config.last_calculated_at ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm font-medium">Active</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Last calculated: {new Date(config.last_calculated_at).toLocaleString()}
              </div>
              <div className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>ATR Minimum:</span>
                  <Badge variant="outline">{config.atr_min ? formatCurrency(config.atr_min) : 'N/A'}</Badge>
                </div>
                <div className="flex justify-between">
                  <span>CRE Minimum:</span>
                  <Badge variant="outline">{config.cre_min || 'N/A'} accounts</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Tier 1 Minimum:</span>
                  <Badge variant="outline">{config.tier1_min || 'N/A'} accounts</Badge>
                </div>
              </div>
            </div>
          ) : (
            <Alert>
              <AlertCircle className="w-4 h-4" />
              <AlertDescription className="text-sm">
                Multi-dimensional balancing is <strong>not active</strong>. 
                Only ARR is being balanced. Click <strong>"Calculate Balance Thresholds"</strong> to enable ATR, CRE, and Tier balancing.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Customer Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            <CardTitle>Customer Assignments</CardTitle>
          </div>
          <CardDescription>Configure ARR targets for customer account assignments</CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Target ARR */}
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
                max={3000000}
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
              The ideal ARR each rep should manage. Used for balanced distribution.
            </p>
          </div>

          {/* Max ARR */}
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
                max={5000000}
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
            <p className="text-xs text-muted-foreground">
              Hard cap on ARR per rep. No rep will be assigned accounts beyond this limit.
            </p>
            
            {config.customer_max_arr <= config.customer_target_arr && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Maximum ARR should be higher than target ARR to allow capacity buffer
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Prospect Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            <CardTitle>Prospect Assignments</CardTitle>
          </div>
          <CardDescription>Configure ARR targets for prospect account assignments</CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Target ARR */}
          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              Target ARR per Rep
              <span className="text-muted-foreground font-normal">
                {formatCurrency(config.prospect_target_arr)}
              </span>
            </Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[config.prospect_target_arr]}
                onValueChange={([value]) => handleChange('prospect_target_arr', value)}
                min={500000}
                max={3000000}
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
          </div>

          {/* Max ARR */}
          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              Maximum ARR per Rep
              <span className="text-muted-foreground font-normal">
                {formatCurrency(config.prospect_max_arr)}
              </span>
            </Label>
            <div className="flex items-center gap-4">
              <Slider
                value={[config.prospect_max_arr]}
                onValueChange={([value]) => handleChange('prospect_max_arr', value)}
                min={1000000}
                max={5000000}
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
            
            {config.prospect_max_arr <= config.prospect_target_arr && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Maximum ARR should be higher than target ARR to allow capacity buffer
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* CRE Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>CRE (Customer Risk Events)</CardTitle>
          <CardDescription>Maximum number of at-risk customers per rep</CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-2">
          <Label>Max CRE per Rep: {config.max_cre_per_rep}</Label>
          <div className="flex items-center gap-4">
            <Slider
              value={[config.max_cre_per_rep]}
              onValueChange={([value]) => handleChange('max_cre_per_rep', value)}
              min={1}
              max={10}
              step={1}
              className="flex-1"
            />
            <Input
              type="number"
              value={config.max_cre_per_rep}
              onChange={(e) => handleChange('max_cre_per_rep', parseInt(e.target.value) || 0)}
              className="w-20"
              min={1}
              max={10}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Prevents any rep from being assigned more at-risk accounts than this limit
          </p>
        </CardContent>
      </Card>

      {/* Info Box */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <p className="font-medium mb-1">How these settings work:</p>
          <ul className="space-y-1 text-sm">
            <li>• <strong>Target ARR</strong>: The engine aims to distribute accounts so each rep reaches this target</li>
            <li>• <strong>Maximum ARR</strong>: Hard limit - reps cannot exceed this amount</li>
            <li>• <strong>Strategic reps</strong>: Get dynamic targets calculated from their current account pool</li>
            <li>• <strong>Normal reps</strong>: Use the configured target and max values</li>
          </ul>
        </AlertDescription>
      </Alert>

      {/* Example Calculation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Example Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground mb-1">With 52 normal reps:</p>
              <p className="font-medium">Target: {formatCurrency(config.customer_target_arr)} each</p>
              <p className="font-medium">Total capacity: {formatCurrency(config.customer_target_arr * 52)}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Maximum allowed:</p>
              <p className="font-medium">{formatCurrency(config.customer_max_arr)} per rep</p>
              <p className="font-medium">Max capacity: {formatCurrency(config.customer_max_arr * 52)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
