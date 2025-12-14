import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { RefreshCw, MapPin, Layers } from 'lucide-react';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PriorityDistributionPie } from './PriorityDistributionPie';
import type { GeoAlignmentMetrics } from '@/types/analytics';

interface BalancingSuccessMetricsProps {
  buildId: string;
  continuityScore: number; // 0-1
  geoAlignment: GeoAlignmentMetrics | null;
  isLoading?: boolean;
}

// Colors for geo alignment pie
const GEO_COLORS = {
  aligned: '#22c55e',    // green
  misaligned: '#ef4444', // red
  unassigned: '#9ca3af', // gray
};

/**
 * Custom tooltip for geo alignment pie
 */
const GeoTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-background border rounded-lg px-3 py-2 shadow-lg text-sm">
        <p className="font-medium">{data.name}</p>
        <p>
          <span className="font-semibold">{data.value.toLocaleString()}</span> accounts
          <span className="text-muted-foreground ml-1">({data.percentage.toFixed(1)}%)</span>
        </p>
      </div>
    );
  }
  return null;
};

/**
 * Success Metrics Row Component
 * Displays Continuity, Geographical Alignment (with pie), and Priorities (with pie)
 */
export const BalancingSuccessMetrics: React.FC<BalancingSuccessMetricsProps> = ({
  buildId,
  continuityScore,
  geoAlignment,
  isLoading = false,
}) => {
  // Get color based on score
  const getContinuityColor = (score: number) => {
    if (score >= 0.7) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 0.5) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getGeoColor = (rate: number) => {
    if (rate >= 80) return 'text-emerald-600 dark:text-emerald-400';
    if (rate >= 60) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  // Prepare geo alignment data for pie chart
  const geoChartData = geoAlignment ? [
    {
      name: 'Aligned',
      value: geoAlignment.aligned,
      percentage: (geoAlignment.aligned / (geoAlignment.aligned + geoAlignment.misaligned + geoAlignment.unassigned)) * 100,
      fill: GEO_COLORS.aligned,
    },
    {
      name: 'Misaligned',
      value: geoAlignment.misaligned,
      percentage: (geoAlignment.misaligned / (geoAlignment.aligned + geoAlignment.misaligned + geoAlignment.unassigned)) * 100,
      fill: GEO_COLORS.misaligned,
    },
    {
      name: 'Unassigned',
      value: geoAlignment.unassigned,
      percentage: (geoAlignment.unassigned / (geoAlignment.aligned + geoAlignment.misaligned + geoAlignment.unassigned)) * 100,
      fill: GEO_COLORS.unassigned,
    },
  ].filter(d => d.value > 0) : [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="card-elevated">
            <CardContent className="p-5">
              <Skeleton className="h-5 w-32 mb-3" />
              <Skeleton className="h-10 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Continuity Card */}
      <Card className="card-elevated card-glass">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <RefreshCw className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex items-center gap-1">
              <h3 className="font-semibold text-foreground">Continuity</h3>
              <UITooltip>
                <TooltipTrigger>
                  <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-sm font-medium mb-1">Account Continuity</p>
                  <p className="text-xs text-muted-foreground">
                    Percentage of accounts that remain with their original owner after assignment.
                    Higher continuity means less disruption for reps and customers.
                  </p>
                </TooltipContent>
              </UITooltip>
            </div>
          </div>
          <div className={`text-3xl font-bold ${getContinuityColor(continuityScore)}`}>
            {(continuityScore * 100).toFixed(0)}%
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Accounts with same owner
          </p>
        </CardContent>
      </Card>

      {/* Geographical Alignment Card */}
      <Card className="card-elevated card-glass">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-emerald-500/20 rounded-lg">
              <MapPin className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex items-center gap-1">
              <h3 className="font-semibold text-foreground">Geo Alignment</h3>
              <UITooltip>
                <TooltipTrigger>
                  <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-sm font-medium mb-1">Geographic Alignment</p>
                  <p className="text-xs text-muted-foreground">
                    Percentage of accounts where the account territory matches the assigned rep's region.
                    Better alignment means more efficient coverage.
                  </p>
                </TooltipContent>
              </UITooltip>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Percentage */}
            <div>
              <div className={`text-3xl font-bold ${getGeoColor(geoAlignment?.alignmentRate || 0)}`}>
                {(geoAlignment?.alignmentRate || 0).toFixed(0)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Territory match
              </p>
            </div>

            {/* Mini Pie Chart */}
            {geoChartData.length > 0 && (
              <div className="w-20 h-20 ml-auto">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={geoChartData}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={15}
                      outerRadius={32}
                      strokeWidth={2}
                      stroke="hsl(var(--background))"
                    >
                      {geoChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<GeoTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Priority Distribution Card */}
      <PriorityDistributionPie buildId={buildId} compact />
    </div>
  );
};

export default BalancingSuccessMetrics;





