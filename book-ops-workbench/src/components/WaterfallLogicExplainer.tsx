import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Info, Settings, CheckCircle, AlertTriangle, TrendingDown, Users, MapPin, Zap, Target, Scale } from 'lucide-react';

interface WaterfallLogicExplainerProps {
  buildId: string;
  onConfigureClick?: () => void;
}

export const WaterfallLogicExplainer: React.FC<WaterfallLogicExplainerProps> = ({ buildId, onConfigureClick }) => {

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                Waterfall Assignment Logic
              </CardTitle>
              <CardDescription className="mt-2">
                Simple, predictable 3-priority system with hard capacity constraints
              </CardDescription>
            </div>
            <Button onClick={onConfigureClick}>
              <Settings className="w-4 h-4 mr-2" />
              Configure Settings
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
          {/* Strategic Accounts - Special Handling */}
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
                <li>Priority: Current owner first, then even split across strategic rep pool</li>
              </ul>
              <Alert className="mt-3 bg-purple-100 dark:bg-purple-900/30 border-purple-300">
                <AlertDescription className="text-sm">
                  <strong>Point blank period:</strong> Strategic reps handle their accounts together, 
                  splitting the load evenly even if overloaded. No strategic account ever goes to a normal rep.
                </AlertDescription>
              </Alert>
            </div>
          </div>

          <div className="border-t pt-6">
            <h3 className="font-semibold mb-4 text-sm text-muted-foreground">NORMAL ACCOUNTS (Non-Strategic)</h3>
          </div>

          {/* Priority 1 */}
          <div className="flex gap-4 p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex-shrink-0">
              <Badge className="bg-green-600 text-white">Priority 1</Badge>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <h4 className="font-semibold">Account Continuity + Geography Match</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Keep the account with its current owner if:
              </p>
              <ul className="text-sm space-y-1 ml-4 list-disc text-muted-foreground">
                <li>Same geography/region as the account</li>
                <li>Rep has capacity (hasn't reached capacity limit)</li>
              </ul>
              <p className="text-sm font-medium text-green-700 dark:text-green-400 mt-2">
                Result: Account stays with current owner - no disruption
              </p>
            </div>
          </div>

          {/* Priority 2 */}
          <div className="flex gap-4 p-4 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
            <div className="flex-shrink-0">
              <Badge className="bg-amber-600 text-white">Priority 2</Badge>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-5 h-5 text-amber-600" />
                <h4 className="font-semibold">Geography Match</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Assign to any rep in the same geography with most available capacity:
              </p>
              <ul className="text-sm space-y-1 ml-4 list-disc text-muted-foreground">
                <li>Matches account's sales territory/region</li>
                <li>Has most available capacity among geographic matches</li>
                <li>Respects strategic vs normal pool separation</li>
              </ul>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mt-2">
                Result: Account assigned to best available rep in home region
              </p>
            </div>
          </div>

          {/* Priority 3 */}
          <div className="flex gap-4 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex-shrink-0">
              <Badge className="bg-blue-600 text-white">Priority 3</Badge>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <h4 className="font-semibold">Current/Past Owner - Any Geography</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Go to current/past owner if they have capacity regardless of geography:
              </p>
              <ul className="text-sm space-y-1 ml-4 list-disc text-muted-foreground">
                <li>Prioritize account continuity with current owner</li>
                <li>Owner has available capacity (within limits)</li>
                <li>Geography match not required</li>
              </ul>
              <p className="text-sm font-medium text-blue-700 dark:text-blue-400 mt-2">
                Result: Account stays with familiar owner, even cross-region
              </p>
            </div>
          </div>

          {/* Priority 4 */}
          <div className="flex gap-4 p-4 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
            <div className="flex-shrink-0">
              <Badge className="bg-slate-600 text-white">Priority 4</Badge>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-slate-600" />
                <h4 className="font-semibold">Best Available</h4>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Assign to the rep with most available capacity:
              </p>
              <ul className="text-sm space-y-1 ml-4 list-disc text-muted-foreground">
                <li>Any rep (any region) with most available capacity</li>
                <li>Still respects capacity limits and CRE thresholds</li>
                <li>Generates cross-region warning for review</li>
              </ul>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-400 mt-2">
                Result: Account assigned to best available rep globally
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Balance Optimization Section - For Non-Strategic Accounts Only */}
      <Card className="border-purple-500/30">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-purple-600/20 border border-purple-500/30">
              <Target className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-purple-600" />
                Balance Optimization (Non-Strategic Accounts)
              </CardTitle>
              <CardDescription className="mt-1">
                After initial assignment using the 4 priorities above, the system performs a balance optimization pass 
                for normal (non-strategic) rep accounts to evenly distribute key workload metrics while respecting the priority rules.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg border border-purple-200 dark:border-purple-800">
            <h4 className="font-semibold mb-3 flex items-center gap-2 text-purple-900 dark:text-purple-100">
              <Scale className="h-4 w-4" />
              Balanced Distribution Metrics
            </h4>
            <p className="text-sm text-muted-foreground mb-3">
              The system monitors and balances these metrics across normal reps:
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-white dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700/30">
                <div className="font-semibold text-sm mb-1">CRE Count</div>
                <p className="text-xs text-muted-foreground">
                  At-risk customers requiring extra attention
                </p>
              </div>
              <div className="p-3 bg-white dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700/30">
                <div className="font-semibold text-sm mb-1">ATR (Available to Renew)</div>
                <p className="text-xs text-muted-foreground">
                  Accounts with renewal opportunities
                </p>
              </div>
              <div className="p-3 bg-white dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700/30">
                <div className="font-semibold text-sm mb-1">Tier 1 Accounts</div>
                <p className="text-xs text-muted-foreground">
                  High-value strategic accounts
                </p>
              </div>
              <div className="p-3 bg-white dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700/30">
                <div className="font-semibold text-sm mb-1">Tier 2 Accounts</div>
                <p className="text-xs text-muted-foreground">
                  Growth potential accounts
                </p>
              </div>
              <div className="p-3 bg-white dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700/30 col-span-2">
                <div className="font-semibold text-sm mb-1">Quarterly Renewals (Q1-Q4)</div>
                <p className="text-xs text-muted-foreground">
                  Distributes renewal timing across quarters to prevent overload
                </p>
              </div>
            </div>
          </div>
          
          <div className="p-4 bg-purple-100 dark:bg-purple-900/30 rounded-lg border border-purple-300 dark:border-purple-700">
            <p className="text-sm font-medium mb-2 text-purple-900 dark:text-purple-100">
              How Balance Optimization Works:
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-purple-600 dark:text-purple-400 font-bold mt-0.5">1.</span>
                <span>System calculates ideal targets based on total accounts divided by normal rep count</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 dark:text-purple-400 font-bold mt-0.5">2.</span>
                <span>During assignment, monitors each rep's current balance against targets</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 dark:text-purple-400 font-bold mt-0.5">3.</span>
                <span>When multiple reps qualify (same priority level), selects rep furthest below target</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 dark:text-purple-400 font-bold mt-0.5">4.</span>
                <span><strong>Still respects all 4 priority rules and capacity limits above</strong></span>
              </li>
            </ul>
          </div>

          <Alert className="bg-purple-50 dark:bg-purple-950 border-purple-300 dark:border-purple-700">
            <Target className="h-4 w-4 text-purple-600" />
            <AlertDescription className="text-sm">
              <strong>Important:</strong> Balance optimization is a tie-breaker, not a rule override. 
              If Priority 1 says "keep with current owner", balance optimization won't move the account. 
              It only helps distribute accounts fairly when multiple reps are equally qualified at the same priority level.
            </AlertDescription>
          </Alert>
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
              <p className="text-xs text-muted-foreground mt-2">
                Example: If max is set to $3M, no rep will be assigned accounts that would push them over $3M.
                The target ARR ($2M) is used for ideal distribution, but the max ARR is the hard cap.
              </p>
            </div>

            <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800">
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                CRE Hard Cap
              </h4>
              <p className="text-sm text-muted-foreground">
                Maximum CRE (at-risk) accounts per rep
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Configurable (default: 3 CRE accounts max)
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
              <p className="text-xs text-muted-foreground mt-2 font-semibold">
                No capacity limits - evenly distributed across strategic reps even if overloaded
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
              <p className="text-xs text-muted-foreground mt-2">
                Enforced after initial assignment pass
              </p>
            </div>
          </div>
          
          <Alert className="mt-4">
            <Info className="h-4 w-4" />
            <AlertDescription>
              <p className="font-medium mb-1">Territory Mapping:</p>
              <p className="text-sm">
                Account territories are mapped to rep regions using your configured territory mappings.
                Go to <strong>Territory Mapping Interface</strong> to view and customize these mappings.
              </p>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Warning System */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5" />
            Warning System
          </CardTitle>
          <CardDescription>
            Post-assignment warnings flag potential issues (not blockers)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
              <Badge variant="outline" className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
                High
              </Badge>
              <div className="flex-1">
                <p className="font-medium text-sm">CRE Risk, Strategic Overflow, Unassigned</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Critical issues requiring immediate attention
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
              <Badge variant="outline" className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                Medium
              </Badge>
              <div className="flex-1">
                <p className="font-medium text-sm">Continuity Broken, Tier 1 Concentration</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Changes worth reviewing but assignments are valid
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
              <Badge variant="outline" className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
                Low
              </Badge>
              <div className="flex-1">
                <p className="font-medium text-sm">Cross-Region, Tier 2 Concentration</p>
                <p className="text-xs text-muted-foreground mt-1">
                  FYI warnings for awareness, no action required
                </p>
              </div>
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
              <p className="font-medium mb-1">Configuration Required</p>
              <p className="text-sm">
                Set target ARR, capacity variance, and risk thresholds before generating assignments
              </p>
            </div>
            <Button onClick={onConfigureClick} variant="outline">
              Configure Now
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      {/* What Changed */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-base">What Changed from the Old System?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-semibold text-red-600 dark:text-red-400 mb-2">❌ Removed:</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Complex multi-rule scoring system</li>
                <li>• Rule priority ordering</li>
                <li>• Dynamic target calculation</li>
                <li>• Rule weights and scoring</li>
                <li>• Soft ARR caps (ignored)</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-green-600 dark:text-green-400 mb-2">✅ Added:</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Simple 3-priority waterfall</li>
                <li>• Hard capacity constraints</li>
                <li>• Capacity variance % control</li>
                <li>• Comprehensive warning system</li>
                <li>• Strategic pool overflow handling</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
