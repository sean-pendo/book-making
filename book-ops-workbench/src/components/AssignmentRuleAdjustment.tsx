import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, Settings, Save, RefreshCw, Sliders, Sparkles } from 'lucide-react';
import { ScoringWeightsEditor } from './ScoringWeightsEditor';

interface AssignmentRule {
  id: string;
  name: string;
  rule_type: string;
  conditions: any;
  priority: number;
  enabled: boolean;
  build_id: string;
  scoring_weights?: any;
  behavior_class?: string;
  account_scope?: string;
}

interface AssignmentRuleAdjustmentProps {
  buildId: string;
  onRulesUpdated?: () => void;
}

export const AssignmentRuleAdjustment: React.FC<AssignmentRuleAdjustmentProps> = ({ 
  buildId, 
  onRulesUpdated 
}) => {
  const [rules, setRules] = useState<AssignmentRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const { toast } = useToast();

  // Load assignment rules
  const loadRules = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('assignment_rules')
        .select('*')
        .eq('build_id', buildId)
        .order('priority');

      if (error) throw error;
      setRules(data || []);
    } catch (error) {
      console.error('Failed to load assignment rules:', error);
      toast({
        title: "Error",
        description: "Failed to load assignment rules",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Update a rule's scoring weights
  const updateRuleScoringWeights = async (ruleId: string, newWeights: any) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('assignment_rules')
        .update({ 
          scoring_weights: newWeights,
          updated_at: new Date().toISOString()
        })
        .eq('id', ruleId);

      if (error) throw error;

      // Update local state
      setRules(prevRules => 
        prevRules.map(rule => 
          rule.id === ruleId 
            ? { ...rule, scoring_weights: newWeights }
            : rule
        )
      );

      toast({
        title: "Success",
        description: "Scoring weights updated successfully",
      });

      onRulesUpdated?.();

    } catch (error) {
      console.error('Failed to update scoring weights:', error);
      toast({
        title: "Error",
        description: "Failed to update scoring weights",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Update a rule's conditions
  const updateRuleConditions = async (ruleId: string, newConditions: any) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('assignment_rules')
        .update({ 
          conditions: newConditions,
          updated_at: new Date().toISOString()
        })
        .eq('id', ruleId);

      if (error) throw error;

      // Update local state
      setRules(prevRules => 
        prevRules.map(rule => 
          rule.id === ruleId 
            ? { ...rule, conditions: newConditions }
            : rule
        )
      );

      toast({
        title: "Success",
        description: "Rule conditions updated successfully",
      });

      // Notify parent component
      onRulesUpdated?.();

    } catch (error) {
      console.error('Failed to update rule conditions:', error);
      toast({
        title: "Error",
        description: "Failed to update rule conditions",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Toggle rule enabled/disabled
  const toggleRuleEnabled = async (ruleId: string, enabled: boolean) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('assignment_rules')
        .update({ 
          enabled,
          updated_at: new Date().toISOString()
        })
        .eq('id', ruleId);

      if (error) throw error;

      // Update local state
      setRules(prevRules => 
        prevRules.map(rule => 
          rule.id === ruleId 
            ? { ...rule, enabled }
            : rule
        )
      );

      toast({
        title: "Success",
        description: `Rule ${enabled ? 'enabled' : 'disabled'} successfully`,
      });

      // Notify parent component
      onRulesUpdated?.();

    } catch (error) {
      console.error('Failed to toggle rule:', error);
      toast({
        title: "Error", 
        description: "Failed to update rule status",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Load rules on mount
  React.useEffect(() => {
    if (buildId) {
      loadRules();
    }
  }, [buildId]);

  // Render MIN_THRESHOLDS rule editor
  const renderMinThresholdsEditor = (rule: AssignmentRule) => {
    const conditions = rule.conditions || {};
    
    return (
      <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
        <div className="flex items-center justify-between">
          <h4 className="font-medium flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Hard Cutoff Configuration
          </h4>
          <Switch
            checked={rule.enabled}
            onCheckedChange={(enabled) => toggleRuleEnabled(rule.id, enabled)}
            disabled={saving}
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`cutoff-${rule.id}`}>Hard Cutoff ARR ($)</Label>
            <Input
              id={`cutoff-${rule.id}`}
              type="number"
              value={conditions.minCustomerARR || 2500000}
              onChange={(e) => {
                const newConditions = {
                  ...conditions,
                  minCustomerARR: parseInt(e.target.value) || 2500000
                };
                updateRuleConditions(rule.id, newConditions);
              }}
              disabled={saving}
              placeholder="2500000"
            />
            <p className="text-xs text-muted-foreground">
              Maximum ARR per sales rep (e.g., 2500000 = $2.5M)
            </p>
          </div>

          <div className="space-y-2">
            <Label>Customer Accounts Only</Label>
            <Switch
              checked={conditions.customersOnly !== false}
              onCheckedChange={(customersOnly) => {
                const newConditions = {
                  ...conditions,
                  customersOnly
                };
                updateRuleConditions(rule.id, newConditions);
              }}
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              Apply this rule only to customer accounts
            </p>
          </div>
        </div>

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Changes to the hard cutoff will immediately affect assignment logic. 
            Current setting: <strong>${((conditions.minCustomerARR || 2500000) / 1000000).toFixed(1)}M ARR per rep</strong>
          </AlertDescription>
        </Alert>
      </div>
    );
  };

  // Render GEO_FIRST rule editor
  const renderGeoFirstEditor = (rule: AssignmentRule) => {
    const conditions = rule.conditions || {};
    
    return (
      <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
        <div className="flex items-center justify-between">
          <h4 className="font-medium flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Geographic Territory Mapping
          </h4>
          <Switch
            checked={rule.enabled}
            onCheckedChange={(enabled) => toggleRuleEnabled(rule.id, enabled)}
            disabled={saving}
          />
        </div>
        
        <div className="space-y-2">
          <Label>Territory Assignment Priority</Label>
          <Select 
            value={conditions.priority || 'high'}
            onValueChange={(priority) => {
              const newConditions = {
                ...conditions,
                priority
              };
              updateRuleConditions(rule.id, newConditions);
            }}
            disabled={saving}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">High Priority (Process first)</SelectItem>
              <SelectItem value="medium">Medium Priority</SelectItem>
              <SelectItem value="low">Low Priority</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Alert>
          <AlertDescription>
            Geographic splitting happens before other rules and determines regional assignment boundaries.
          </AlertDescription>
        </Alert>
      </div>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Assignment Rule Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading assignment rules...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Assignment Rule Configuration
        </CardTitle>
        <CardDescription>
          Adjust assignment rules in real-time. Changes will affect future assignment generations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium">Active Rules ({rules.filter(r => r.enabled).length}/{rules.length})</h3>
          <Button 
            onClick={loadRules} 
            variant="outline" 
            size="sm"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {rules.length === 0 ? (
          <Alert>
            <AlertDescription>
              No assignment rules found for this build. Rules are required for assignment generation.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            {rules.map((rule) => (
              <div key={rule.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <h3 className="font-medium">{rule.name}</h3>
                    <span className={`px-2 py-1 rounded text-xs ${
                      rule.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {rule.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      Priority: {rule.priority}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedRule(
                      expandedRule === rule.id ? null : rule.id
                    )}
                  >
                    {expandedRule === rule.id ? 'Collapse' : 'Configure'}
                  </Button>
                </div>

                {expandedRule === rule.id && (
                  <div className="mt-4 space-y-4">
                    {/* Scoring Weights */}
                    {['GEO_FIRST', 'CONTINUITY', 'SMART_BALANCE', 'MIN_THRESHOLDS', 'TIER_BALANCE', 'CRE_BALANCE', 'ROUND_ROBIN', 'AI_BALANCER'].includes(rule.rule_type) && (
                      <div className="mb-4">
                        <ScoringWeightsEditor
                          ruleType={rule.rule_type}
                          weights={rule.scoring_weights || {}}
                          onChange={(weights) => updateRuleScoringWeights(rule.id, weights)}
                        />
                      </div>
                    )}
                    
                    {/* Rule-specific config */}
                    {rule.rule_type === 'MIN_THRESHOLDS' && renderMinThresholdsEditor(rule)}
                    {rule.rule_type === 'GEO_FIRST' && renderGeoFirstEditor(rule)}
                    {!['MIN_THRESHOLDS', 'GEO_FIRST'].includes(rule.rule_type) && (
                      <div className="p-4 border rounded-lg bg-muted/50">
                        <p className="text-sm text-muted-foreground">
                          Configuration for {rule.rule_type} rules is not yet available.
                        </p>
                      </div>
                    )}
                    
                    {/* Behavior class badge */}
                    {rule.behavior_class && rule.behavior_class !== 'STANDARD' && (
                      <div className="flex items-center gap-2">
                        {rule.behavior_class === 'FINAL_ARBITER' && <Sparkles className="h-4 w-4 text-primary" />}
                        <Badge variant="outline" className="gap-1">
                          {rule.behavior_class === 'FINAL_ARBITER' && 'AI Final Arbiter'}
                          {rule.behavior_class === 'PRIMARY_ASSIGNER' && 'AI Primary Assigner'}
                          {rule.behavior_class === 'CONSTRAINT' && 'Constraint'}
                          {rule.behavior_class === 'CONDITIONAL' && 'Conditional'}
                          {rule.behavior_class === 'OVERRIDE' && 'Override'}
                          {rule.behavior_class === 'TIEBREAKER' && 'Tiebreaker'}
                        </Badge>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {saving && (
          <Alert>
            <Save className="h-4 w-4" />
            <AlertDescription>
              Saving rule changes...
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};