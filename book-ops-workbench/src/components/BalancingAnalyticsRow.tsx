import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { DollarSign, TrendingUp } from 'lucide-react';
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

// Muted color palette
const PRIORITY_COLORS = {
  P1: '#22c55e', // green - Continuity + Geo
  P2: '#3b82f6', // blue - Geo Match
  P3: '#eab308', // yellow - Continuity Only
  P4: '#f97316', // orange - Fallback
  Manual: '#a855f7', // purple - Manual
  Other: '#6b7280', // gray - Other
};

const formatCurrency = (value: number): string => {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
};

export const BalancingAnalyticsRow: React.FC<BalancingAnalyticsRowProps> = ({
  repMetrics,
  beforeMetrics,
  buildId,
  customerMetrics
}) => {
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
      
      // Parse rationale to extract priority
      const priorityCounts: Record<string, number> = {
        P1: 0,
        P2: 0,
        P3: 0,
        P4: 0,
        Manual: 0,
        Other: 0
      };
      
      (data || []).forEach(assignment => {
        const rationale = assignment.rationale || '';
        if (rationale.includes('Priority 1') || rationale.includes('Continuity + Geo')) {
          priorityCounts.P1++;
        } else if (rationale.includes('Priority 2') || rationale.includes('Geography Match')) {
          priorityCounts.P2++;
        } else if (rationale.includes('Priority 3') || rationale.includes('Current Owner')) {
          priorityCounts.P3++;
        } else if (rationale.includes('Priority 4') || rationale.includes('Priority 5') || rationale.includes('Best Available') || rationale.includes('Fallback')) {
          priorityCounts.P4++;
        } else if (rationale.toUpperCase().includes('MANUAL')) {
          priorityCounts.Manual++;
        } else if (rationale) {
          priorityCounts.Other++;
        }
      });
      
      // Convert to chart data format, filtering out zeros
      return Object.entries(priorityCounts)
        .filter(([_, count]) => count > 0)
        .map(([name, value]) => ({
          name,
          value,
          color: PRIORITY_COLORS[name as keyof typeof PRIORITY_COLORS]
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

  // Prepare before/after data for top reps by ARR change
  const beforeAfterData = React.useMemo(() => {
    if (!beforeMetrics || repMetrics.length === 0) return [];
    
    // Calculate before ARR per rep (approximation based on averages)
    const avgBeforeARR = beforeMetrics.avgCustomerARRPerRep;
    
    // Get top 8 reps sorted by absolute ARR difference from average
    return repMetrics
      .map(rep => ({
        name: rep.name.split(' ').map(n => n[0]).join(''), // Initials
        fullName: rep.name,
        before: avgBeforeARR,
        after: rep.customerARR,
        change: rep.customerARR - avgBeforeARR
      }))
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 8);
  }, [repMetrics, beforeMetrics]);

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
            <p className="text-muted-foreground">
              Before: <span className="font-medium text-foreground">{formatCurrency(data.before)}</span>
            </p>
            <p className="text-muted-foreground">
              After: <span className="font-medium text-foreground">{formatCurrency(data.after)}</span>
            </p>
            <p className={`${data.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {data.change >= 0 ? '+' : ''}{formatCurrency(data.change)}
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  const totalAssignments = priorityData?.reduce((sum, d) => sum + d.value, 0) || 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6">
      {/* Average Metrics Cards */}
      <div className="md:col-span-3 grid grid-cols-2 gap-3">
        <Card className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-background border-emerald-200/50 dark:border-emerald-800/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-medium text-muted-foreground">Avg ARR/Rep</span>
            </div>
            <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
              {formatCurrency(avgARRPerRep)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-background border-blue-200/50 dark:border-blue-800/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-medium text-muted-foreground">Avg ATR/Rep</span>
            </div>
            <p className="text-xl font-bold text-blue-700 dark:text-blue-300">
              {formatCurrency(avgATRPerRep)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Before/After Comparison Chart */}
      <Card className="md:col-span-5">
        <CardContent className="p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Book Changes (Top 8 Reps)</p>
          {beforeAfterData.length > 0 ? (
            <div className="h-[120px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={beforeAfterData} layout="vertical" margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                  <XAxis type="number" hide />
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    tick={{ fontSize: 10 }} 
                    width={30}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<BarTooltip />} />
                  <Bar dataKey="before" fill="#9ca3af" name="Before" radius={[0, 2, 2, 0]} barSize={8} />
                  <Bar dataKey="after" fill="#22c55e" name="After" radius={[0, 2, 2, 0]} barSize={8} />
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

      {/* Priority Distribution Donut */}
      <Card className="md:col-span-4">
        <CardContent className="p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Assignment Priority Distribution</p>
          {priorityData && priorityData.length > 0 ? (
            <div className="flex items-center gap-2">
              <div className="h-[120px] w-[120px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={priorityData}
                      cx="50%"
                      cy="50%"
                      innerRadius={30}
                      outerRadius={50}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {priorityData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<PriorityTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1">
                {priorityData.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div 
                        className="w-2 h-2 rounded-full" 
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="text-muted-foreground">{entry.name}</span>
                    </div>
                    <span className="font-medium tabular-nums">
                      {entry.value} <span className="text-muted-foreground">({Math.round((entry.value / totalAssignments) * 100)}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[120px] flex items-center justify-center text-sm text-muted-foreground">
              No assignments yet
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BalancingAnalyticsRow;

