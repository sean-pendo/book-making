import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { MessageSquare, Search, CheckCircle, XCircle, Clock, Loader2, Edit2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function ReviewNotes() {
  const { user, effectiveProfile } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [selectedBuildId, setSelectedBuildId] = useState<string>('');
  const [selectedReassignment, setSelectedReassignment] = useState<any>(null);
  const [reviewRationale, setReviewRationale] = useState('');
  const [viewingNotes, setViewingNotes] = useState<any>(null);

  // Fetch builds
  const { data: builds } = useQuery({
    queryKey: ['builds-for-review'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('builds')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Fetch reassignments based on role
  const { data: reassignments, isLoading } = useQuery({
    queryKey: ['reassignments-for-review', selectedBuildId, effectiveProfile?.role],
    queryFn: async () => {
      if (!selectedBuildId) return [];

      let query = supabase
        .from('manager_reassignments')
        .select('*')
        .eq('build_id', selectedBuildId);

      // Role-based filtering
      if (effectiveProfile?.role === 'SLM' || effectiveProfile?.role === 'FLM') {
        // Get the manager's name from sales_reps to determine if they're FLM or SLM
        const managerName = effectiveProfile.full_name;
        
        // Get all reps managed by this person
        const { data: managedReps } = await supabase
          .from('sales_reps')
          .select('rep_id')
          .eq('build_id', selectedBuildId)
          .or(`flm.eq.${managerName},slm.eq.${managerName}`);

        const managedRepIds = managedReps?.map(r => r.rep_id) || [];
        
        // Filter reassignments to only those involving managed reps
        if (managedRepIds.length > 0) {
          query = query.in('current_owner_id', managedRepIds);
        }
      }
      // REVOPS and LEADERSHIP see everything (no additional filter)

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!selectedBuildId,
  });

  // Fetch notes for accounts
  const { data: notes } = useQuery({
    queryKey: ['manager-notes-review', selectedBuildId],
    queryFn: async () => {
      if (!selectedBuildId) return [];

      const { data, error } = await supabase
        .from('manager_notes')
        .select('*')
        .eq('build_id', selectedBuildId)
        .order('created_at', { ascending: false});

      if (error) throw error;
      
      // Fetch additional data for each note
      const notesWithDetails = await Promise.all(data.map(async (note) => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', note.manager_user_id)
          .single();

        const { data: account } = await supabase
          .from('accounts')
          .select('account_name')
          .eq('sfdc_account_id', note.sfdc_account_id)
          .eq('build_id', selectedBuildId)
          .single();

        return {
          ...note,
          profile,
          account,
        };
      }));

      return notesWithDetails;
    },
    enabled: !!selectedBuildId,
  });

  // Fetch teams for filter
  const { data: teams } = useQuery({
    queryKey: ['teams-filter', selectedBuildId],
    queryFn: async () => {
      if (!selectedBuildId) return [];

      const { data, error } = await supabase
        .from('sales_reps')
        .select('team')
        .eq('build_id', selectedBuildId);

      if (error) throw error;
      return [...new Set(data?.map(r => r.team).filter(Boolean))];
    },
    enabled: !!selectedBuildId,
  });

  // Approve reassignment mutation
  const approveMutation = useMutation({
    mutationFn: async ({ id, rationale }: { id: string; rationale: string }) => {
      // First, get the reassignment details
      const { data: reassignment, error: fetchError } = await supabase
        .from('manager_reassignments')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // Update the reassignment status
      const { error: updateError } = await supabase
        .from('manager_reassignments')
        .update({
          status: 'approved',
          approved_by: user!.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateError) throw updateError;

      // Update the account with the new owner
      const { error: accountError } = await supabase
        .from('accounts')
        .update({
          new_owner_id: reassignment.proposed_owner_id,
          new_owner_name: reassignment.proposed_owner_name,
        })
        .eq('sfdc_account_id', reassignment.sfdc_account_id)
        .eq('build_id', reassignment.build_id);

      if (accountError) throw accountError;
    },
    onSuccess: () => {
      toast({
        title: 'Reassignment Approved',
        description: 'The account reassignment has been approved and reflected in manager dashboards.',
      });
      queryClient.invalidateQueries({ queryKey: ['reassignments-for-review'] });
      queryClient.invalidateQueries({ queryKey: ['manager-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['manager-sales-reps'] });
      setSelectedReassignment(null);
      setReviewRationale('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Reject reassignment mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ id, rationale }: { id: string; rationale: string }) => {
      const { error } = await supabase
        .from('manager_reassignments')
        .update({
          status: 'rejected',
          approved_by: user!.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Reassignment Rejected',
        description: 'The account reassignment has been rejected.',
      });
      queryClient.invalidateQueries({ queryKey: ['reassignments-for-review'] });
      setSelectedReassignment(null);
      setReviewRationale('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-success/10 text-success hover:bg-success/20"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      case 'pending':
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const filteredReassignments = reassignments?.filter(r => {
    const matchesSearch = 
      r.account_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.current_owner_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.proposed_owner_name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesTeam = teamFilter === 'all' || true; // TODO: Add team lookup

    const matchesTab =
      (activeTab === 'pending' && r.status === 'pending') ||
      (activeTab === 'approved' && r.status === 'approved') ||
      (activeTab === 'rejected' && r.status === 'rejected');

    return matchesSearch && matchesTeam && matchesTab;
  });

  const pendingCount = reassignments?.filter(r => r.status === 'pending').length || 0;
  const approvedCount = reassignments?.filter(r => r.status === 'approved').length || 0;
  const rejectedCount = reassignments?.filter(r => r.status === 'rejected').length || 0;

  // Set default build
  if (builds && builds.length > 0 && !selectedBuildId) {
    setSelectedBuildId(builds[0].id);
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Review & Notes</h1>
          <p className="text-muted-foreground">
            Manager workspace for reviewing assignments and adding notes
          </p>
          {effectiveProfile?.role && (
            <Badge variant="outline" className="mt-2">
              {effectiveProfile.role} Access
            </Badge>
          )}
        </div>
        <Select value={selectedBuildId} onValueChange={setSelectedBuildId}>
          <SelectTrigger className="w-[300px]">
            <SelectValue placeholder="Select a build" />
          </SelectTrigger>
          <SelectContent>
            {builds?.map((build) => (
              <SelectItem key={build.id} value={build.id}>
                {build.name} - {build.version_tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pending">Pending ({pendingCount})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({approvedCount})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({rejectedCount})</TabsTrigger>
          <TabsTrigger value="notes">Notes ({notes?.length || 0})</TabsTrigger>
        </TabsList>

        {/* Filter Controls */}
        <div className="flex items-center gap-4 my-4">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search accounts, owners..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {teams?.map((team) => (
                <SelectItem key={team} value={team}>
                  {team}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <TabsContent value="pending" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Pending Reviews
              </CardTitle>
              <CardDescription>
                Account assignments awaiting approval
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : !filteredReassignments || filteredReassignments.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">No pending reviews</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Current Owner</TableHead>
                      <TableHead>Proposed Owner</TableHead>
                      <TableHead>Requested By</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Rationale</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReassignments.map((reassignment) => (
                      <TableRow key={reassignment.id}>
                        <TableCell className="font-medium">{reassignment.account_name}</TableCell>
                        <TableCell>{reassignment.current_owner_name}</TableCell>
                        <TableCell>
                          <div className="font-medium text-primary">{reassignment.proposed_owner_name}</div>
                        </TableCell>
                        <TableCell className="text-sm">Manager</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(reassignment.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <div className="text-sm text-muted-foreground truncate" title={reassignment.rationale}>
                            {reassignment.rationale || 'No rationale provided'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => setSelectedReassignment(reassignment)}
                            >
                              Review
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
        </TabsContent>

        <TabsContent value="approved" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                Approved Assignments
              </CardTitle>
              <CardDescription>
                Account assignments that have been approved
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : !filteredReassignments || filteredReassignments.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">No approved reviews</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Current Owner</TableHead>
                      <TableHead>New Owner</TableHead>
                      <TableHead>Approved By</TableHead>
                      <TableHead>Approved Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReassignments.map((reassignment) => (
                      <TableRow key={reassignment.id}>
                        <TableCell className="font-medium">{reassignment.account_name}</TableCell>
                        <TableCell>{reassignment.current_owner_name}</TableCell>
                        <TableCell className="font-medium text-success">{reassignment.proposed_owner_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {effectiveProfile?.full_name || 'System'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {reassignment.approved_at ? new Date(reassignment.approved_at).toLocaleDateString() : '-'}
                        </TableCell>
                        <TableCell>{getStatusBadge(reassignment.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rejected" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="w-5 h-5" />
                Rejected Assignments
              </CardTitle>
              <CardDescription>
                Account assignments that have been rejected
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : !filteredReassignments || filteredReassignments.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">No rejected reviews</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Current Owner</TableHead>
                      <TableHead>Proposed Owner</TableHead>
                      <TableHead>Rejected By</TableHead>
                      <TableHead>Rejected Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReassignments.map((reassignment) => (
                      <TableRow key={reassignment.id}>
                        <TableCell className="font-medium">{reassignment.account_name}</TableCell>
                        <TableCell>{reassignment.current_owner_name}</TableCell>
                        <TableCell className="text-muted-foreground">{reassignment.proposed_owner_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {effectiveProfile?.full_name || 'System'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {reassignment.approved_at ? new Date(reassignment.approved_at).toLocaleDateString() : '-'}
                        </TableCell>
                        <TableCell>{getStatusBadge(reassignment.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Manager Notes
              </CardTitle>
              <CardDescription>
                All notes added by managers for this build
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!notes || notes.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">No notes added yet</p>
              ) : (
                <ScrollArea className="h-[600px]">
                  <div className="space-y-4">
                    {notes.map((note: any) => (
                      <Card key={note.id} className="border-l-4 border-l-primary">
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="font-medium">
                                {note.account?.account_name || 'Unknown Account'}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Account ID: {note.sfdc_account_id}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-muted-foreground">
                                {new Date(note.created_at).toLocaleDateString()}
                              </div>
                              <div className="text-xs font-medium">
                                {note.profile?.full_name || note.profile?.email || 'Unknown'}
                              </div>
                            </div>
                          </div>
                          <p className="text-sm bg-muted/50 p-3 rounded-md whitespace-pre-wrap">
                            {note.note_text}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      {selectedReassignment && (
        <Dialog open={!!selectedReassignment} onOpenChange={() => setSelectedReassignment(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Review Reassignment Request</DialogTitle>
              <DialogDescription>
                Approve or reject this account reassignment proposal
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Account</div>
                    <div className="font-medium">{selectedReassignment.account_name}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Account ID</div>
                    <div className="font-mono text-sm">{selectedReassignment.sfdc_account_id}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Current Owner</div>
                    <div className="font-medium">{selectedReassignment.current_owner_name}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Proposed Owner</div>
                    <div className="font-medium text-primary">{selectedReassignment.proposed_owner_name}</div>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Rationale</div>
                  <div className="text-sm bg-background p-2 rounded">
                    {selectedReassignment.rationale || 'No rationale provided'}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Review Notes (Optional)</Label>
                <Textarea
                  value={reviewRationale}
                  onChange={(e) => setReviewRationale(e.target.value)}
                  placeholder="Add notes about your decision..."
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedReassignment(null);
                  setReviewRationale('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => rejectMutation.mutate({ 
                  id: selectedReassignment.id, 
                  rationale: reviewRationale 
                })}
                disabled={rejectMutation.isPending}
              >
                {rejectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Reject
              </Button>
              <Button
                onClick={() => approveMutation.mutate({ 
                  id: selectedReassignment.id, 
                  rationale: reviewRationale 
                })}
                disabled={approveMutation.isPending}
              >
                {approveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Approve
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
