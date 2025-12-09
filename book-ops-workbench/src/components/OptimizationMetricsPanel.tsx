import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { 
  TrendingUp, 
  MapPin, 
  Users, 
  Target, 
  ChevronDown,
  AlertTriangle,
  CheckCircle,
  BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OptimizationMetrics {
  // Primary metrics
  arrBalanceScore: number;      // 100 - (CV of rep ARR * 100), higher = better
  geoAlignmentPct: number;      // % accounts in correct region
  continuityPct: number;        // % accounts with same owner
  p1Rate: number;               // % assigned at P1 (continuity+geo)
  
  // Secondary metrics
  p2Rate: number;               // % assigned at P2 (geo match)
  p3bRate: number;              // % assigned at P3b (continuity any-geo)
  p4Rate: number;               // % assigned at P4 (fallback)
  repsInBand: number;           // count of reps within variance band
  repsOverMax: number;          // count of reps over preferred max
  repsTotal: number;            // total reps
  crossRegionCount: number;     // count of cross-region assignments
  creVariance: number;          // CV of CRE distribution
  
  // ARR stats
  avgArrPerRep: number;
  minArrPerRep: number;
  maxArrPerRep: number;
  targetArr: number;
  
  // Totals
  totalAccounts: number;
  totalCustomerArr: number;
}

interface OptimizationMetricsPanelProps {
  metrics: OptimizationMetrics;
  previousMetrics?: OptimizationMetrics | null;
  isLoading?: boolean;
  title?: string;
}

const formatCurrency = (value: number): string => {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
};

const formatPercent = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

const getScoreColor = (score: number, thresholds: { good: number; warning: number }): string => {
  if (score >= thresholds.good) return 'text-green-600 dark:text-green-400';
  if (score >= thresholds.warning) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
};

const getDeltaIndicator = (current: number, previous: number | undefined): React.ReactNode => {
  if (previous === undefined) return null;
  const delta = current - previous;
  if (Math.abs(delta) < 0.1) return null;
  
  const isPositive = delta > 0;
  return (
    <span className={cn(
      'text-xs ml-2',
      isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
    )}>
      {isPositive ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}
    </span>
  );
};

export const OptimizationMetricsPanel: React.FC<OptimizationMetricsPanelProps> = ({
  metrics,
  previousMetrics,
  isLoading = false,
  title = 'Optimization Metrics'
}) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  const priorityBreakdown = useMemo(() => {
    return [
      { label: 'P1 (Continuity + Geo)', value: metrics.p1Rate, color: 'bg-green-500' },
      { label: 'P2 (Geo Match)', value: metrics.p2Rate, color: 'bg-blue-500' },
      { label: 'P3b (Continuity)', value: metrics.p3bRate, color: 'bg-amber-500' },
      { label: 'P4 (Fallback)', value: metrics.p4Rate, color: 'bg-red-500' },
    ];
  }, [metrics]);

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader>
          <div className="h-6 w-48 bg-muted rounded" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-elevated">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              {title}
            </CardTitle>
            <CardDescription>
              Key performance indicators for territory assignment quality
            </CardDescription>
          </div>
          {previousMetrics && (
            <Badge variant="outline" className="text-xs">
              Comparing to previous run
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Primary Metrics - 4 Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* ARR Balance Score */}
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">ARR Balance</span>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className={cn(
                  'text-2xl font-bold',
                  getScoreColor(metrics.arrBalanceScore, { good: 80, warning: 60 })
                )}>
                  {metrics.arrBalanceScore.toFixed(0)}
                </span>
                <span className="text-sm text-muted-foreground">/100</span>
                {getDeltaIndicator(metrics.arrBalanceScore, previousMetrics?.arrBalanceScore)}
              </div>
              <Progress 
                value={metrics.arrBalanceScore} 
                className="h-1.5 mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Higher = more evenly distributed
              </p>
            </CardContent>
          </Card>

          {/* Geographic Alignment */}
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Geo Alignment</span>
                <MapPin className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className={cn(
                  'text-2xl font-bold',
                  getScoreColor(metrics.geoAlignmentPct, { good: 85, warning: 70 })
                )}>
                  {formatPercent(metrics.geoAlignmentPct)}
                </span>
                {getDeltaIndicator(metrics.geoAlignmentPct, previousMetrics?.geoAlignmentPct)}
              </div>
              <Progress 
                value={metrics.geoAlignmentPct} 
                className="h-1.5 mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Accounts in correct region
              </p>
            </CardContent>
          </Card>

          {/* Continuity Rate */}
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Continuity</span>
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className={cn(
                  'text-2xl font-bold',
                  getScoreColor(metrics.continuityPct, { good: 50, warning: 30 })
                )}>
                  {formatPercent(metrics.continuityPct)}
                </span>
                {getDeltaIndicator(metrics.continuityPct, previousMetrics?.continuityPct)}
              </div>
              <Progress 
                value={metrics.continuityPct} 
                className="h-1.5 mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Accounts with same owner
              </p>
            </CardContent>
          </Card>

          {/* P1 Rate */}
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">P1 Quality</span>
                <Target className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className={cn(
                  'text-2xl font-bold',
                  getScoreColor(metrics.p1Rate, { good: 40, warning: 25 })
                )}>
                  {formatPercent(metrics.p1Rate)}
                </span>
                {getDeltaIndicator(metrics.p1Rate, previousMetrics?.p1Rate)}
              </div>
              <Progress 
                value={metrics.p1Rate} 
                className="h-1.5 mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Best quality assignments
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Priority Breakdown Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Priority Distribution</span>
            <span className="text-muted-foreground">{metrics.totalAccounts} accounts</span>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden">
            {priorityBreakdown.map((item, idx) => (
              <div
                key={idx}
                className={cn(item.color, 'transition-all')}
                style={{ width: `${item.value}%` }}
                title={`${item.label}: ${item.value.toFixed(1)}%`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {priorityBreakdown.map((item, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <div className={cn('w-2 h-2 rounded-full', item.color)} />
                <span className="text-muted-foreground">{item.label}:</span>
                <span className="font-medium">{item.value.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Secondary Metrics - Collapsible */}
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between">
              <span className="text-sm">Additional Metrics</span>
              <ChevronDown className={cn(
                'h-4 w-4 transition-transform',
                isExpanded && 'rotate-180'
              )} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {/* Rep Capacity Stats */}
              <div className="space-y-1">
                <span className="text-muted-foreground">Reps in Band</span>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="font-medium">
                    {metrics.repsInBand} / {metrics.repsTotal}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground">Reps Over Max</span>
                <div className="flex items-center gap-2">
                  {metrics.repsOverMax > 0 ? (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                  <span className="font-medium">{metrics.repsOverMax}</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground">Cross-Region</span>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{metrics.crossRegionCount} accounts</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground">CRE Variance</span>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'font-medium',
                    metrics.creVariance > 50 ? 'text-amber-600' : 'text-green-600'
                  )}>
                    {metrics.creVariance.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* ARR Stats */}
              <div className="col-span-2 md:col-span-4 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">ARR per Rep</span>
                  <div className="flex items-center gap-4">
                    <span className="text-xs">
                      Min: <span className="font-medium">{formatCurrency(metrics.minArrPerRep)}</span>
                    </span>
                    <span className="text-xs">
                      Avg: <span className="font-medium">{formatCurrency(metrics.avgArrPerRep)}</span>
                    </span>
                    <span className="text-xs">
                      Max: <span className="font-medium">{formatCurrency(metrics.maxArrPerRep)}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      (Target: {formatCurrency(metrics.targetArr)})
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
};

export default OptimizationMetricsPanel;

