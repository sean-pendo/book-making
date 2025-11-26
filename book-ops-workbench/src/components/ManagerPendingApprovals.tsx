import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface ManagerPendingApprovalsProps {
  buildId: string;
  managerLevel?: 'FLM' | 'SLM';
}

export default function ManagerPendingApprovals({ buildId, managerLevel }: ManagerPendingApprovalsProps) {
  const { user, effectiveProfile } = useAuth();
  const userRole = effectiveProfile?.role || 'FLM';

  const { data: reassignments, isLoading } = useQuery({
    queryKey: ['manager-pending-approvals', buildId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manager_reassignments')
        .select('*')
        .eq('build_id', buildId)
        .eq('manager_user_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getStatusBadge = (approvalStatus: string) => {
    switch (approvalStatus) {
      case 'pending_slm':
        return <Badge variant="outline" className="gap-1 bg-amber-50 text-amber-700 border-amber-300"><Clock className="w-3 h-3" />Awaiting SLM</Badge>;
      case 'pending_revops':
        return <Badge variant="outline" className="gap-1 bg-blue-50 text-blue-700 border-blue-300"><Clock className="w-3 h-3" />Awaiting RevOps</Badge>;
      case 'approved':
        return <Badge className="bg-success/10 text-success hover:bg-success/20 gap-1"><CheckCircle className="w-3 h-3" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Rejected</Badge>;
      default:
        return <Badge variant="outline" className="gap-1"><AlertCircle className="w-3 h-3" />{approvalStatus || 'Unknown'}</Badge>;
    }
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

  const pendingSlmCount = reassignments?.filter(r => r.approval_status === 'pending_slm').length || 0;
  const pendingRevopsCount = reassignments?.filter(r => r.approval_status === 'pending_revops').length || 0;
  const approvedCount = reassignments?.filter(r => r.approval_status === 'approved').length || 0;
  const rejectedCount = reassignments?.filter(r => r.approval_status === 'rejected').length || 0;

  // Determine which cards to show based on role
  // FLM: Show all 4 (their proposals start at pending_slm)
  // SLM: Hide "Awaiting SLM" (their proposals skip to pending_revops)
  // RevOps: Show only "Applied" and "Rejected" (their proposals auto-approve)
  const showAwaitingSlm = userRole === 'FLM' || (managerLevel === 'FLM' && userRole !== 'REVOPS');
  const showAwaitingRevops = userRole !== 'REVOPS';
  const isRevOps = userRole === 'REVOPS';

  // Calculate grid columns based on visible cards
  const visibleCardCount = (showAwaitingSlm ? 1 : 0) + (showAwaitingRevops ? 1 : 0) + 2; // Always show Approved + Rejected
  const gridCols = `grid-cols-${visibleCardCount}`;

  return (
    <div className="space-y-6">
      <div className={`grid gap-4 ${visibleCardCount === 4 ? 'grid-cols-4' : visibleCardCount === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {/* Awaiting SLM - Only show for FLMs */}
        {showAwaitingSlm && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-600">{pendingSlmCount}</div>
                <div className="text-sm text-muted-foreground">Awaiting SLM</div>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Awaiting RevOps - Show for FLM and SLM, not RevOps */}
        {showAwaitingRevops && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{pendingRevopsCount}</div>
                <div className="text-sm text-muted-foreground">Awaiting RevOps</div>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Approved/Applied - Show for all */}
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-success">{approvedCount}</div>
              <div className="text-sm text-muted-foreground">
                {isRevOps ? 'Applied' : 'Approved'}
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Rejected - Show for all */}
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-destructive">{rejectedCount}</div>
              <div className="text-sm text-muted-foreground">Rejected</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reassignment Requests</CardTitle>
          <CardDescription>Track your proposed account reassignments</CardDescription>
        </CardHeader>
        <CardContent>
          {!reassignments || reassignments.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No reassignment requests yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Current Owner</TableHead>
                  <TableHead>Proposed Owner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Rationale</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reassignments.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="font-medium">{request.account_name}</TableCell>
                    <TableCell>{request.current_owner_name}</TableCell>
                    <TableCell>
                      <div className="font-medium text-primary">{request.proposed_owner_name}</div>
                    </TableCell>
                    <TableCell>{getStatusBadge(request.approval_status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(request.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="text-sm text-muted-foreground truncate" title={request.rationale || 'No rationale provided'}>
                        {request.rationale || 'No rationale provided'}
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
  );
}
