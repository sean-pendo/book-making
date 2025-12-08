import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Users, Building, TrendingUp, AlertTriangle, RotateCcw, Lock, ArrowLeft } from 'lucide-react';
import { useEnhancedBalancing, RepMetrics } from '@/hooks/useEnhancedBalancing';
import { useEnhancedAccountCalculations } from '@/hooks/useEnhancedAccountCalculations';
import { SalesRepDetailModal } from '@/components/SalesRepDetailModal';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface EnhancedBalancingDashboardProps {
  buildId?: string;
}

interface BalanceMetrics {
  totalCustomerARR: number;
  totalCustomerAccounts: number;
  totalProspectAccounts: number;
  avgCustomerARRPerRep: number;
  avgCustomerAccountsPerRep: number;
  avgProspectAccountsPerRep: number;
  arrBalance: 'Balanced' | 'Unbalanced';
  accountBalance: 'Balanced' | 'Unbalanced';
  maxArrVariance: number;
  maxAccountVariance: number;
  ownerRetentionRate: number;
  avgRegionalAlignment: number;
  prospectRetentionRate: number;
  prospectRegionalAlignment: number;
}

export const EnhancedBalancingDashboard = ({ buildId }: EnhancedBalancingDashboardProps) => {
  const navigate = useNavigate();
  const [selectedRep, setSelectedRep] = useState<RepMetrics | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data, isLoading, error, refetch, generateRebalancingPlan } = useEnhancedBalancing(buildId);
  const { recalculateAccountValues, recalculateAccountValuesAsync, isCalculating, progress } = useEnhancedAccountCalculations(buildId);
  const [thresholds, setThresholds] = useState<any>(null);

  useEffect(() => {
    const fetchThresholds = async () => {
      if (!buildId) return;
      
      const { data: config } = await supabase
        .from('assignment_configuration')
        .select('*')
        .eq('build_id', buildId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (config) {
        setThresholds(config);
      }
    };
    
    fetchThresholds();
  }, [buildId]);

  const handleRefresh = async () => {
    if (!buildId) return;
    
    try {
      // Refetch the balancing data directly from database
      await refetch();
      toast.success('Data refreshed successfully');
    } catch (error) {
      console.error('Error refreshing data:', error);
      toast.error('Failed to refresh data. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin mr-2" />
        <span>Loading enhanced balancing data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
          <AlertDescription className="text-red-900 dark:text-red-200">
            Error loading balancing data: {error}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 space-y-4">
        <Alert className="border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30">
          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <AlertDescription className="text-yellow-900 dark:text-yellow-200">
            <strong>No Assignment Data Available</strong>
            <p className="mt-2 text-sm">
              No balanced assignments have been generated yet for this build. 
              Please navigate to the Assignment Engine to generate territory assignments.
            </p>
          </AlertDescription>
        </Alert>
        <div className="flex items-center gap-2">
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RotateCcw className="h-4 w-4 mr-2" />
            Refresh Data
          </Button>
        </div>
      </div>
    );
  }

  // Check if assignments have been applied (new_owner_id set on accounts)
  if (data.assignedAccountsCount === 0) {
    return (
      <div className="p-6 space-y-6">
        <Card className="border-2 border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-900/10">
          <CardContent className="p-8">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-4 rounded-full bg-amber-100 dark:bg-amber-900/30">
                <Lock className="h-12 w-12 text-amber-600" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-amber-900 dark:text-amber-100">
                  Balancing Dashboard Locked
                </h2>
                <p className="text-amber-700 dark:text-amber-300 max-w-md">
                  No assignments have been applied yet. The Balancing Dashboard shows metrics 
                  based on assigned accounts — you need to generate and apply assignments first.
                </p>
              </div>
              
              <Alert className="max-w-lg text-left border-amber-200 bg-amber-100/50 dark:bg-amber-900/20">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-900 dark:text-amber-100">How to unlock</AlertTitle>
                <AlertDescription className="text-amber-700 dark:text-amber-300">
                  <ol className="list-decimal list-inside space-y-1 mt-2 text-sm">
                    <li>Go to the <strong>Assignments</strong> tab</li>
                    <li>Click <strong>Generate</strong> (Customers, Prospects, or All)</li>
                    <li>Review the proposals in the Preview dialog</li>
                    <li>Click <strong>Apply Assignments</strong> to save to database</li>
                  </ol>
                </AlertDescription>
              </Alert>

              <div className="flex items-center gap-3 pt-4">
                <Button 
                  onClick={() => navigate(`/build/${buildId}?tab=assignments`)}
                  variant="outline"
                  className="border-amber-500 text-amber-700 hover:bg-amber-100"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Go to Assignments
                </Button>
                <Button onClick={handleRefresh} variant="ghost" size="sm">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const balanceMetrics: BalanceMetrics = {
    totalCustomerARR: data.customerMetrics.totalARR,
    totalCustomerAccounts: data.customerMetrics.totalAccounts,
    totalProspectAccounts: data.prospectMetrics.totalAccounts,
    avgCustomerARRPerRep: data.customerMetrics.avgARRPerRep,
    avgCustomerAccountsPerRep: data.customerMetrics.totalAccounts / (data.repMetrics.length || 1),
    avgProspectAccountsPerRep: data.prospectMetrics.avgAccountsPerRep,
    arrBalance: data.customerMetrics.balance,
    accountBalance: data.prospectMetrics.balance,
    maxArrVariance: data.customerMetrics.maxVariance,
    maxAccountVariance: data.prospectMetrics.maxVariance,
    ownerRetentionRate: data.retentionMetrics.ownerRetentionRate,
    avgRegionalAlignment: data.retentionMetrics.avgRegionalAlignment,
    prospectRetentionRate: data.retentionMetrics.prospectRetentionRate,
    prospectRegionalAlignment: data.retentionMetrics.prospectRegionalAlignment
  };

  const repMetrics: RepMetrics[] = data.repMetrics;
  const beforeMetrics = data.beforeMetrics;

  const getBalanceStatusColor = (status: string) => {
    switch (status) {
      case 'Balanced': return 'bg-green-500';
      case 'Unbalanced': return 'bg-red-500';
      case 'Overloaded': return 'bg-red-500';
      case 'Light': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleRepClick = (rep: RepMetrics) => {
    setSelectedRep(rep);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedRep(null);
  };

  const getRepWarnings = (rep: RepMetrics) => {
    const warnings: { type: string; message: string }[] = [];
    
    if (!thresholds) return warnings;

    // Check CRE threshold (use override if set, otherwise use calculated max)
    const creMax = thresholds.cre_max_override ?? thresholds.cre_max;
    if (creMax && rep.creCount >= creMax) {
      warnings.push({
        type: 'CRE',
        message: `${rep.creCount} CREs (max: ${creMax})`
      });
    }

    // Check ATR threshold (use override if set, otherwise use calculated max)
    const atrMax = thresholds.atr_max_override ?? thresholds.atr_max;
    if (atrMax && rep.customerATR >= atrMax) {
      warnings.push({
        type: 'ATR',
        message: `$${(rep.customerATR / 1000000).toFixed(1)}M ATR (max: $${(atrMax / 1000000).toFixed(1)}M)`
      });
    }

    // Check Q1 renewals (use override if set, otherwise use calculated max)
    const q1Max = thresholds.q1_renewal_max_override ?? thresholds.q1_renewal_max;
    if (q1Max && rep.renewalsQ1 >= q1Max) {
      warnings.push({
        type: 'Q1',
        message: `${rep.renewalsQ1} Q1 renewals (max: ${q1Max})`
      });
    }

    // Check Q2 renewals (use override if set, otherwise use calculated max)
    const q2Max = thresholds.q2_renewal_max_override ?? thresholds.q2_renewal_max;
    if (q2Max && rep.renewalsQ2 >= q2Max) {
      warnings.push({
        type: 'Q2',
        message: `${rep.renewalsQ2} Q2 renewals (max: ${q2Max})`
      });
    }

    // Check Q3 renewals (use override if set, otherwise use calculated max)
    const q3Max = thresholds.q3_renewal_max_override ?? thresholds.q3_renewal_max;
    if (q3Max && rep.renewalsQ3 >= q3Max) {
      warnings.push({
        type: 'Q3',
        message: `${rep.renewalsQ3} Q3 renewals (max: ${q3Max})`
      });
    }

    // Check Q4 renewals (use override if set, otherwise use calculated max)
    const q4Max = thresholds.q4_renewal_max_override ?? thresholds.q4_renewal_max;
    if (q4Max && rep.renewalsQ4 >= q4Max) {
      warnings.push({
        type: 'Q4',
        message: `${rep.renewalsQ4} Q4 renewals (max: ${q4Max})`
      });
    }

    return warnings;
  };

  return (
    <>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Territory Balancing Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Analyze account distribution and rep performance across territories
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleRefresh}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
              disabled={isCalculating}
            >
              <RotateCcw className={`h-4 w-4 ${isCalculating ? 'animate-spin' : ''}`} />
              {isCalculating ? 'Recalculating...' : 'Refresh Data'}
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Parent Customer Accounts</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{balanceMetrics.totalCustomerAccounts.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                Avg: {Math.round(balanceMetrics.avgCustomerAccountsPerRep)} per rep
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Parent Prospect Accounts</CardTitle>
              <Building className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{balanceMetrics.totalProspectAccounts.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                Avg: {Math.round(balanceMetrics.avgProspectAccountsPerRep)} per rep
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Customer Retention</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{balanceMetrics.ownerRetentionRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                Customer accounts with same owner
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Customer Regional Alignment</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{balanceMetrics.avgRegionalAlignment.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                Customer accounts in rep's region
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Prospect Retention</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{balanceMetrics.prospectRetentionRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                Prospects with same owner
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Prospect Regional Alignment</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{balanceMetrics.prospectRegionalAlignment.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                Prospects in rep's region
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Sales Representatives List */}
        <div className="w-full">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Sales Representatives ({data.repMetrics.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {data.repMetrics.map((rep) => {
                  const warnings = getRepWarnings(rep);
                  
                  return (
                    <Card 
                      key={rep.rep_id} 
                      className={`cursor-pointer transition-colors hover:bg-muted/50 ${warnings.length > 0 ? 'border-l-4 border-l-amber-500' : ''}`}
                      onClick={() => handleRepClick(rep)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold">{rep.name}</h3>
                              <Badge className={getBalanceStatusColor(rep.status)}>
                                {rep.status}
                              </Badge>
                              {warnings.length > 0 && (
                                <Badge variant="outline" className="border-amber-500 dark:border-amber-600 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  {warnings.length} {warnings.length === 1 ? 'Warning' : 'Warnings'}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {rep.team} • {rep.region}
                            </p>
                          </div>
                          <div className="text-right space-y-1">
                            <div className="text-sm">
                              <span className="font-medium">{rep.customerAccounts}</span>
                              <span className="text-muted-foreground"> parent customers</span>
                            </div>
                            <div className="text-sm">
                              <span className="font-medium">{rep.prospectAccounts}</span>
                              <span className="text-muted-foreground"> parent prospects</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Customer ARR: </span>
                            <span className="font-medium">{formatCurrency(rep.customerARR)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Customer ATR: </span>
                            <span className="font-medium">{formatCurrency(rep.customerATR)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Renewals: </span>
                            <span className="font-medium">{rep.totalRenewals}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">CREs: </span>
                            <span className="font-medium">{rep.creCount}</span>
                          </div>
                        </div>

                        {warnings.length > 0 && (
                          <div className="mt-3 pt-3 border-t space-y-1">
                            {warnings.map((warning, idx) => (
                              <div key={idx} className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                <span className="font-medium">{warning.type}:</span>
                                <span>{warning.message}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sales Rep Detail Modal */}
        <SalesRepDetailModal
          open={isModalOpen}
          onOpenChange={handleModalClose}
          rep={selectedRep}
          buildId={buildId}
          availableReps={data.repMetrics}
          onDataRefresh={refetch}
        />

      </div>
    </>
  );
};