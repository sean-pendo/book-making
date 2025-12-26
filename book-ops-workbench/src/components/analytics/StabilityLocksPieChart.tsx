/**
 * Stability Locks Pie Chart
 * 
 * Self-contained component that shows accounts locked from optimization
 * by lock type. Uses the same logic as the assignment engine.
 * 
 * @see MASTER_LOGIC.mdc §13.4.3 - Stability Lock Breakdown
 * @see MASTER_LOGIC.mdc §11.5 - Account Locking Priorities
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, Lock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useStabilityLockBreakdown } from '@/hooks/useStabilityLockBreakdown';

interface StabilityLocksPieChartProps {
  buildId: string;
  title?: string;
  compact?: boolean;
}

/**
 * Lock type colors - semantic colors based on lock meaning
 * @see MASTER_LOGIC.mdc §13.4.3
 */
const LOCK_COLORS = {
  manualLock: '#10b981',      // emerald-500 - intentional action
  backfillMigration: '#3b82f6', // blue-500 - transition
  creRisk: '#ef4444',          // red-500 - risk/danger
  renewalSoon: '#f59e0b',      // amber-500 - time-sensitive
  peFirm: '#8b5cf6',           // violet-500 - special handling
  recentChange: '#6b7280',     // gray-500 - stability
};

/**
 * Lock type display names and descriptions
 */
const LOCK_LABELS: Record<string, { name: string; description: string }> = {
  manualLock: { 
    name: 'Manual Lock', 
    description: 'Excluded from reassignment by user' 
  },
  backfillMigration: { 
    name: 'Backfill', 
    description: 'Owner leaving, migrating to replacement' 
  },
  creRisk: { 
    name: 'CRE Risk', 
    description: 'At-risk accounts stay with experienced owner' 
  },
  renewalSoon: { 
    name: 'Renewal Soon', 
    description: 'Renewing within configured days' 
  },
  peFirm: { 
    name: 'PE Firm', 
    description: 'PE-owned, routed to dedicated rep' 
  },
  recentChange: { 
    name: 'Recent Change', 
    description: 'Recently changed owner' 
  },
};

/**
 * Custom tooltip for the pie chart
 */
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    
    return (
      <div className="bg-background border rounded-lg px-3 py-2 shadow-lg text-sm max-w-xs">
        <p className="font-medium">{data.name}</p>
        <p className="text-muted-foreground text-xs mt-0.5">
          {data.description}
        </p>
        <p className="text-muted-foreground text-xs mt-1">
          <span className="font-semibold text-foreground">{data.value.toLocaleString()}</span> accounts
          {data.total > 0 && (
            <span className="ml-1">({Math.round((data.value / data.total) * 100)}%)</span>
          )}
        </p>
      </div>
    );
  }
  return null;
};

export const StabilityLocksPieChart: React.FC<StabilityLocksPieChartProps> = ({
  buildId,
  title = 'Stability Locks',
  compact = false,
}) => {
  const { data: breakdown, isLoading } = useStabilityLockBreakdown(buildId);

  // Loading state
  if (isLoading) {
    if (compact) {
      return <Skeleton className="h-[140px] w-full rounded-lg" />;
    }
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="pt-0">
          <Skeleton className="h-[180px] w-full" />
        </CardContent>
      </Card>
    );
  }

  // No data or no locks - don't render in compact mode
  if (!breakdown || breakdown.total === 0) {
    if (compact) {
      return null;
    }
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">
            No stability locks active
          </div>
        </CardContent>
      </Card>
    );
  }

  // Build chart data from breakdown
  const chartData = [
    { key: 'manualLock', value: breakdown.manualLock },
    { key: 'backfillMigration', value: breakdown.backfillMigration },
    { key: 'creRisk', value: breakdown.creRisk },
    { key: 'renewalSoon', value: breakdown.renewalSoon },
    { key: 'peFirm', value: breakdown.peFirm },
    { key: 'recentChange', value: breakdown.recentChange },
  ]
    .filter(item => item.value > 0) // Only show non-zero categories
    .map(item => ({
      key: item.key,
      name: LOCK_LABELS[item.key].name,
      description: LOCK_LABELS[item.key].description,
      value: item.value,
      color: LOCK_COLORS[item.key as keyof typeof LOCK_COLORS],
      total: breakdown.total,
    }));

  const pieSize = compact 
    ? { innerRadius: 25, outerRadius: 50, height: 100 } 
    : { innerRadius: 35, outerRadius: 65, height: 140 };

  const content = (
    <div className={`flex items-center ${compact ? 'gap-3' : 'gap-4'}`}>
      <div className={`${compact ? 'h-[100px] w-[100px]' : 'h-[140px] w-[140px]'} flex-shrink-0`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={pieSize.innerRadius}
              outerRadius={pieSize.outerRadius}
              paddingAngle={2}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 1000 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      
      <div className={`flex-1 ${compact ? 'space-y-1' : 'space-y-2'}`}>
        {chartData.map((entry) => (
          <div 
            key={entry.key}
            className={`flex items-center justify-between ${compact ? 'text-xs' : 'text-sm'}`}
          >
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full flex-shrink-0" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}</span>
            </div>
            <div className="text-right">
              <span className="font-medium">
                {entry.value.toLocaleString()}
              </span>
              <span className="text-muted-foreground text-xs ml-1">
                ({Math.round((entry.value / breakdown.total) * 100)}%)
              </span>
            </div>
          </div>
        ))}
        
        {/* Total footer */}
        <div className={`flex items-center justify-between pt-1 border-t ${compact ? 'text-xs' : 'text-sm'}`}>
          <span className="text-muted-foreground font-medium">Total Locked</span>
          <span className="font-semibold">{breakdown.total.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );

  if (compact) {
    return content;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            {title}
          </CardTitle>
          <UITooltip>
            <TooltipTrigger>
              <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-sm font-medium mb-1">Stability Locks</p>
              <p className="text-xs text-muted-foreground">
                Accounts locked from reassignment during optimization. 
                These stay with their current owner (or migrate to a backfill target).
              </p>
            </TooltipContent>
          </UITooltip>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {content}
      </CardContent>
    </Card>
  );
};

export default StabilityLocksPieChart;

