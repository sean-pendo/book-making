import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowRight, AlertTriangle, TrendingUp, TrendingDown, Minus, BarChart3, DollarSign, Hash, RefreshCw } from 'lucide-react';
import { useMetricsComparison } from '@/hooks/useBuildData';
import { LPScoreCard, BeforeAfterBar, VarianceIndicator } from '@/components/analytics';
import type { LPSuccessMetrics } from '@/types/analytics';
import { cn } from '@/lib/utils';

interface BeforeAfterComparisonPanelProps {
  buildId: string;
}

type MetricToggle = 'arr' | 'atr' | 'accounts';

const LP_METRIC_LABELS: Record<keyof LPSuccessMetrics, string> = {
  balanceScore: 'Balance',
  continuityScore: 'Continuity',
  geographyScore: 'Geography',
  teamAlignmentScore: 'Team Fit',
  capacityUtilization: 'Capacity',
};

const LP_METRIC_DESCRIPTIONS: Record<keyof LPSuccessMetrics, string> = {
  balanceScore: 'Workload distribution',
  continuityScore: 'Owner retention',
  geographyScore: 'Geo alignment',
  teamAlignmentScore: 'Tier matching',
  capacityUtilization: 'Target utilization',
};

interface MetricRowProps {
  label: string;
  description: string;
  before: number | null;
  after: number | null;
  delta: number | null;
}

const MetricRow: React.FC<MetricRowProps> = ({ label, description, before, after, delta }) => {
  const formatScore = (score: number | null) => 
    score === null ? '--' : `${Math.round(score * 100)}%`;
  
  const DeltaIcon = delta === null || Math.abs(delta) < 0.01 
    ? Minus 
    : delta > 0 
      ? TrendingUp 
      : TrendingDown;
  
  const deltaColor = delta === null || Math.abs(delta) < 0.01
    ? 'text-muted-foreground'
    : delta > 0
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-red-600 dark:text-red-400';

  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <div className="flex-1">
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right w-16">
          <p className="text-sm text-muted-foreground">{formatScore(before)}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className="text-right w-16">
          <p className="text-sm font-medium">{formatScore(after)}</p>
        </div>
        <div className={cn('flex items-center gap-1 w-20', deltaColor)}>
          <DeltaIcon className="h-4 w-4" />
          <span className="text-sm font-medium">
            {delta === null ? '--' : `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`}
          </span>
        </div>
      </div>
    </div>
  );
};

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 gap-4">
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
    <Skeleton className="h-48" />
  </div>
);

export const BeforeAfterComparisonPanel: React.FC<BeforeAfterComparisonPanelProps> = ({ buildId }) => {
  const [metricToggle, setMetricToggle] = useState<MetricToggle>('arr');
  const { data: comparison, isLoading, error, refetch } = useMetricsComparison(buildId);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <Alert className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <AlertDescription className="text-red-900 dark:text-red-200">
          Error loading comparison data: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  if (!comparison || !comparison.hasProposedAssignments) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No proposed assignments yet</p>
            <p className="text-sm">Generate assignments to see before/after comparison</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { original, proposed, deltas } = comparison;

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Before → After Comparison
          </h3>
          <p className="text-sm text-muted-foreground">
            Original assignments vs proposed changes
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* LP Metrics Comparison */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">LP Success Metrics</CardTitle>
          <CardDescription className="text-xs">
            How assignment quality changed from original to proposed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Before/After Columns */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <div className="w-3 h-3 rounded-full bg-slate-400" />
                BEFORE (Original)
              </div>
              <div className="grid grid-cols-2 gap-2">
                <LPScoreCard label="Balance" score={original.lpMetrics.balanceScore} size="sm" />
                <LPScoreCard label="Continuity" score={original.lpMetrics.continuityScore} size="sm" />
                <LPScoreCard label="Geography" score={original.lpMetrics.geographyScore} size="sm" />
                <LPScoreCard label="Team Fit" score={original.lpMetrics.teamAlignmentScore} size="sm" />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                AFTER (Proposed)
              </div>
              <div className="grid grid-cols-2 gap-2">
                <LPScoreCard label="Balance" score={proposed.lpMetrics.balanceScore} size="sm" />
                <LPScoreCard label="Continuity" score={proposed.lpMetrics.continuityScore} size="sm" />
                <LPScoreCard label="Geography" score={proposed.lpMetrics.geographyScore} size="sm" />
                <LPScoreCard label="Team Fit" score={proposed.lpMetrics.teamAlignmentScore} size="sm" />
              </div>
            </div>
          </div>

          {/* Deltas Summary */}
          <div className="mt-6 pt-4 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-3">CHANGE SUMMARY</p>
            <div className="flex flex-wrap gap-3">
              {(Object.keys(deltas) as (keyof LPSuccessMetrics)[])
                .filter(key => key !== 'capacityUtilization')
                .map(key => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{LP_METRIC_LABELS[key]}:</span>
                    <VarianceIndicator 
                      before={original.lpMetrics[key] || 0} 
                      after={proposed.lpMetrics[key] || 0}
                      format="percentage"
                      size="sm"
                      invertColors={key === 'continuityScore'} // Decrease in continuity is bad
                    />
                  </div>
                ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Regional Comparison Chart */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">Regional Balance</CardTitle>
              <CardDescription className="text-xs">
                Distribution before and after assignment
              </CardDescription>
            </div>
            <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
              <Button
                variant={metricToggle === 'arr' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setMetricToggle('arr')}
              >
                <DollarSign className="h-3 w-3 mr-1" />
                ARR
              </Button>
              <Button
                variant={metricToggle === 'atr' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setMetricToggle('atr')}
              >
                <TrendingUp className="h-3 w-3 mr-1" />
                ATR
              </Button>
              <Button
                variant={metricToggle === 'accounts' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setMetricToggle('accounts')}
              >
                <Hash className="h-3 w-3 mr-1" />
                Accounts
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <BeforeAfterBar
            beforeData={original.byRegion}
            afterData={proposed.byRegion}
            metric={metricToggle}
            title=""
          />
        </CardContent>
      </Card>

      {/* Owner Retention Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Owner Retention</p>
            <p className="text-2xl font-bold">
              {Math.round(proposed.lpMetrics.continuityScore * 100)}%
            </p>
            <p className="text-xs text-muted-foreground">accounts kept same owner</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Geo Alignment</p>
            <p className="text-2xl font-bold">
              {proposed.geoAlignment.alignmentRate.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">
              {proposed.geoAlignment.aligned.toLocaleString()} of {(proposed.geoAlignment.aligned + proposed.geoAlignment.misaligned).toLocaleString()} aligned
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BeforeAfterComparisonPanel;








