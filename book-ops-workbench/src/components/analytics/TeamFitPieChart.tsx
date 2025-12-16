import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, Shield } from 'lucide-react';
import type { TierAlignmentBreakdown } from '@/types/analytics';

interface TeamFitPieChartProps {
  breakdown: TierAlignmentBreakdown;
  teamAlignmentScore: number | null;
  title?: string;
  compact?: boolean; // For inline use in cards
}

const ALIGNMENT_COLORS = {
  exactMatch: '#22c55e', // green - perfect match
  oneLevelMismatch: '#f59e0b', // amber - 1 level off
  twoPlusLevelMismatch: '#ef4444', // red - 2+ levels off
  unassigned: '#6b7280', // gray - no assignment
  unknown: '#a1a1aa', // zinc - N/A (missing tier data)
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    
    return (
      <div className="bg-background border rounded-lg px-2 py-1.5 shadow-lg text-sm">
        <p className="font-medium">{data.name}</p>
        <p className="text-muted-foreground text-xs">
          {data.value.toLocaleString()} accounts ({data.total > 0 ? Math.round((data.value / data.total) * 100) : 0}%)
        </p>
      </div>
    );
  }
  return null;
};

export const TeamFitPieChart: React.FC<TeamFitPieChartProps> = ({
  breakdown,
  teamAlignmentScore,
  title = 'Team Fit',
  compact = false,
}) => {
  // Include unknown in total - these are accounts with missing tier data (N/A)
  const total = breakdown.exactMatch + breakdown.oneLevelMismatch + breakdown.twoPlusLevelMismatch + breakdown.unassigned + (breakdown.unknown || 0);

  const chartData = [
    {
      name: 'Perfect Match',
      value: breakdown.exactMatch,
      color: ALIGNMENT_COLORS.exactMatch,
      total
    },
    {
      name: '1-Level Mismatch',
      value: breakdown.oneLevelMismatch,
      color: ALIGNMENT_COLORS.oneLevelMismatch,
      total
    },
    {
      name: '2+ Level Mismatch',
      value: breakdown.twoPlusLevelMismatch,
      color: ALIGNMENT_COLORS.twoPlusLevelMismatch,
      total
    },
    ...(breakdown.unassigned > 0 ? [{
      name: 'Unassigned',
      value: breakdown.unassigned,
      color: ALIGNMENT_COLORS.unassigned,
      total
    }] : []),
    ...((breakdown.unknown || 0) > 0 ? [{
      name: 'N/A (Missing Data)',
      value: breakdown.unknown || 0,
      color: ALIGNMENT_COLORS.unknown,
      total
    }] : []),
  ].filter(item => item.value > 0); // Only show categories with accounts

  if (total === 0) {
    return compact ? null : (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
            No tier data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const pieSize = compact ? { innerRadius: 25, outerRadius: 50, height: 100 } : { innerRadius: 35, outerRadius: 65, height: 140 };

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
            key={entry.name}
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
                ({Math.round((entry.value / total) * 100)}%)
              </span>
            </div>
          </div>
        ))}
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
            <Shield className="h-4 w-4 text-muted-foreground" />
            {title}
          </CardTitle>
          <UITooltip>
            <TooltipTrigger>
              <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-sm font-medium mb-1">Account-Rep Tier Alignment</p>
              <p className="text-xs text-muted-foreground">
                Shows how well account tiers match rep specializations. Perfect Match = exact tier alignment, mismatches indicate tier differences.
              </p>
            </TooltipContent>
          </UITooltip>
        </div>
        {teamAlignmentScore != null && (
          <div className="text-xs text-muted-foreground mt-1">
            Alignment Score: <span className="font-semibold text-violet-600 dark:text-violet-400">{(teamAlignmentScore * 100).toFixed(0)}%</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {content}
      </CardContent>
    </Card>
  );
};

export default TeamFitPieChart;

