import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Layers } from 'lucide-react';
import { usePriorityDistribution, type PriorityDistributionItem } from '@/hooks/useBuildData';
import { Skeleton } from '@/components/ui/skeleton';

interface PriorityDistributionPieProps {
  buildId: string;
  compact?: boolean;
}

// Colors for priority levels (P0-P5+)
const PRIORITY_COLORS = [
  '#10b981', // P0 - emerald (manual holdover)
  '#3b82f6', // P1 - blue
  '#8b5cf6', // P2 - violet
  '#f59e0b', // P3 - amber
  '#ef4444', // P4 - red
  '#6b7280', // P5+ - gray
  '#ec4899', // unassigned - pink
];

/**
 * Custom tooltip for the priority pie chart
 */
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as PriorityDistributionItem;
    return (
      <div className="bg-background border rounded-lg px-3 py-2 shadow-lg text-sm max-w-xs">
        <p className="font-semibold text-foreground">{data.priorityId}: {data.priorityName}</p>
        {data.priorityDescription && (
          <p className="text-xs text-muted-foreground mt-1">{data.priorityDescription}</p>
        )}
        <div className="mt-2 pt-2 border-t">
          <p className="text-sm">
            <span className="font-medium">{data.count.toLocaleString()}</span> accounts
            <span className="text-muted-foreground ml-1">({data.percentage.toFixed(1)}%)</span>
          </p>
        </div>
      </div>
    );
  }
  return null;
};

/**
 * Priority Distribution Pie Chart
 * Shows breakdown of accounts by assignment priority level
 * Hover tooltips show priority name and description from PRIORITY_REGISTRY
 */
export const PriorityDistributionPie: React.FC<PriorityDistributionPieProps> = ({
  buildId,
  compact = false,
}) => {
  const { data: distribution, isLoading, error } = usePriorityDistribution(buildId);

  if (isLoading) {
    return (
      <Card className="card-elevated">
        <CardContent className={compact ? "p-4" : "p-5"}>
          <div className="flex items-center gap-3 mb-3">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="flex items-center justify-center">
            <Skeleton className={`${compact ? 'h-24 w-24' : 'h-32 w-32'} rounded-full`} />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !distribution || distribution.length === 0) {
    return (
      <Card className="card-elevated">
        <CardContent className={compact ? "p-4" : "p-5"}>
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-gray-500/20 rounded-lg">
              <Layers className="h-5 w-5 text-gray-500" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Priorities</h3>
              <p className="text-xs text-muted-foreground">Assignment breakdown</p>
            </div>
          </div>
          <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
            No priority data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Prepare data for chart
  const chartData = distribution.map((item, index) => ({
    ...item,
    fill: PRIORITY_COLORS[index % PRIORITY_COLORS.length],
  }));

  return (
    <Card className="card-elevated card-glass overflow-visible">
      <CardContent className={`${compact ? "p-4" : "p-5"} overflow-visible`}>
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-violet-500/20 rounded-lg">
            <Layers className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Priorities</h3>
            <p className="text-xs text-muted-foreground">Assignment breakdown</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Pie Chart - overflow-visible allows tooltip to escape */}
          <div className={`${compact ? "w-28 h-28" : "w-36 h-36"} overflow-visible`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="count"
                  nameKey="priorityId"
                  cx="50%"
                  cy="50%"
                  innerRadius={compact ? 20 : 28}
                  outerRadius={compact ? 40 : 52}
                  strokeWidth={2}
                  stroke="hsl(var(--background))"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  content={<CustomTooltip />}
                  wrapperStyle={{ zIndex: 9999, pointerEvents: 'none' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend - shows priority name with count */}
          <div className="flex-1 space-y-1 min-w-0">
            {chartData.slice(0, 5).map((item) => (
              <div key={item.priorityId} className="flex items-center justify-between text-xs gap-2">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.fill }}
                  />
                  <span
                    className="text-muted-foreground truncate"
                    title={`${item.priorityId}: ${item.priorityName}`}
                  >
                    {item.priorityId}: {item.priorityName}
                  </span>
                </div>
                <span className="font-medium tabular-nums flex-shrink-0">
                  {item.count.toLocaleString()}
                </span>
              </div>
            ))}
            {chartData.length > 5 && (
              <div className="text-xs text-muted-foreground">
                +{chartData.length - 5} more
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PriorityDistributionPie;





