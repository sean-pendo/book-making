import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ARRDistributionData {
  repId: string;
  repName: string;
  customerARR: number;
  region?: string;
  status?: 'Balanced' | 'Overloaded' | 'Light';
}

interface ARRDistributionChartProps {
  data: ARRDistributionData[];
  targetArr: number;
  minThreshold: number;
  preferredMax: number;
  hardCap: number;
  title?: string;
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

export const ARRDistributionChart: React.FC<ARRDistributionChartProps> = ({
  data,
  targetArr,
  minThreshold,
  preferredMax,
  hardCap,
  title = "ARR Distribution by Rep"
}) => {
  // Sort by ARR descending
  const sortedData = [...data].sort((a, b) => b.customerARR - a.customerARR);
  
  // Calculate the maximum for scaling (use hardCap or max value, whichever is higher)
  const maxValue = Math.max(hardCap, ...sortedData.map(d => d.customerARR));
  
  // Calculate bar width as percentage
  const getBarWidth = (arr: number) => {
    return Math.min(100, (arr / maxValue) * 100);
  };
  
  // Get bar color based on thresholds
  const getBarColor = (arr: number) => {
    if (arr > preferredMax) {
      return 'bg-red-500 dark:bg-red-600'; // Over preferred max
    }
    if (arr >= minThreshold && arr <= preferredMax) {
      return 'bg-green-500 dark:bg-green-600'; // Within band
    }
    return 'bg-blue-500 dark:bg-blue-600'; // Under minimum
  };
  
  // Get status text
  const getStatusText = (arr: number) => {
    if (arr > preferredMax) return 'Over preferred max';
    if (arr >= minThreshold && arr <= preferredMax) return 'Within target band';
    return 'Below minimum';
  };

  // Calculate summary stats
  const withinBand = sortedData.filter(d => d.customerARR >= minThreshold && d.customerARR <= preferredMax).length;
  const overMax = sortedData.filter(d => d.customerARR > preferredMax).length;
  const underMin = sortedData.filter(d => d.customerARR < minThreshold).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription className="flex gap-4 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-green-500" />
            Within Band: {withinBand}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-blue-500" />
            Under Min: {underMin}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-red-500" />
            Over Max: {overMax}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Threshold markers */}
        <div className="relative mb-2 h-6 flex items-center">
          <div 
            className="absolute border-l-2 border-blue-400 border-dashed h-full"
            style={{ left: `${(minThreshold / maxValue) * 100}%` }}
          >
            <span className="absolute -top-1 left-1 text-[10px] text-blue-500 whitespace-nowrap">
              Min {formatCurrency(minThreshold)}
            </span>
          </div>
          <div 
            className="absolute border-l-2 border-green-500 h-full"
            style={{ left: `${(targetArr / maxValue) * 100}%` }}
          >
            <span className="absolute -top-1 left-1 text-[10px] text-green-600 whitespace-nowrap font-medium">
              Target {formatCurrency(targetArr)}
            </span>
          </div>
          <div 
            className="absolute border-l-2 border-yellow-500 border-dashed h-full"
            style={{ left: `${(preferredMax / maxValue) * 100}%` }}
          >
            <span className="absolute -top-1 left-1 text-[10px] text-yellow-600 whitespace-nowrap">
              Pref Max {formatCurrency(preferredMax)}
            </span>
          </div>
          <div 
            className="absolute border-l-2 border-red-500 h-full"
            style={{ left: `${(hardCap / maxValue) * 100}%` }}
          >
            <span className="absolute -top-1 left-1 text-[10px] text-red-600 whitespace-nowrap">
              Hard Cap {formatCurrency(hardCap)}
            </span>
          </div>
        </div>

        {/* Bar chart */}
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {sortedData.map((rep) => (
            <Tooltip key={rep.repId}>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 group cursor-pointer">
                  <div className="w-24 text-xs truncate text-right text-muted-foreground group-hover:text-foreground">
                    {rep.repName.split(' ')[0]}
                  </div>
                  <div className="flex-1 bg-muted rounded-full h-4 relative overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${getBarColor(rep.customerARR)} group-hover:opacity-80`}
                      style={{ width: `${getBarWidth(rep.customerARR)}%` }}
                    />
                    {/* Threshold lines on bar */}
                    <div 
                      className="absolute top-0 bottom-0 border-l border-green-300"
                      style={{ left: `${(targetArr / maxValue) * 100}%` }}
                    />
                  </div>
                  <div className="w-16 text-xs font-medium text-right">
                    {formatCurrency(rep.customerARR)}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <div className="text-sm">
                  <div className="font-medium">{rep.repName}</div>
                  {rep.region && <div className="text-muted-foreground">{rep.region}</div>}
                  <div className="mt-1">ARR: {formatCurrency(rep.customerARR)}</div>
                  <div className={`text-xs mt-1 ${
                    rep.customerARR > preferredMax ? 'text-red-500' : 
                    rep.customerARR >= minThreshold ? 'text-green-500' : 'text-blue-500'
                  }`}>
                    {getStatusText(rep.customerARR)}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

