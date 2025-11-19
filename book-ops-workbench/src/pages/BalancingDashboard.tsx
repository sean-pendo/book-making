import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Shuffle, TrendingUp, Users, DollarSign } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useBuildDataRelationships } from '@/hooks/useBuildData';

interface SwapSimulation {
  fromRep: string;
  toRep: string;
  accountsToMove: number;
  estimatedARRTransfer: number;
}

interface BalancingDashboardProps {
  buildId?: string;
}

export const BalancingDashboard = ({ buildId: propBuildId }: BalancingDashboardProps = {}) => {
  const { buildId: paramBuildId } = useParams<{ buildId: string }>();
  const buildId = propBuildId || paramBuildId;
  const { toast } = useToast();
  
  const [selectedRep, setSelectedRep] = useState<string | null>(null);
  const [showSwapDialog, setShowSwapDialog] = useState(false);
  const [swapSimulation, setSwapSimulation] = useState<SwapSimulation>({
    fromRep: '',
    toRep: '',
    accountsToMove: 1,
    estimatedARRTransfer: 0
  });

  const { 
    data: buildData, 
    isLoading, 
    error 
  } = useBuildDataRelationships(buildId);

  if (!buildId) {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Balancing Dashboard requires a build context. Please navigate here from a specific build.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-64 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-24 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !buildData) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load balancing data. Please try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const { ownerMetrics } = buildData;
  
  // Calculate summary metrics based on parent accounts for accurate workload assessment
  const totalParentAccounts = ownerMetrics.reduce((sum, rep) => sum + rep.accounts.parents, 0);
  const totalAccounts = ownerMetrics.reduce((sum, rep) => sum + rep.accounts.total, 0);
  const totalARR = ownerMetrics.reduce((sum, rep) => sum + rep.arr, 0);
  const totalATR = ownerMetrics.reduce((sum, rep) => sum + rep.atr, 0);
  const totalRenewals = ownerMetrics.reduce((sum, rep) => 
    sum + rep.opportunities.renewals.Q1 + rep.opportunities.renewals.Q2 + 
    rep.opportunities.renewals.Q3 + rep.opportunities.renewals.Q4, 0
  );
  
  // Calculate realistic averages based on reps with accounts
  const repsWithAccounts = ownerMetrics.filter(rep => rep.accounts.parents > 0);
  const avgParentAccounts = repsWithAccounts.length > 0 ? Math.round(totalParentAccounts / repsWithAccounts.length) : 0;
  const overloadedThreshold = Math.round(avgParentAccounts * 1.3); // 130% of average


  const handleSimulateSwap = () => {
    const fromRepData = ownerMetrics.find(r => r.rep_id === swapSimulation.fromRep);
    const toRepData = ownerMetrics.find(r => r.rep_id === swapSimulation.toRep);
    
    if (!fromRepData || !toRepData) return;

    // Estimate ARR transfer based on average ARR per parent account
    const avgARRPerAccount = fromRepData.accounts.parents > 0 ? fromRepData.arr / fromRepData.accounts.parents : 0;
    const estimatedTransfer = avgARRPerAccount * swapSimulation.accountsToMove;
    
    setSwapSimulation(prev => ({
      ...prev,
      estimatedARRTransfer: estimatedTransfer
    }));

    toast({
      title: "Swap Simulated",
      description: `Moving ${swapSimulation.accountsToMove} accounts would transfer ~$${(estimatedTransfer/1000).toFixed(0)}K ARR`,
    });
  };

  const selectedRepData = selectedRep ? ownerMetrics.find(r => r.rep_id === selectedRep) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Territory Balancing</h1>
          <p className="text-muted-foreground">
            Analyze workload distribution and simulate territory adjustments
          </p>
        </div>
        <Dialog open={showSwapDialog} onOpenChange={setShowSwapDialog}>
          <DialogTrigger asChild>
            <Button>
              <Shuffle className="w-4 h-4 mr-2" />
              Swap Simulator
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Account Swap Simulator</DialogTitle>
              <DialogDescription>
                Simulate moving accounts between representatives to see the impact on workload distribution.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>From Rep</Label>
                  <select 
                    className="w-full p-2 border rounded"
                    value={swapSimulation.fromRep}
                    onChange={(e) => setSwapSimulation(prev => ({...prev, fromRep: e.target.value}))}
                  >
                    <option value="">Select Rep</option>
                    {ownerMetrics.map(rep => (
                      <option key={rep.rep_id} value={rep.rep_id}>
                        {rep.name} ({rep.accounts.parents} parent accounts)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>To Rep</Label>
                  <select 
                    className="w-full p-2 border rounded"
                    value={swapSimulation.toRep}
                    onChange={(e) => setSwapSimulation(prev => ({...prev, toRep: e.target.value}))}
                  >
                    <option value="">Select Rep</option>
                    {ownerMetrics.map(rep => (
                      <option key={rep.rep_id} value={rep.rep_id}>
                        {rep.name} ({rep.accounts.parents} parent accounts)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Accounts to Move</Label>
                <Input
                  type="number"
                  min="1"
                  value={swapSimulation.accountsToMove}
                  onChange={(e) => setSwapSimulation(prev => ({
                    ...prev, 
                    accountsToMove: parseInt(e.target.value) || 1
                  }))}
                />
              </div>
              {swapSimulation.estimatedARRTransfer > 0 && (
                <Alert>
                  <TrendingUp className="h-4 w-4" />
                  <AlertDescription>
                    Estimated ARR Transfer: ${(swapSimulation.estimatedARRTransfer / 1000).toFixed(0)}K
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex gap-2">
                <Button onClick={handleSimulateSwap} disabled={!swapSimulation.fromRep || !swapSimulation.toRep}>
                  Simulate
                </Button>
                <Button variant="outline" onClick={() => setShowSwapDialog(false)}>
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total ARR</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(totalARR / 1000000).toFixed(1)}M</div>
            <p className="text-xs text-muted-foreground">
              Across {ownerMetrics.length} reps
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total ATR</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(totalATR / 1000000).toFixed(1)}M</div>
            <p className="text-xs text-muted-foreground">
              Annual target revenue
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Parent Accounts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalParentAccounts.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Avg: {avgParentAccounts} per rep | Total: {totalAccounts.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Renewals</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRenewals}</div>
            <p className="text-xs text-muted-foreground">
              Across all quarters
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Rep Metrics Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Representative Metrics</CardTitle>
              <CardDescription>
                Click on a representative to see detailed breakdown
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Representative</TableHead>
                    <TableHead>Parent Accounts</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>ARR</TableHead>
                    <TableHead>Renewals</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ownerMetrics.map((rep) => {
                    const totalRenewals = rep.opportunities.renewals.Q1 + rep.opportunities.renewals.Q2 + 
                                        rep.opportunities.renewals.Q3 + rep.opportunities.renewals.Q4;
                    const isOverloaded = rep.accounts.parents > overloadedThreshold;
                    const varianceFromAvg = rep.accounts.parents - avgParentAccounts;
                    
                    return (
                      <TableRow
                        key={rep.rep_id}
                        className={`cursor-pointer hover:bg-muted/50 ${
                          selectedRep === rep.rep_id ? 'bg-muted' : ''
                        }`}
                        onClick={() => setSelectedRep(rep.rep_id)}
                      >
                        <TableCell className="font-medium">
                          <div>
                            <div>{rep.name}</div>
                            <div className="text-sm text-muted-foreground">{rep.team}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{rep.accounts.parents}</div>
                            <div className="text-xs text-muted-foreground">
                              {varianceFromAvg > 0 ? '+' : ''}{varianceFromAvg} vs avg ({avgParentAccounts})
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={isOverloaded ? "destructive" : rep.accounts.parents < avgParentAccounts * 0.8 ? "secondary" : "default"}>
                            {isOverloaded ? "Overloaded" : rep.accounts.parents < avgParentAccounts * 0.8 ? "Light" : "Balanced"}
                          </Badge>
                        </TableCell>
                        <TableCell>${(rep.arr / 1000000).toFixed(1)}M</TableCell>
                        <TableCell>{totalRenewals}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Selected Rep Details */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Representative Details</CardTitle>
              <CardDescription>
                {selectedRepData ? `Details for ${selectedRepData.name}` : 'Select a representative to view details'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedRepData ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Account Breakdown</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Parent Accounts:</span>
                        <span className="font-medium">{selectedRepData.accounts.parents}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total (inc. children):</span>
                        <span>{selectedRepData.accounts.total}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Customers:</span>
                        <span>{selectedRepData.accounts.customers}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Prospects:</span>
                        <span>{selectedRepData.accounts.prospects}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Enterprise:</span>
                        <span>{selectedRepData.accounts.enterprise}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>CRE Risk:</span>
                        <span>{selectedRepData.accounts.creRisk}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Revenue</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>ARR:</span>
                        <span>${(selectedRepData.arr / 1000000).toFixed(1)}M</span>
                      </div>
                      <div className="flex justify-between">
                        <span>ATR:</span>
                        <span>${(selectedRepData.atr / 1000000).toFixed(1)}M</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Quarterly Renewals</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Q1:</span>
                        <span>{selectedRepData.opportunities.renewals.Q1}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Q2:</span>
                        <span>{selectedRepData.opportunities.renewals.Q2}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Q3:</span>
                        <span>{selectedRepData.opportunities.renewals.Q3}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Q4:</span>
                        <span>{selectedRepData.opportunities.renewals.Q4}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Click on a representative in the table to view their detailed metrics and account breakdown.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};