import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, Upload, FileText, AlertCircle, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { SkeletonLoader } from '@/components/SkeletonLoader';
import Papa from 'papaparse';

interface RepMetrics {
  rep_id: string;
  name: string;
  accounts: number;
  arr: number;
  atr: number;
}

interface FLMMetrics {
  flm_name: string;
  rep_count: number;
  accounts: number;
  arr: number;
  atr: number;
  reps: RepMetrics[];
}

interface ApprovedBuild {
  id: string;
  name: string;
  slm_name: string | null;
  customer_metrics: FLMMetrics[];
  prospect_metrics: FLMMetrics[];
  customer_totals: {
    total_reps: number;
    total_accounts: number;
    total_arr: number;
    total_atr: number;
  };
  prospect_totals: {
    total_reps: number;
    total_accounts: number;
    total_arr: number;
    total_atr: number;
  };
}

interface OrgAccount {
  sfdc_account_id: string;
  account_name: string;
  assigned_in_builds: string[];
  not_assigned_in_builds: string[];
}

export default function RevOpsFinalView() {
  const { toast } = useToast();
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [orgAccounts, setOrgAccounts] = useState<OrgAccount[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedFLMs, setExpandedFLMs] = useState<Set<string>>(new Set());

  // Fetch all finalized builds with manager hierarchy and detailed metrics
  const { data: approvedBuilds, isLoading: buildsLoading } = useQuery({
    queryKey: ['finalized-builds'],
    queryFn: async () => {
      // Get builds where all manager reviews are accepted
      const { data: builds, error: buildsError } = await supabase
        .from('builds')
        .select('id, name')
        .order('created_at', { ascending: false });

      if (buildsError) throw buildsError;
      if (!builds) return [];

      // For each build, check if all manager reviews are accepted
      const buildsWithData = await Promise.all(
        builds.map(async (build) => {
          // Get all manager reviews for this build
          const { data: reviews } = await supabase
            .from('manager_reviews')
            .select('status, manager_name, manager_level')
            .eq('build_id', build.id);

          // Only include builds where SLM has accepted
          const slm = reviews?.find(r => r.manager_level === 'SLM' && r.status === 'accepted');
          if (!slm) return null;

          // Get all parent accounts (including unchanged ones where new_owner_id is null)
          const { data: allAccounts } = await supabase
            .from('accounts')
            .select('is_customer, new_owner_id, owner_id, calculated_arr, calculated_atr, is_parent')
            .eq('build_id', build.id)
            .eq('is_parent', true);

          // Get sales reps for this build
          const { data: salesReps } = await supabase
            .from('sales_reps')
            .select('rep_id, name, flm, slm')
            .eq('build_id', build.id)
            .not('flm', 'is', null)
            .neq('flm', '');

          // Only get FLMs whose SLM has accepted
          const acceptedSLMs = reviews?.filter(r => r.manager_level === 'SLM' && r.status === 'accepted').map(r => r.manager_name) || [];

          // Get FLMs only under accepted SLMs
          const uniqueFLMs = [...new Set(
            (salesReps || [])
              .filter(rep => rep.flm && acceptedSLMs.includes(rep.slm || ''))
              .map(rep => rep.flm)
              .filter(Boolean)
          )];

          // Helper to get effective owner (new_owner_id if set, otherwise owner_id)
          const getEffectiveOwnerId = (acc: { new_owner_id: string | null; owner_id: string }) => 
            acc.new_owner_id || acc.owner_id;

          // Calculate metrics for each FLM
          const calculateFLMMetrics = (isCustomer: boolean) => {
            return uniqueFLMs.map(flmName => {
              // Get reps under this FLM
              const flmReps = (salesReps || []).filter(rep => rep.flm === flmName);
              const repIds = flmReps.map(r => r.rep_id);

              // Get accounts assigned to these reps (using effective owner)
              const flmAccounts = (allAccounts || []).filter(
                acc => acc.is_customer === isCustomer && repIds.includes(getEffectiveOwnerId(acc))
              );

              // Calculate per-rep metrics
              const repMetrics: RepMetrics[] = flmReps.map(rep => {
                const repAccounts = flmAccounts.filter(acc => getEffectiveOwnerId(acc) === rep.rep_id);
                return {
                  rep_id: rep.rep_id,
                  name: rep.name,
                  accounts: repAccounts.length,
                  arr: repAccounts.reduce((sum, acc) => sum + (Number(acc.calculated_arr) || 0), 0),
                  atr: repAccounts.reduce((sum, acc) => sum + (Number(acc.calculated_atr) || 0), 0),
                };
              });

              return {
                flm_name: flmName,
                rep_count: flmReps.length,
                accounts: flmAccounts.length,
                arr: flmAccounts.reduce((sum, acc) => sum + (Number(acc.calculated_arr) || 0), 0),
                atr: flmAccounts.reduce((sum, acc) => sum + (Number(acc.calculated_atr) || 0), 0),
                reps: repMetrics,
              };
            });
          };

          const customerMetrics = calculateFLMMetrics(true);
          const prospectMetrics = calculateFLMMetrics(false);

          // Calculate totals
          const customerTotals = {
            total_reps: customerMetrics.reduce((sum, m) => sum + m.rep_count, 0),
            total_accounts: customerMetrics.reduce((sum, m) => sum + m.accounts, 0),
            total_arr: customerMetrics.reduce((sum, m) => sum + m.arr, 0),
            total_atr: customerMetrics.reduce((sum, m) => sum + m.atr, 0),
          };

          const prospectTotals = {
            total_reps: prospectMetrics.reduce((sum, m) => sum + m.rep_count, 0),
            total_accounts: prospectMetrics.reduce((sum, m) => sum + m.accounts, 0),
            total_arr: prospectMetrics.reduce((sum, m) => sum + m.arr, 0),
            total_atr: prospectMetrics.reduce((sum, m) => sum + m.atr, 0),
          };

          return {
            id: build.id,
            name: build.name,
            slm_name: slm.manager_name,
            customer_metrics: customerMetrics,
            prospect_metrics: prospectMetrics,
            customer_totals: customerTotals,
            prospect_totals: prospectTotals,
          };
        })
      );

      // Filter out null values (builds that aren't fully approved)
      return buildsWithData.filter(Boolean) as ApprovedBuild[];
    },
  });

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a CSV file',
        variant: 'destructive',
      });
      return;
    }

    setUploadedFile(file);
    toast({
      title: 'File selected',
      description: `${file.name} ready to process`,
    });
  };

  // Process uploaded accounts file
  const processAccountsFile = async () => {
    if (!uploadedFile || !approvedBuilds) return;

    setIsProcessing(true);

    try {
      // Parse CSV file
      Papa.parse(uploadedFile, {
        header: true,
        complete: async (results) => {
          const data = results.data as any[];
          
          // Extract account IDs from CSV (assuming column is 'sfdc_account_id' or 'Account ID')
          const accountIds = data
            .map(row => row['sfdc_account_id'] || row['Account ID'] || row['account_id'])
            .filter(Boolean);

          if (accountIds.length === 0) {
            toast({
              title: 'No accounts found',
              description: 'Could not find account IDs in CSV. Expected column: sfdc_account_id, Account ID, or account_id',
              variant: 'destructive',
            });
            setIsProcessing(false);
            return;
          }

          // For each account, check which builds it's assigned in
          const accountCoverage = await Promise.all(
            accountIds.map(async (accountId: string) => {
              const assignedInBuilds: string[] = [];
              const notAssignedInBuilds: string[] = [];

              for (const build of approvedBuilds) {
                const { data: account } = await supabase
                  .from('accounts')
                  .select('sfdc_account_id, account_name, new_owner_id')
                  .eq('build_id', build.id)
                  .eq('sfdc_account_id', accountId)
                  .maybeSingle();

                if (account) {
                  if (account.new_owner_id) {
                    assignedInBuilds.push(build.name);
                  } else {
                    notAssignedInBuilds.push(build.name);
                  }
                } else {
                  notAssignedInBuilds.push(build.name);
                }
              }

              // Get account name from first found instance
              const { data: accountInfo } = await supabase
                .from('accounts')
                .select('account_name')
                .eq('sfdc_account_id', accountId)
                .limit(1)
                .maybeSingle();

              return {
                sfdc_account_id: accountId,
                account_name: accountInfo?.account_name || accountId,
                assigned_in_builds: assignedInBuilds,
                not_assigned_in_builds: notAssignedInBuilds,
              };
            })
          );

          setOrgAccounts(accountCoverage);
          setIsProcessing(false);

          toast({
            title: 'Analysis complete',
            description: `Processed ${accountIds.length} accounts across ${approvedBuilds.length} approved books`,
          });
        },
        error: (error) => {
          console.error('CSV parsing error:', error);
          toast({
            title: 'Error parsing CSV',
            description: error.message,
            variant: 'destructive',
          });
          setIsProcessing(false);
        },
      });
    } catch (error: any) {
      console.error('Error processing file:', error);
      toast({
        title: 'Error processing file',
        description: error.message,
        variant: 'destructive',
      });
      setIsProcessing(false);
    }
  };

  // Export coverage report
  const exportCoverageReport = () => {
    if (orgAccounts.length === 0) return;

    const csv = Papa.unparse(
      orgAccounts.map(acc => ({
        'Account ID': acc.sfdc_account_id,
        'Account Name': acc.account_name,
        'Assigned In Books': acc.assigned_in_builds.join(', ') || 'None',
        'Not Assigned In Books': acc.not_assigned_in_builds.join(', ') || 'None',
        'Total Books': approvedBuilds?.length || 0,
        'Coverage %': ((acc.assigned_in_builds.length / (approvedBuilds?.length || 1)) * 100).toFixed(1),
      }))
    );

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `account-coverage-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: 'Report exported',
      description: 'Coverage report downloaded successfully',
    });
  };

  if (buildsLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <SkeletonLoader />
      </div>
    );
  }

  const unassignedAccounts = orgAccounts.filter(a => a.assigned_in_builds.length === 0);
  const partiallyAssigned = orgAccounts.filter(
    a => a.assigned_in_builds.length > 0 && a.not_assigned_in_builds.length > 0
  );
  const fullyAssigned = orgAccounts.filter(
    a => a.assigned_in_builds.length === approvedBuilds?.length && approvedBuilds.length > 0
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-success" />
            RevOps Final View
          </h1>
          <p className="text-muted-foreground mt-2">
            Review finalized books and verify account assignment coverage
          </p>
        </div>
      </div>

      <Tabs defaultValue="approved-books" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="approved-books">Finalized Books</TabsTrigger>
          <TabsTrigger value="coverage-check">Coverage Check</TabsTrigger>
        </TabsList>

        {/* Finalized Books Tab */}
        <TabsContent value="approved-books" className="space-y-4">
          {!approvedBuilds || approvedBuilds.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No finalized books yet</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            approvedBuilds.map((build) => (
              <Card key={build.id}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-2xl">{build.slm_name || 'Unknown SLM'}</CardTitle>
                    <Badge variant="secondary">SLM</Badge>
                  </div>
                  <CardDescription>Book: {build.name}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="customers" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="customers">Customers</TabsTrigger>
                      <TabsTrigger value="prospects">Prospects</TabsTrigger>
                    </TabsList>

                    {/* Customers Tab */}
                    <TabsContent value="customers" className="space-y-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Manager/Rep</TableHead>
                            <TableHead className="text-right">Reps</TableHead>
                            <TableHead className="text-right">Accounts</TableHead>
                            <TableHead className="text-right">ARR</TableHead>
                            <TableHead className="text-right">ATR</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {build.customer_metrics.map((flm, idx) => {
                            const isExpanded = expandedFLMs.has(`${build.id}-customer-${flm.flm_name}`);
                            return (
                              <React.Fragment key={idx}>
                                <TableRow 
                                  className="cursor-pointer hover:bg-muted/50"
                                  onClick={() => {
                                    const key = `${build.id}-customer-${flm.flm_name}`;
                                    setExpandedFLMs(prev => {
                                      const newSet = new Set(prev);
                                      if (newSet.has(key)) {
                                        newSet.delete(key);
                                      } else {
                                        newSet.add(key);
                                      }
                                      return newSet;
                                    });
                                  }}
                                >
                                  <TableCell className="font-medium">
                                    <div className="flex items-center gap-2">
                                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                      {flm.flm_name}
                                      <Badge variant="outline" className="text-xs">FLM</Badge>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">{flm.rep_count}</TableCell>
                                  <TableCell className="text-right">{flm.accounts}</TableCell>
                                  <TableCell className="text-right">
                                    ${(flm.arr / 1000000).toFixed(1)}M
                                  </TableCell>
                                  <TableCell className="text-right">
                                    ${(flm.atr / 1000000).toFixed(1)}M
                                  </TableCell>
                                </TableRow>
                                {isExpanded && flm.reps.map((rep) => (
                                  <TableRow key={rep.rep_id} className="bg-muted/30">
                                    <TableCell className="pl-12 text-sm">
                                      {rep.name}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">-</TableCell>
                                    <TableCell className="text-right text-sm">{rep.accounts}</TableCell>
                                    <TableCell className="text-right text-sm">
                                      ${(rep.arr / 1000000).toFixed(1)}M
                                    </TableCell>
                                    <TableCell className="text-right text-sm">
                                      ${(rep.atr / 1000000).toFixed(1)}M
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </React.Fragment>
                            );
                          })}
                          <TableRow className="bg-muted/50 font-bold">
                            <TableCell className="text-primary">
                              {build.slm_name} Total
                            </TableCell>
                            <TableCell className="text-right text-primary">
                              {build.customer_totals.total_reps}
                            </TableCell>
                            <TableCell className="text-right text-primary">
                              {build.customer_totals.total_accounts}
                            </TableCell>
                            <TableCell className="text-right text-primary">
                              ${(build.customer_totals.total_arr / 1000000).toFixed(1)}M
                            </TableCell>
                            <TableCell className="text-right text-primary">
                              ${(build.customer_totals.total_atr / 1000000).toFixed(1)}M
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TabsContent>

                    {/* Prospects Tab */}
                    <TabsContent value="prospects" className="space-y-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Manager/Rep</TableHead>
                            <TableHead className="text-right">Reps</TableHead>
                            <TableHead className="text-right">Accounts</TableHead>
                            <TableHead className="text-right">ARR</TableHead>
                            <TableHead className="text-right">ATR</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {build.prospect_metrics.map((flm, idx) => {
                            const isExpanded = expandedFLMs.has(`${build.id}-prospect-${flm.flm_name}`);
                            return (
                              <React.Fragment key={idx}>
                                <TableRow 
                                  className="cursor-pointer hover:bg-muted/50"
                                  onClick={() => {
                                    const key = `${build.id}-prospect-${flm.flm_name}`;
                                    setExpandedFLMs(prev => {
                                      const newSet = new Set(prev);
                                      if (newSet.has(key)) {
                                        newSet.delete(key);
                                      } else {
                                        newSet.add(key);
                                      }
                                      return newSet;
                                    });
                                  }}
                                >
                                  <TableCell className="font-medium">
                                    <div className="flex items-center gap-2">
                                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                      {flm.flm_name}
                                      <Badge variant="outline" className="text-xs">FLM</Badge>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">{flm.rep_count}</TableCell>
                                  <TableCell className="text-right">{flm.accounts}</TableCell>
                                  <TableCell className="text-right">
                                    ${(flm.arr / 1000000).toFixed(1)}M
                                  </TableCell>
                                  <TableCell className="text-right">
                                    ${(flm.atr / 1000000).toFixed(1)}M
                                  </TableCell>
                                </TableRow>
                                {isExpanded && flm.reps.map((rep) => (
                                  <TableRow key={rep.rep_id} className="bg-muted/30">
                                    <TableCell className="pl-12 text-sm">
                                      {rep.name}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">-</TableCell>
                                    <TableCell className="text-right text-sm">{rep.accounts}</TableCell>
                                    <TableCell className="text-right text-sm">
                                      ${(rep.arr / 1000000).toFixed(1)}M
                                    </TableCell>
                                    <TableCell className="text-right text-sm">
                                      ${(rep.atr / 1000000).toFixed(1)}M
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </React.Fragment>
                            );
                          })}
                          <TableRow className="bg-muted/50 font-bold">
                            <TableCell className="text-primary">
                              {build.slm_name} Total
                            </TableCell>
                            <TableCell className="text-right text-primary">
                              {build.prospect_totals.total_reps}
                            </TableCell>
                            <TableCell className="text-right text-primary">
                              {build.prospect_totals.total_accounts}
                            </TableCell>
                            <TableCell className="text-right text-primary">
                              ${(build.prospect_totals.total_arr / 1000000).toFixed(1)}M
                            </TableCell>
                            <TableCell className="text-right text-primary">
                              ${(build.prospect_totals.total_atr / 1000000).toFixed(1)}M
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Coverage Check Tab */}
        <TabsContent value="coverage-check" className="space-y-4">
          {/* Upload Section */}
          <Card>
            <CardHeader>
              <CardTitle>Upload Org Accounts</CardTitle>
              <CardDescription>
                Upload a CSV file containing all accounts in your organization to check assignment coverage across finalized books
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    disabled={isProcessing}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    CSV should contain a column: sfdc_account_id, Account ID, or account_id
                  </p>
                </div>
                <Button
                  onClick={processAccountsFile}
                  disabled={!uploadedFile || isProcessing || !approvedBuilds || approvedBuilds.length === 0}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {isProcessing ? 'Processing...' : 'Analyze'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          {orgAccounts.length > 0 && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Total Accounts</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{orgAccounts.length}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Fully Assigned</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-success">{fullyAssigned.length}</div>
                    <p className="text-xs text-muted-foreground">
                      {((fullyAssigned.length / orgAccounts.length) * 100).toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Partially Assigned</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-warning">{partiallyAssigned.length}</div>
                    <p className="text-xs text-muted-foreground">
                      {((partiallyAssigned.length / orgAccounts.length) * 100).toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Unassigned</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-destructive">{unassignedAccounts.length}</div>
                    <p className="text-xs text-muted-foreground">
                      {((unassignedAccounts.length / orgAccounts.length) * 100).toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Results Table */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Account Coverage Report</CardTitle>
                      <CardDescription>
                        Assignment status across all finalized books
                      </CardDescription>
                    </div>
                    <Button onClick={exportCoverageReport} variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      Export Report
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border max-h-[600px] overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background">
                        <TableRow>
                          <TableHead>Account ID</TableHead>
                          <TableHead>Account Name</TableHead>
                          <TableHead>Assigned In</TableHead>
                          <TableHead>Not Assigned In</TableHead>
                          <TableHead className="text-right">Coverage</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orgAccounts.map((account) => {
                          const coverage = approvedBuilds
                            ? (account.assigned_in_builds.length / approvedBuilds.length) * 100
                            : 0;

                          return (
                            <TableRow key={account.sfdc_account_id}>
                              <TableCell className="font-mono text-sm">
                                {account.sfdc_account_id}
                              </TableCell>
                              <TableCell className="font-medium">
                                {account.account_name}
                              </TableCell>
                              <TableCell>
                                {account.assigned_in_builds.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {account.assigned_in_builds.map((book) => (
                                      <Badge key={book} variant="default" className="text-xs">
                                        {book}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-sm">None</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {account.not_assigned_in_builds.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {account.not_assigned_in_builds.map((book) => (
                                      <Badge key={book} variant="outline" className="text-xs">
                                        {book}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-sm">None</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge
                                  variant={
                                    coverage === 100
                                      ? 'default'
                                      : coverage > 0
                                      ? 'secondary'
                                      : 'destructive'
                                  }
                                >
                                  {coverage.toFixed(0)}%
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
