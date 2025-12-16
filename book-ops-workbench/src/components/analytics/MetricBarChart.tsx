import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { ArrBucket, TierDistribution } from '@/types/analytics';

interface MetricBarChartProps {
  data: ArrBucket[] | { name: string; value: number; color?: string }[];
  title?: string;
  xAxisKey?: string;
  yAxisKey?: string;
  formatValue?: (value: number) => string;
  color?: string;
  showValues?: boolean;
}

const defaultFormatValue = (value: number): string => {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return value.toLocaleString();
};

const CustomTooltip = ({ active, payload, formatValue }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const formatter = formatValue || defaultFormatValue;
    return (
      <div className="bg-background border rounded-lg px-3 py-2 shadow-lg text-sm">
        <p className="font-medium">{data.bucket || data.name}</p>
        <p className="text-muted-foreground">
          {data.count !== undefined && `${data.count} accounts`}
          {data.totalARR !== undefined && ` · ${formatter(data.totalARR)}`}
          {data.value !== undefined && data.count === undefined && formatter(data.value)}
        </p>
      </div>
    );
  }
  return null;
};

export const MetricBarChart: React.FC<MetricBarChartProps> = ({
  data,
  title = 'Distribution',
  xAxisKey = 'bucket',
  yAxisKey = 'count',
  formatValue = defaultFormatValue,
  color = 'hsl(var(--primary))',
  showValues = false,
}) => {
  // Normalize data to have consistent keys
  const normalizedData = data.map(item => {
    if ('bucket' in item) {
      return {
        name: item.bucket,
        value: item.count,
        totalARR: item.totalARR,
        ...item,
      };
    }
    return item;
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-[140px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={normalizedData} 
              margin={{ top: 10, right: 10, left: -10, bottom: 5 }}
            >
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={35}
              />
              <Tooltip content={(props) => <CustomTooltip {...props} formatValue={formatValue} />} wrapperStyle={{ zIndex: 1000 }} />
              <Bar 
                dataKey="value" 
                radius={[4, 4, 0, 0]}
                fill={color}
              >
                {normalizedData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={(entry as any).color || color}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

/**
 * Specialized version for Tier Distribution
 */
export const TierDistributionChart: React.FC<{ distribution: TierDistribution; title?: string }> = ({
  distribution,
  title = 'Account Tiers',
}) => {
  const data = [
    { name: 'Tier 1', value: distribution.tier1, color: '#8b5cf6' }, // purple
    { name: 'Tier 2', value: distribution.tier2, color: '#3b82f6' }, // blue
    { name: 'Standard', value: distribution.standard, color: '#6b7280' }, // gray
  ];

  return (
    <MetricBarChart 
      data={data} 
      title={title}
      formatValue={(v) => v.toLocaleString()}
    />
  );
};

export default MetricBarChart;








