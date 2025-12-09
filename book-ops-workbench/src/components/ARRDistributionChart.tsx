import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { BarChart3, TrendingDown, TrendingUp, Minus } from 'lucide-react';

interface RepARRData {
  repId: string;
  repName: string;
  region: string | null;
  arr: number;
  accountCount: number;
}

interface ARRDistributionChartProps {
  data: RepARRData[];
  targetArr: number;
  minThreshold: number;
  preferredMax: number;
  hardCap: number;
  title?: string;
}

const formatCurrency = (value: number): string => {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
};

export const ARRDistributionChart: React.FC<ARRDistributionChartProps> = ({
  data,
  targetArr,
  minThreshold,
  preferredMax,
  hardCap,
  title = 'ARR Distribution by Rep'
}) => {
  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => b.arr - a.arr);
  }, [data]);

  const maxARR = useMemo(() => {
    return Math.max(...data.map(d => d.arr), hardCap);
  }, [data, hardCap]);

  const stats = useMemo(() => {
    const arrValues = data.map(d => d.arr);
    const total = arrValues.reduce((a, b) => a + b, 0);
    const avg = total / arrValues.length;
    const min = Math.min(...arrValues);
    const max = Math.max(...arrValues);
    
    const belowMin = data.filter(d => d.arr < minThreshold).length;
    const inBand = data.filter(d => d.arr >= minThreshold && d.arr <= preferredMax).length;
    const overMax = data.filter(d => d.arr > preferredMax).length;

    return { total, avg, min, max, belowMin, inBand, overMax };
  }, [data, minThreshold, preferredMax]);

  const getBarColor = (arr: number): string => {
    if (arr < minThreshold) return 'bg-amber-500';
    if (arr > preferredMax) return 'bg-red-500';
    return 'bg-green-500';
  };

  const getStatusIcon = (arr: number) => {
    if (arr < minThreshold) return <TrendingDown className="h-3 w-3 text-amber-500" />;
    if (arr > preferredMax) return <TrendingUp className="h-3 w-3 text-red-500" />;
    return <Minus className="h-3 w-3 text-green-500" />;
  };

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center">No data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-elevated">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              {title}
            </CardTitle>
            <CardDescription>
              {data.length} reps • Total: {formatCurrency(stats.total)} • Avg: {formatCurrency(stats.avg)}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="text-amber-600 border-amber-300">
              Below: {stats.belowMin}
            </Badge>
            <Badge variant="outline" className="text-green-600 border-green-300">
              In Band: {stats.inBand}
            </Badge>
            <Badge variant="outline" className="text-red-600 border-red-300">
              Over: {stats.overMax}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Reference Lines Legend */}
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-4 px-2">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              Below Min ({formatCurrency(minThreshold)})
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              In Band
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              Over Preferred ({formatCurrency(preferredMax)})
            </span>
          </div>
          <span>Target: {formatCurrency(targetArr)}</span>
        </div>

        {/* Chart Container */}
        <div className="relative">
          {/* Reference lines */}
          <div 
            className="absolute h-full border-l-2 border-dashed border-amber-400 z-10"
            style={{ left: `${(minThreshold / maxARR) * 100}%` }}
          />
          <div 
            className="absolute h-full border-l-2 border-dashed border-blue-400 z-10"
            style={{ left: `${(targetArr / maxARR) * 100}%` }}
          />
          <div 
            className="absolute h-full border-l-2 border-dashed border-red-400 z-10"
            style={{ left: `${(preferredMax / maxARR) * 100}%` }}
          />

          {/* Bars */}
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-2">
            {sortedData.map((rep) => (
              <Tooltip key={rep.repId}>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 group cursor-pointer">
                    <div className="w-24 text-xs truncate text-right">
                      <span className="group-hover:text-primary transition-colors">
                        {rep.repName.split(' ').pop()}
                      </span>
                    </div>
                    <div className="flex-1 h-6 bg-muted/30 rounded relative overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded transition-all group-hover:opacity-80',
                          getBarColor(rep.arr)
                        )}
                        style={{ width: `${(rep.arr / maxARR) * 100}%` }}
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium">
                        {formatCurrency(rep.arr)}
                      </span>
                    </div>
                    <div className="w-6">
                      {getStatusIcon(rep.arr)}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">
                  <div className="space-y-1">
                    <p className="font-medium">{rep.repName}</p>
                    <p className="text-sm">Region: {rep.region || 'N/A'}</p>
                    <p className="text-sm">ARR: {formatCurrency(rep.arr)}</p>
                    <p className="text-sm">Accounts: {rep.accountCount}</p>
                    <p className="text-xs text-muted-foreground">
                      {rep.arr < minThreshold && 'Below minimum threshold'}
                      {rep.arr >= minThreshold && rep.arr <= preferredMax && 'Within target band'}
                      {rep.arr > preferredMax && 'Over preferred maximum'}
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

        {/* X-Axis Labels */}
        <div className="flex justify-between text-xs text-muted-foreground mt-2 pt-2 border-t">
          <span>$0</span>
          <span>{formatCurrency(maxARR / 4)}</span>
          <span>{formatCurrency(maxARR / 2)}</span>
          <span>{formatCurrency(maxARR * 3 / 4)}</span>
          <span>{formatCurrency(maxARR)}</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default ARRDistributionChart;

