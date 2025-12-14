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
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    
    const getTierExplanation = () => {
      switch (data.name) {
        case 'Perfect Match':
          return 'Account tier exactly matches rep tier (SMB→SMB, Growth→Growth, MM→MM, ENT→ENT)';
        case '1-Level Mismatch':
          return 'One tier level difference (SMB→Growth, Growth→MM, MM→ENT)';
        case '2+ Level Mismatch':
          return 'Two or more tier levels different (SMB→MM, SMB→ENT, Growth→ENT)';
        case 'Unassigned':
          return 'Accounts without valid owner assignments';
        default:
          return '';
      }
    };
    
    return (
      <div className="bg-background border rounded-lg px-3 py-2 shadow-lg text-sm max-w-xs">
        <p className="font-medium">{data.name}</p>
        <p className="text-muted-foreground">
          {data.value.toLocaleString()} accounts
        </p>
        {data.total > 0 && (
          <p className="text-muted-foreground text-xs">
            {Math.round((data.value / data.total) * 100)}% of total
          </p>
        )}
        <p className="text-muted-foreground text-xs mt-1 pt-1 border-t">
          {getTierExplanation()}
        </p>
        <div className="text-muted-foreground text-xs mt-1 pt-1 border-t space-y-0.5">
          <p><strong>Tier Order:</strong> SMB → Growth → MM → ENT</p>
          <p className="mt-1"><strong>Tier Definitions:</strong></p>
          <p>• <strong>SMB</strong> = Small Business (&lt;100 employees)</p>
          <p>• <strong>Growth</strong> = Growth (100-499 employees)</p>
          <p>• <strong>MM</strong> = Mid-Market (500-1,499 employees)</p>
          <p>• <strong>ENT</strong> = Enterprise (1,500+ employees)</p>
        </div>
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
  const total = breakdown.exactMatch + breakdown.oneLevelMismatch + breakdown.twoPlusLevelMismatch + breakdown.unassigned;
  
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
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      
      <div className={`flex-1 ${compact ? 'space-y-1' : 'space-y-2'}`}>
        {chartData.map((entry) => {
          const getTooltipContent = () => {
            switch (entry.name) {
              case 'Perfect Match':
                return (
                  <>
                    <p className="text-sm font-medium mb-1">Perfect Match</p>
                    <p className="text-xs text-muted-foreground">
                      Accounts where the account tier exactly matches the rep's tier specialization. This is the ideal alignment.
                    </p>
                    <p className="text-xs mt-1 text-muted-foreground">
                      <strong>Example:</strong> SMB account assigned to SMB rep, or Growth account assigned to Growth rep
                    </p>
                    <div className="text-xs mt-2 pt-2 border-t space-y-0.5">
                      <p className="font-medium">Tier Definitions:</p>
                      <p>• <strong>SMB</strong> = Small Business (&lt;100 employees)</p>
                      <p>• <strong>Growth</strong> = Growth (100-499 employees)</p>
                      <p>• <strong>MM</strong> = Mid-Market (500-1,499 employees)</p>
                      <p>• <strong>ENT</strong> = Enterprise (1,500+ employees)</p>
                    </div>
                  </>
                );
              case '1-Level Mismatch':
                return (
                  <>
                    <p className="text-sm font-medium mb-1">1-Level Mismatch</p>
                    <p className="text-xs text-muted-foreground">
                      Accounts where the account tier is one level different from the rep's tier. Acceptable but not ideal.
                    </p>
                    <p className="text-xs mt-1 text-muted-foreground">
                      <strong>Example:</strong> SMB account assigned to Growth rep, or Growth account assigned to MM rep
                    </p>
                    <div className="text-xs mt-2 pt-2 border-t space-y-0.5">
                      <p className="font-medium">Tier Order:</p>
                      <p><strong>SMB → Growth → MM → ENT</strong></p>
                      <p className="mt-1 font-medium">Tier Definitions:</p>
                      <p>• <strong>SMB</strong> = Small Business (&lt;100 employees)</p>
                      <p>• <strong>Growth</strong> = Growth (100-499 employees)</p>
                      <p>• <strong>MM</strong> = Mid-Market (500-1,499 employees)</p>
                      <p>• <strong>ENT</strong> = Enterprise (1,500+ employees)</p>
                    </div>
                  </>
                );
              case '2+ Level Mismatch':
                return (
                  <>
                    <p className="text-sm font-medium mb-1">2+ Level Mismatch</p>
                    <p className="text-xs text-muted-foreground">
                      Accounts where the account tier is two or more levels different from the rep's tier. These assignments may need review.
                    </p>
                    <p className="text-xs mt-1 text-muted-foreground">
                      <strong>Example:</strong> SMB account assigned to MM rep, or SMB account assigned to ENT rep
                    </p>
                    <div className="text-xs mt-2 pt-2 border-t space-y-0.5">
                      <p className="font-medium">Tier Order:</p>
                      <p><strong>SMB → Growth → MM → ENT</strong></p>
                      <p className="mt-1 font-medium">Tier Definitions:</p>
                      <p>• <strong>SMB</strong> = Small Business (&lt;100 employees)</p>
                      <p>• <strong>Growth</strong> = Growth (100-499 employees)</p>
                      <p>• <strong>MM</strong> = Mid-Market (500-1,499 employees)</p>
                      <p>• <strong>ENT</strong> = Enterprise (1,500+ employees)</p>
                    </div>
                  </>
                );
              case 'Unassigned':
                return (
                  <>
                    <p className="text-sm font-medium mb-1">Unassigned</p>
                    <p className="text-xs text-muted-foreground">
                      Accounts that don't have an owner assigned or the assigned owner doesn't exist in the sales reps list.
                    </p>
                  </>
                );
              default:
                return null;
            }
          };

          return (
            <UITooltip key={entry.name}>
              <TooltipTrigger asChild>
                <div className={`flex items-center justify-between ${compact ? 'text-xs' : 'text-sm'} cursor-help`}>
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
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {getTooltipContent()}
              </TooltipContent>
            </UITooltip>
          );
        })}
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

