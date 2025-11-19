import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';

interface RuleUsageData {
  region: string;
  GEO_FIRST?: number;
  CONTINUITY?: number;
  LOAD_BALANCE?: number;
  [key: string]: number | string | undefined;
}

interface RuleUsageByRegionChartProps {
  data: RuleUsageData[];
}

const RULE_COLORS = {
  GEO_FIRST: 'hsl(var(--primary))',
  CONTINUITY: 'hsl(var(--secondary))',
  LOAD_BALANCE: 'hsl(var(--accent))',
  MANUAL: 'hsl(var(--muted-foreground))',
  ROUND_ROBIN: 'hsl(var(--destructive))',
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const total = payload.reduce((sum: number, entry: any) => sum + (entry.value || 0), 0);
    
    return (
      <div className="bg-background border rounded-lg shadow-lg p-3">
        <p className="font-medium mb-2">{`${label} Region`}</p>
        <div className="space-y-1">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded" 
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-sm">{entry.dataKey.replace('_', ' ')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{entry.value}</span>
                <span className="text-xs text-muted-foreground">
                  ({total > 0 ? Math.round((entry.value / total) * 100) : 0}%)
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t mt-2 pt-2">
          <div className="flex justify-between">
            <span className="text-sm font-medium">Total:</span>
            <span className="font-medium">{total}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export const RuleUsageByRegionChart: React.FC<RuleUsageByRegionChartProps> = ({ data }) => {
  // Get all rule types from the data
  const allRules = Array.from(
    new Set(
      data.flatMap(item => 
        Object.keys(item).filter(key => key !== 'region' && typeof item[key] === 'number')
      )
    )
  );

  const formatData = data.map(item => ({
    ...item,
    // Ensure all rules have a value (0 if not present)
    ...allRules.reduce((acc, rule) => ({
      ...acc,
      [rule]: item[rule] || 0
    }), {})
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Rule Usage by Region
        </CardTitle>
        <CardDescription>
          Distribution of assignment rules across geographic regions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={formatData}
              margin={{
                top: 20,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis 
                dataKey="region" 
                tick={{ fontSize: 12 }}
                interval={0}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              
              {allRules.map((rule, index) => (
                <Bar
                  key={rule}
                  dataKey={rule}
                  stackId="rules"
                  fill={RULE_COLORS[rule as keyof typeof RULE_COLORS] || `hsl(${(index * 60) % 360}, 50%, 50%)`}
                  radius={index === allRules.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t">
          {allRules.map((rule) => (
            <div key={rule} className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded" 
                style={{ backgroundColor: RULE_COLORS[rule as keyof typeof RULE_COLORS] || `hsl(${(allRules.indexOf(rule) * 60) % 360}, 50%, 50%)` }}
              />
              <span className="text-sm">{rule.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};