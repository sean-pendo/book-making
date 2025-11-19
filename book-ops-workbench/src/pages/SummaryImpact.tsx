import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { BarChart3, TrendingUp, TrendingDown, Users, DollarSign, Calendar, Target, Download, ArrowRight, ArrowLeft, Minus } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface TeamSummary {
  team_name: string;
  region: string;
  current_arr: number;
  previous_arr: number;
  arr_delta: number;
  current_atr: number;
  previous_atr: number;
  atr_delta: number;
  current_customers: number;
  previous_customers: number;
  customer_delta: number;
  current_prospects: number;
  previous_prospects: number;
  prospect_delta: number;
  renewal_q1: number;
  renewal_q2: number;
  renewal_q3: number;
  renewal_q4: number;
  continuity_percentage: number;
  accounts_gained: number;
  accounts_lost: number;
  accounts_held: number;
}

interface ComparisonMetrics {
  metric: string;
  current_year: number;
  prior_year: number;
  delta: number;
  delta_percentage: number;
  trend: 'up' | 'down' | 'flat';
}

export const SummaryImpact = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('summary');

  const [teamSummaries] = useState<TeamSummary[]>([
    {
      team_name: 'Enterprise AMER',
      region: 'AMER',
      current_arr: 12500000,
      previous_arr: 11800000,
      arr_delta: 700000,
      current_atr: 9800000,
      previous_atr: 9200000,
      atr_delta: 600000,
      current_customers: 145,
      previous_customers: 138,
      customer_delta: 7,
      current_prospects: 89,
      previous_prospects: 95,
      prospect_delta: -6,
      renewal_q1: 35,
      renewal_q2: 28,
      renewal_q3: 42,
      renewal_q4: 31,
      continuity_percentage: 78,
      accounts_gained: 12,
      accounts_lost: 5,
      accounts_held: 138
    },
    {
      team_name: 'Enterprise EMEA',
      region: 'EMEA',
      current_arr: 9800000,
      previous_arr: 9200000,
      arr_delta: 600000,
      current_atr: 7400000,
      previous_atr: 7100000,
      atr_delta: 300000,
      current_customers: 112,
      previous_customers: 108,
      customer_delta: 4,
      current_prospects: 67,
      previous_prospects: 72,
      prospect_delta: -5,
      renewal_q1: 22,
      renewal_q2: 31,
      renewal_q3: 28,
      renewal_q4: 26,
      continuity_percentage: 82,
      accounts_gained: 8,
      accounts_lost: 4,
      accounts_held: 108
    },
    {
      team_name: 'Commercial AMER',
      region: 'AMER',
      current_arr: 8200000,
      previous_arr: 7800000,
      arr_delta: 400000,
      current_atr: 6100000,
      previous_atr: 5900000,
      atr_delta: 200000,
      current_customers: 234,
      previous_customers: 225,
      customer_delta: 9,
      current_prospects: 456,
      previous_prospects: 445,
      prospect_delta: 11,
      renewal_q1: 58,
      renewal_q2: 62,
      renewal_q3: 55,
      renewal_q4: 49,
      continuity_percentage: 71,
      accounts_gained: 23,
      accounts_lost: 14,
      accounts_held: 225
    },
    {
      team_name: 'Commercial EMEA',
      region: 'EMEA',
      current_arr: 6800000,
      previous_arr: 6400000,
      arr_delta: 400000,
      current_atr: 4900000,
      previous_atr: 4700000,
      atr_delta: 200000,
      current_customers: 189,
      previous_customers: 182,
      customer_delta: 7,
      current_prospects: 312,
      previous_prospects: 298,
      prospect_delta: 14,
      renewal_q1: 42,
      renewal_q2: 38,
      renewal_q3: 46,
      renewal_q4: 35,
      continuity_percentage: 75,
      accounts_gained: 18,
      accounts_lost: 11,
      accounts_held: 182
    }
  ]);

  const [comparisonMetrics] = useState<ComparisonMetrics[]>([
    {
      metric: 'Total ARR',
      current_year: 37300000,
      prior_year: 35200000,
      delta: 2100000,
      delta_percentage: 5.97,
      trend: 'up'
    },
    {
      metric: 'Total ATR',
      current_year: 28200000,
      prior_year: 26900000,
      delta: 1300000,
      delta_percentage: 4.83,
      trend: 'up'
    },
    {
      metric: 'Total Customers',
      current_year: 680,
      prior_year: 653,
      delta: 27,
      delta_percentage: 4.14,
      trend: 'up'
    },
    {
      metric: 'Total Prospects',
      current_year: 924,
      prior_year: 910,
      delta: 14,
      delta_percentage: 1.54,
      trend: 'up'
    },
    {
      metric: 'Average Continuity',
      current_year: 76.5,
      prior_year: 72.3,
      delta: 4.2,
      delta_percentage: 5.81,
      trend: 'up'
    },
    {
      metric: 'Q1 Renewals',
      current_year: 157,
      prior_year: 148,
      delta: 9,
      delta_percentage: 6.08,
      trend: 'up'
    },
    {
      metric: 'Q2 Renewals',
      current_year: 159,
      prior_year: 142,
      delta: 17,
      delta_percentage: 11.97,
      trend: 'up'
    },
    {
      metric: 'Q3 Renewals',
      current_year: 171,
      prior_year: 156,
      delta: 15,
      delta_percentage: 9.62,
      trend: 'up'
    }
  ]);

  const generateVPCheatSheet = () => {
    toast({
      title: "VP Cheat Sheet Generated",
      description: "One-page executive summary is being prepared for download",
    });
  };

  const getTrendIcon = (trend: string, delta: number) => {
    if (trend === 'up' || delta > 0) {
      return <TrendingUp className="w-4 h-4 text-green-600" />;
    } else if (trend === 'down' || delta < 0) {
      return <TrendingDown className="w-4 h-4 text-red-600" />;
    }
    return <Minus className="w-4 h-4 text-gray-500" />;
  };

  const getDeltaBadge = (delta: number, isPercentage = false) => {
    const value = isPercentage ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%` : `${delta > 0 ? '+' : ''}${delta.toLocaleString()}`;
    
    if (delta > 0) {
      return <Badge className="bg-green-500">{value}</Badge>;
    } else if (delta < 0) {
      return <Badge variant="destructive">{value}</Badge>;
    }
    return <Badge variant="outline">{value}</Badge>;
  };

  const formatCurrency = (amount: number) => {
    return `$${(amount / 1000000).toFixed(1)}M`;
  };

  const totalCurrentARR = teamSummaries.reduce((sum, team) => sum + team.current_arr, 0);
  const totalPreviousARR = teamSummaries.reduce((sum, team) => sum + team.previous_arr, 0);
  const totalARRDelta = totalCurrentARR - totalPreviousARR;

  const totalCurrentCustomers = teamSummaries.reduce((sum, team) => sum + team.current_customers, 0);
  const totalPreviousCustomers = teamSummaries.reduce((sum, team) => sum + team.previous_customers, 0);
  const totalCustomerDelta = totalCurrentCustomers - totalPreviousCustomers;

  const avgContinuity = teamSummaries.reduce((sum, team) => sum + team.continuity_percentage, 0) / teamSummaries.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Summary & Impact</h1>
          <p className="text-muted-foreground">
            Comprehensive view of territory changes and their business impact
          </p>
        </div>
        <Button onClick={generateVPCheatSheet}>
          <Download className="w-4 h-4 mr-2" />
          Generate VP Cheat Sheet
        </Button>
      </div>

      {/* Executive Summary Cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-green-600" />
              <div className="text-sm font-medium">Total ARR</div>
            </div>
            <div className="text-2xl font-bold">{formatCurrency(totalCurrentARR)}</div>
            <div className="flex items-center gap-1 mt-1">
              {getTrendIcon('up', totalARRDelta)}
              {getDeltaBadge(totalARRDelta)}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-blue-600" />
              <div className="text-sm font-medium">Total Customers</div>
            </div>
            <div className="text-2xl font-bold">{totalCurrentCustomers}</div>
            <div className="flex items-center gap-1 mt-1">
              {getTrendIcon('up', totalCustomerDelta)}
              {getDeltaBadge(totalCustomerDelta)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-purple-600" />
              <div className="text-sm font-medium">Avg Continuity</div>
            </div>
            <div className="text-2xl font-bold">{avgContinuity.toFixed(1)}%</div>
            <div className="flex items-center gap-1 mt-1">
              <Badge className="bg-green-500">Good</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-orange-600" />
              <div className="text-sm font-medium">Q1 Renewals</div>
            </div>
            <div className="text-2xl font-bold">
              {teamSummaries.reduce((sum, team) => sum + team.renewal_q1, 0)}
            </div>
            <div className="flex items-center gap-1 mt-1">
              <Badge variant="outline">Balanced</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="summary">Team Summary</TabsTrigger>
          <TabsTrigger value="comparison">Year-over-Year</TabsTrigger>
          <TabsTrigger value="continuity">Continuity Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Team Performance Summary
              </CardTitle>
              <CardDescription>
                Current vs previous year metrics by team
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Team</TableHead>
                    <TableHead>ARR</TableHead>
                    <TableHead>ATR</TableHead>
                    <TableHead>Customers</TableHead>
                    <TableHead>Prospects</TableHead>
                    <TableHead>Renewals (Q1-Q4)</TableHead>
                    <TableHead>Continuity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamSummaries.map((team) => (
                    <TableRow key={team.team_name}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{team.team_name}</div>
                          <div className="text-sm text-muted-foreground">{team.region}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{formatCurrency(team.current_arr)}</div>
                          <div className="flex items-center gap-1">
                            {getTrendIcon('up', team.arr_delta)}
                            <span className="text-xs">{getDeltaBadge(team.arr_delta)}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{formatCurrency(team.current_atr)}</div>
                          <div className="flex items-center gap-1">
                            {getTrendIcon('up', team.atr_delta)}
                            <span className="text-xs">{getDeltaBadge(team.atr_delta)}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{team.current_customers}</div>
                          <div className="flex items-center gap-1">
                            {getTrendIcon('up', team.customer_delta)}
                            <span className="text-xs">{getDeltaBadge(team.customer_delta)}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{team.current_prospects}</div>
                          <div className="flex items-center gap-1">
                            {getTrendIcon('up', team.prospect_delta)}
                            <span className="text-xs">{getDeltaBadge(team.prospect_delta)}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Badge variant="outline" className="text-xs">{team.renewal_q1}</Badge>
                          <Badge variant="outline" className="text-xs">{team.renewal_q2}</Badge>
                          <Badge variant="outline" className="text-xs">{team.renewal_q3}</Badge>
                          <Badge variant="outline" className="text-xs">{team.renewal_q4}</Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Progress value={team.continuity_percentage} className="w-16" />
                          <div className="text-xs text-center">{team.continuity_percentage}%</div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="comparison" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Year-over-Year Comparison
              </CardTitle>
              <CardDescription>
                Side-by-side comparison with prior year performance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead>Current Year</TableHead>
                    <TableHead>Prior Year</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>% Change</TableHead>
                    <TableHead>Trend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparisonMetrics.map((metric) => (
                    <TableRow key={metric.metric}>
                      <TableCell className="font-medium">{metric.metric}</TableCell>
                      <TableCell>
                        {metric.metric.includes('ARR') || metric.metric.includes('ATR') ? 
                          formatCurrency(metric.current_year) : 
                          metric.current_year.toLocaleString()
                        }
                      </TableCell>
                      <TableCell>
                        {metric.metric.includes('ARR') || metric.metric.includes('ATR') ? 
                          formatCurrency(metric.prior_year) : 
                          metric.prior_year.toLocaleString()
                        }
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {getTrendIcon(metric.trend, metric.delta)}
                          {getDeltaBadge(metric.delta)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getDeltaBadge(metric.delta_percentage, true)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getTrendIcon(metric.trend, metric.delta)}
                          <span className="text-sm capitalize">{metric.trend}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="continuity" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Account Movement Analysis
                </CardTitle>
                <CardDescription>
                  Breakdown of accounts held, gained, and lost by team
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Team</TableHead>
                      <TableHead>Held</TableHead>
                      <TableHead>Gained</TableHead>
                      <TableHead>Lost</TableHead>
                      <TableHead>Net Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamSummaries.map((team) => (
                      <TableRow key={team.team_name}>
                        <TableCell className="font-medium">{team.team_name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Minus className="w-3 h-3 text-gray-500" />
                            {team.accounts_held}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <ArrowRight className="w-3 h-3 text-green-600" />
                            {team.accounts_gained}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <ArrowLeft className="w-3 h-3 text-red-600" />
                            {team.accounts_lost}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getDeltaBadge(team.accounts_gained - team.accounts_lost)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Continuity Metrics</CardTitle>
                <CardDescription>
                  Customer retention and relationship continuity by team
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {teamSummaries.map((team) => (
                  <div key={team.team_name} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{team.team_name}</span>
                      <Badge 
                        className={
                          team.continuity_percentage >= 80 ? "bg-green-500" :
                          team.continuity_percentage >= 70 ? "bg-yellow-500" : "bg-red-500"
                        }
                      >
                        {team.continuity_percentage}%
                      </Badge>
                    </div>
                    <Progress value={team.continuity_percentage} />
                    <div className="text-xs text-muted-foreground">
                      {team.accounts_held} of {team.accounts_held + team.accounts_lost} customers retained
                    </div>
                  </div>
                ))}
                
                <Separator />
                
                <div className="space-y-2">
                  <h4 className="font-medium">Overall Continuity</h4>
                  <Progress value={avgContinuity} />
                  <div className="text-sm text-muted-foreground text-center">
                    {avgContinuity.toFixed(1)}% average across all teams
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Renewal Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Quarterly Renewal Distribution</CardTitle>
              <CardDescription>
                Renewal load balance across quarters by team
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {teamSummaries.map((team) => (
                  <div key={team.team_name} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{team.team_name}</span>
                      <span className="text-sm text-muted-foreground">
                        {team.renewal_q1 + team.renewal_q2 + team.renewal_q3 + team.renewal_q4} total renewals
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="text-center p-2 bg-muted/20 rounded">
                        <div className="text-sm font-bold">Q1</div>
                        <div className="text-lg">{team.renewal_q1}</div>
                      </div>
                      <div className="text-center p-2 bg-muted/20 rounded">
                        <div className="text-sm font-bold">Q2</div>
                        <div className="text-lg">{team.renewal_q2}</div>
                      </div>
                      <div className="text-center p-2 bg-muted/20 rounded">
                        <div className="text-sm font-bold">Q3</div>
                        <div className="text-lg">{team.renewal_q3}</div>
                      </div>
                      <div className="text-center p-2 bg-muted/20 rounded">
                        <div className="text-sm font-bold">Q4</div>
                        <div className="text-lg">{team.renewal_q4}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};