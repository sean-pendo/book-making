import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Target, Users, MapPin, BarChart3, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface OptimizationMetrics {
  arrBalanceScore: number;      // 100 - CV (higher = more balanced)
  geoAlignmentPct: number;      // % accounts in correct region
  continuityPct: number;        // % accounts with same owner
  p1Rate: number;               // % assigned at P1 (continuity+geo)
  p2Rate: number;               // % assigned at P2 (geo match)
  p3Rate: number;               // % assigned at P3 (continuity any-geo)
  p4Rate: number;               // % assigned at P4 (fallback)
  repsInBand: number;           // reps within variance band
  totalReps: number;
  avgArrPerRep: number;
  minArrPerRep: number;
  maxArrPerRep: number;
  targetArr: number;
  totalAccounts: number;
  totalCustomerArr: number;
  // Biggest movers
  biggestGainer?: { name: string; netChange: number; gainedCount: number };
  biggestLoser?: { name: string; netChange: number; lostCount: number };
}

interface OptimizationMetricsPanelProps {
  metrics: OptimizationMetrics;
  title?: string;
  showPriorityBreakdown?: boolean;
}

const formatCurrency = (amount: number) => {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  }
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }
  return `$${amount.toFixed(0)}`;
};

const getScoreColor = (score: number) => {
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
};

const getScoreBadge = (score: number) => {
  if (score >= 80) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  if (score >= 60) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
};

export const OptimizationMetricsPanel: React.FC<OptimizationMetricsPanelProps> = ({ 
  metrics, 
  title = "Assignment Quality Metrics",
  showPriorityBreakdown = true
}) => {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5" />
              {title}
            </CardTitle>
            <CardDescription>
              {metrics.totalAccounts} accounts across {metrics.totalReps} reps • Total ARR: {formatCurrency(metrics.totalCustomerArr)}
            </CardDescription>
          </div>
          <Badge className={getScoreBadge(metrics.arrBalanceScore)}>
            Balance Score: {metrics.arrBalanceScore.toFixed(0)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Primary Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Target className="h-4 w-4" />
              ARR Balance
            </div>
            <div className={`text-2xl font-bold ${getScoreColor(metrics.arrBalanceScore)}`}>
              {metrics.arrBalanceScore.toFixed(0)}%
            </div>
            <div className="text-xs text-muted-foreground">
              Avg: {formatCurrency(metrics.avgArrPerRep)} per rep
            </div>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              Geographic Match
            </div>
            <div className={`text-2xl font-bold ${getScoreColor(metrics.geoAlignmentPct)}`}>
              {metrics.geoAlignmentPct.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">
              Accounts in correct region
            </div>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              Continuity
            </div>
            <div className={`text-2xl font-bold ${getScoreColor(metrics.continuityPct)}`}>
              {metrics.continuityPct.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">
              Kept with same owner
            </div>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              Reps in Target Band
            </div>
            <div className="text-2xl font-bold">
              {metrics.repsInBand}/{metrics.totalReps}
            </div>
            <div className="text-xs text-muted-foreground">
              Within variance band
            </div>
          </div>
        </div>

        {/* Priority Breakdown */}
        {showPriorityBreakdown && (
          <div className="border-t pt-4">
            <div className="text-sm font-medium mb-2">Priority Distribution</div>
            <div className="flex gap-2 flex-wrap">
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="bg-green-50 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-800 dark:text-green-300">
                    P1: {metrics.p1Rate.toFixed(1)}%
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Continuity + Geography Match (Best)</TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300">
                    P2: {metrics.p2Rate.toFixed(1)}%
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Geography Match (New Rep)</TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="bg-yellow-50 border-yellow-200 text-yellow-700 dark:bg-yellow-900/30 dark:border-yellow-800 dark:text-yellow-300">
                    P3: {metrics.p3Rate.toFixed(1)}%
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Continuity (Wrong Geography)</TooltipContent>
              </Tooltip>
              
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300">
                    P4: {metrics.p4Rate.toFixed(1)}%
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Fallback Assignment</TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}

        {/* ARR Spread */}
        <div className="border-t pt-4">
          <div className="text-sm font-medium mb-2">ARR Distribution</div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs text-muted-foreground">Min Rep</div>
              <div className="font-semibold">{formatCurrency(metrics.minArrPerRep)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Target</div>
              <div className="font-semibold text-primary">{formatCurrency(metrics.targetArr)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Max Rep</div>
              <div className="font-semibold">{formatCurrency(metrics.maxArrPerRep)}</div>
            </div>
          </div>
        </div>

        {/* Biggest Movers */}
        {(metrics.biggestGainer || metrics.biggestLoser) && (
          <div className="border-t pt-4">
            <div className="text-sm font-medium mb-2">Biggest Movers</div>
            <div className="grid grid-cols-2 gap-4">
              {metrics.biggestGainer && metrics.biggestGainer.netChange > 0 && (
                <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <ArrowUpRight className="h-5 w-5 text-green-600" />
                  <div>
                    <div className="text-sm font-medium">{metrics.biggestGainer.name}</div>
                    <div className="text-xs text-green-600">
                      +{formatCurrency(metrics.biggestGainer.netChange)} ({metrics.biggestGainer.gainedCount} accounts)
                    </div>
                  </div>
                </div>
              )}
              {metrics.biggestLoser && metrics.biggestLoser.netChange < 0 && (
                <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <ArrowDownRight className="h-5 w-5 text-red-600" />
                  <div>
                    <div className="text-sm font-medium">{metrics.biggestLoser.name}</div>
                    <div className="text-xs text-red-600">
                      {formatCurrency(metrics.biggestLoser.netChange)} ({metrics.biggestLoser.lostCount} accounts)
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

