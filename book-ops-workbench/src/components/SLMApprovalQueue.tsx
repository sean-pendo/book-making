import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, Clock, AlertCircle, ArrowRight } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface SLMApprovalQueueProps {
  buildId: string;
  slmName: string;
}

export default function SLMApprovalQueue({ buildId, slmName }: SLMApprovalQueueProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedReassignment, setSelectedReassignment] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  // Fetch all pending_slm reassignments for FLMs under this SLM
  const { data: pendingApprovals, isLoading } = useQuery({
    queryKey: ['slm-pending-approvals', buildId, slmName],
    queryFn: async () => {
      // First, get all reps under this SLM (to identify which current_owner_ids are valid)
      const { data: repsUnderSLM, error: repsError } = await supabase
        .from('sales_reps')
        .select('rep_id, name, flm')
        .eq('build_id', buildId)
        .eq('slm', slmName);

      if (repsError) throw repsError;

      // Get rep IDs under this SLM
      const repIdsUnderSLM = repsUnderSLM?.map(r => r.rep_id) || [];

      if (repIdsUnderSLM.length === 0) {
        return [];
      }

      // Fetch pending_slm reassignments WHERE the current owner is a rep under this SLM
      // This ensures SLMs only see proposals affecting their team
      const { data: reassignments, error: reassignmentsError } = await supabase
        .from('manager_reassignments')
        .select(`
          *,
          proposer:profiles!manager_reassignments_manager_user_id_fkey(full_name, email)
        `)
        .eq('build_id', buildId)
        .eq('approval_status', 'pending_slm')
        .in('current_owner_id', repIdsUnderSLM)
        .order('created_at', { ascending: false });

      if (reassignmentsError) throw reassignmentsError;

      return reassignments || [];
    },
    enabled: !!buildId && !!slmName,
  });

  // Approve a single reassignment
  const approveMutation = useMutation({
    mutationFn: async (reassignmentId: string) => {
      const { error } = await supabase
        .from('manager_reassignments')
        .update({
          approval_status: 'pending_revops',
          slm_approved_by: user!.id,
          slm_approved_at: new Date().toISOString(),
        })
        .eq('id', reassignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Proposal Approved',
        description: 'Sent to RevOps for final approval.',
      });
      queryClient.invalidateQueries({ queryKey: ['slm-pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['manager-accounts'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Reject a single reassignment
  const rejectMutation = useMutation({
    mutationFn: async ({ reassignmentId, reason }: { reassignmentId: string; reason: string }) => {
      const { error } = await supabase
        .from('manager_reassignments')
        .update({
          approval_status: 'rejected',
          slm_approved_by: user!.id,
          slm_approved_at: new Date().toISOString(),
          rationale: reason ? `[SLM Rejected] ${reason}` : '[SLM Rejected]',
        })
        .eq('id', reassignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Proposal Rejected',
        description: 'The FLM has been notified.',
      });
      queryClient.invalidateQueries({ queryKey: ['slm-pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['manager-accounts'] });
      setShowRejectDialog(false);
      setSelectedReassignment(null);
      setRejectReason('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Approve all pending
  const approveAllMutation = useMutation({
    mutationFn: async () => {
      if (!pendingApprovals || pendingApprovals.length === 0) {
        throw new Error('No pending proposals');
      }

      const { error } = await supabase
        .from('manager_reassignments')
        .update({
          approval_status: 'pending_revops',
          slm_approved_by: user!.id,
          slm_approved_at: new Date().toISOString(),
        })
        .eq('build_id', buildId)
        .eq('approval_status', 'pending_slm');

      if (error) throw error;
      return pendingApprovals.length;
    },
    onSuccess: (count) => {
      toast({
        title: 'All Proposals Approved',
        description: `${count} proposal${count !== 1 ? 's' : ''} sent to RevOps for final approval.`,
      });
      queryClient.invalidateQueries({ queryKey: ['slm-pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['manager-accounts'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const pendingCount = pendingApprovals?.length || 0;

  return (
    <>
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
                <div className="text-sm text-muted-foreground">Pending Your Approval</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-sm text-muted-foreground mb-2">Approval Flow</div>
                <div className="flex items-center justify-center gap-2 text-xs">
                  <Badge variant="outline">FLM Proposes</Badge>
                  <ArrowRight className="w-3 h-3" />
                  <Badge className="bg-amber-100 text-amber-800">You Approve</Badge>
                  <ArrowRight className="w-3 h-3" />
                  <Badge variant="outline">RevOps Final</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center justify-center">
              {pendingCount > 0 && (
                <Button
                  onClick={() => approveAllMutation.mutate()}
                  disabled={approveAllMutation.isPending}
                  className="gap-2"
                >
                  {approveAllMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  Approve All ({pendingCount})
                </Button>
              )}
              {pendingCount === 0 && (
                <div className="text-center text-muted-foreground">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                  <p className="text-sm">All caught up!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Pending Approvals Table */}
        <Card>
          <CardHeader>
            <CardTitle>FLM Reassignment Proposals</CardTitle>
            <CardDescription>
              Review and approve account reassignments proposed by your FLMs
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!pendingApprovals || pendingApprovals.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No pending proposals from your FLMs</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Current Owner</TableHead>
                    <TableHead>Proposed Owner</TableHead>
                    <TableHead>Proposed By</TableHead>
                    <TableHead>Rationale</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingApprovals.map((reassignment: any) => (
                    <TableRow key={reassignment.id}>
                      <TableCell className="font-medium">{reassignment.account_name}</TableCell>
                      <TableCell>{reassignment.current_owner_name}</TableCell>
                      <TableCell>
                        <span className="font-medium text-primary">{reassignment.proposed_owner_name}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {reassignment.proposer?.full_name || reassignment.proposer?.email || 'Unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="text-sm text-muted-foreground truncate" title={reassignment.rationale}>
                          {reassignment.rationale || 'No rationale provided'}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(reassignment.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            onClick={() => approveMutation.mutate(reassignment.id)}
                            disabled={approveMutation.isPending}
                            className="gap-1"
                          >
                            {approveMutation.isPending ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <CheckCircle className="w-3 h-3" />
                            )}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedReassignment(reassignment);
                              setShowRejectDialog(true);
                            }}
                            className="gap-1"
                          >
                            <XCircle className="w-3 h-3" />
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Proposal</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this reassignment proposal. The FLM will be notified.
            </DialogDescription>
          </DialogHeader>
          
          {selectedReassignment && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Account</span>
                  <span className="font-medium">{selectedReassignment.account_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Proposed Change</span>
                  <span className="text-sm">
                    {selectedReassignment.current_owner_name} → {selectedReassignment.proposed_owner_name}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reject-reason">Reason for Rejection</Label>
                <Textarea
                  id="reject-reason"
                  placeholder="Explain why this proposal is being rejected..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectDialog(false);
                setSelectedReassignment(null);
                setRejectReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedReassignment) {
                  rejectMutation.mutate({
                    reassignmentId: selectedReassignment.id,
                    reason: rejectReason,
                  });
                }
              }}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Reject Proposal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

