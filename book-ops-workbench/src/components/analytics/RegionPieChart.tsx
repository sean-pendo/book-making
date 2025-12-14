import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { RegionMetrics } from '@/types/analytics';

interface RegionPieChartProps {
  data: RegionMetrics[];
  title?: string;
  metric?: 'accounts' | 'arr' | 'atr' | 'pipeline';
  showLegend?: boolean;
}

const REGION_COLORS: Record<string, string> = {
  AMER: 'hsl(var(--chart-1))',
  EMEA: 'hsl(var(--chart-2))',
  APAC: 'hsl(var(--chart-3))',
};

// Fallback colors if CSS variables don't work
const FALLBACK_COLORS: Record<string, string> = {
  AMER: '#3b82f6', // blue
  EMEA: '#22c55e', // green
  APAC: '#f59e0b', // amber
};

const formatValue = (value: number, metric: string): string => {
  if (metric === 'arr' || metric === 'atr' || metric === 'pipeline') {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value.toFixed(0)}`;
  }
  return value.toLocaleString();
};

const CustomTooltip = ({ active, payload, metric }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-background border rounded-lg px-3 py-2 shadow-lg text-sm">
        <p className="font-medium">{data.region}</p>
        <p className="text-muted-foreground">
          {formatValue(data[metric], metric)}
        </p>
        {data.repCount !== undefined && (
          <p className="text-muted-foreground text-xs">
            {data.repCount} reps
          </p>
        )}
      </div>
    );
  }
  return null;
};

export const RegionPieChart: React.FC<RegionPieChartProps> = ({
  data,
  title = 'By Region',
  metric = 'accounts',
  showLegend = true,
}) => {
  const chartData = data.map(region => ({
    ...region,
    value: region[metric],
    color: FALLBACK_COLORS[region.region] || '#6b7280',
  }));

  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-4">
          <div className="h-[120px] w-[120px] flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={30}
                  outerRadius={55}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={(props) => <CustomTooltip {...props} metric={metric} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          
          {showLegend && (
            <div className="flex-1 space-y-2">
              {chartData.map((entry) => (
                <div key={entry.region} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-muted-foreground">{entry.region}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-medium">
                      {formatValue(entry.value, metric)}
                    </span>
                    {total > 0 && (
                      <span className="text-muted-foreground text-xs ml-1">
                        ({Math.round((entry.value / total) * 100)}%)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default RegionPieChart;

