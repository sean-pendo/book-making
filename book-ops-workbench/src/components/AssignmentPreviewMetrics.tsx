import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { useAnalyticsMetrics } from '@/hooks/useBuildData';
import { LPScoreCard, BalanceScoreDetailCard } from '@/components/analytics';
import type { LPSuccessMetrics } from '@/types/analytics';
import { cn } from '@/lib/utils';

interface AssignmentPreviewMetricsProps {
  buildId: string;
  compact?: boolean;
}

// Insight metrics (excluding balance since it has its own detailed card)
type InsightMetricKey = 'continuityScore' | 'geographyScore' | 'teamAlignmentScore';

interface MetricInsight {
  metric: InsightMetricKey;
  label: string;
  threshold: { good: number; warning: number };
  goodMessage: string;
  warningMessage: string;
  badMessage: string;
}

const METRIC_INSIGHTS: MetricInsight[] = [
  {
    metric: 'continuityScore',
    label: 'Continuity',
    threshold: { good: 0.8, warning: 0.6 },
    goodMessage: 'Most accounts are stable with current owners',
    warningMessage: 'Moderate account churn detected',
    badMessage: 'High account turnover - consider continuity priorities',
  },
  {
    metric: 'geographyScore',
    label: 'Geography',
    threshold: { good: 0.8, warning: 0.5 },
    goodMessage: 'Strong geographic alignment',
    warningMessage: 'Some geo misalignment - will be optimized',
    badMessage: 'Poor geographic alignment - priority optimization needed',
  },
  {
    metric: 'teamAlignmentScore',
    label: 'Team Fit',
    threshold: { good: 0.7, warning: 0.4 },
    goodMessage: 'Account tiers match rep specializations well',
    warningMessage: 'Some tier mismatches exist',
    badMessage: 'Significant tier misalignment detected',
  },
];

const getInsightStatus = (score: number | null, threshold: { good: number; warning: number }) => {
  if (score === null) return 'unknown';
  if (score >= threshold.good) return 'good';
  if (score >= threshold.warning) return 'warning';
  return 'bad';
};

const InsightItem: React.FC<{ insight: MetricInsight; score: number | null }> = ({ insight, score }) => {
  const status = getInsightStatus(score, insight.threshold);
  
  const Icon = status === 'good' ? CheckCircle : status === 'warning' ? AlertTriangle : AlertTriangle;
  const colorClass = status === 'good' 
    ? 'text-emerald-600 dark:text-emerald-400' 
    : status === 'warning'
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-red-600 dark:text-red-400';
  
  const message = status === 'good' 
    ? insight.goodMessage 
    : status === 'warning' 
      ? insight.warningMessage 
      : insight.badMessage;

  if (status === 'good') return null; // Only show warnings/issues

  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className={cn('h-4 w-4 mt-0.5 flex-shrink-0', colorClass)} />
      <span className="text-muted-foreground">{message}</span>
    </div>
  );
};

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-4 gap-3">
      {[...Array(4)].map((_, i) => (
        <Skeleton key={i} className="h-20" />
      ))}
    </div>
    <Skeleton className="h-12" />
  </div>
);

export const AssignmentPreviewMetrics: React.FC<AssignmentPreviewMetricsProps> = ({ 
  buildId,
  compact = false 
}) => {
  const { data: metrics, isLoading, error } = useAnalyticsMetrics(buildId);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <Alert className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
        <Info className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-900 dark:text-amber-200">
          Could not load preview metrics. You can still proceed with generation.
        </AlertDescription>
      </Alert>
    );
  }

  if (!metrics) {
    return null;
  }

  const lpMetrics = metrics.lpMetrics;
  
  // Collect insights that need attention
  const insights = METRIC_INSIGHTS.filter(insight => {
    const score = lpMetrics[insight.metric];
    const status = getInsightStatus(score, insight.threshold);
    return status !== 'good' && status !== 'unknown';
  });

  return (
    <Card className="border-dashed">
      <CardHeader className={cn('pb-3', compact && 'py-3')}>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Info className="h-4 w-4" />
          Current State (Before Assignment)
        </CardTitle>
      </CardHeader>
      <CardContent className={cn('space-y-4', compact && 'pb-3')}>
        {/* Balance Score with Drill-down (the most critical metric) */}
        <BalanceScoreDetailCard 
          balanceDetail={lpMetrics.balanceDetail}
          showDrilldown={!compact}
          compact={compact}
        />
        
        {/* Other LP Score Cards */}
        <div className="grid grid-cols-3 gap-3">
          <LPScoreCard 
            label="Continuity" 
            score={lpMetrics.continuityScore}
            description="Account stability with owners"
            size="sm"
          />
          <LPScoreCard 
            label="Geography" 
            score={lpMetrics.geographyScore}
            description="Account-to-rep region match"
            size="sm"
          />
          <LPScoreCard 
            label="Team Fit" 
            score={lpMetrics.teamAlignmentScore}
            description="Account tier matching"
            size="sm"
          />
        </div>

        {/* Insights */}
        {insights.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            {insights.map(insight => (
              <InsightItem 
                key={insight.metric} 
                insight={insight} 
                score={lpMetrics[insight.metric]} 
              />
            ))}
          </div>
        )}

        {insights.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 pt-2 border-t">
            <CheckCircle className="h-4 w-4" />
            <span>All metrics look good! Assignment will optimize for best results.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AssignmentPreviewMetrics;

