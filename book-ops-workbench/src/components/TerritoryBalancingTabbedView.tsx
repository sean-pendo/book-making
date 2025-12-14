import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Users, DollarSign, Target, Download, RefreshCw, ArrowLeft, Settings, Info, Star, TrendingUp, TrendingDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useBuildDataRelationships, useInvalidateBuildData } from '@/hooks/useBuildData';
import { useAccountCalculations } from '@/hooks/useAccountCalculations';
import { analyzeWorkloadBalance, getRepWorkloadStatus, type WorkloadBalancingResult } from '@/utils/workloadBalancing';

interface TerritoryBalancingTabbedViewProps {
  buildId?: string;
}

export const TerritoryBalancingTabbedView = ({ buildId: propBuildId }: TerritoryBalancingTabbedViewProps = {}) => {
  const { buildId: paramBuildId } = useParams<{ buildId: string }>();
  const buildId = propBuildId || paramBuildId;
  const navigate = useNavigate();
  const { toast } = useToast();
  const invalidateBuildData = useInvalidateBuildData();
  const { recalculateAccountValues, isCalculating } = useAccountCalculations();
  
  const [selectedRep, setSelectedRep] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<'customers' | 'prospects'>('customers');
  const [activeTerritory, setActiveTerritory] = useState('West');
  
  // Configuration state for dynamic targets
  const [normalTargetARR, setNormalTargetARR] = useState<number>(2000000);
  const [stratDistribution, setStratDistribution] = useState<'equal' | 'weighted'>('equal');
  const [prospectsPerRep, setProspectsPerRep] = useState<number>(20);

  const { 
    data: buildData, 
    isLoading, 
    error,
    refetch 
  } = useBuildDataRelationships(buildId);

  const handleRefreshData = async () => {
    if (buildId) {
      console.log('[Territory Balancing] Refreshing data and recalculating values...');
      
      try {
        // First recalculate account values to ensure data accuracy
        await recalculateAccountValues.mutateAsync(buildId);
        
        // Then invalidate caches and refetch
        invalidateBuildData(buildId);
        refetch();
        
        toast({
          title: "Data Refreshed",
          description: "Territory balancing data has been recalculated and updated.",
        });
      } catch (error) {
        console.error('[Territory Balancing] Error during refresh:', error);
        toast({
          title: "Refresh Failed",
          description: "There was an error refreshing the data. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  // Process data for both customer and prospect views using enhanced metrics
  const processedData = useMemo(() => {
    if (!buildData?.enhancedMetrics) {
      console.log('[Territory Balancing] No enhanced metrics found');
      return { customers: {}, prospects: {} };
    }
    
    console.log('[Territory Balancing] Processing enhanced metrics:', buildData.enhancedMetrics.length, 'reps');
    console.log('[Territory Balancing] Sample enhanced metric:', buildData.enhancedMetrics[0]);
    
    const territories = ['West', 'North East', 'South East', 'Central', 'Unassigned Region'];
    
    // Show all reps in both tabs, but highlight different metrics per tab
    const groupRepsByTerritory = (reps: any[]) => {
      return territories.reduce((acc, territory) => {
        let territoryReps;
        if (territory === 'Unassigned Region') {
          territoryReps = reps.filter(rep => !rep.region || rep.region.trim() === '');
        } else {
          const normalizedTerritory = territory.toLowerCase();
          territoryReps = reps.filter(rep => {
            const repRegion = (rep.region || '').toLowerCase().trim();
            return repRegion === normalizedTerritory || 
                   repRegion.includes(normalizedTerritory);
          });
        }
        acc[territory] = territoryReps;
        return acc;
      }, {} as Record<string, typeof reps>);
    };
    
    const territoryData = groupRepsByTerritory(buildData.enhancedMetrics);
    
    console.log('[Territory Balancing] Territory data:', territoryData);
    
    return { customers: territoryData, prospects: territoryData };
  }, [buildData]);

  if (!buildId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <AlertCircle className="mx-auto h-16 w-16 text-muted-foreground" />
              <div>
                <h3 className="text-xl font-semibold">No Build Selected</h3>
                <p className="text-muted-foreground mt-2">
                  Book Balancing requires a build context. Please navigate here from a specific build.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-8 bg-muted rounded-md w-64 animate-pulse"></div>
                <div className="h-4 bg-muted rounded-md w-96 animate-pulse"></div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="space-y-3">
                      <div className="h-4 bg-muted rounded animate-pulse"></div>
                      <div className="h-8 bg-muted rounded animate-pulse w-20"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !buildData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <AlertCircle className="mx-auto h-16 w-16 text-destructive" />
              <div>
                <h3 className="text-xl font-semibold">Failed to Load Data</h3>
                <p className="text-muted-foreground mt-2">
                  Failed to load territory data. Please try refreshing the page.
                </p>
              </div>
              <Button onClick={() => window.location.reload()}>
                Refresh Page
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { ownerMetrics, enhancedMetrics } = buildData;
  
  // Check for pending assignments
  const hasPendingAssignments = buildData.accountsByOwner.size > 0 && 
    Array.from(buildData.accountsByOwner.keys()).some(ownerId => {
      const ownerAccounts = buildData.accountsByOwner.get(ownerId) || [];
      return ownerAccounts.some(acc => (acc as any).new_owner_id && (acc as any).new_owner_id !== acc.owner_id);
    });

  // Calculate metrics for current view
  const currentData = processedData[activeView];
  const currentTerritoryReps = currentData[activeTerritory] || [];
  
  // Separate metrics for customers vs prospects
  const customerMetrics = ownerMetrics.map(rep => ({
    ...rep,
    // Customer-specific calculations based on hierarchy ARR
    arr: rep.arr, // This should already be using hierarchy ARR from buildDataService
    accounts: {
      ...rep.accounts,
      customers: rep.accounts.customers, // Parent customers only
    }
  }));
  
  const prospectMetrics = ownerMetrics.map(rep => ({
    ...rep,
    // Prospect-specific calculations
    accounts: {
      ...rep.accounts,
      prospects: rep.accounts.prospects, // Parent prospects only
    }
  }));

  // Use enhanced metrics for display and calculations since they have renewals data
  const activeMetrics = activeView === 'customers' ? enhancedMetrics : enhancedMetrics;
  
  const totalParentAccounts = activeMetrics.reduce((sum, rep) => sum + (rep.accounts?.parents || 0), 0);
  const totalARR = activeMetrics.reduce((sum, rep) => sum + (rep.arr || 0), 0);
  const totalATR = activeMetrics.reduce((sum, rep) => sum + (rep.atr || 0), 0);
  const totalRenewals = activeMetrics.reduce((sum, rep) => 
    sum + (rep.renewals?.Q1 || 0) + (rep.renewals?.Q2 || 0) + 
    (rep.renewals?.Q3 || 0) + (rep.renewals?.Q4 || 0), 0
  );

  // Workload balance analysis - use ownerMetrics for balance calculations
  const workloadAnalysis: WorkloadBalancingResult = analyzeWorkloadBalance(ownerMetrics);
  
  const getRepStatus = (rep: any) => {
    // Find corresponding owner metric for balance calculation
    const ownerRep = ownerMetrics.find(o => o.rep_id === rep.rep_id);
    return ownerRep ? getRepWorkloadStatus(ownerRep, ownerMetrics) : 'Balanced';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Overloaded': return 'destructive';
      case 'Light': return 'secondary';
      case 'Balanced': return 'default';
      default: return 'outline';
    }
  };

  const selectedRepData = selectedRep ? enhancedMetrics?.find(r => r.rep_id === selectedRep) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
        <div className="max-w-7xl mx-auto p-6 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-4">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => navigate(`/build/${buildId}/assignment-engine`)}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Assignment Engine
                </Button>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                  Book Balancing Dashboard
                </h1>
              </div>
              <div className="flex items-center gap-4">
                <p className="text-muted-foreground text-lg">
                  Balance workload distribution for {activeView}
                </p>
                {hasPendingAssignments && (
                  <Badge variant="secondary" className="ml-2 animate-pulse">
                    📊 Preview Mode - New Book Assignments
                  </Badge>
                )}
                {/* Workload Balance Status */}
                <div className="flex items-center gap-2">
                  <Badge 
                    variant={workloadAnalysis.isBalanced ? "default" : "destructive"}
                    className="gap-1"
                  >
                    {workloadAnalysis.isBalanced ? '✅ Balanced' : '⚠️ Imbalanced'}
                  </Badge>
                  {!workloadAnalysis.isBalanced && (
                    <span className="text-sm text-muted-foreground">
                      {workloadAnalysis.overloadedReps.length} overloaded, {workloadAnalysis.underloadedReps.length} underloaded
                    </span>
                  )}
                </div>
              </div>
              {hasPendingAssignments && (
                <Alert className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/50">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-700 dark:text-blue-300">
                    <strong>Preview Mode:</strong> Showing projected new book distribution based on generated assignments. All metrics reflect what each rep's portfolio would look like after assignment execution. Use "Execute Assignments" to finalize changes.
                  </AlertDescription>
                </Alert>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="gap-2">
                <Download className="w-4 h-4" />
                Export Report
              </Button>
              <Button 
                variant="outline" 
                onClick={handleRefreshData} 
                className="gap-2" 
                disabled={isCalculating}
              >
                <RefreshCw className={`w-4 h-4 ${isCalculating ? 'animate-spin' : ''}`} />
                {isCalculating ? 'Recalculating...' : 'Refresh Data'}
              </Button>
              {hasPendingAssignments && (
                <Button 
                  onClick={() => navigate(`/build/${buildId}/assignment-engine`)}
                  className="gap-2 bg-gradient-to-r from-primary to-primary/80"
                >
                  <Settings className="w-4 h-4" />
                  Execute Assignments
                </Button>
              )}
            </div>
          </div>

          {/* Customer vs Prospect Toggle */}
          <Tabs value={activeView} onValueChange={(value: any) => setActiveView(value)} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-muted">
              <TabsTrigger value="customers">Customer Account Balancing</TabsTrigger>
              <TabsTrigger value="prospects">Prospect Account Balancing</TabsTrigger>
            </TabsList>

            <TabsContent value="customers" className="space-y-6">
              {/* Configuration Panel */}
              <Card className="border-primary/20 bg-card/50">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    Balancing Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure dynamic targets for customer account rebalancing
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="normalTargetARR">Normal Rep Target ARR</Label>
                      <Input
                        id="normalTargetARR"
                        type="number"
                        value={normalTargetARR}
                        onChange={(e) => setNormalTargetARR(Number(e.target.value))}
                        placeholder="2000000"
                      />
                      <p className="text-xs text-muted-foreground">
                        ${(normalTargetARR / 1000000).toFixed(1)}M per normal rep
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="stratDistribution">Strategic Pool Distribution</Label>
                      <Select value={stratDistribution} onValueChange={(value: 'equal' | 'weighted') => setStratDistribution(value)}>
                        <SelectTrigger id="stratDistribution">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="equal">Equal Distribution</SelectItem>
                          <SelectItem value="weighted">Weighted by Seniority</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button
                        variant="secondary"
                        className="w-full"
                        onClick={() => {
                          setNormalTargetARR(2000000);
                          setStratDistribution('equal');
                        }}
                      >
                        Reset to Defaults
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Workload Balance Analysis */}
              {!workloadAnalysis.isBalanced && (
                <Alert className="border-orange-200 bg-orange-50/50 dark:border-orange-800 dark:bg-orange-950/50">
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                  <AlertDescription className="text-orange-700 dark:text-orange-300">
                    <strong>Workload Imbalance Detected:</strong> Account variance: {workloadAnalysis.variance.accountCount.toFixed(1)}%, ARR variance: {workloadAnalysis.variance.arr.toFixed(1)}%. 
                    Target: ≤15% variance. Consider rebalancing assignments.
                    {workloadAnalysis.suggestions.length > 0 && (
                      <div className="mt-2">
                        <strong>Suggestion:</strong> Move {workloadAnalysis.suggestions[0].accountsToMove} accounts from overloaded to underloaded reps.
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* Customer Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="bg-gradient-to-br from-card to-card/80 border-0 shadow-lg">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Customer ARR</CardTitle>
                    <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                      <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                      ${(totalARR / 1000000).toFixed(0)}M
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-card to-card/80 border-0 shadow-lg">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Customer ATR</CardTitle>
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                      <Target className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                      ${(totalATR / 1000000).toFixed(0)}M
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-card to-card/80 border-0 shadow-lg">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Customer Accounts</CardTitle>
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                      <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                      {totalParentAccounts.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-card to-card/80 border-0 shadow-lg">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Renewals</CardTitle>
                    <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
                      <RefreshCw className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                                     <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                      {totalRenewals || 0}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      renewal opportunities
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Territory Navigation for Customers */}
              <Tabs value={activeTerritory} onValueChange={setActiveTerritory}>
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="West">West</TabsTrigger>
                  <TabsTrigger value="Northeast">Northeast</TabsTrigger>
                  <TabsTrigger value="Southeast">Southeast</TabsTrigger>
                  <TabsTrigger value="Central">Central</TabsTrigger>
                  <TabsTrigger value="Unassigned Region">Unassigned</TabsTrigger>
                </TabsList>

                {/* Customer Territory Content */}
                {Object.entries(currentData).map(([territory, reps]) => (
                  <TabsContent key={territory} value={territory}>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <div className="lg:col-span-2">
                        <Card>
                          <CardHeader>
                            <CardTitle>{territory} - Customer Representatives ({reps.length})</CardTitle>
                            <CardDescription>Customer account distribution and performance metrics</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="overflow-x-auto">
                              <Table className="min-w-[1200px]">
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="min-w-[150px]">Representative</TableHead>
                                    <TableHead className="min-w-[120px]">Parent Accounts</TableHead>
                                    <TableHead className="min-w-[80px]">ARR</TableHead>
                                    <TableHead className="text-center min-w-[200px]" colSpan={4}>Renewals</TableHead>
                                    <TableHead className="text-center min-w-[200px]" colSpan={4}>Tier Distribution</TableHead>
                                    <TableHead className="min-w-[80px]">Retention%</TableHead>
                                    <TableHead className="min-w-[80px]">Region%</TableHead>
                                    <TableHead className="min-w-[120px]">Status</TableHead>
                                  </TableRow>
                                  <TableRow>
                                    <TableHead></TableHead>
                                    <TableHead></TableHead>
                                    <TableHead></TableHead>
                                    <TableHead className="text-center text-xs min-w-[50px]">Q1</TableHead>
                                    <TableHead className="text-center text-xs min-w-[50px]">Q2</TableHead>
                                    <TableHead className="text-center text-xs min-w-[50px]">Q3</TableHead>
                                    <TableHead className="text-center text-xs min-w-[50px]">Q4</TableHead>
                                    <TableHead className="text-center text-xs min-w-[50px]">Tier 1</TableHead>
                                    <TableHead className="text-center text-xs min-w-[50px]">Tier 2</TableHead>
                                    <TableHead className="text-center text-xs min-w-[50px]">Tier 3</TableHead>
                                    <TableHead className="text-center text-xs min-w-[50px]">Tier 4</TableHead>
                                    <TableHead></TableHead>
                                    <TableHead></TableHead>
                                    <TableHead></TableHead>
                                  </TableRow>
                                </TableHeader>
                              <TableBody>
                                {reps.map((rep) => {
                                  const status = getRepStatus(rep);
                                  return (
                                    <TableRow 
                                      key={rep.rep_id}
                                      className={`cursor-pointer hover:bg-muted/50 ${selectedRep === rep.rep_id ? 'bg-muted' : ''}`}
                                      onClick={() => setSelectedRep(selectedRep === rep.rep_id ? null : rep.rep_id)}
                                    >
                                      <TableCell className="font-medium">
                                        <div>
                                          <div className="font-semibold">{rep.name}</div>
                                          <div className="text-xs text-muted-foreground">
                                            {rep.flm || 'No FLM'} / {rep.slm || 'No SLM'}
                                          </div>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <div className="text-center">
                                          <div className="font-semibold text-lg">{rep.accounts.parents}</div>
                                          <div className="text-xs text-muted-foreground">
                                            {(rep.accounts.total - rep.accounts.parents)} children
                                          </div>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <span className="font-semibold">${(rep.arr / 1000000).toFixed(1)}M</span>
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <span className="font-medium">{rep.renewals.Q1 || 0}</span>
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <span className="font-medium">{rep.renewals.Q2 || 0}</span>
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <span className="font-medium">{rep.renewals.Q3 || 0}</span>
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <span className="font-medium">{rep.renewals.Q4 || 0}</span>
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <span className="font-medium">{(rep.tierPercentages?.tier1 ?? 0).toFixed(0)}%</span>
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <span className="font-medium">{(rep.tierPercentages?.tier2 ?? 0).toFixed(0)}%</span>
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <span className="font-medium">{(rep.tierPercentages?.tier3 ?? 0).toFixed(0)}%</span>
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <span className="font-medium">{(rep.tierPercentages?.tier4 ?? 0).toFixed(0)}%</span>
                                      </TableCell>
                                      <TableCell>
                                        <span className="font-medium">{rep.accountContinuity?.toFixed(0)}%</span>
                                      </TableCell>
                                      <TableCell>
                                        <span className="font-medium">{rep.regionalAlignment?.toFixed(0)}%</span>
                                      </TableCell>
                                      <TableCell>
                                        <Tooltip>
                                          <TooltipTrigger>
                                            <Badge variant={getStatusColor(status) as any}>{status}</Badge>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <div className="space-y-1">
                                              <div><strong>Parent Accounts:</strong> {rep.accounts.parents}</div>
                                              <div><strong>ARR:</strong> ${(rep.arr / 1000000).toFixed(1)}M</div>
                                 <div><strong>Average:</strong> {(ownerMetrics.reduce((sum, r) => sum + r.accounts.parents, 0) / ownerMetrics.length).toFixed(1)} accounts</div>
                                                {status === 'Overloaded' && <div className="text-destructive"><strong>Above target by:</strong> {((rep.accounts?.parents || 0) - (ownerMetrics.reduce((sum, r) => sum + r.accounts.parents, 0) / ownerMetrics.length)).toFixed(1)} accounts</div>}
                                                {status === 'Light' && <div className="text-blue-600"><strong>Below target by:</strong> {((ownerMetrics.reduce((sum, r) => sum + r.accounts.parents, 0) / ownerMetrics.length) - (rep.accounts?.parents || 0)).toFixed(1)} accounts</div>}
                                            </div>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                              </Table>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Customer Rep Details */}
                      <div>
                        {selectedRepData ? (
                          <Card>
                            <CardHeader>
                              <CardTitle>Customer Portfolio Details</CardTitle>
                              <CardDescription>{selectedRepData.name}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <p className="text-sm text-muted-foreground">Parent Accounts</p>
                                    <p className="text-2xl font-bold">{selectedRepData.accounts.parents}</p>
                                  </div>
                                  <div>
                                    <p className="text-sm text-muted-foreground">Child Accounts</p>
                                    <p className="text-2xl font-bold">{selectedRepData.accounts.children}</p>
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <p className="text-sm text-muted-foreground">Customer ARR</p>
                                    <p className="text-2xl font-bold">${(selectedRepData.arr / 1000000).toFixed(0)}M</p>
                                  </div>
                                  <div>
                                    <p className="text-sm text-muted-foreground">Customer ATR</p>
                                    <p className="text-2xl font-bold">${(selectedRepData.atr / 1000000).toFixed(0)}M</p>
                                  </div>
                                </div>

                                <div className="grid grid-cols-4 gap-2 text-center">
                                  <div>
                                    <p className="text-xs text-muted-foreground">Q1</p>
                                    <p className="font-bold">{selectedRepData.renewals.Q1}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Q2</p>
                                    <p className="font-bold">{selectedRepData.renewals.Q2}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Q3</p>
                                    <p className="font-bold">{selectedRepData.renewals.Q3}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">Q4</p>
                                    <p className="font-bold">{selectedRepData.renewals.Q4}</p>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <p className="text-sm text-muted-foreground">Tier 1%</p>
                                    <p className="text-xl font-bold">{(selectedRepData.tierPercentages?.tier1 ?? 0).toFixed(1)}%</p>
                                  </div>
                                  <div>
                                    <p className="text-sm text-muted-foreground">Tier 2%</p>
                                    <p className="text-xl font-bold">{(selectedRepData.tierPercentages?.tier2 ?? 0).toFixed(1)}%</p>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <p className="text-sm text-muted-foreground">Tier 3%</p>
                                    <p className="text-xl font-bold">{(selectedRepData.tierPercentages?.tier3 ?? 0).toFixed(1)}%</p>
                                  </div>
                                  <div>
                                    <p className="text-sm text-muted-foreground">Tier 4%</p>
                                    <p className="text-xl font-bold">{(selectedRepData.tierPercentages?.tier4 ?? 0).toFixed(1)}%</p>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <p className="text-sm text-muted-foreground">Account Retention</p>
                                    <p className="text-xl font-bold">{selectedRepData.accountContinuity?.toFixed(1)}%</p>
                                  </div>
                                  <div>
                                    <p className="text-sm text-muted-foreground">Regional Alignment</p>
                                    <p className="text-xl font-bold">{selectedRepData.regionalAlignment?.toFixed(1)}%</p>
                                  </div>
                                </div>

                                <div className="pt-2 border-t">
                                  <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                      <p className="text-muted-foreground">FLM</p>
                                      <p className="font-medium">{selectedRepData.flm || 'Not Assigned'}</p>
                                    </div>
                                    <div>
                                      <p className="text-muted-foreground">SLM</p>
                                      <p className="font-medium">{selectedRepData.slm || 'Not Assigned'}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ) : (
                          <Card>
                            <CardContent className="pt-6">
                              <div className="text-center text-muted-foreground">
                                <Users className="mx-auto h-12 w-12 mb-4" />
                                <p>Select a representative to view their customer portfolio details</p>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </TabsContent>

            <TabsContent value="prospects" className="space-y-6">
              {/* Prospect Workload Balance Analysis */}
              {!workloadAnalysis.isBalanced && (
                <Alert className="border-orange-200 bg-orange-50/50 dark:border-orange-800 dark:bg-orange-950/50">
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                  <AlertDescription className="text-orange-700 dark:text-orange-300">
                    <strong>Prospect Workload Imbalance:</strong> Account variance: {workloadAnalysis.variance.accountCount.toFixed(1)}%. 
                    Target: ≤15% variance. Consider rebalancing prospect assignments.
                  </AlertDescription>
                </Alert>
              )}

              {/* Prospect Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="bg-gradient-to-br from-card to-card/80 border-0 shadow-lg">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Total Accounts</CardTitle>
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                      <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                      {activeMetrics.reduce((sum, rep) => sum + (rep.accounts?.total || 0), 0).toLocaleString()}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-card to-card/80 border-0 shadow-lg">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Net ARR</CardTitle>
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                      <DollarSign className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                      ${(activeMetrics.reduce((sum, rep) => sum + (rep.prospectNetARR || 0), 0) / 1000000).toFixed(1)}M
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-card to-card/80 border-0 shadow-lg">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Pipeline Opportunities</CardTitle>
                    <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                      <Target className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                      {activeMetrics.reduce((sum, rep) => sum + (rep.renewals?.total || 0), 0).toLocaleString()}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-card to-card/80 border-0 shadow-lg">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Coverage Rate</CardTitle>
                    <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
                      <Target className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                      {activeMetrics.length > 0 ? ((activeMetrics.filter(rep => (rep.accounts?.total || 0) > 0).length / activeMetrics.length) * 100).toFixed(0) : 0}%
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Territory Navigation for Prospects */}
              <Tabs value={activeTerritory} onValueChange={setActiveTerritory}>
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="West">West</TabsTrigger>
                  <TabsTrigger value="Northeast">Northeast</TabsTrigger>
                  <TabsTrigger value="Southeast">Southeast</TabsTrigger>
                  <TabsTrigger value="Central">Central</TabsTrigger>
                  <TabsTrigger value="Unassigned Region">Unassigned</TabsTrigger>
                </TabsList>

                {/* Prospect Territory Content */}
                {Object.entries(currentData).map(([territory, reps]) => (
                  <TabsContent key={territory} value={territory}>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <div className="lg:col-span-2">
                        <Card>
                          <CardHeader>
                            <CardTitle>{territory} - Prospect Representatives ({reps.length})</CardTitle>
                            <CardDescription>Prospect account distribution and coverage metrics</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="overflow-x-auto">
                              <Table className="min-w-[1000px]">
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="min-w-[150px]">Representative</TableHead>
                                    <TableHead className="min-w-[120px]">Parent Accounts</TableHead>
                                    <TableHead className="min-w-[80px]">Net ARR</TableHead>
                                    <TableHead className="min-w-[80px]">Opportunities</TableHead>
                                    <TableHead className="min-w-[80px]">Retention%</TableHead>
                                    <TableHead className="min-w-[80px]">Region%</TableHead>
                                    <TableHead className="min-w-[120px]">Status</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {reps.map((rep) => {
                                    const status = getRepStatus(rep);
                                    const prospectMetric = prospectMetrics.find(p => p.rep_id === rep.rep_id);
                                    return (
                                      <TableRow 
                                        key={rep.rep_id}
                                        className={`cursor-pointer hover:bg-muted/50 ${selectedRep === rep.rep_id ? 'bg-muted' : ''}`}
                                        onClick={() => setSelectedRep(selectedRep === rep.rep_id ? null : rep.rep_id)}
                                      >
                                        <TableCell className="font-medium">
                                          <div>
                                            <div className="font-semibold">{rep.name}</div>
                                            <div className="text-xs text-muted-foreground">
                                              {rep.flm || 'No FLM'} / {rep.slm || 'No SLM'}
                                            </div>
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <div className="text-center">
                                            <div className="font-semibold text-lg">{rep.accounts?.parents || 0}</div>
                                            <div className="text-xs text-muted-foreground">
                                              {(rep.accounts?.total || 0) - (rep.accounts?.parents || 0)} children
                                            </div>
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <span className="font-semibold">${((rep.prospectNetARR || 0) / 1000000).toFixed(1)}M</span>
                                        </TableCell>
                                         <TableCell>
                                           <span className="font-medium">{rep.renewals?.total || 0}</span>
                                         </TableCell>
                                        <TableCell>
                                          <span className="font-medium">{rep.accountContinuity?.toFixed(0)}%</span>
                                        </TableCell>
                                        <TableCell>
                                          <span className="font-medium">{rep.regionalAlignment?.toFixed(0)}%</span>
                                        </TableCell>
                                        <TableCell>
                                          <Tooltip>
                                            <TooltipTrigger>
                                              <Badge variant={getStatusColor(status) as any}>{status}</Badge>
                                            </TooltipTrigger>
                                             <TooltipContent>
                                               <div className="space-y-1">
                                                 <div><strong>Parent Accounts:</strong> {rep.accounts?.parents || 0}</div>
                                                 <div><strong>Net ARR:</strong> ${((rep.prospectNetARR || 0) / 1000000).toFixed(1)}M</div>
                                                 <div><strong>Opportunities:</strong> {rep.opportunities?.total || 0}</div>
                                                  <div><strong>Average:</strong> {(ownerMetrics.reduce((sum, r) => sum + r.accounts.parents, 0) / ownerMetrics.length).toFixed(1)} accounts</div>
                                                  {status === 'Overloaded' && <div className="text-destructive"><strong>Above target by:</strong> {((rep.accounts?.parents || 0) - (ownerMetrics.reduce((sum, r) => sum + r.accounts.parents, 0) / ownerMetrics.length)).toFixed(1)} accounts</div>}
                                                  {status === 'Light' && <div className="text-blue-600"><strong>Below target by:</strong> {((ownerMetrics.reduce((sum, r) => sum + r.accounts.parents, 0) / ownerMetrics.length) - (rep.accounts?.parents || 0)).toFixed(1)} accounts</div>}
                                               </div>
                                             </TooltipContent>
                                          </Tooltip>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Prospect Rep Detail Panel */}
                      <div className="lg:col-span-1">
                        {selectedRepData ? (
                          <Card className="sticky top-6">
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2">
                                <Users className="w-5 h-5" />
                                {selectedRepData.name}
                              </CardTitle>
                              <CardDescription>Prospect Portfolio Details</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <p className="text-muted-foreground">Total Accounts</p>
                                  <p className="text-2xl font-bold">{selectedRepData.accounts?.total || 0}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Parent Accounts</p>
                                  <p className="text-2xl font-bold">{selectedRepData.accounts?.parents || 0}</p>
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <p className="text-muted-foreground">Net ARR</p>
                                  <p className="text-2xl font-bold">${((selectedRepData.prospectNetARR || 0) / 1000000).toFixed(1)}M</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Opportunities</p>
                                  <p className="text-2xl font-bold">{(selectedRepData.renewals?.Q1 || 0) + (selectedRepData.renewals?.Q2 || 0) + (selectedRepData.renewals?.Q3 || 0) + (selectedRepData.renewals?.Q4 || 0)}</p>
                                </div>
                              </div>
                              
                              <div className="space-y-2">
                                <div className="flex justify-between">
                                  <span className="text-sm text-muted-foreground">Regional Alignment</span>
                                  <span className="text-sm font-medium">{selectedRepData.regionalAlignment?.toFixed(1)}%</span>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ) : (
                          <Card className="sticky top-6">
                            <CardContent className="pt-6">
                              <div className="text-center text-muted-foreground">
                                <Users className="mx-auto h-12 w-12 mb-4 opacity-50" />
                                <p>Select a representative to view their prospect portfolio details</p>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </TabsContent>
          </Tabs>
        </div>
      </div>
  );
};