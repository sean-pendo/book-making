import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Plus, Trash2, Settings, Map, Users, Target, Shuffle, ChevronUp, ChevronDown, GitBranch, AlertTriangle, Sparkles, Loader2, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ConditionalModifierBuilder } from './ConditionalModifierBuilder';
import { ScoringWeightsEditor } from './ScoringWeightsEditor';
import { RuleFieldMapper } from './RuleFieldMapper';
import { validateRules } from '@/utils/ruleValidator';

export interface AssignmentRule {
  id?: string;
  name: string;
  rule_type: string;
  priority: number;
  conditions: any;
  enabled: boolean;
  account_scope: string;
  description?: string;
  scoring_weights?: any;
  rule_logic?: any;
  conditional_modifiers?: any[];
  rule_dependencies?: any[];
  is_custom_rule?: boolean;
  region_capacity_config?: any;
}

interface AdvancedRuleBuilderProps {
  buildId: string;
  onRulesChanged: () => void;
}

const RULE_TYPES = [
  { value: 'GEO_FIRST', label: 'Geographic Assignment', icon: Map, description: 'Assign accounts based on territory mappings' },
  { value: 'CONTINUITY', label: 'Account Continuity', icon: Users, description: 'Maintain rep-account relationships' },
  { value: 'SMART_BALANCE', label: 'Workload Balance', icon: Target, description: 'Balance ARR across reps' },
  { value: 'TIER_BALANCE', label: 'Tier Balancing', icon: Shuffle, description: 'Balance by account tier (Tier 1 = strategic reps)' },
  { value: 'CRE_BALANCE', label: 'CRE Risk Distribution', icon: AlertTriangle, description: 'Distribute CRE accounts evenly (max 3 per rep)' }
];

export const AdvancedRuleBuilder: React.FC<AdvancedRuleBuilderProps> = ({ buildId, onRulesChanged }) => {
  const { toast } = useToast();
  const [rules, setRules] = useState<AssignmentRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewRuleDialog, setShowNewRuleDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<AssignmentRule | null>(null);
  const [showFieldMapper, setShowFieldMapper] = useState(false);
  const [fieldMapperRule, setFieldMapperRule] = useState<AssignmentRule | null>(null);
  const [newRule, setNewRule] = useState<Partial<AssignmentRule>>({
    name: '',
    rule_type: 'GEO_FIRST',
    priority: 1,
    conditions: {},
    enabled: true,
    account_scope: 'all',
    description: '',
    rule_logic: {}
  });

  // Note: behavior_class removed - all rules now use standard priority-based scoring

  useEffect(() => {
    loadRules();
  }, [buildId]);

  const loadRules = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('assignment_rules')
        .select('id, name, rule_type, priority, conditions, enabled, description, account_scope, scoring_weights, rule_logic, conditional_modifiers, rule_dependencies, is_custom_rule, region_capacity_config')
        .eq('build_id', buildId)
        .order('priority');

      if (error) throw error;
      setRules((data || []) as AssignmentRule[]);
    } catch (error) {
      console.error('Error loading rules:', error);
      toast({
        title: "Error Loading Rules",
        description: "Failed to load assignment rules",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getRuleValidationBadge = (rule: AssignmentRule) => {
    const validation = validateRules(rules, rule);
    
    if (!validation.isValid) {
      const errorMessages = validation.errors.map(e => `• ${e.message}`).join('\n');
      return (
        <HoverCard>
          <HoverCardTrigger>
            <Badge 
              variant="destructive" 
              className="ml-2 cursor-help"
            >
              ❌ Incomplete
            </Badge>
          </HoverCardTrigger>
          <HoverCardContent className="w-80">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm text-destructive">Errors:</h4>
              <div className="text-xs whitespace-pre-line">{errorMessages}</div>
            </div>
          </HoverCardContent>
        </HoverCard>
      );
    }
    
    if (validation.warnings.length > 0) {
      const warningMessages = validation.warnings.map(w => `• ${w.message}`).join('\n');
      return (
        <HoverCard>
          <HoverCardTrigger>
            <Badge 
              variant="outline" 
              className="ml-2 border-yellow-500 text-yellow-600 cursor-help"
            >
              ⚠️ {validation.warnings.length} Warning{validation.warnings.length > 1 ? 's' : ''}
            </Badge>
          </HoverCardTrigger>
          <HoverCardContent className="w-80">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Warnings:</h4>
              <div className="text-xs whitespace-pre-line">{warningMessages}</div>
            </div>
          </HoverCardContent>
        </HoverCard>
      );
    }
    
    return <Badge variant="outline" className="ml-2 border-green-500 text-green-600">✅ Ready</Badge>;
  };

  const openFieldMapper = (rule: AssignmentRule) => {
    setFieldMapperRule(rule);
    setShowFieldMapper(true);
  };

  const handleFieldMappingSave = async (fieldMappings: any) => {
    if (!fieldMapperRule) return;

    const updatedConditions = {
      ...fieldMapperRule.conditions,
      fieldMappings
    };

    try {
      const { error } = await supabase
        .from('assignment_rules')
        .update({
          conditions: updatedConditions,
          updated_at: new Date().toISOString()
        })
        .eq('id', fieldMapperRule.id);

      if (error) throw error;

      await loadRules();
      onRulesChanged();
      
      toast({
        title: "Field Mappings Updated",
        description: `Field mappings for "${fieldMapperRule.name}" have been saved`
      });
    } catch (error) {
      console.error('Error updating field mappings:', error);
      toast({
        title: "Error",
        description: "Failed to save field mappings",
        variant: "destructive"
      });
    }
  };

  const saveRule = async (rule: Partial<AssignmentRule>) => {
    // Validate before saving
    const validation = validateRules(rules, rule as AssignmentRule);
    if (!validation.isValid) {
      toast({
        title: "Validation Errors",
        description: validation.errors[0]?.message || "Please fix validation errors",
        variant: "destructive"
      });
      return;
    }

    try {
      if (rule.id) {
        // Update existing rule
        const { error } = await supabase
          .from('assignment_rules')
          .update({
            name: rule.name,
            rule_type: rule.rule_type,
            priority: rule.priority,
            conditions: rule.conditions,
            enabled: rule.enabled,
            account_scope: rule.account_scope,
            description: rule.description,
            scoring_weights: rule.scoring_weights || {},
            rule_logic: rule.rule_logic || {},
            conditional_modifiers: rule.conditional_modifiers || [],
            rule_dependencies: rule.rule_dependencies || [],
            is_custom_rule: rule.is_custom_rule || false,
            region_capacity_config: rule.region_capacity_config || {},
            updated_at: new Date().toISOString()
          })
          .eq('id', rule.id);

        if (error) throw error;
      } else {
        // Create new rule
        const { error } = await supabase
          .from('assignment_rules')
          .insert({
            build_id: buildId,
            name: rule.name,
            rule_type: rule.rule_type,
            priority: rule.priority,
            conditions: rule.conditions,
            enabled: rule.enabled,
            account_scope: rule.account_scope,
            description: rule.description,
            scoring_weights: rule.scoring_weights || {},
            rule_logic: rule.rule_logic || {},
            conditional_modifiers: rule.conditional_modifiers || [],
            rule_dependencies: rule.rule_dependencies || [],
            is_custom_rule: rule.is_custom_rule || false,
            region_capacity_config: rule.region_capacity_config || {}
          });

        if (error) throw error;
      }

      await loadRules();
      onRulesChanged();
      setShowNewRuleDialog(false);
      setEditingRule(null);
      
      toast({
        title: "Rule Saved",
        description: `Assignment rule "${rule.name}" has been saved successfully`
      });
    } catch (error) {
      console.error('Error saving rule:', error);
      toast({
        title: "Error Saving Rule",
        description: "Failed to save assignment rule",
        variant: "destructive"
      });
    }
  };

  const deleteRule = async (ruleId: string) => {
    try {
      const { error } = await supabase
        .from('assignment_rules')
        .delete()
        .eq('id', ruleId);

      if (error) throw error;

      await loadRules();
      onRulesChanged();
      
      toast({
        title: "Rule Deleted",
        description: "Assignment rule has been deleted successfully"
      });
    } catch (error) {
      console.error('Error deleting rule:', error);
      toast({
        title: "Error Deleting Rule",
        description: "Failed to delete assignment rule",
        variant: "destructive"
      });
    }
  };


  const toggleRuleEnabled = async (ruleId: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('assignment_rules')
        .update({ enabled, updated_at: new Date().toISOString() })
        .eq('id', ruleId);

      if (error) throw error;

      await loadRules();
      onRulesChanged();
    } catch (error) {
      console.error('Error toggling rule:', error);
      toast({
        title: "Error Updating Rule",
        description: "Failed to update rule status",
        variant: "destructive"
      });
    }
  };

  const movePriorityUp = async (rule: AssignmentRule) => {
    if (rule.priority <= 1) return; // Already highest priority

    try {
      // Find the rule with the next lower priority (priority - 1)
      const targetRule = rules.find(r => r.priority === rule.priority - 1);
      
      if (!targetRule) return;

      // Swap priorities
      const { error: error1 } = await supabase
        .from('assignment_rules')
        .update({ priority: rule.priority, updated_at: new Date().toISOString() })
        .eq('id', targetRule.id);

      const { error: error2 } = await supabase
        .from('assignment_rules')
        .update({ priority: rule.priority - 1, updated_at: new Date().toISOString() })
        .eq('id', rule.id);

      if (error1 || error2) throw error1 || error2;

      await loadRules();
      onRulesChanged();
      
      toast({
        title: "Priority Updated",
        description: `Moved "${rule.name}" up in priority`
      });
    } catch (error) {
      console.error('Error updating priority:', error);
      toast({
        title: "Error Updating Priority",
        description: "Failed to update rule priority",
        variant: "destructive"
      });
    }
  };

  const movePriorityDown = async (rule: AssignmentRule) => {
    const maxPriority = Math.max(...rules.map(r => r.priority));
    if (rule.priority >= maxPriority) return; // Already lowest priority

    try {
      // Find the rule with the next higher priority (priority + 1)
      const targetRule = rules.find(r => r.priority === rule.priority + 1);
      
      if (!targetRule) return;

      // Swap priorities
      const { error: error1 } = await supabase
        .from('assignment_rules')
        .update({ priority: rule.priority, updated_at: new Date().toISOString() })
        .eq('id', targetRule.id);

      const { error: error2 } = await supabase
        .from('assignment_rules')
        .update({ priority: rule.priority + 1, updated_at: new Date().toISOString() })
        .eq('id', rule.id);

      if (error1 || error2) throw error1 || error2;

      await loadRules();
      onRulesChanged();
      
      toast({
        title: "Priority Updated",
        description: `Moved "${rule.name}" down in priority`
      });
    } catch (error) {
      console.error('Error updating priority:', error);
      toast({
        title: "Error Updating Priority",
        description: "Failed to update rule priority",
        variant: "destructive"
      });
    }
  };

  const getRuleTypeInfo = (type: string) => {
    return RULE_TYPES.find(t => t.value === type) || RULE_TYPES[0];
  };

  const renderConditionsEditor = (
    rule: Partial<AssignmentRule>, 
    updateConditions: (conditions: any) => void,
    parsingState?: {
      naturalLanguageInput: string;
      setNaturalLanguageInput: (value: string) => void;
      parseNaturalLanguage: () => void;
      isParsing: boolean;
    }
  ) => {
    const conditions = rule.conditions || {};

    switch (rule.rule_type) {
      case 'GEO_FIRST':
        return (
          <Alert>
            <Map className="h-4 w-4" />
            <AlertDescription>
              Geographic assignment uses territory mappings configured in the "Territories" tab.
              Click the "Territory Mappings" button to map account territories to rep regions.
            </AlertDescription>
          </Alert>
        );

      case 'CONTINUITY':
        return (
          <Alert>
            <Users className="h-4 w-4" />
            <AlertDescription>
              Continuity rule gives bonus points to keep accounts with their current owner.
              No additional configuration needed - adjust scoring weights above.
            </AlertDescription>
          </Alert>
        );

      case 'SMART_BALANCE':
        return (
          <Alert>
            <Target className="h-4 w-4" />
            <AlertDescription>
              Balance rule favors under-utilized reps. Target ARR is calculated from total accounts and active reps.
              No additional configuration needed - adjust scoring weights above.
            </AlertDescription>
          </Alert>
        );

      case 'TIER_BALANCE':
        return (
          <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Hardcoded Logic</AlertTitle>
            <AlertDescription>
              <div className="space-y-2 mt-2">
                <p><strong>Tier 1 + Strategic Rep:</strong> 60 points</p>
                <p><strong>Tier 3/4 + Non-Strategic Rep:</strong> 40 points</p>
                <p><strong>Other combinations:</strong> 20 points</p>
                <p className="text-xs mt-2 text-muted-foreground">
                  This logic is hardcoded in the engine and cannot be configured through the UI.
                </p>
              </div>
            </AlertDescription>
          </Alert>
        );
      
      case 'CRE_BALANCE':
        return (
          <Alert className="bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>CRE Distribution (Max 3 per Rep)</AlertTitle>
            <AlertDescription>
              <div className="space-y-2 mt-2">
                <p>CRE (Customer Risk Escalation) accounts are high-risk and capped at <strong>3 per rep</strong>.</p>
                <p>The engine automatically blocks assignment if a rep is at max CRE capacity.</p>
                <p className="text-xs mt-2 text-muted-foreground">
                  Max CRE limit is hardcoded to 3 and cannot be changed through the UI.
                </p>
              </div>
            </AlertDescription>
          </Alert>
        );

      default:
        return null;
    }
  };

  const RuleDialog = ({ rule, onSave, onClose, onRuleChange }: { 
    rule: Partial<AssignmentRule>, 
    onSave: (rule: Partial<AssignmentRule>) => void,
    onClose: () => void,
    onRuleChange?: (rule: Partial<AssignmentRule>) => void
  }) => {
    const [localRule, setLocalRule] = useState<Partial<AssignmentRule>>({
      ...rule
    });
    const [naturalLanguageInput, setNaturalLanguageInput] = useState('');
    const [isParsing, setIsParsing] = useState(false);

    const parseNaturalLanguage = async () => {
      if (!naturalLanguageInput.trim()) {
        toast({
          title: "Input Required",
          description: "Please describe your balancing goals",
          variant: "destructive",
        });
        return;
      }

      setIsParsing(true);
      try {
        const { data, error } = await supabase.functions.invoke('parse-ai-balancer-config', {
          body: { naturalLanguageInput }
        });

        if (error) throw error;

        if (data?.error) {
          toast({
            title: "Parsing Failed",
            description: data.error,
            variant: "destructive",
          });
          return;
        }

        if (data?.success && data?.config) {
          console.log('🔍 Parsed config from AI:', data.config);
          
          // Create fresh conditions object to force React re-render
          const newConditions = {
            minARRThreshold: data.config.minARRThreshold ?? 1000000,
            maxARRThreshold: data.config.maxARRThreshold ?? 3000000,
            mustStayInRegion: data.config.mustStayInRegion ?? true,
            maintainContinuity: data.config.maintainContinuity ?? true,
            maxMovesPerRep: data.config.maxMovesPerRep ?? 5,
            maxTotalMoves: data.config.maxTotalMoves ?? 20,
          };
          
          console.log('🔍 New conditions being set:', newConditions);
          
          // Use functional update to ensure React detects the change
          setLocalRule(prevRule => {
            const updatedRule = {
              ...prevRule,
              conditions: newConditions,
              description: data.originalInput || prevRule.description,
            };
            
            // Sync with parent immediately
            if (onRuleChange) {
              onRuleChange(updatedRule);
            }
            
            return updatedRule;
          });

          toast({
            title: "Configuration Parsed ✨",
            description: "Review the auto-populated fields below",
          });
          
          setNaturalLanguageInput('');
        }
      } catch (error: any) {
        console.error('Error parsing natural language:', error);
        toast({
          title: "Parsing Error",
          description: error.message || "Failed to parse your request",
          variant: "destructive",
        });
      } finally {
        setIsParsing(false);
      }
    };

    return (
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {rule.id ? 'Edit Assignment Rule' : 'Create New Assignment Rule'}
          </DialogTitle>
          <DialogDescription>
            Configure assignment rules to control how accounts are distributed to sales representatives
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Rule Information */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Rule Name</Label>
              <Input
                value={localRule.name || ''}
                onChange={(e) => setLocalRule({ ...localRule, name: e.target.value })}
                placeholder="Enter rule name"
              />
            </div>
            <div>
              <Label>Rule Type</Label>
              <Select 
                value={localRule.rule_type}
                onValueChange={(value) => {
                  if (value !== localRule.rule_type) {
                    setLocalRule({ ...localRule, rule_type: value, conditions: {} });
                  } else {
                    setLocalRule({ ...localRule, rule_type: value });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RULE_TYPES.map(type => {
                    const Icon = type.icon;
                    return (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {type.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Priority</Label>
              <Input
                type="number"
                value={localRule.priority || 1}
                onChange={(e) => setLocalRule({ ...localRule, priority: parseInt(e.target.value) })}
              />
            </div>
            <div>
              <Label>Account Scope</Label>
              <Select 
                value={localRule.account_scope}
                onValueChange={(value) => setLocalRule({ ...localRule, account_scope: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Accounts</SelectItem>
                  <SelectItem value="customers">Customers Only</SelectItem>
                  <SelectItem value="prospects">Prospects Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2 pt-6">
              <Switch
                checked={localRule.enabled !== false}
                onCheckedChange={(checked) => setLocalRule({ ...localRule, enabled: checked })}
              />
              <Label>Enabled</Label>
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={localRule.description || ''}
              onChange={(e) => setLocalRule({ ...localRule, description: e.target.value })}
              placeholder="Optional description of what this rule does"
            />
          </div>

          <Separator />

          {/* Scoring Weights Editor */}
          {['GEO_FIRST', 'CONTINUITY', 'SMART_BALANCE', 'TIER_BALANCE', 'CRE_BALANCE'].includes(localRule.rule_type) && (
            <>
              <ScoringWeightsEditor
                ruleType={localRule.rule_type}
                weights={localRule.scoring_weights || {}}
                onChange={(weights) => setLocalRule({ ...localRule, scoring_weights: weights })}
              />
              <Separator />
            </>
          )}

          {/* Rule-Specific Conditions */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Rule Configuration</h3>
            {renderConditionsEditor(
              localRule, 
              (conditions) => setLocalRule({ ...localRule, conditions }),
              {
                naturalLanguageInput,
                setNaturalLanguageInput,
                parseNaturalLanguage,
                isParsing
              }
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button 
            onClick={() => onSave(localRule)}
            disabled={!localRule.name || !localRule.rule_type}
          >
            {rule.id ? 'Update Rule' : 'Create Rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8">Loading rules...</div>;
  }

  // STANDARD MULTI-RULE UI

  // STANDARD MULTI-RULE UI
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Assignment Rules
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Configure assignment rules for account distribution and balancing
            </p>
          </div>
          <div>
            <Dialog open={showNewRuleDialog} onOpenChange={setShowNewRuleDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Rule
                </Button>
              </DialogTrigger>
              <RuleDialog 
                rule={newRule} 
                onSave={saveRule}
                onClose={() => setShowNewRuleDialog(false)}
                onRuleChange={(updatedRule) => setNewRule(updatedRule)}
              />
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {rules.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No assignment rules configured. Create your first rule to enable sophisticated assignment logic.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            {rules.map((rule) => {
              const ruleType = getRuleTypeInfo(rule.rule_type);
              const Icon = ruleType.icon;
              
              return (
                <Card key={rule.id} className={rule.enabled ? 'border-green-200' : 'border-gray-200'}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded ${rule.enabled ? 'bg-green-100' : 'bg-gray-100'}`}>
                          <Icon className={`h-4 w-4 ${rule.enabled ? 'text-green-600' : 'text-gray-500'}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{rule.name}</h3>
                            <div className="flex items-center gap-1">
                              <Badge variant="outline">Priority {rule.priority}</Badge>
                              <div className="flex flex-col">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-4 w-4 p-0 hover:bg-accent"
                                  onClick={() => movePriorityUp(rule)}
                                  disabled={rule.priority <= 1}
                                  title="Move up in priority"
                                >
                                  <ChevronUp className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-4 w-4 p-0 hover:bg-accent"
                                  onClick={() => movePriorityDown(rule)}
                                  disabled={rule.priority >= Math.max(...rules.map(r => r.priority))}
                                  title="Move down in priority"
                                >
                                  <ChevronDown className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <Badge variant={rule.account_scope === 'all' ? 'default' : 'secondary'}>
                              {rule.account_scope}
                            </Badge>
                            {getRuleValidationBadge(rule)}
                            {!rule.enabled && <Badge variant="destructive">Disabled</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {rule.description || ruleType.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={rule.enabled}
                          onCheckedChange={(checked) => toggleRuleEnabled(rule.id!, checked)}
                        />
                        {['GEO_FIRST'].includes(rule.rule_type) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openFieldMapper(rule)}
                          >
                            <Settings className="h-4 w-4 mr-1" />
                            Territory Mappings
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingRule(rule)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteRule(rule.id!)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {editingRule && (
          <Dialog open={!!editingRule} onOpenChange={() => setEditingRule(null)}>
            <RuleDialog 
              rule={editingRule} 
              onSave={saveRule}
              onClose={() => setEditingRule(null)}
              onRuleChange={(updatedRule) => setEditingRule(updatedRule as AssignmentRule)}
            />
          </Dialog>
        )}

        {/* Field Mapper Dialog */}
        {fieldMapperRule && (
          <RuleFieldMapper
            open={showFieldMapper}
            onClose={() => {
              setShowFieldMapper(false);
              setFieldMapperRule(null);
            }}
            ruleType={fieldMapperRule.rule_type}
            buildId={buildId}
            currentConditions={fieldMapperRule.conditions}
            onSave={handleFieldMappingSave}
          />
        )}
      </CardContent>
    </Card>
  );
};