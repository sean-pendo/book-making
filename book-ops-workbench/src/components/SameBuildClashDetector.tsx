import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { HIGH_VALUE_ARR_THRESHOLD, SALES_TOOLS_ARR_THRESHOLD, getAccountARR } from '@/_domain';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Users, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface SameBuildClash {
  id: string;
  sfdc_account_id: string;
  account_name: string;
  current_owner: string;
  new_owner: string;
  arr: number;
  conflict_type: 'assignment_conflict' | 'ownership_change' | 'duplicate_assignment';
  severity: 'high' | 'medium' | 'low';
  is_resolved: boolean;
}

interface SameBuildClashDetectorProps {
  buildId: string;
}

export const SameBuildClashDetector: React.FC<SameBuildClashDetectorProps> = ({ buildId }) => {
  const { toast } = useToast();
  const [selectedClash, setSelectedClash] = useState<SameBuildClash | null>(null);
  const [resolutionType, setResolutionType] = useState<string>('');
  const [resolutionRationale, setResolutionRationale] = useState('');
  const [showResolutionDialog, setShowResolutionDialog] = useState(false);

  // Detect same-build clashes
  const { data: clashes, isLoading: clashesLoading, refetch: refetchClashes } = useQuery({
    queryKey: ['same-build-clashes', buildId],
    queryFn: async () => {
      if (!buildId) return [];
      
      // Get accounts that have both owner_id and new_owner_id but they're different
      const { data: accounts, error } = await supabase
        .from('accounts')
        .select(`
          sfdc_account_id,
          account_name,
          owner_id,
          owner_name,
          new_owner_id,
          new_owner_name,
          calculated_arr,
          is_parent
        `)
        .eq('build_id', buildId)
        .eq('is_parent', true)
        .not('owner_id', 'is', null)
        .not('new_owner_id', 'is', null)
        .neq('owner_id', 'new_owner_id'); // Different owners
      
      if (error) throw error;
      
      const clashes: SameBuildClash[] = (accounts || []).map(account => {
        const accountARR = getAccountARR(account);
        return {
          id: `${buildId}-${account.sfdc_account_id}`,
          sfdc_account_id: account.sfdc_account_id,
          account_name: account.account_name,
          current_owner: `${account.owner_name} (${account.owner_id})`,
          new_owner: `${account.new_owner_name} (${account.new_owner_id})`,
          arr: accountARR,
          conflict_type: 'assignment_conflict',
          severity: accountARR > HIGH_VALUE_ARR_THRESHOLD ? 'high' : accountARR > SALES_TOOLS_ARR_THRESHOLD ? 'medium' : 'low',
          is_resolved: false
        };
      });
      
      return clashes;
    },
    enabled: !!buildId
  });

  // Get existing clash resolutions from database
  const { data: resolvedClashes } = useQuery({
    queryKey: ['same-build-resolved-clashes', buildId],
    queryFn: async () => {
      if (!buildId) return [];
      
      const { data, error } = await supabase
        .from('clashes')
        .select('*')
        .eq('build_id', buildId)
        .eq('is_resolved', true);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!buildId
  });

  const clashStats = useMemo(() => {
    if (!clashes) return { total: 0, resolved: 0, highSeverity: 0, pending: 0 };
    
    const resolved = resolvedClashes?.length || 0;
    return {
      total: clashes.length,
      resolved,
      highSeverity: clashes.filter(c => c.severity === 'high').length,
      pending: clashes.length - resolved
    };
  }, [clashes, resolvedClashes]);

  const handleResolveClash = async () => {
    if (!selectedClash || !resolutionType || !resolutionRationale) return;

    try {
      // Save clash resolution to database
      const { error } = await supabase
        .from('clashes')
        .insert({
          build_id: buildId,
          sfdc_account_id: selectedClash.sfdc_account_id,
          account_name: selectedClash.account_name,
          amer_owner: selectedClash.current_owner.includes('(') 
            ? selectedClash.current_owner.split(' (')[0] 
            : selectedClash.current_owner,
          emea_owner: selectedClash.new_owner.includes('(') 
            ? selectedClash.new_owner.split(' (')[0] 
            : selectedClash.new_owner,
          proposed_resolution: resolutionType,
          resolution_rationale: resolutionRationale,
          is_resolved: true,
          resolved_by: (await supabase.auth.getUser()).data.user?.id,
          resolved_at: new Date().toISOString()
        });

      if (error) throw error;

      toast({
        title: "Clash Resolved",
        description: `Successfully resolved assignment conflict for ${selectedClash.account_name}`,
      });
      
      setShowResolutionDialog(false);
      setResolutionType('');
      setResolutionRationale('');
      setSelectedClash(null);
      refetchClashes();
    } catch (error) {
      console.error('Error resolving clash:', error);
      toast({
        title: "Resolution Failed",
        description: "Failed to resolve clash. Please try again.",
        variant: "destructive"
      });
    }
  };

  if (clashesLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Detecting assignment conflicts...</span>
        </div>
      </div>
    );
  }

  if (!clashes || clashes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Assignment Conflicts</CardTitle>
          <CardDescription>
            Check for conflicting assignments within this build
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Assignment Conflicts</h3>
            <p className="text-muted-foreground">
              All account assignments are consistent within this build.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assignment Conflicts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clashStats.total}</div>
            <p className="text-xs text-muted-foreground">
              In this build
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{clashStats.pending}</div>
            <p className="text-xs text-muted-foreground">
              Need resolution
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Severity</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{clashStats.highSeverity}</div>
            <p className="text-xs text-muted-foreground">
              High value accounts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{clashStats.resolved}</div>
            <p className="text-xs text-muted-foreground">
              Successfully handled
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Conflicts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Assignment Conflicts</CardTitle>
          <CardDescription>
            Accounts with conflicting current and new owner assignments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Current Owner</TableHead>
                <TableHead>New Assignment</TableHead>
                <TableHead>ARR</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clashes.map((clash) => (
                <TableRow key={clash.id}>
                  <TableCell className="font-medium">
                    <div>
                      <div>{clash.account_name}</div>
                      <div className="text-sm text-muted-foreground">{clash.sfdc_account_id}</div>
                    </div>
                  </TableCell>
                  <TableCell>{clash.current_owner}</TableCell>
                  <TableCell>{clash.new_owner}</TableCell>
                  <TableCell>
                    ${clash.arr.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={clash.severity === 'high' ? 'destructive' : clash.severity === 'medium' ? 'default' : 'secondary'}>
                      {clash.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Dialog open={showResolutionDialog && selectedClash?.id === clash.id} onOpenChange={setShowResolutionDialog}>
                      <DialogTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setSelectedClash(clash)}
                        >
                          Resolve
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Resolve Assignment Conflict</DialogTitle>
                          <DialogDescription>
                            Choose how to resolve the assignment conflict for {clash.account_name}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <label className="text-sm font-medium">Resolution Type</label>
                            <Select value={resolutionType} onValueChange={setResolutionType}>
                              <SelectTrigger>
                                <SelectValue placeholder="Choose resolution..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="keep_current">Keep Current Owner</SelectItem>
                                <SelectItem value="keep_new">Apply New Assignment</SelectItem>
                                <SelectItem value="manual_review">Requires Manual Review</SelectItem>
                                <SelectItem value="reassign">Reassign to Different Rep</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-sm font-medium">Rationale</label>
                            <Textarea
                              placeholder="Explain the reasoning for this resolution..."
                              value={resolutionRationale}
                              onChange={(e) => setResolutionRationale(e.target.value)}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button onClick={handleResolveClash} disabled={!resolutionType || !resolutionRationale}>
                              Apply Resolution
                            </Button>
                            <Button variant="outline" onClick={() => setShowResolutionDialog(false)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};