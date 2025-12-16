import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, TrendingDown, Users, DollarSign } from 'lucide-react';

interface RepWorkload {
  repId: string;
  repName: string;
  region: string;
  currentARR: number;
  currentAccounts: number;
  proposedARR: number;
  proposedAccounts: number;
  territories: Set<string>;
  pool?: 'strategic' | 'normal';
}

interface WorkloadBalanceVisualizationProps {
  repWorkloads: RepWorkload[];
  balanceScore: number;
  varianceScore: number;
  targetARRPerRep: number;
  minARRPerRep: number;
}

export const WorkloadBalanceVisualization: React.FC<WorkloadBalanceVisualizationProps> = ({
  repWorkloads,
  balanceScore,
  varianceScore,
  targetARRPerRep,
  minARRPerRep
}) => {
  // Group reps by pool for visualization
  const stratReps = repWorkloads.filter(r => r.pool === 'strategic');
  const normalReps = repWorkloads.filter(r => r.pool !== 'strategic');

  // Prepare data for chart
  const prepareChartData = (workloads: RepWorkload[]) => workloads.map(workload => ({
    name: workload.repName.split(' ').map(n => n[0]).join(''), // Initials
    fullName: workload.repName,
    region: workload.region,
    pool: workload.pool || 'normal',
    currentARR: workload.currentARR / 1000000, // Convert to millions
    proposedARR: workload.proposedARR / 1000000,
    currentAccounts: workload.currentAccounts,
    proposedAccounts: workload.proposedAccounts,
    change: (workload.proposedARR - workload.currentARR) / 1000000
  })).sort((a, b) => b.proposedARR - a.proposedARR);

  const chartData = prepareChartData(repWorkloads);

  // Calculate statistics
  const totalCurrentARR = repWorkloads.reduce((sum, w) => sum + w.currentARR, 0);
  const totalProposedARR = repWorkloads.reduce((sum, w) => sum + w.proposedARR, 0);
  const avgProposedARR = totalProposedARR / repWorkloads.length;
  
  const repsAboveMin = repWorkloads.filter(w => w.proposedARR >= minARRPerRep).length;
  const repsBelowMin = repWorkloads.length - repsAboveMin;

  // Color coding for bars
  const getBarColor = (arr: number, target: number, min: number) => {
    if (arr < min / 1000000) return '#ef4444'; // Red - below minimum
    if (arr < target / 1000000 * 0.8) return '#f97316'; // Orange - below 80% of target
    if (arr > target / 1000000 * 1.2) return '#eab308'; // Yellow - above 120% of target
    return '#22c55e'; // Green - balanced
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border rounded-lg p-3 shadow-lg">
          <p className="font-semibold">{data.fullName}</p>
          <p className="text-sm text-muted-foreground">{data.region}</p>
          <div className="mt-2 space-y-1">
            <p className="text-sm">
              Current ARR: <span className="font-medium">${data.currentARR.toFixed(1)}M</span>
            </p>
            <p className="text-sm">
              Proposed ARR: <span className="font-medium">${data.proposedARR.toFixed(1)}M</span>
            </p>
            <p className="text-sm">
              Accounts: <span className="font-medium">{data.currentAccounts} → {data.proposedAccounts}</span>
            </p>
            {data.change !== 0 && (
              <p className={`text-sm flex items-center gap-1 ${data.change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {data.change > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {data.change > 0 ? '+' : ''}{data.change.toFixed(1)}M change
              </p>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BarChart className="h-4 w-4 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Balance Score</p>
                <p className="text-2xl font-bold">{balanceScore.toFixed(0)}/100</p>
              </div>
            </div>
            <Progress value={balanceScore} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-orange-500" />
              <div>
                <p className="text-sm text-muted-foreground">Variance</p>
                <p className="text-2xl font-bold">{varianceScore.toFixed(1)}%</p>
              </div>
            </div>
            <Badge variant={varianceScore < 20 ? "success" : varianceScore < 30 ? "secondary" : "destructive"} className="mt-2">
              {varianceScore < 20 ? 'Excellent' : varianceScore < 30 ? 'Good' : 'Needs Work'}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Above Minimum</p>
                <p className="text-2xl font-bold">{repsAboveMin}/{repWorkloads.length}</p>
              </div>
            </div>
            {repsBelowMin > 0 && (
              <Badge variant="destructive" className="mt-2">
                {repsBelowMin} below ${(minARRPerRep/1000000).toFixed(1)}M
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-purple-500" />
              <div>
                <p className="text-sm text-muted-foreground">Avg ARR</p>
                <p className="text-2xl font-bold">${(avgProposedARR/1000000).toFixed(1)}M</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Target: ${(targetARRPerRep/1000000).toFixed(1)}M
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ARR Distribution Chart with Pool Separation */}
      <Card>
        <CardHeader>
          <CardTitle>ARR Distribution by Representative & Pool</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {stratReps.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg">Strategic Pool</h3>
                <Badge variant="secondary">{stratReps.length} reps</Badge>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={prepareChartData(stratReps)} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis 
                      label={{ value: 'ARR (Millions)', angle: -90, position: 'insideLeft' }}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 1000 }} />
                    <Bar dataKey="proposedARR" radius={[4, 4, 0, 0]}>
                      {prepareChartData(stratReps).map((entry, index) => (
                        <Cell 
                          key={`strat-cell-${index}`} 
                          fill={getBarColor(entry.proposedARR, targetARRPerRep, minARRPerRep)} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {normalReps.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg">Normal Pool</h3>
                <Badge variant="outline">{normalReps.length} reps</Badge>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={prepareChartData(normalReps)} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 12 }}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis 
                      label={{ value: 'ARR (Millions)', angle: -90, position: 'insideLeft' }}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip content={<CustomTooltip />} wrapperStyle={{ zIndex: 1000 }} />
                    <Bar dataKey="proposedARR" radius={[4, 4, 0, 0]}>
                      {prepareChartData(normalReps).map((entry, index) => (
                        <Cell 
                          key={`normal-cell-${index}`} 
                          fill={getBarColor(entry.proposedARR, targetARRPerRep, minARRPerRep)} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          
          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-4 justify-center">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded"></div>
              <span className="text-xs">Below Minimum</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-orange-500 rounded"></div>
              <span className="text-xs">Below Target</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded"></div>
              <span className="text-xs">Balanced</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-500 rounded"></div>
              <span className="text-xs">Above Target</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Workload Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Workload Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {chartData.map((data, index) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="font-medium">{data.fullName}</span>
                    <span className="text-sm text-muted-foreground">{data.region}</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-4 text-sm">
                  <div className="text-center">
                    <p className="font-medium">${data.proposedARR.toFixed(1)}M</p>
                    <p className="text-muted-foreground">ARR</p>
                  </div>
                  <div className="text-center">
                    <p className="font-medium">{data.proposedAccounts}</p>
                    <p className="text-muted-foreground">Accounts</p>
                  </div>
                  {data.change !== 0 && (
                    <div className="text-center">
                      <p className={`font-medium ${data.change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {data.change > 0 ? '+' : ''}{data.change.toFixed(1)}M
                      </p>
                      <p className="text-muted-foreground">Change</p>
                    </div>
                  )}
                  <Badge 
                    variant={
                      data.proposedARR < minARRPerRep / 1000000 ? "destructive" :
                      data.proposedARR < targetARRPerRep / 1000000 * 0.8 ? "secondary" :
                      data.proposedARR > targetARRPerRep / 1000000 * 1.2 ? "outline" : "success"
                    }
                  >
                    {data.proposedARR < minARRPerRep / 1000000 ? 'Below Min' :
                     data.proposedARR < targetARRPerRep / 1000000 * 0.8 ? 'Light' :
                     data.proposedARR > targetARRPerRep / 1000000 * 1.2 ? 'Heavy' : 'Balanced'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};