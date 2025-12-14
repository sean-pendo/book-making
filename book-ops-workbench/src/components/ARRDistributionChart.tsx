import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

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

// Get first name + last initial (e.g., "Tom S")
const formatRepName = (fullName: string) => {
  const parts = fullName.trim().split(' ');
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1][0];
  return `${firstName} ${lastInitial}`;
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
  
  // Calculate data-driven scale: use max data value with 10% padding
  // Only extend to hardCap if data actually approaches it
  const maxDataValue = Math.max(...sortedData.map(d => d.customerARR), 0);
  const dataWithPadding = maxDataValue * 1.1; // 10% headroom
  
  // Use whichever is larger: data with padding, or preferredMax (to show the target zone)
  // But don't stretch to hardCap unless data is actually near it
  const maxValue = Math.max(dataWithPadding, preferredMax * 1.1);
  
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
    if (arr > preferredMax) return 'Over ceiling - needs rebalancing';
    if (arr >= minThreshold && arr <= preferredMax) return 'In range';
    return 'Below floor - can take more';
  };

  // Calculate summary stats
  const withinBand = sortedData.filter(d => d.customerARR >= minThreshold && d.customerARR <= preferredMax).length;
  const overCeiling = sortedData.filter(d => d.customerARR > preferredMax).length;
  const belowFloor = sortedData.filter(d => d.customerARR < minThreshold).length;

  // Calculate positions for threshold markers
  const minPos = (minThreshold / maxValue) * 100;
  const prefMaxPos = (preferredMax / maxValue) * 100;
  const hardCapPos = (hardCap / maxValue) * 100;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 bg-card">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">{title}</CardTitle>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-sm">Shows each rep's total Customer ARR. Green = in range (floor to ceiling), Blue = below floor (can take more accounts), Red = over ceiling (needs rebalancing).</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <CardDescription className="flex gap-4 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-blue-500" />
            Below Floor: {belowFloor}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-green-500" />
            In Range: {withinBand}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-red-500" />
            Over Ceiling: {overCeiling}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="relative">
        {/* Threshold legend - shows green target zone */}
        <div className="flex items-center justify-start gap-5 mb-4 text-xs flex-wrap bg-card pb-2">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-4 bg-green-500/30 border border-green-500/50 rounded-sm" />
            <span className="text-green-600 font-medium">Target Zone: {formatCurrency(minThreshold)} - {formatCurrency(preferredMax)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-0.5 h-4 bg-red-500" />
            <span className="text-red-600">Hard Cap: {formatCurrency(hardCap)}</span>
          </div>
        </div>

        {/* Bar chart */}
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {sortedData.map((rep) => (
            <Tooltip key={rep.repId}>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 group cursor-pointer">
                  <div className="w-24 text-xs truncate text-right text-muted-foreground group-hover:text-foreground">
                    {formatRepName(rep.repName)}
                  </div>
                  <div className="flex-1 bg-muted rounded-full h-4 relative overflow-hidden">
                    {/* Green target zone highlight */}
                    <div 
                      className="absolute top-0 bottom-0 bg-green-500/20"
                      style={{ 
                        left: `${minPos}%`, 
                        width: `${prefMaxPos - minPos}%` 
                      }}
                    />
                    {/* The actual bar */}
                    <div
                      className={`h-full rounded-full transition-all ${getBarColor(rep.customerARR)} group-hover:opacity-80 relative z-10`}
                      style={{ width: `${getBarWidth(rep.customerARR)}%` }}
                    />
                    {/* Hard cap line */}
                    <div 
                      className="absolute top-0 bottom-0 w-0.5 bg-red-500/70 z-20"
                      style={{ left: `${hardCapPos}%` }}
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
