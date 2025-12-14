import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Info, Settings, CheckCircle, AlertTriangle, Users, MapPin, Zap, Shield, Lock, Scale, Building2, Clock, RefreshCw, Briefcase, Target } from 'lucide-react';
import { PriorityConfig, getPriorityById, PriorityDefinition, SubCondition, getAvailableSubConditions } from '@/config/priorityRegistry';

interface MappedFields {
  accounts: Set<string>;
  sales_reps: Set<string>;
  opportunities: Set<string>;
}

interface WaterfallLogicExplainerProps {
  buildId: string;
  priorityConfig: PriorityConfig[];
  assignmentMode: string;
  onConfigureClick?: () => void;
  mappedFields?: MappedFields;
}

// Color schemes for priority cards
const PRIORITY_COLORS = [
  { bg: 'bg-green-50 dark:bg-green-950', border: 'border-green-200 dark:border-green-800', badge: 'bg-green-600', text: 'text-green-700 dark:text-green-400', icon: 'text-green-600' },
  { bg: 'bg-amber-50 dark:bg-amber-950', border: 'border-amber-200 dark:border-amber-800', badge: 'bg-amber-600', text: 'text-amber-700 dark:text-amber-400', icon: 'text-amber-600' },
  { bg: 'bg-blue-50 dark:bg-blue-950', border: 'border-blue-200 dark:border-blue-800', badge: 'bg-blue-600', text: 'text-blue-700 dark:text-blue-400', icon: 'text-blue-600' },
  { bg: 'bg-purple-50 dark:bg-purple-950', border: 'border-purple-200 dark:border-purple-800', badge: 'bg-purple-600', text: 'text-purple-700 dark:text-purple-400', icon: 'text-purple-600' },
  { bg: 'bg-slate-50 dark:bg-slate-950', border: 'border-slate-200 dark:border-slate-800', badge: 'bg-slate-600', text: 'text-slate-700 dark:text-slate-400', icon: 'text-slate-600' },
  { bg: 'bg-cyan-50 dark:bg-cyan-950', border: 'border-cyan-200 dark:border-cyan-800', badge: 'bg-cyan-600', text: 'text-cyan-700 dark:text-cyan-400', icon: 'text-cyan-600' },
  { bg: 'bg-pink-50 dark:bg-pink-950', border: 'border-pink-200 dark:border-pink-800', badge: 'bg-pink-600', text: 'text-pink-700 dark:text-pink-400', icon: 'text-pink-600' },
  { bg: 'bg-indigo-50 dark:bg-indigo-950', border: 'border-indigo-200 dark:border-indigo-800', badge: 'bg-indigo-600', text: 'text-indigo-700 dark:text-indigo-400', icon: 'text-indigo-600' },
];

// Get icon for a priority
function getPriorityIcon(priorityId: string, className: string) {
  switch (priorityId) {
    case 'manual_holdover':
      return <Lock className={className} />;
    case 'sales_tools_bucket':
      return <Briefcase className={className} />;
    case 'stability_accounts':
      return <Shield className={className} />;
    case 'team_alignment':
      return <Target className={className} />;
    case 'geo_and_continuity':
      return <CheckCircle className={className} />;
    case 'geography':
      return <MapPin className={className} />;
    case 'continuity':
      return <CheckCircle className={className} />;
    case 'arr_balance':
      return <Zap className={className} />;
    default:
      return <Shield className={className} />;
  }
}

// Get icon for a sub-condition
function getSubConditionIcon(subConditionId: string, className: string) {
  switch (subConditionId) {
    case 'cre_risk':
      return <AlertTriangle className={className} />;
    case 'renewal_soon':
      return <Clock className={className} />;
    case 'pe_firm':
      return <Building2 className={className} />;
    case 'recent_owner_change':
      return <RefreshCw className={className} />;
    default:
      return <Shield className={className} />;
  }
}

// Get detailed description for a priority
function getPriorityDetails(priorityId: string, config?: PriorityConfig): { bullets: string[]; result: string } {
  switch (priorityId) {
    case 'manual_holdover':
      return {
        bullets: [
          'Excluded accounts: locked to current owner (no movement)',
          'Strategic accounts: stay within strategic rep pool (can rebalance between strategic reps)'
        ],
        result: 'Holdover accounts never move, strategic accounts stay with strategic reps'
      };
    case 'sales_tools_bucket':
      return {
        bullets: [
          'Customer accounts with ARR under $25K',
          'Routed to Sales Tools bucket (no SLM/FLM hierarchy)',
          'Does NOT apply to prospects'
        ],
        result: 'Low-value customers managed via Sales Tools system'
      };
    case 'stability_accounts':
      // Dynamic bullets based on enabled sub-conditions
      const enabledSubs = config?.subConditions?.filter(sc => sc.enabled).map(sc => sc.id) || [];
      const bullets: string[] = [];
      if (enabledSubs.includes('cre_risk')) bullets.push('CRE at-risk accounts stay with current owner');
      if (enabledSubs.includes('renewal_soon')) bullets.push('Accounts with renewal in 90 days stay');
      if (enabledSubs.includes('pe_firm')) bullets.push('PE-owned accounts stay with majority owner');
      if (enabledSubs.includes('recent_owner_change')) bullets.push('Recently changed accounts (90 days) stay');
      return {
        bullets: bullets.length > 0 ? bullets : ['Configure sub-conditions to define stability criteria'],
        result: 'Account stays if ANY enabled condition matches (unless rep at capacity)'
      };
    case 'team_alignment':
      const minPct = (config?.settings?.minTierMatchPct as number) ?? 80;
      return {
        bullets: [
          'Matches account employee count to rep team tier',
          'SMB: <100 | Growth: 100-499 | MM: 500-1499 | ENT: 1500+',
          `Reps must have ≥${minPct}% accounts matching their tier`,
          'Graduated penalties for mismatches'
        ],
        result: 'Account assigned to rep in appropriate team tier'
      };
    case 'geo_and_continuity':
      return {
        bullets: [
          'Current owner is in the same geography as the account',
          'Rep has capacity (hasn\'t reached capacity limit)'
        ],
        result: 'Account stays with current owner - no disruption'
      };
    case 'geography':
      return {
        bullets: [
          'Matches account territory to rep region',
          'Has most available capacity among geographic matches'
        ],
        result: 'Account assigned to best rep in home region'
      };
    case 'continuity':
      return {
        bullets: [
          'Prefer keeping accounts with current owner when balanced',
          'Maintains relationship even if geography doesn\'t match'
        ],
        result: 'Account stays with familiar owner'
      };
    case 'arr_balance':
      return {
        bullets: [
          'Final fallback for remaining accounts',
          'Uses weighted multi-metric optimization'
        ],
        result: 'Accounts distributed to balance ARR/ATR/Pipeline across reps'
      };
    default:
      return {
        bullets: ['Priority-based assignment logic'],
        result: 'Account assigned based on priority rules'
      };
  }
}

export const WaterfallLogicExplainer: React.FC<WaterfallLogicExplainerProps> = ({ 
  buildId, 
  priorityConfig,
  assignmentMode,
  onConfigureClick,
  mappedFields
}) => {
  // Get enabled priorities sorted by position
  const enabledPriorities = priorityConfig
    .filter(p => p.enabled)
    .sort((a, b) => a.position - b.position)
    .map(p => ({
      config: p,
      definition: getPriorityById(p.id)
    }))
    .filter(p => p.definition);

  // Split into holdovers and optimization
  const holdoverPriorities = enabledPriorities.filter(p => p.definition?.type === 'holdover');
  const optimizationPriorities = enabledPriorities.filter(p => p.definition?.type === 'optimization');

  const getModeLabel = (mode: string) => {
    switch (mode) {
      case 'ENT': return 'Enterprise';
      case 'COMMERCIAL': return 'Commercial';
      case 'EMEA': return 'EMEA';
      case 'CUSTOM': return 'Custom';
      default: return mode;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                Assignment Priority Waterfall
              </CardTitle>
              <CardDescription className="mt-2 flex items-center gap-2">
                <Badge variant="outline">{getModeLabel(assignmentMode)} Mode</Badge>
                <span>{enabledPriorities.length} priorities active</span>
              </CardDescription>
            </div>
            <Button onClick={onConfigureClick}>
              <Settings className="w-4 h-4 mr-2" />
              Configure Priorities
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5" />
            How Assignment Works
          </CardTitle>
          <CardDescription>
            The engine evaluates each account through these priorities in order
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Holdover Priorities Section */}
          {holdoverPriorities.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">HOLDOVER PRIORITIES (Filter Before Optimization)</span>
              </div>
              {holdoverPriorities.map((priority, index) => {
                const colors = PRIORITY_COLORS[index % PRIORITY_COLORS.length];
                const details = getPriorityDetails(priority.config.id, priority.config);
                const hasSubConditions = priority.definition?.subConditions && priority.definition.subConditions.length > 0;
                
                // Filter sub-conditions to only show those that are enabled AND have data available
                const { available: availableSubs } = priority.definition 
                  ? getAvailableSubConditions(priority.definition, mappedFields || { accounts: new Set(), sales_reps: new Set(), opportunities: new Set() })
                  : { available: [] };
                const enabledSubConditions = priority.config.subConditions?.filter(sc => 
                  sc.enabled && availableSubs.some(avail => avail.id === sc.id)
                ) || [];
                
                return (
                  <div 
                    key={priority.config.id}
                    className={`p-4 ${colors.bg} rounded-lg border ${colors.border}`}
                  >
                    <div className="flex gap-4">
                      <div className="flex-shrink-0">
                        <Badge className={`${colors.badge} text-white font-mono`}>
                          {priority.definition?.isLocked ? '🔒 ' : ''}P{index}
                        </Badge>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {getPriorityIcon(priority.config.id, `w-5 h-5 ${colors.icon}`)}
                          <h4 className="font-semibold">{priority.definition?.name}</h4>
                          <Badge variant="secondary" className="text-xs">Filter</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {priority.definition?.description}
                        </p>
                        
                        {/* Show sub-conditions for stability_accounts */}
                        {hasSubConditions && enabledSubConditions.length > 0 && (
                          <div className="mt-3 p-3 bg-background/50 rounded border">
                            <p className="text-xs font-medium text-muted-foreground mb-2">
                              Active sub-conditions ({enabledSubConditions.length}):
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              {priority.definition?.subConditions
                                ?.filter(sc => enabledSubConditions.find(e => e.id === sc.id))
                                .map(sc => (
                                  <div key={sc.id} className="flex items-center gap-2 text-sm">
                                    {getSubConditionIcon(sc.id, 'w-4 h-4 text-muted-foreground')}
                                    <span>{sc.name}</span>
                                  </div>
                                ))
                              }
                            </div>
                          </div>
                        )}
                        
                        <ul className="text-sm space-y-1 ml-4 list-disc text-muted-foreground mt-2">
                          {details.bullets.map((bullet, i) => (
                            <li key={i}>{bullet}</li>
                          ))}
                        </ul>
                        <p className={`text-sm font-medium ${colors.text} mt-2`}>
                          Result: {details.result}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* Optimization Priorities Section */}
          {optimizationPriorities.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-2 mt-6">
                <Scale className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">OPTIMIZATION PRIORITIES (Sequential Waterfall)</span>
              </div>
              {optimizationPriorities.map((priority, index) => {
                const colorIndex = (holdoverPriorities.length + index) % PRIORITY_COLORS.length;
                const colors = PRIORITY_COLORS[colorIndex];
                const details = getPriorityDetails(priority.config.id, priority.config);
                const priorityNumber = holdoverPriorities.length + index;
                // Residual Optimization (arr_balance) gets special "RO" badge instead of numbered priority
                const isResidualOptimization = priority.config.id === 'arr_balance';
                const badgeLabel = isResidualOptimization ? 'RO' : `P${priorityNumber}`;
                
                return (
                  <div 
                    key={priority.config.id}
                    className={`flex gap-4 p-4 ${colors.bg} rounded-lg border ${colors.border}`}
                  >
                    <div className="flex-shrink-0">
                      <Badge className={`${colors.badge} text-white font-mono`}>{badgeLabel}</Badge>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getPriorityIcon(priority.config.id, `w-5 h-5 ${colors.icon}`)}
                        <h4 className="font-semibold">{priority.definition?.name}</h4>
                        <Badge variant="outline" className="text-xs">{isResidualOptimization ? 'Final' : 'Optimize'}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {priority.definition?.description}
                      </p>
                      <ul className="text-sm space-y-1 ml-4 list-disc text-muted-foreground">
                        {details.bullets.map((bullet, i) => (
                          <li key={i}>{bullet}</li>
                        ))}
                      </ul>
                      <p className={`text-sm font-medium ${colors.text} mt-2`}>
                        Result: {details.result}
                      </p>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </CardContent>
      </Card>

      {/* Configuration */}
      <Alert>
        <Settings className="h-4 w-4" />
        <AlertDescription>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium mb-1">Priority Configuration</p>
              <p className="text-sm">
                Reorder, enable/disable priorities, or switch modes in the configuration panel
              </p>
            </div>
            <Button onClick={onConfigureClick} variant="outline">
              Configure Now
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
};
