import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getApprovalStepsForRegion } from '@/utils/approvalChainUtils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface ManagerReassignmentPanelProps {
  buildId: string;
  managerUserId: string;
  managerLevel: 'FLM' | 'SLM';
  managerName: string;
}

export default function ManagerReassignmentPanel({
  buildId,
  managerUserId,
  managerLevel,
  managerName,
}: ManagerReassignmentPanelProps) {
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [newOwnerId, setNewOwnerId] = useState<string>('');
  const [rationale, setRationale] = useState('');
  const queryClient = useQueryClient();

  // Fetch eligible sales reps
  const { data: eligibleReps } = useQuery({
    queryKey: ['eligible-reps', buildId, managerLevel, managerName],
    queryFn: async () => {
      let query = supabase
        .from('sales_reps')
        .select('*')
        .eq('build_id', buildId)
        .eq('include_in_assignments', true);

      if (managerLevel === 'FLM') {
        query = query.eq('flm', managerName);
      } else if (managerLevel === 'SLM') {
        query = query.eq('slm', managerName);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // Fetch accounts for reassignment selection
  const { data: accounts } = useQuery({
    queryKey: ['reassignment-accounts', buildId, eligibleReps],
    queryFn: async () => {
      if (!eligibleReps || eligibleReps.length === 0) return [];

      const repIds = eligibleReps.map(rep => rep.rep_id);
      
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('build_id', buildId)
        .eq('is_parent', true)
        .in('new_owner_id', repIds);

      if (error) throw error;
      return data;
    },
    enabled: !!eligibleReps && eligibleReps.length > 0,
  });

  // Fetch pending reassignments
  const { data: pendingReassignments } = useQuery({
    queryKey: ['pending-reassignments', buildId, managerUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manager_reassignments')
        .select('*')
        .eq('build_id', buildId)
        .eq('manager_user_id', managerUserId)
        .in('approval_status', ['pending_slm', 'pending_revops'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Fetch assignment configuration for capacity checks
  const { data: config } = useQuery({
    queryKey: ['assignment-config', buildId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assignment_configuration')
        .select('*')
        .eq('build_id', buildId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  // Fetch build region to determine approval chain
  const { data: buildData } = useQuery({
    queryKey: ['build-region', buildId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('builds')
        .select('region')
        .eq('id', buildId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  // Determine initial approval status based on region
  const initialApprovalStatus = useMemo(() => {
    return getApprovalStepsForRegion(buildData?.region)[0];
  }, [buildData?.region]);

  const createReassignmentMutation = useMutation({
    mutationFn: async () => {
      const account = accounts?.find(a => a.sfdc_account_id === selectedAccount);
      const newOwner = eligibleReps?.find(r => r.rep_id === newOwnerId);
      
      if (!account || !newOwner) throw new Error('Invalid selection');

      // Calculate capacity warnings
      const newOwnerAccounts = accounts?.filter(a => a.new_owner_id === newOwnerId) || [];
      const newOwnerARR = newOwnerAccounts.reduce((sum, a) => sum + (a.calculated_arr || 0), 0);
      const targetARR = config?.customer_target_arr || 1300000;
      const maxARR = config?.customer_max_arr || 3000000;
      
      const warnings = [];
      if (newOwnerARR + (account.calculated_arr || 0) > maxARR) {
        warnings.push({
          type: 'capacity_exceeded',
          message: `${newOwner.name} will exceed max ARR capacity (${Math.round((newOwnerARR + (account.calculated_arr || 0)) / maxARR * 100)}% of max)`,
          severity: 'high'
        });
      } else if (newOwnerARR + (account.calculated_arr || 0) > targetARR * 1.2) {
        warnings.push({
          type: 'approaching_capacity',
          message: `${newOwner.name} will be approaching capacity (${Math.round((newOwnerARR + (account.calculated_arr || 0)) / targetARR * 100)}% of target)`,
          severity: 'medium'
        });
      }

      const { error } = await supabase.from('manager_reassignments').insert({
        build_id: buildId,
        sfdc_account_id: account.sfdc_account_id,
        account_name: account.account_name,
        current_owner_id: account.new_owner_id || account.owner_id,
        current_owner_name: account.new_owner_name || account.owner_name,
        proposed_owner_id: newOwner.rep_id,
        proposed_owner_name: newOwner.name,
        manager_user_id: managerUserId,
        rationale,
        capacity_warnings: warnings,
        status: 'pending', // Legacy field
        approval_status: initialApprovalStatus, // Dynamic based on region (EMEA skips SLM)
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Reassignment Proposed',
        description: 'Your reassignment has been submitted for RevOps approval.',
      });
      setSelectedAccount('');
      setNewOwnerId('');
      setRationale('');
      queryClient.invalidateQueries({ queryKey: ['pending-reassignments'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const selectedAccountData = accounts?.find(a => a.sfdc_account_id === selectedAccount);
  const selectedNewOwner = eligibleReps?.find(r => r.rep_id === newOwnerId);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Propose Account Reassignment</CardTitle>
          <CardDescription>
            Reassign accounts within your team. All reassignments require RevOps approval.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Select Account to Reassign</Label>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an account..." />
              </SelectTrigger>
              <SelectContent>
                {accounts?.map((account) => (
                  <SelectItem key={account.sfdc_account_id} value={account.sfdc_account_id}>
                    {account.account_name} (Current: {account.new_owner_name || account.owner_name})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>New Owner</Label>
            <Select value={newOwnerId} onValueChange={setNewOwnerId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose new owner..." />
              </SelectTrigger>
              <SelectContent>
                {eligibleReps?.map((rep) => (
                  <SelectItem key={rep.rep_id} value={rep.rep_id}>
                    {rep.name} ({rep.team})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Rationale</Label>
            <Textarea
              placeholder="Explain why this reassignment is needed..."
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={3}
            />
          </div>

          {selectedAccountData && selectedNewOwner && (
            <div className="bg-accent/20 p-4 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{selectedAccountData.account_name}</span>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{selectedNewOwner.name}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                ARR: {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(selectedAccountData.calculated_arr || 0)}
              </div>
            </div>
          )}

          <Button
            onClick={() => createReassignmentMutation.mutate()}
            disabled={!selectedAccount || !newOwnerId || !rationale || createReassignmentMutation.isPending}
            className="w-full"
          >
            {createReassignmentMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Propose Reassignment
          </Button>
        </CardContent>
      </Card>

      {pendingReassignments && pendingReassignments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Reassignments</CardTitle>
            <CardDescription>Awaiting RevOps approval</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Warnings</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingReassignments.map((reassignment: any) => (
                  <TableRow key={reassignment.id}>
                    <TableCell className="font-medium">{reassignment.account_name}</TableCell>
                    <TableCell>{reassignment.current_owner_name}</TableCell>
                    <TableCell>{reassignment.proposed_owner_name}</TableCell>
                    <TableCell>
                      {reassignment.capacity_warnings && reassignment.capacity_warnings.length > 0 ? (
                        <Badge variant="outline" className="gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {reassignment.capacity_warnings.length} warning(s)
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{reassignment.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
