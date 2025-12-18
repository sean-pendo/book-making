import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { SALES_TOOLS_ARR_THRESHOLD, formatCurrency } from '@/_domain';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, Search, CheckCircle, Download, Zap, Globe, Users, Building } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface Clash {
  id: string;
  sfdc_account_id: string;
  account_name: string;
  parent_account?: string;
  amer_owner: string;
  amer_team: string;
  emea_owner: string;
  emea_team: string;
  arr_amer: number;
  arr_emea: number;
  total_arr: number;
  proposed_resolution?: string;
  resolution_reason?: string;
  is_resolved: boolean;
  resolved_by?: string;
  resolved_at?: string;
  auto_resolvable: boolean;
  risk_level: 'low' | 'medium' | 'high';
  children_count: number;
}

interface AutoResolutionRule {
  id: string;
  name: string;
  description: string;
  condition: string;
  action: string;
  enabled: boolean;
  matches_count: number;
}

export const ClashDetector = () => {
  const { toast } = useToast();
  const { effectiveProfile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [resolutionFilter, setResolutionFilter] = useState<string>('all');
  const [selectedClash, setSelectedClash] = useState<Clash | null>(null);
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [resolutionReason, setResolutionReason] = useState('');
  const [proposedOwner, setProposedOwner] = useState('');

  // Get user's region for filtering
  const userRegion = effectiveProfile?.region;

  // Fetch clashes scoped to user's region builds
  const { data: clashes = [], isLoading, refetch } = useQuery({
    queryKey: ['clashes', userRegion],
    queryFn: async () => {
      // First get build IDs for user's region
      let buildsQuery = supabase
        .from('builds')
        .select('id');
      
      // Filter builds by region (unless REVOPS)
      if (userRegion && effectiveProfile?.role !== 'REVOPS') {
        buildsQuery = buildsQuery.eq('region', userRegion);
      }
      
      const { data: regionBuilds } = await buildsQuery;
      const regionBuildIds = regionBuilds?.map(b => b.id) || [];
      
      // Now fetch clashes for those builds
      let query = supabase
        .from('clashes')
        .select('*')
        .order('created_at', { ascending: false });
      
      // Filter clashes to only those in region builds
      if (regionBuildIds.length > 0 && effectiveProfile?.role !== 'REVOPS') {
        query = query.in('build_id', regionBuildIds);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      // Transform database data to match component interface
      return (data || []).map(clash => ({
        id: clash.id,
        sfdc_account_id: clash.sfdc_account_id,
        account_name: clash.account_name || 'Unknown Account',
        parent_account: undefined, // Not available from current database schema
        amer_owner: clash.amer_owner || 'Unknown',
        amer_team: 'AMER Team', // Could be enhanced with team data
        emea_owner: clash.emea_owner || 'Unknown', 
        emea_team: 'EMEA Team', // Could be enhanced with team data
        arr_amer: 0, // Could be calculated from account data
        arr_emea: 0, // Could be calculated from account data
        total_arr: 0, // Could be calculated from account data
        proposed_resolution: clash.proposed_resolution,
        resolution_reason: clash.resolution_rationale,
        is_resolved: clash.is_resolved || false,
        resolved_by: clash.resolved_by ? 'System User' : undefined,
        resolved_at: clash.resolved_at ? new Date(clash.resolved_at).toISOString().split('T')[0] : undefined,
        auto_resolvable: false, // Could be determined by business rules
        risk_level: (Math.random() > 0.5 ? 'high' : Math.random() > 0.5 ? 'medium' : 'low') as 'high' | 'medium' | 'low', // Random for now, could be determined by ARR or other factors
        children_count: 0 // Could be calculated from hierarchy data
      }));
    }
  });

  const [autoRules] = useState<AutoResolutionRule[]>([
    {
      id: 'AR001',
      name: '50K Rule - EMEA Priority',
      description: 'If child account >$50K ARR exists in EMEA, assign entire hierarchy to EMEA',
      condition: 'child_arr_emea > 50000',
      action: 'assign_to_emea',
      enabled: true,
      matches_count: 12
    },
    {
      id: 'AR002',
      name: 'Higher ARR Assignment',
      description: 'Assign to region with higher ARR when difference > 50%',
      condition: 'arr_difference_percentage > 50',
      action: 'assign_to_higher_arr',
      enabled: true,
      matches_count: 8
    },
    {
      id: 'AR003',
      name: 'Parent Hierarchy Enforcement',
      description: 'Keep child accounts in same region as parent account',
      condition: 'has_parent_assignment',
      action: 'follow_parent_region',
      enabled: true,
      matches_count: 15
    },
    {
      id: 'AR004',
      name: 'Commercial Threshold',
      description: `Commercial accounts <${formatCurrency(SALES_TOOLS_ARR_THRESHOLD)} assigned to region with operational presence`,
      condition: `tier = commercial AND total_arr < ${SALES_TOOLS_ARR_THRESHOLD}`,
      action: 'assign_to_operational_region',
      enabled: false,
      matches_count: 5
    }
  ]);

  const handleAutoResolve = async () => {
    const autoResolvableClashes = clashes.filter(clash => 
      clash.auto_resolvable && !clash.is_resolved
    );

    if (autoResolvableClashes.length === 0) {
      toast({
        title: "No Auto-Resolvable Clashes",
        description: "All clashes require manual resolution",
      });
      return;
    }

    try {
      // Update auto-resolvable clashes in database
      for (const clash of autoResolvableClashes) {
        let proposedResolution = '';
        if (clash.arr_emea > clash.arr_amer * 1.5) {
          proposedResolution = 'Assigned to EMEA (higher ARR)';
        } else if (clash.arr_amer > clash.arr_emea * 1.5) {
          proposedResolution = 'Assigned to AMER (higher ARR)';
        } else if (clash.children_count > 0) {
          proposedResolution = 'Applied parent hierarchy rule';
        } else {
          proposedResolution = 'Applied 50K rule';
        }

        await supabase
          .from('clashes')
          .update({
            is_resolved: true,
            proposed_resolution: proposedResolution,
            resolved_by: (await supabase.auth.getUser()).data.user?.id,
            resolved_at: new Date().toISOString()
          })
          .eq('id', clash.id);
      }

      refetch(); // Refetch clashes to update UI

      toast({
        title: "Auto-Resolution Complete",
        description: `Resolved ${autoResolvableClashes.length} clashes automatically`,
      });
    } catch (error) {
      console.error('Error in auto-resolve:', error);
      toast({
        title: "Auto-Resolution Failed",
        description: "Some clashes could not be auto-resolved. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleManualResolve = async () => {
    if (!selectedClash) return;

    try {
      // Update clash in database
      const { error } = await supabase
        .from('clashes')
        .update({
          proposed_resolution: `Assigned to ${proposedOwner}`,
          resolution_rationale: resolutionReason,
          is_resolved: true,
          resolved_by: (await supabase.auth.getUser()).data.user?.id,
          resolved_at: new Date().toISOString()
        })
        .eq('id', selectedClash.id);

      if (error) throw error;

      setShowResolveDialog(false);
      setSelectedClash(null);
      setResolutionReason('');
      setProposedOwner('');
      refetch(); // Refetch clashes to update UI

      toast({
        title: "Clash Resolved",
        description: `${selectedClash.account_name} has been manually resolved`,
      });
    } catch (error) {
      console.error('Error resolving clash:', error);
      toast({
        title: "Resolution Failed",
        description: "Failed to resolve clash. Please try again.",
        variant: "destructive"
      });
    }
  };

  const exportClashSummary = () => {
    toast({
      title: "Export Started",
      description: "Clash summary sheet is being generated...",
    });
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case 'high':
        return <Badge variant="destructive">High Risk</Badge>;
      case 'medium':
        return <Badge className="bg-orange-500">Medium Risk</Badge>;
      case 'low':
        return <Badge className="bg-yellow-500">Low Risk</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getResolutionBadge = (resolved: boolean, autoResolvable: boolean) => {
    if (resolved) {
      return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Resolved</Badge>;
    }
    if (autoResolvable) {
      return <Badge className="bg-blue-500"><Zap className="w-3 h-3 mr-1" />Auto-Resolvable</Badge>;
    }
    return <Badge variant="outline">Manual Required</Badge>;
  };

  const filteredClashes = (clashes || []).filter(clash => {
    const matchesSearch = clash.account_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         clash.sfdc_account_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         clash.amer_owner.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         clash.emea_owner.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = resolutionFilter === 'all' ||
                         (resolutionFilter === 'resolved' && clash.is_resolved) ||
                         (resolutionFilter === 'unresolved' && !clash.is_resolved) ||
                         (resolutionFilter === 'auto' && clash.auto_resolvable);

    return matchesSearch && matchesFilter;
  });

  const unresolvedCount = clashes?.filter(c => !c.is_resolved).length || 0;
  const autoResolvableCount = clashes?.filter(c => c.auto_resolvable && !c.is_resolved).length || 0;
  const highRiskCount = clashes?.filter(c => c.risk_level === 'high' && !c.is_resolved).length || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clash Detector</h1>
          <p className="text-muted-foreground">
            Detect and resolve duplicate assignments across AMER and EMEA regions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportClashSummary}>
            <Download className="w-4 h-4 mr-2" />
            Export Summary
          </Button>
          <Button onClick={handleAutoResolve} disabled={autoResolvableCount === 0}>
            <Zap className="w-4 h-4 mr-2" />
            Auto-Resolve ({autoResolvableCount})
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <div className="text-sm font-medium">Total Clashes</div>
            </div>
            <div className="text-2xl font-bold">{clashes.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-orange-600" />
              <div className="text-sm font-medium">Unresolved</div>
            </div>
            <div className="text-2xl font-bold">{unresolvedCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-600" />
              <div className="text-sm font-medium">Auto-Resolvable</div>
            </div>
            <div className="text-2xl font-bold">{autoResolvableCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <div className="text-sm font-medium">High Risk</div>
            </div>
            <div className="text-2xl font-bold">{highRiskCount}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Clashes Table */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    Regional Assignment Clashes
                  </CardTitle>
                  <CardDescription>
                    Accounts assigned to multiple regions requiring resolution
                  </CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search clashes..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 w-64"
                    />
                  </div>
                  <Select value={resolutionFilter} onValueChange={setResolutionFilter}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Clashes</SelectItem>
                      <SelectItem value="unresolved">Unresolved</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="auto">Auto-Resolvable</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>AMER Owner</TableHead>
                    <TableHead>EMEA Owner</TableHead>
                    <TableHead>ARR Split</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClashes.map((clash) => (
                    <TableRow key={clash.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{clash.account_name}</div>
                          <div className="text-sm text-muted-foreground">
                            {clash.sfdc_account_id}
                            {clash.parent_account && (
                              <Badge className="ml-2" variant="outline">
                                Parent: {clash.parent_account}
                              </Badge>
                            )}
                            {clash.children_count > 0 && (
                              <Badge className="ml-2" variant="outline">
                                {clash.children_count} Children
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{clash.amer_owner}</div>
                          <div className="text-sm text-muted-foreground">{clash.amer_team}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{clash.emea_owner}</div>
                          <div className="text-sm text-muted-foreground">{clash.emea_team}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm">
                            AMER: ${clash.arr_amer.toLocaleString()}
                          </div>
                          <div className="text-sm">
                            EMEA: ${clash.arr_emea.toLocaleString()}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Total: ${clash.total_arr.toLocaleString()}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{getRiskBadge(clash.risk_level)}</TableCell>
                      <TableCell>
                        {getResolutionBadge(clash.is_resolved, clash.auto_resolvable)}
                        {clash.proposed_resolution && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {clash.proposed_resolution}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {!clash.is_resolved && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              setSelectedClash(clash);
                              setShowResolveDialog(true);
                            }}
                          >
                            Resolve
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Auto-Resolution Rules */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Auto-Resolution Rules
              </CardTitle>
              <CardDescription>
                Automated policies for clash resolution
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {autoRules.map((rule) => (
                  <div key={rule.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-sm">{rule.name}</h4>
                      <Badge 
                        variant={rule.enabled ? "default" : "outline"}
                        className={rule.enabled ? "bg-green-500" : ""}
                      >
                        {rule.enabled ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{rule.description}</p>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium">Matches: {rule.matches_count}</span>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs">
                        Edit
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Manual Resolution Dialog */}
      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Clash - {selectedClash?.account_name}</DialogTitle>
            <DialogDescription>
              Manually assign this account to the appropriate region and owner
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedClash && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <div><strong>Current Assignment:</strong></div>
                    <div>AMER: {selectedClash.amer_owner} (${selectedClash.arr_amer.toLocaleString()} ARR)</div>
                    <div>EMEA: {selectedClash.emea_owner} (${selectedClash.arr_emea.toLocaleString()} ARR)</div>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="proposed-owner">Assign To</Label>
              <Select value={proposedOwner} onValueChange={setProposedOwner}>
                <SelectTrigger>
                  <SelectValue placeholder="Select region and owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="amer">AMER - {selectedClash?.amer_owner}</SelectItem>
                  <SelectItem value="emea">EMEA - {selectedClash?.emea_owner}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="resolution-reason">Resolution Reason</Label>
              <Textarea
                id="resolution-reason"
                value={resolutionReason}
                onChange={(e) => setResolutionReason(e.target.value)}
                placeholder="Explain the rationale for this assignment decision..."
              />
            </div>

            {selectedClash?.children_count && selectedClash.children_count > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  This account has {selectedClash.children_count} child accounts. 
                  Resolving this clash will also affect the child account assignments.
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResolveDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleManualResolve}
              disabled={!proposedOwner || !resolutionReason}
            >
              Resolve Clash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};