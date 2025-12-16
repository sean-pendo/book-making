import React from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, BarChart3 } from 'lucide-react';
import { useAnalyticsMetrics } from '@/hooks/useBuildData';
import { RepDistributionChart } from '@/components/analytics';

interface DataOverviewAnalyticsProps {
  buildId: string;
}

/**
 * Loading skeleton for analytics section
 */
const AnalyticsSkeleton: React.FC = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
      {[...Array(5)].map((_, i) => (
        <Card key={i} className="p-4">
          <Skeleton className="h-4 w-16 mb-2" />
          <Skeleton className="h-8 w-12" />
          <Skeleton className="h-1.5 w-full mt-2" />
        </Card>
      ))}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i} className="p-4">
          <Skeleton className="h-4 w-24 mb-4" />
          <Skeleton className="h-[120px] w-full" />
        </Card>
      ))}
    </div>
  </div>
);

export const DataOverviewAnalytics: React.FC<DataOverviewAnalyticsProps> = ({ buildId }) => {
  // Pass useProposed=false to show original imported data (not proposed assignments)
  // This excludes Sales Tools bucket which is a balancing concept, not import data
  const { data: metrics, isLoading, error } = useAnalyticsMetrics(buildId, false);

  if (isLoading) {
    return <AnalyticsSkeleton />;
  }

  if (error) {
    return (
      <Alert className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
        <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
        <AlertDescription className="text-red-900 dark:text-red-200">
          Error loading analytics: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  if (!metrics) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No analytics data available</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Balance Analytics
        </h3>
        <p className="text-sm text-muted-foreground">
          Current state analysis based on imported data (original owner assignments)
        </p>
      </div>

      {/* Two Charts Side-by-Side: Financial + Accounts Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Financial Distribution (ARR/ATR/Pipeline) */}
        <RepDistributionChart 
          data={metrics.repDistribution}
          allowedMetrics={['arr', 'atr', 'pipeline']}
          showStats={true}
        />
        
        {/* Right: Account Distribution (Customer vs Prospect) */}
        <RepDistributionChart 
          data={metrics.repDistribution}
          allowedMetrics={['accounts']}
          showStats={true}
        />
      </div>

    </div>
  );
};

export default DataOverviewAnalytics;



