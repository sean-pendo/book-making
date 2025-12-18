import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { RefreshCw, MapPin, Layers } from 'lucide-react';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PriorityDistributionPie } from './PriorityDistributionPie';
import type { GeoAlignmentMetrics, ContinuityMetrics } from '@/types/analytics';

interface BalancingSuccessMetricsProps {
  buildId: string;
  continuityScore: number; // 0-1
  /** Detailed continuity breakdown with actual counts */
  continuityMetrics?: ContinuityMetrics;
  geoAlignment: GeoAlignmentMetrics | null;
  isLoading?: boolean;
}

// Colors for geo alignment pie
const GEO_COLORS = {
  aligned: '#22c55e',    // green
  misaligned: '#ef4444', // red
  unassigned: '#6b7280', // gray
};

// Region colors for pie chart - shades of green (all aligned)
// Using different green shades to distinguish regions while showing they're all "aligned"
const REGION_CHART_COLORS = [
  '#22c55e', // green-500
  '#16a34a', // green-600
  '#15803d', // green-700
  '#166534', // green-800
  '#4ade80', // green-400
  '#86efac', // green-300
  '#14532d', // green-900
  '#bbf7d0', // green-200
];

/**
 * Custom tooltip for geo alignment pie - shows region breakdown
 */
const GeoTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const hasBreakdown = data.aligned !== undefined;
    
    return (
      <div className="bg-background border rounded-lg px-3 py-2 shadow-lg text-sm min-w-[140px]">
        <p className="font-medium mb-1">{data.name}</p>
        <p className="text-xs text-muted-foreground mb-2">
          <span className="font-semibold text-foreground">{data.value.toLocaleString()}</span> accounts
          <span className="ml-1">({data.percentage.toFixed(1)}%)</span>
        </p>
        {hasBreakdown && (
          <div className="text-xs space-y-0.5 pt-1 border-t">
            <div className="flex justify-between">
              <span style={{ color: GEO_COLORS.aligned }}>● Aligned</span>
              <span>{data.aligned.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: GEO_COLORS.misaligned }}>● Misaligned</span>
              <span>{data.misaligned.toLocaleString()}</span>
            </div>
            {data.unassigned > 0 && (
              <div className="flex justify-between">
                <span style={{ color: GEO_COLORS.unassigned }}>● Unassigned</span>
                <span>{data.unassigned.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}
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
  continuityMetrics,
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

  // Use actual continuity counts from metrics (not derived from geo data)
  const retainedAccounts = continuityMetrics?.retainedCount ?? 0;
  const changedAccounts = continuityMetrics?.changedCount ?? 0;
  const eligibleAccounts = continuityMetrics?.eligibleCount ?? 0;
  const excludedAccounts = continuityMetrics?.excludedCount ?? 0;
  
  // Keep totalAccounts for geo chart calculations only
  const totalAccounts = geoAlignment 
    ? geoAlignment.aligned + geoAlignment.misaligned + geoAlignment.unassigned 
    : 0;

  // Prepare geo alignment data for pie chart - by region
  // Each region shows as a slice, colored by alignment status
  const geoChartData = (() => {
    if (!geoAlignment?.byRegion || geoAlignment.byRegion.length === 0) {
      // Fallback to simple aligned/misaligned/unassigned if no region breakdown
      return [
        {
          name: 'Aligned',
          value: geoAlignment?.aligned || 0,
          percentage: geoAlignment ? (geoAlignment.aligned / totalAccounts) * 100 : 0,
          fill: GEO_COLORS.aligned,
        },
        {
          name: 'Misaligned',
          value: geoAlignment?.misaligned || 0,
          percentage: geoAlignment ? (geoAlignment.misaligned / totalAccounts) * 100 : 0,
          fill: GEO_COLORS.misaligned,
        },
        {
          name: 'Unassigned',
          value: geoAlignment?.unassigned || 0,
          percentage: geoAlignment ? (geoAlignment.unassigned / totalAccounts) * 100 : 0,
          fill: GEO_COLORS.unassigned,
        },
      ].filter(d => d.value > 0);
    }

    // Build chart data from regions, excluding "Unassigned" bucket
    // and coloring by region with a color array
    return geoAlignment.byRegion
      .filter(r => r.region !== 'Unassigned' && r.total > 0)
      .map((r, index) => ({
        name: r.region,
        value: r.total,
        aligned: r.aligned,
        misaligned: r.misaligned,
        unassigned: r.unassigned,
        percentage: (r.total / totalAccounts) * 100,
        fill: REGION_CHART_COLORS[index % REGION_CHART_COLORS.length],
      }));
  })();

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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 overflow-visible">
      {/* Continuity Card */}
      <Card className="card-elevated card-glass overflow-visible relative z-10">
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
                  <p className="text-xs text-muted-foreground mb-2">
                    Percentage of accounts that remain with their original owner after assignment.
                    Higher continuity means less disruption for reps and customers.
                  </p>
                  <div className="text-xs pt-2 border-t space-y-1">
                    <div className="flex justify-between">
                      <span>Retained:</span>
                      <span className="font-medium text-emerald-500">{retainedAccounts.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Changed:</span>
                      <span className="font-medium text-amber-500">{changedAccounts.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Eligible:</span>
                      <span>{eligibleAccounts.toLocaleString()}</span>
                    </div>
                    {excludedAccounts > 0 && (
                      <div className="flex justify-between text-muted-foreground/70 text-[10px] pt-1">
                        <span>Excluded (owner missing):</span>
                        <span>{excludedAccounts.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </UITooltip>
            </div>
          </div>
          <div className={`text-3xl font-bold ${getContinuityColor(continuityScore)}`}>
            {(continuityScore * 100).toFixed(0)}%
          </div>
          <p className="text-xs text-muted-foreground mt-1 mb-3">
            Accounts with same owner
          </p>
          
          {/* Horizontal bar showing retained vs changed */}
          {eligibleAccounts > 0 && (
            <UITooltip>
              <TooltipTrigger asChild>
                <div className="space-y-1.5 cursor-default">
                  <div className="h-3 w-full bg-muted rounded-full overflow-hidden flex">
                    <div 
                      className="h-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${(retainedAccounts / eligibleAccounts) * 100}%` }}
                    />
                    <div 
                      className="h-full bg-amber-500 transition-all duration-500"
                      style={{ width: `${(changedAccounts / eligibleAccounts) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {retainedAccounts.toLocaleString()} retained
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      {changedAccounts.toLocaleString()} changed
                    </span>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={8} className="max-w-xs z-[9999]">
                <div className="text-xs space-y-1">
                  <div className="flex justify-between gap-4">
                    <span className="text-emerald-500">● Retained:</span>
                    <span className="font-medium">{retainedAccounts.toLocaleString()} ({((retainedAccounts / eligibleAccounts) * 100).toFixed(1)}%)</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-amber-500">● Changed:</span>
                    <span className="font-medium">{changedAccounts.toLocaleString()} ({((changedAccounts / eligibleAccounts) * 100).toFixed(1)}%)</span>
                  </div>
                  {excludedAccounts > 0 && (
                    <div className="flex justify-between gap-4 pt-1 border-t text-muted-foreground">
                      <span>Excluded (owner missing):</span>
                      <span>{excludedAccounts.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </TooltipContent>
            </UITooltip>
          )}
        </CardContent>
      </Card>

      {/* Geographical Alignment Card */}
      <Card className="card-elevated card-glass overflow-visible">
        <CardContent className="p-5 overflow-visible">
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
                  <p className="text-xs text-muted-foreground mb-2">
                    Percentage of accounts where the account territory matches the assigned rep's region.
                    Better alignment means more efficient coverage.
                  </p>
                  <div className="text-xs pt-2 border-t space-y-1">
                    <div className="flex justify-between">
                      <span style={{ color: GEO_COLORS.aligned }}>● Aligned</span>
                      <span className="font-medium">{geoAlignment?.aligned.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: GEO_COLORS.misaligned }}>● Misaligned</span>
                      <span className="font-medium">{geoAlignment?.misaligned.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span style={{ color: GEO_COLORS.unassigned }}>● Unassigned</span>
                      <span className="font-medium">{geoAlignment?.unassigned.toLocaleString()}</span>
                    </div>
                  </div>
                </TooltipContent>
              </UITooltip>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Pie Chart - centered with more space */}
            {geoChartData.length > 0 && (
              <div className="w-24 h-24 flex-shrink-0 overflow-visible">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={geoChartData}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={18}
                      outerRadius={38}
                      strokeWidth={2}
                      stroke="hsl(var(--background))"
                    >
                      {geoChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<GeoTooltip />} wrapperStyle={{ zIndex: 9999, pointerEvents: 'none' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Percentage and Region Legend */}
            <div className="flex-1 min-w-0">
              <div className={`text-2xl font-bold ${getGeoColor(geoAlignment?.alignmentRate || 0)}`}>
                {(geoAlignment?.alignmentRate || 0).toFixed(0)}%
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Territory match
              </p>
              {/* Region legend - compact */}
              <div className="space-y-0.5">
                {geoChartData.slice(0, 3).map((item, index) => (
                  <div key={index} className="flex items-center gap-1 text-[10px]">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: item.fill }}
                    />
                    <span className="text-muted-foreground truncate">{item.name}</span>
                  </div>
                ))}
                {geoChartData.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">+{geoChartData.length - 3} more</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Priority Distribution Card */}
      <PriorityDistributionPie buildId={buildId} compact />
    </div>
  );
};

export default BalancingSuccessMetrics;





