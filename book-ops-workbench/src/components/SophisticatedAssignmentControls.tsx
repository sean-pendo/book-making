import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Settings, BarChart3, Users, Cog } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface SophisticatedAssignmentControlsProps {
  buildId?: string;
  onRunAssignment: (config: AssignmentConfig) => void;
  isRunning: boolean;
}

interface AssignmentConfig {
  minARRPerRep: number;
  minAccountsPerRep: number;
  maxVariancePercent: number;
  respectTerritories: boolean;
  enableContinuity: boolean;
  simulationMode: boolean;
}

export const SophisticatedAssignmentControls: React.FC<SophisticatedAssignmentControlsProps> = ({
  buildId,
  onRunAssignment,
  isRunning
}) => {
  const { toast } = useToast();
  const [rulesSummary, setRulesSummary] = useState<any>(null);
  const [config, setConfig] = useState<AssignmentConfig>({
    minARRPerRep: 1.5, // In millions
    minAccountsPerRep: 1,
    maxVariancePercent: 20,
    respectTerritories: true,
    enableContinuity: true,
    simulationMode: false
  });

  useEffect(() => {
    if (buildId) {
      loadRulesSummary();
    }
  }, [buildId]);

  const loadRulesSummary = async () => {
    try {
      const { data: rules, error } = await supabase
        .from('assignment_rules')
        .select('id, name, rule_type, enabled, conditions')
        .eq('build_id', buildId)
        .eq('enabled', true);

      if (error) throw error;

      const summary = {
        totalRules: rules?.length || 0,
        geoRules: rules?.filter(r => r.rule_type === 'GEO_FIRST').length || 0,
        balanceRules: rules?.filter(r => r.rule_type === 'SMART_BALANCE').length || 0,
        continuityRules: rules?.filter(r => r.rule_type === 'CONTINUITY').length || 0,
        minThresholdRules: rules?.filter(r => r.rule_type === 'MIN_THRESHOLDS').length || 0,
        rules: rules || []
      };

      setRulesSummary(summary);
    } catch (error) {
      console.error('Error loading rules summary:', error);
    }
  };

  const handleRunAssignment = () => {
    // Convert minARRPerRep to actual value (millions to full amount)
    const actualConfig = {
      ...config,
      minARRPerRep: config.minARRPerRep * 1000000
    };
    onRunAssignment(actualConfig);
  };

  return (
    <div className="space-y-6">
      {/* Rules Summary */}
      {rulesSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cog className="h-5 w-5" />
              Active Assignment Rules
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{rulesSummary.geoRules}</div>
                <p className="text-xs text-muted-foreground">Geographic Rules</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{rulesSummary.balanceRules}</div>
                <p className="text-xs text-muted-foreground">Balance Rules</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{rulesSummary.continuityRules}</div>
                <p className="text-xs text-muted-foreground">Continuity Rules</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{rulesSummary.minThresholdRules}</div>
                <p className="text-xs text-muted-foreground">Threshold Rules</p>
              </div>
            </div>
            
            {rulesSummary.totalRules === 0 && (
              <Alert className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No assignment rules configured. Go to the "Rules" tab to set up sophisticated assignment logic.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Assignment Execution Controls
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Fine-tune assignment execution using your configured rules
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Balance Controls */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <h3 className="font-semibold">Balance Override Controls</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="minARR">Minimum ARR per Rep (M)</Label>
                <Input
                  id="minARR"
                  type="number"
                  step="0.1"
                  min="0"
                  value={config.minARRPerRep}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    minARRPerRep: parseFloat(e.target.value) || 0 
                  }))}
                  placeholder="1.5"
                />
                <p className="text-xs text-muted-foreground">
                  Override minimum thresholds configured in rules
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="minAccounts">Minimum Accounts per Rep</Label>
                <Input
                  id="minAccounts"
                  type="number"
                  min="1"
                  value={config.minAccountsPerRep}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    minAccountsPerRep: parseInt(e.target.value) || 1 
                  }))}
                  placeholder="1"
                />
                <p className="text-xs text-muted-foreground">
                  Override account minimums from rules
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxVariance">Max Variance Override (%)</Label>
                <Input
                  id="maxVariance"
                  type="number"
                  min="5"
                  max="50"
                  value={config.maxVariancePercent}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    maxVariancePercent: parseInt(e.target.value) || 20 
                  }))}
                  placeholder="20"
                />
                <p className="text-xs text-muted-foreground">
                  Override variance settings from balance rules
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Execution Strategy */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <h3 className="font-semibold">Execution Strategy</h3>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="respectTerritories">Enforce Territory Rules</Label>
                  <p className="text-xs text-muted-foreground">
                    Use configured geographic assignment rules strictly
                  </p>
                </div>
                <Switch
                  id="respectTerritories"
                  checked={config.respectTerritories}
                  onCheckedChange={(checked) => setConfig(prev => ({ 
                    ...prev, 
                    respectTerritories: checked 
                  }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="enableContinuity">Apply Continuity Rules</Label>
                  <p className="text-xs text-muted-foreground">
                    Use configured continuity rules to maintain rep relationships
                  </p>
                </div>
                <Switch
                  id="enableContinuity"
                  checked={config.enableContinuity}
                  onCheckedChange={(checked) => setConfig(prev => ({ 
                    ...prev, 
                    enableContinuity: checked 
                  }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="simulationMode">Simulation Mode</Label>
                  <p className="text-xs text-muted-foreground">
                    Preview assignments without saving (test rule effectiveness)
                  </p>
                </div>
                <Switch
                  id="simulationMode"
                  checked={config.simulationMode}
                  onCheckedChange={(checked) => setConfig(prev => ({ 
                    ...prev, 
                    simulationMode: checked 
                  }))}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Information Alert */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Enhanced Assignment Engine:</strong> This system uses your configured assignment rules in priority order:
              <br />
              1. <Badge variant="outline">Geographic Rules</Badge> - Territory-based assignment with intelligent fallbacks
              <br />
              2. <Badge variant="outline">Continuity Rules</Badge> - Maintains existing rep-account relationships when possible
              <br />
              3. <Badge variant="outline">Balance Rules</Badge> - Ensures equitable workload distribution across reps
              <br />
              4. <Badge variant="outline">Threshold Rules</Badge> - Guarantees minimum ARR and account requirements
            </AlertDescription>
          </Alert>

          {/* Run Assignment Button */}
          <div className="pt-4">
            <Button 
              onClick={handleRunAssignment}
              disabled={isRunning || !rulesSummary?.totalRules}
              className="w-full h-12"
              size="lg"
            >
              {isRunning ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Running Enhanced Assignment...
                </>
              ) : !rulesSummary?.totalRules ? (
                <>
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Configure Rules First
                </>
              ) : (
                <>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  {config.simulationMode ? 'Preview Assignment' : 'Run Enhanced Assignment'}
                </>
              )}
            </Button>
            
            {!rulesSummary?.totalRules && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Go to the "Rules" tab to configure assignment rules before generating assignments
              </p>
            )}
          </div>

          {/* Configuration Summary */}
          <div className="bg-muted/50 p-4 rounded-lg">
            <h4 className="font-medium mb-2">Current Configuration:</h4>
            <div className="text-sm space-y-1">
              <div>Active Rules: <Badge variant="secondary">{rulesSummary?.totalRules || 0}</Badge></div>
              <div>Min ARR Override: <Badge variant="secondary">${config.minARRPerRep}M</Badge></div>
              <div>Max Variance Override: <Badge variant="secondary">{config.maxVariancePercent}%</Badge></div>
              <div className="flex gap-2 mt-2">
                {config.respectTerritories && <Badge variant="outline">Territory Rules</Badge>}
                {config.enableContinuity && <Badge variant="outline">Continuity Rules</Badge>}
                {config.simulationMode && <Badge variant="outline">Simulation</Badge>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};