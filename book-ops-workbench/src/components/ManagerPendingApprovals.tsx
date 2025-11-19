import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface ManagerPendingApprovalsProps {
  buildId: string;
}

export default function ManagerPendingApprovals({ buildId }: ManagerPendingApprovalsProps) {
  const { user } = useAuth();

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" />Pending</Badge>;
      case 'approved':
        return <Badge className="bg-success/10 text-success hover:bg-success/20 gap-1"><CheckCircle className="w-3 h-3" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Rejected</Badge>;
      default:
        return <Badge>{status}</Badge>;
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

  const pendingCount = reassignments?.filter(r => r.status === 'pending').length || 0;
  const approvedCount = reassignments?.filter(r => r.status === 'approved').length || 0;
  const rejectedCount = reassignments?.filter(r => r.status === 'rejected').length || 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold">{pendingCount}</div>
              <div className="text-sm text-muted-foreground">Pending</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-success">{approvedCount}</div>
              <div className="text-sm text-muted-foreground">Approved</div>
            </div>
          </CardContent>
        </Card>
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
                    <TableCell>{getStatusBadge(request.status)}</TableCell>
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
