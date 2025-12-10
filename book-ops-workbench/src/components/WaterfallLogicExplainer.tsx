import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Info, Settings, CheckCircle, AlertTriangle, TrendingDown, Users, MapPin, Zap, Shield, Lock, Scale, Building2 } from 'lucide-react';
import { PriorityConfig, getPriorityById, PriorityDefinition } from '@/config/priorityRegistry';

interface WaterfallLogicExplainerProps {
  buildId: string;
  priorityConfig: PriorityConfig[];
  assignmentMode: string;
  onConfigureClick?: () => void;
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
    case 'geo_and_continuity':
      return <CheckCircle className={className} />;
    case 'pe_firm':
      return <Building2 className={className} />;
    case 'top_10_percent':
      return <TrendingDown className={className} />;
    case 'cre_risk':
      return <AlertTriangle className={className} />;
    case 'rs_routing':
      return <Users className={className} />;
    case 'geography':
    case 'sub_region':
      return <MapPin className={className} />;
    case 'continuity':
      return <CheckCircle className={className} />;
    case 'renewal_balance':
      return <Scale className={className} />;
    case 'arr_balance':
      return <Scale className={className} />;
    default:
      return <Shield className={className} />;
  }
}

// Get detailed description for a priority
function getPriorityDetails(priorityId: string): { bullets: string[]; result: string } {
  switch (priorityId) {
    case 'manual_holdover':
      return {
        bullets: [
          'Accounts marked "exclude from reassignment"',
          'Always stays with current owner regardless of other factors'
        ],
        result: 'Protected accounts never move'
      };
    case 'geo_and_continuity':
      return {
        bullets: [
          'Current owner is in the same geography as the account',
          'Rep has capacity (hasn\'t reached capacity limit)'
        ],
        result: 'Account stays with current owner - no disruption'
      };
    case 'pe_firm':
      return {
        bullets: [
          'Account is owned by a Private Equity firm',
          'Stays with designated AE, never routed to Renewal Specialists'
        ],
        result: 'PE-owned accounts stay protected'
      };
    case 'top_10_percent':
      return {
        bullets: [
          'Account is in top 10% by ARR (calculated at runtime)',
          'Not routed to Renewal Specialists'
        ],
        result: 'Top performers stay with experienced AEs'
      };
    case 'cre_risk':
      return {
        bullets: [
          'Account flagged as CRE (at-risk)',
          'Requires experienced owner to manage risk'
        ],
        result: 'At-risk accounts stay with current owner'
      };
    case 'rs_routing':
      return {
        bullets: [
          'Account ARR is at or below RS threshold (default $25K)',
          'Routed to Renewal Specialist reps for handling'
        ],
        result: 'Low-ARR accounts go to Renewal Specialists'
      };
    case 'geography':
      return {
        bullets: [
          'Matches account territory to rep region',
          'Has most available capacity among geographic matches'
        ],
        result: 'Account assigned to best rep in home region'
      };
    case 'sub_region':
      return {
        bullets: [
          'Routes to EMEA sub-regions: DACH, UKI, Nordics, France, Benelux, Middle East',
          'Based on account HQ country'
        ],
        result: 'EMEA accounts go to correct sub-region team'
      };
    case 'continuity':
      return {
        bullets: [
          'Prefer keeping accounts with current owner when balanced',
          'Maintains relationship even if geography doesn\'t match'
        ],
        result: 'Account stays with familiar owner'
      };
    case 'renewal_balance':
      return {
        bullets: [
          'Distribute renewals evenly across Q1/Q2/Q3/Q4 per rep',
          'Prevents renewal overload in any single quarter'
        ],
        result: 'Even quarterly workload distribution'
      };
    case 'arr_balance':
      return {
        bullets: [
          'Even distribution of ARR across all reps',
          'Targets configured capacity per rep'
        ],
        result: 'Balanced ARR workload across team'
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
  onConfigureClick 
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
          {/* Strategic Accounts - Always shown */}
          <div className="flex gap-4 p-4 bg-purple-50 dark:bg-purple-950 rounded-lg border-2 border-purple-500 dark:border-purple-700">
            <div className="flex-shrink-0">
              <Badge className="bg-purple-600 text-white">Strategic Pool</Badge>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-purple-600" />
                <h4 className="font-semibold">Strategic Accounts - Always Stay Together</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Strategic accounts (currently owned by strategic reps) have special handling:
              </p>
              <ul className="text-sm space-y-1 ml-4 list-disc text-muted-foreground">
                <li><strong>Always stay with strategic reps</strong> - never overflow to normal reps</li>
                <li><strong>No capacity limits</strong> - strategic reps share the load evenly</li>
                <li><strong>Even distribution</strong> - assigned to strategic rep with least load</li>
              </ul>
            </div>
          </div>

          <div className="border-t pt-6">
            <h3 className="font-semibold mb-4 text-sm text-muted-foreground">NORMAL ACCOUNTS - PRIORITY WATERFALL</h3>
          </div>

          {/* Holdover Priorities Section */}
          {holdoverPriorities.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">HOLDOVER PRIORITIES (Filter Before Optimization)</span>
              </div>
              {holdoverPriorities.map((priority, index) => {
                const colors = PRIORITY_COLORS[index % PRIORITY_COLORS.length];
                const details = getPriorityDetails(priority.config.id);
                
                return (
                  <div 
                    key={priority.config.id}
                    className={`flex gap-4 p-4 ${colors.bg} rounded-lg border ${colors.border}`}
                  >
                    <div className="flex-shrink-0">
                      <Badge className={`${colors.badge} text-white`}>
                        {priority.definition?.isLocked ? '🔒' : ''} P{index + 1}
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

          {/* Optimization Priorities Section */}
          {optimizationPriorities.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-2 mt-6">
                <Scale className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">OPTIMIZATION PRIORITIES (HiGHS Solver Weights)</span>
              </div>
              {optimizationPriorities.map((priority, index) => {
                const colorIndex = (holdoverPriorities.length + index) % PRIORITY_COLORS.length;
                const colors = PRIORITY_COLORS[colorIndex];
                const details = getPriorityDetails(priority.config.id);
                const priorityNumber = holdoverPriorities.length + index + 1;
                
                return (
                  <div 
                    key={priority.config.id}
                    className={`flex gap-4 p-4 ${colors.bg} rounded-lg border ${colors.border}`}
                  >
                    <div className="flex-shrink-0">
                      <Badge className={`${colors.badge} text-white`}>P{priorityNumber}</Badge>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getPriorityIcon(priority.config.id, `w-5 h-5 ${colors.icon}`)}
                        <h4 className="font-semibold">{priority.definition?.name}</h4>
                        <Badge variant="outline" className="text-xs">Optimize</Badge>
                        <Badge variant="secondary" className="text-xs">Weight: {priority.config.weight}</Badge>
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

      {/* Global Constraints */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Global Constraints (Always Enforced)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800">
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-red-600" />
                Capacity Hard Cap
              </h4>
              <p className="text-sm text-muted-foreground">
                No rep can exceed: <strong>Maximum ARR</strong> (configured limit)
              </p>
            </div>

            <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800">
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                CRE Hard Cap
              </h4>
              <p className="text-sm text-muted-foreground">
                Maximum CRE (at-risk) accounts per rep (configurable)
              </p>
            </div>

            <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg border-2 border-purple-500 dark:border-purple-700">
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-600" />
                Strategic Pool - Always Together
              </h4>
              <p className="text-sm text-muted-foreground">
                Strategic accounts <strong>always</strong> stay with strategic reps
              </p>
            </div>

            <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg border border-purple-200 dark:border-purple-800">
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-purple-600" />
                Parent-Child Alignment
              </h4>
              <p className="text-sm text-muted-foreground">
                Parent and child accounts keep same owner
              </p>
            </div>
          </div>
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
