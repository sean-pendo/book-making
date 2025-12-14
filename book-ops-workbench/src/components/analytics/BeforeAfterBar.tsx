import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { RegionMetrics } from '@/types/analytics';

interface BeforeAfterBarProps {
  beforeData: RegionMetrics[];
  afterData: RegionMetrics[];
  metric: 'accounts' | 'arr' | 'atr' | 'pipeline';
  title?: string;
}

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

const CustomTooltip = ({ active, payload, label, metric }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background border rounded-lg px-3 py-2 shadow-lg text-sm">
        <p className="font-medium mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-muted-foreground" style={{ color: entry.color }}>
            {entry.name}: {formatValue(entry.value, metric)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export const BeforeAfterBar: React.FC<BeforeAfterBarProps> = ({
  beforeData,
  afterData,
  metric,
  title = 'Before vs After',
}) => {
  // Merge before and after data by region
  const chartData = beforeData.map(before => {
    const after = afterData.find(a => a.region === before.region);
    return {
      region: before.region,
      before: before[metric],
      after: after ? after[metric] : 0,
    };
  });

  const metricLabels: Record<string, string> = {
    accounts: 'Accounts',
    arr: 'ARR',
    atr: 'ATR',
    pipeline: 'Pipeline',
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          {title} - {metricLabels[metric]}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={chartData} 
              margin={{ top: 10, right: 10, left: -10, bottom: 5 }}
            >
              <XAxis 
                dataKey="region" 
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={45}
                tickFormatter={(value) => formatValue(value, metric)}
              />
              <Tooltip content={(props) => <CustomTooltip {...props} metric={metric} />} />
              <Legend 
                wrapperStyle={{ fontSize: 11 }}
                iconType="circle"
                iconSize={8}
              />
              <Bar 
                dataKey="before" 
                name="Before"
                fill="#94a3b8"
                radius={[4, 4, 0, 0]}
                barSize={20}
              />
              <Bar 
                dataKey="after" 
                name="After"
                fill="#3b82f6"
                radius={[4, 4, 0, 0]}
                barSize={20}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default BeforeAfterBar;








