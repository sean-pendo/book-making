import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import { DollarSign, TrendingUp, TrendingDown, Info, Hash } from 'lucide-react';
import type { RepMetrics } from '@/hooks/useEnhancedBalancing';

interface BeforeMetrics {
  totalCustomerARR: number;
  totalCustomerAccounts: number;
  totalProspectAccounts: number;
  avgCustomerARRPerRep: number;
  avgCustomerAccountsPerRep: number;
  avgProspectAccountsPerRep: number;
  maxArrVariance: number;
}

interface BalancingAnalyticsRowProps {
  repMetrics: RepMetrics[];
  beforeMetrics?: BeforeMetrics;
  buildId?: string;
  customerMetrics?: {
    avgARRPerRep: number;
  };
}

// Priority color palette matching P0-P4 + P6 + RO structure
const PRIORITY_COLORS: Record<string, string> = {
  P0: '#a855f7', // purple - Manual Holdover & Strategic
  P1: '#22c55e', // green - Stability Accounts
  P2: '#14b8a6', // teal - Geography + Continuity
  P3: '#3b82f6', // blue - Geographic Match
  P4: '#eab308', // yellow - Account Continuity
  P6: '#ec4899', // pink - Renewal Specialist (FLM)
  RO: '#f97316', // orange - Residual Optimization (not a numbered priority)
  Other: '#6b7280', // gray - Other
};

// Priority descriptions for tooltips
const PRIORITY_DESCRIPTIONS: Record<string, string> = {
  P0: 'Manual Holdover & Strategic Accounts',
  P1: 'Stability Accounts (CRE Risk, Renewals, Top 10%, PE)',
  P2: 'Geography + Continuity Match',
  P3: 'Geographic Match',
  P4: 'Account Continuity',
  P6: 'Renewal Specialist (FLM)',
  RO: 'Residual Optimization',
  Other: 'Other assignments',
};

const formatCurrency = (value: number): string => {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
};

// Get first name + last initial (e.g., "Tom S")
const formatRepName = (fullName: string) => {
  const parts = fullName.trim().split(' ');
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1][0];
  return `${firstName} ${lastInitial}`;
};

export const BalancingAnalyticsRow: React.FC<BalancingAnalyticsRowProps> = ({
  repMetrics,
  beforeMetrics,
  buildId,
  customerMetrics
}) => {
  const [showAccountsMode, setShowAccountsMode] = useState(false); // false = $, true = # accounts

  // Query priority distribution from assignments table
  const { data: priorityData } = useQuery({
    queryKey: ['priority-distribution', buildId],
    queryFn: async () => {
      if (!buildId) return [];
      
      const { data, error } = await supabase
        .from('assignments')
        .select('rationale')
        .eq('build_id', buildId);
      
      if (error) throw error;
      
      // Parse rationale to extract priority (supports P0-P4 + P6 + RO format)
      const priorityCounts: Record<string, number> = {
        P0: 0,
        P1: 0,
        P2: 0,
        P3: 0,
        P4: 0,
        P6: 0,
        RO: 0,  // Residual Optimization (not a numbered priority)
        Other: 0
      };
      
      (data || []).forEach(assignment => {
        const rationale = assignment.rationale || '';
        
        // New format: "P0:", "P1:", "P2:", etc.
        // Note: Strategic accounts use "Priority 0:" format from optimizationSolver.ts
        if (rationale.includes('P0:') || rationale.includes('Priority 0:') || rationale.includes('Excluded from reassignment') || rationale.toUpperCase().includes('MANUAL')) {
          priorityCounts.P0++;
        } else if (rationale.includes('P1:') || rationale.includes('Stability')) {
          priorityCounts.P1++;
        } else if (rationale.includes('P2:') || rationale.includes('Geography + Continuity')) {
          priorityCounts.P2++;
        } else if (rationale.includes('P3:') || rationale.includes('Geographic Match') || rationale.includes('Geography Match')) {
          priorityCounts.P3++;
        } else if (rationale.includes('P4:') || rationale.includes('Account Continuity') || rationale.includes('Current Owner')) {
          priorityCounts.P4++;
        } else if (
          rationale.includes('RO:') ||
          rationale.includes('Residual Optimization') ||
          rationale.includes('Optimized:') ||
          // Legacy patterns (backward compat for existing data + simplifiedAssignmentEngine)
          rationale.includes('Next Best') || 
          rationale.includes('Best Available') || 
          rationale.includes('Fallback')
        ) {
          priorityCounts.RO++;
        } else if (rationale.includes('P6:') || rationale.includes('Renewal Specialist') || rationale.includes('FLM Routing')) {
          priorityCounts.P6++;
        } else if (rationale) {
          // Legacy format fallback
          if (rationale.includes('Priority 1') || rationale.includes('Continuity + Geo')) {
            priorityCounts.P2++;
          } else if (rationale.includes('Priority 2')) {
            priorityCounts.P3++;
          } else if (rationale.includes('Priority 3')) {
            priorityCounts.P4++;
          } else if (rationale.includes('Priority 4') || rationale.includes('Priority 5')) {
            priorityCounts.RO++;  // Legacy P4/P5 → now RO
          } else {
            priorityCounts.Other++;
          }
        }
      });
      
      // Convert to chart data format, filtering out zeros
      return Object.entries(priorityCounts)
        .filter(([_, count]) => count > 0)
        .map(([name, value]) => ({
          name,
          value,
          color: PRIORITY_COLORS[name],
          description: PRIORITY_DESCRIPTIONS[name] || name
        }));
    },
    enabled: !!buildId
  });

  // Calculate averages
  const avgARRPerRep = customerMetrics?.avgARRPerRep || 
    (repMetrics.length > 0 
      ? repMetrics.reduce((sum, rep) => sum + rep.customerARR, 0) / repMetrics.length 
      : 0);
  
  const avgATRPerRep = repMetrics.length > 0
    ? repMetrics.reduce((sum, rep) => sum + rep.customerATR, 0) / repMetrics.length
    : 0;

  // Total ATR (for display)
  const totalATR = repMetrics.reduce((sum, rep) => sum + rep.customerATR, 0);

  // Calculate prospect pipeline per rep (using totalATR from repMetrics which includes prospect value)
  const avgPipelinePerRep = repMetrics.length > 0
    ? repMetrics.reduce((sum, rep) => sum + (rep.totalATR || 0), 0) / repMetrics.length
    : 0;

  // Prepare before/after data - calculate based on account changes or ARR changes
  const beforeAfterData = React.useMemo(() => {
    if (!beforeMetrics || repMetrics.length === 0) return { winners: [], losers: [] };
    
    const avgBeforeARR = beforeMetrics.avgCustomerARRPerRep;
    const avgBeforeAccounts = beforeMetrics.avgCustomerAccountsPerRep;
    
    const allReps = repMetrics.map(rep => ({
      name: formatRepName(rep.name),
      fullName: rep.name,
      beforeARR: avgBeforeARR,
      afterARR: rep.customerARR,
      changeARR: rep.customerARR - avgBeforeARR,
      beforeAccounts: Math.round(avgBeforeAccounts),
      afterAccounts: rep.customerAccounts,
      changeAccounts: rep.customerAccounts - Math.round(avgBeforeAccounts),
    }));
    
    // Sort by change (positive = winners, negative = losers)
    const sorted = [...allReps].sort((a, b) => {
      const aVal = showAccountsMode ? a.changeAccounts : a.changeARR;
      const bVal = showAccountsMode ? b.changeAccounts : b.changeARR;
      return bVal - aVal;
    });
    
    return {
      winners: sorted.filter(r => (showAccountsMode ? r.changeAccounts : r.changeARR) > 0).slice(0, 5),
      losers: sorted.filter(r => (showAccountsMode ? r.changeAccounts : r.changeARR) < 0).slice(-5).reverse(),
    };
  }, [repMetrics, beforeMetrics, showAccountsMode]);

  // Custom tooltip for pie chart
  const PriorityTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const labels: Record<string, string> = {
        P1: 'Continuity + Geo',
        P2: 'Geo Match',
        P3: 'Continuity Only',
        P4: 'Fallback',
        Manual: 'Manual Reassignment',
        Other: 'Other'
      };
      return (
        <div className="bg-background border rounded-lg px-3 py-2 shadow-lg text-sm">
          <p className="font-medium">{labels[data.name] || data.name}</p>
          <p className="text-muted-foreground">{data.value} accounts</p>
        </div>
      );
    }
    return null;
  };

  // Custom tooltip for bar chart
  const BarTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border rounded-lg px-3 py-2 shadow-lg text-sm">
          <p className="font-medium">{data.fullName}</p>
          <div className="space-y-1 mt-1">
            {showAccountsMode ? (
              <>
                <p className="text-muted-foreground">
                  Before: <span className="font-medium text-foreground">{data.beforeAccounts} accounts</span>
                </p>
                <p className="text-muted-foreground">
                  After: <span className="font-medium text-foreground">{data.afterAccounts} accounts</span>
                </p>
                <p className={`${data.changeAccounts >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {data.changeAccounts >= 0 ? '+' : ''}{data.changeAccounts} accounts
                </p>
              </>
            ) : (
              <>
                <p className="text-muted-foreground">
                  Before: <span className="font-medium text-foreground">{formatCurrency(data.beforeARR)}</span>
                </p>
                <p className="text-muted-foreground">
                  After: <span className="font-medium text-foreground">{formatCurrency(data.afterARR)}</span>
                </p>
                <p className={`${data.changeARR >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {data.changeARR >= 0 ? '+' : ''}{formatCurrency(data.changeARR)}
                </p>
              </>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  const totalAssignments = priorityData?.reduce((sum, d) => sum + d.value, 0) || 0;

  return (
    <div className="space-y-4">
      {/* Row 1: Metrics Cards + Priority Pie */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Average Metrics Cards */}
        <div className="md:col-span-4 grid grid-cols-3 gap-3">
          <Card className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-background border-emerald-200/50 dark:border-emerald-800/30">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-1 mb-3">
                <DollarSign className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-medium text-muted-foreground">Avg ARR</span>
              </div>
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                {formatCurrency(avgARRPerRep)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/20 dark:to-background border-amber-200/50 dark:border-amber-800/30">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-1 mb-3">
                <TrendingUp className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-medium text-muted-foreground">Avg ATR</span>
              </div>
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                {formatCurrency(avgATRPerRep)}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-background border-blue-200/50 dark:border-blue-800/30">
            <CardContent className="p-4 text-center">
              <div className="flex items-center justify-center gap-1 mb-3">
                <TrendingUp className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-medium text-muted-foreground">Avg Pipeline</span>
              </div>
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                {formatCurrency(avgPipelinePerRep)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Priority Distribution Donut */}
        <Card className="md:col-span-8">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-medium text-muted-foreground">Assignment Priority Distribution</p>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-sm mb-2">Assignment priorities (hover legend for details):</p>
                  <ul className="text-xs space-y-0.5">
                    <li><strong>P0</strong>: Manual Holdover & Strategic</li>
                    <li><strong>P1</strong>: Stability (CRE, Renewals, Top 10%)</li>
                    <li><strong>P2-P4</strong>: Optimization priorities</li>
                    <li><strong>RO</strong>: Residual Optimization (final fallback)</li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </div>
            {priorityData && priorityData.length > 0 ? (
              <div className="flex items-center gap-4">
                <div className="h-[100px] w-[100px] flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={priorityData}
                        cx="50%"
                        cy="50%"
                        innerRadius={25}
                        outerRadius={45}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {priorityData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<PriorityTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 grid grid-cols-3 gap-x-4 gap-y-1">
                  {priorityData.map((entry) => (
                    <Tooltip key={entry.name}>
                      <TooltipTrigger asChild>
                        <div className="flex items-center justify-between text-xs cursor-help">
                          <div className="flex items-center gap-1.5">
                            <div 
                              className="w-2 h-2 rounded-full flex-shrink-0" 
                              style={{ backgroundColor: entry.color }}
                            />
                            <span className="text-muted-foreground">{entry.name}</span>
                          </div>
                          <span className="font-medium tabular-nums ml-2">
                            {entry.value} <span className="text-muted-foreground">({Math.round((entry.value / totalAssignments) * 100)}%)</span>
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-sm">{(entry as any).description || entry.name}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[100px] flex items-center justify-center text-sm text-muted-foreground">
                No assignments yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Winners and Losers Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Biggest Winners Chart */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <p className="text-xs font-medium text-muted-foreground">Biggest Gains (Top 5)</p>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-sm">Reps who gained the most {showAccountsMode ? 'accounts' : 'ARR'} compared to the average before assignment.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
                <Button
                  variant={!showAccountsMode ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setShowAccountsMode(false)}
                >
                  <DollarSign className="h-3 w-3" />
                </Button>
                <Button
                  variant={showAccountsMode ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setShowAccountsMode(true)}
                >
                  <Hash className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {beforeAfterData.winners.length > 0 ? (
              <div className="h-[120px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={beforeAfterData.winners} 
                    layout="vertical" 
                    margin={{ left: 0, right: 10, top: 5, bottom: 5 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      tick={{ fontSize: 10 }} 
                      width={55}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RechartsTooltip content={<BarTooltip />} />
                    <Bar 
                      dataKey={showAccountsMode ? "changeAccounts" : "changeARR"} 
                      fill="#22c55e" 
                      radius={[0, 4, 4, 0]} 
                      barSize={12} 
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[120px] flex items-center justify-center text-sm text-muted-foreground">
                No comparison data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Biggest Losers Chart */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-500" />
                <p className="text-xs font-medium text-muted-foreground">Biggest Losses (Top 5)</p>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-sm">Reps who lost the most {showAccountsMode ? 'accounts' : 'ARR'} compared to the average before assignment.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
                <Button
                  variant={!showAccountsMode ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setShowAccountsMode(false)}
                >
                  <DollarSign className="h-3 w-3" />
                </Button>
                <Button
                  variant={showAccountsMode ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setShowAccountsMode(true)}
                >
                  <Hash className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {beforeAfterData.losers.length > 0 ? (
              <div className="h-[120px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={beforeAfterData.losers} 
                    layout="vertical" 
                    margin={{ left: 0, right: 10, top: 5, bottom: 5 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      tick={{ fontSize: 10 }} 
                      width={55}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RechartsTooltip content={<BarTooltip />} />
                    <Bar 
                      dataKey={showAccountsMode ? "changeAccounts" : "changeARR"} 
                      fill="#ef4444" 
                      radius={[0, 4, 4, 0]} 
                      barSize={12} 
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[120px] flex items-center justify-center text-sm text-muted-foreground">
                No comparison data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BalancingAnalyticsRow;
