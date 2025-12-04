import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { notifyProposalApproved, notifyProposalRejected } from '@/services/slackNotificationService';
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
import { MessageSquare, Search, CheckCircle, XCircle, Clock, Loader2, Edit2, AlertTriangle } from 'lucide-react';
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

      // Role-based filtering and approval_status filtering
      const role = effectiveProfile?.role?.toUpperCase();
      if (role === 'REVOPS') {
        // REVOPS sees ALL pending items (both pending_slm AND pending_revops)
        // This allows RevOps to approve FLM requests directly without waiting for SLM
        query = query.in('approval_status', ['pending_slm', 'pending_revops', 'approved', 'rejected']);
      } else if (role === 'SLM' || role === 'FLM') {
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

  // Detect conflicts: multiple proposals for the same account (within this build)
  const conflictMap = useMemo(() => {
    if (!reassignments) return new Map<string, number>();
    
    const accountCounts = new Map<string, number>();
    reassignments.forEach(r => {
      const count = accountCounts.get(r.sfdc_account_id) || 0;
      accountCounts.set(r.sfdc_account_id, count + 1);
    });
    
    // Only keep accounts with more than 1 proposal
    const conflicts = new Map<string, number>();
    accountCounts.forEach((count, accountId) => {
      if (count > 1) conflicts.set(accountId, count);
    });
    
    return conflicts;
  }, [reassignments]);

  // Detect cross-build conflicts: proposals for the same account in OTHER builds
  const { data: crossBuildConflicts } = useQuery({
    queryKey: ['cross-build-conflicts', selectedBuildId, reassignments?.map(r => r.sfdc_account_id)],
    queryFn: async () => {
      if (!selectedBuildId || !reassignments || reassignments.length === 0) return new Map<string, { buildId: string; buildName: string; count: number }[]>();

      // Get unique account IDs from current reassignments
      const accountIds = [...new Set(reassignments.map(r => r.sfdc_account_id))];
      
      if (accountIds.length === 0) return new Map<string, { buildId: string; buildName: string; count: number }[]>();

      // Find pending proposals in OTHER builds for these accounts
      const { data: otherBuildProposals, error } = await supabase
        .from('manager_reassignments')
        .select('sfdc_account_id, build_id')
        .in('sfdc_account_id', accountIds)
        .neq('build_id', selectedBuildId)
        .in('approval_status', ['pending_slm', 'pending_revops']);

      if (error || !otherBuildProposals) return new Map<string, { buildId: string; buildName: string; count: number }[]>();

      // Get build names for the conflicting builds
      const conflictingBuildIds = [...new Set(otherBuildProposals.map(p => p.build_id))];
      const { data: buildNames } = await supabase
        .from('builds')
        .select('id, name')
        .in('id', conflictingBuildIds);

      const buildNameMap = new Map(buildNames?.map(b => [b.id, b.name]) || []);

      // Group by account ID
      const crossConflicts = new Map<string, { buildId: string; buildName: string; count: number }[]>();
      
      otherBuildProposals.forEach(proposal => {
        const existing = crossConflicts.get(proposal.sfdc_account_id) || [];
        const buildEntry = existing.find(e => e.buildId === proposal.build_id);
        
        if (buildEntry) {
          buildEntry.count++;
        } else {
          existing.push({
            buildId: proposal.build_id,
            buildName: buildNameMap.get(proposal.build_id) || 'Unknown Build',
            count: 1,
          });
        }
        
        crossConflicts.set(proposal.sfdc_account_id, existing);
      });

      return crossConflicts;
    },
    enabled: !!selectedBuildId && !!reassignments && reassignments.length > 0,
  });

  // Get warning info for a reassignment
  const getWarnings = (reassignment: any) => {
    const warnings: Array<{ type: 'conflict' | 'late' | 'out_of_scope' | 'cross_build'; message: string }> = [];
    
    // Check for out-of-scope (no proposed owner)
    if (reassignment.proposed_owner_name === '[OUT OF SCOPE]' || !reassignment.proposed_owner_id) {
      warnings.push({
        type: 'out_of_scope',
        message: 'Account needs assignment outside the manager\'s hierarchy',
      });
    }
    
    // Check for conflict (multiple proposals for same account in THIS build)
    const conflictCount = conflictMap.get(reassignment.sfdc_account_id);
    if (conflictCount && conflictCount > 1) {
      warnings.push({
        type: 'conflict',
        message: `${conflictCount} proposals in this build`,
      });
    }

    // Check for cross-build conflict (proposals in OTHER builds)
    const crossBuildInfo = crossBuildConflicts?.get(reassignment.sfdc_account_id);
    if (crossBuildInfo && crossBuildInfo.length > 0) {
      const totalOtherProposals = crossBuildInfo.reduce((sum, b) => sum + b.count, 0);
      const buildNames = crossBuildInfo.map(b => b.buildName).join(', ');
      warnings.push({
        type: 'cross_build',
        message: `${totalOtherProposals} proposal(s) in other builds: ${buildNames}`,
      });
    }
    
    // Check for late submission
    if (reassignment.is_late_submission) {
      warnings.push({
        type: 'late',
        message: 'Submitted after SLM review',
      });
    }
    
    return warnings;
  };

  // RevOps final approval - applies the change to the account
  const approveMutation = useMutation({
    mutationFn: async ({ id, rationale }: { id: string; rationale: string }) => {
      // First, get the reassignment details
      const { data: reassignment, error: fetchError } = await supabase
        .from('manager_reassignments')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // Get manager email for notification
      let managerEmail: string | null = null;
      if (reassignment.manager_user_id) {
        const { data: managerProfile } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', reassignment.manager_user_id)
          .single();
        managerEmail = managerProfile?.email || null;
      }

      // Update the reassignment status to final approved
      const { error: updateError } = await supabase
        .from('manager_reassignments')
        .update({
          status: 'approved',
          approval_status: 'approved',
          revops_approved_by: user!.id,
          revops_approved_at: new Date().toISOString(),
          approved_by: user!.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateError) throw updateError;

      // Update the account with the new owner (final step - change is applied)
      const { error: accountError } = await supabase
        .from('accounts')
        .update({
          new_owner_id: reassignment.proposed_owner_id,
          new_owner_name: reassignment.proposed_owner_name,
        })
        .eq('sfdc_account_id', reassignment.sfdc_account_id)
        .eq('build_id', reassignment.build_id);

      if (accountError) throw accountError;

      // AUTO-REJECT competing proposals for the same account
      // This prevents orphaned proposals and accidental double-approvals
      const { data: competingProposals, error: competingError } = await supabase
        .from('manager_reassignments')
        .select('id, manager_user_id, proposed_owner_name')
        .eq('sfdc_account_id', reassignment.sfdc_account_id)
        .eq('build_id', reassignment.build_id)
        .neq('id', id)
        .in('approval_status', ['pending_slm', 'pending_revops']);

      if (!competingError && competingProposals && competingProposals.length > 0) {
        // Reject all competing proposals
        const competingIds = competingProposals.map(p => p.id);
        const { error: rejectError } = await supabase
          .from('manager_reassignments')
          .update({
            status: 'rejected',
            approval_status: 'rejected',
            revops_approved_by: user!.id,
            revops_approved_at: new Date().toISOString(),
            rationale: `Superseded: Another proposal for this account was approved (assigned to ${reassignment.proposed_owner_name})`,
          })
          .in('id', competingIds);

        if (rejectError) {
          console.error('[ReviewNotes] Failed to auto-reject competing proposals:', rejectError);
        }

        // Notify managers whose proposals were superseded
        const buildName = builds?.find(b => b.id === reassignment.build_id)?.name || 'Unknown Build';
        for (const competing of competingProposals) {
          if (competing.manager_user_id && competing.manager_user_id !== reassignment.manager_user_id) {
            const { data: competingManagerProfile } = await supabase
              .from('profiles')
              .select('email')
              .eq('id', competing.manager_user_id)
              .single();

            if (competingManagerProfile?.email) {
              notifyProposalRejected(
                competingManagerProfile.email,
                reassignment.account_name || 'Unknown Account',
                effectiveProfile?.full_name || 'RevOps',
                `Another proposal was approved instead (assigned to ${reassignment.proposed_owner_name})`,
                buildName
              ).catch(console.error);
            }
          }
        }

        console.log(`[ReviewNotes] Auto-rejected ${competingProposals.length} competing proposal(s) for account ${reassignment.sfdc_account_id}`);
      }

      // Send Slack notification to the manager who proposed the change
      if (managerEmail) {
        const buildName = builds?.find(b => b.id === reassignment.build_id)?.name || 'Unknown Build';
        notifyProposalApproved(
          managerEmail,
          reassignment.account_name || 'Unknown Account',
          reassignment.proposed_owner_name || 'Unknown',
          effectiveProfile?.full_name || 'RevOps',
          buildName
        ).catch(console.error);
      }
    },
    onSuccess: () => {
      toast({
        title: 'Reassignment Approved',
        description: 'Final approval complete. The account has been reassigned.',
      });
      queryClient.invalidateQueries({ queryKey: ['reassignments-for-review'] });
      queryClient.invalidateQueries({ queryKey: ['manager-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['manager-sales-reps'] });
      queryClient.invalidateQueries({ queryKey: ['slm-pending-approvals'] });
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

  // RevOps reject - sends back to SLM/FLM
  const rejectMutation = useMutation({
    mutationFn: async ({ id, rationale }: { id: string; rationale: string }) => {
      // First, get the reassignment details
      const { data: reassignment, error: fetchError } = await supabase
        .from('manager_reassignments')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // Get manager email for notification
      let managerEmail: string | null = null;
      if (reassignment.manager_user_id) {
        const { data: managerProfile } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', reassignment.manager_user_id)
          .single();
        managerEmail = managerProfile?.email || null;
      }

      const { error } = await supabase
        .from('manager_reassignments')
        .update({
          status: 'rejected',
          approval_status: 'rejected',
          revops_approved_by: user!.id,
          revops_approved_at: new Date().toISOString(),
          rationale: rationale ? `[RevOps Rejected] ${rationale}` : '[RevOps Rejected]',
        })
        .eq('id', id);

      if (error) throw error;

      // Send Slack notification to the manager who proposed the change
      if (managerEmail) {
        const buildName = builds?.find(b => b.id === reassignment.build_id)?.name || 'Unknown Build';
        notifyProposalRejected(
          managerEmail,
          reassignment.account_name || 'Unknown Account',
          effectiveProfile?.full_name || 'RevOps',
          rationale,
          buildName
        ).catch(console.error);
      }
    },
    onSuccess: () => {
      toast({
        title: 'Reassignment Rejected',
        description: 'The proposal has been rejected and sent back to the manager.',
      });
      queryClient.invalidateQueries({ queryKey: ['reassignments-for-review'] });
      queryClient.invalidateQueries({ queryKey: ['slm-pending-approvals'] });
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

  const getStatusBadge = (status: string, approvalStatus?: string, reassignment?: any) => {
    // Use approval_status if available, otherwise fall back to status
    const effectiveStatus = approvalStatus || status;
    
    switch (effectiveStatus) {
      case 'approved':
        // Show who approved it
        if (reassignment?.revops_approved_by) {
          return <Badge className="bg-success/10 text-success hover:bg-success/20"><CheckCircle className="w-3 h-3 mr-1" />Approved by RevOps</Badge>;
        } else if (reassignment?.slm_approved_by && !reassignment?.revops_approved_by) {
          return <Badge className="bg-success/10 text-success hover:bg-success/20"><CheckCircle className="w-3 h-3 mr-1" />Approved by SLM</Badge>;
        }
        return <Badge className="bg-success/10 text-success hover:bg-success/20"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      case 'pending':
      case 'pending_slm':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"><Clock className="w-3 h-3 mr-1" />Awaiting Review</Badge>;
      case 'pending_revops':
        // SLM already approved, now waiting for RevOps
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"><Clock className="w-3 h-3 mr-1" />SLM Approved • Awaiting RevOps</Badge>;
      default:
        return <Badge variant="secondary">{effectiveStatus}</Badge>;
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
      (activeTab === 'pending' && (r.approval_status === 'pending_revops' || r.approval_status === 'pending_slm')) ||
      (activeTab === 'approved' && r.approval_status === 'approved') ||
      (activeTab === 'rejected' && r.approval_status === 'rejected');

    return matchesSearch && matchesTeam && matchesTab;
  });

  const pendingCount = reassignments?.filter(r => r.approval_status === 'pending_revops' || r.approval_status === 'pending_slm').length || 0;
  const approvedCount = reassignments?.filter(r => r.approval_status === 'approved').length || 0;
  const rejectedCount = reassignments?.filter(r => r.approval_status === 'rejected').length || 0;

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
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Rationale</TableHead>
                      <TableHead>Warnings</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReassignments.map((reassignment) => {
                      const warnings = getWarnings(reassignment);
                      const isOutOfScope = warnings.some(w => w.type === 'out_of_scope');
                      return (
                        <TableRow key={reassignment.id} className={isOutOfScope ? 'bg-red-50/50 dark:bg-red-950/20 border-l-4 border-l-red-500' : warnings.length > 0 ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}>
                          <TableCell className="font-medium">{reassignment.account_name}</TableCell>
                          <TableCell>{reassignment.current_owner_name}</TableCell>
                          <TableCell>
                            <div className="font-medium text-primary">{reassignment.proposed_owner_name}</div>
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(reassignment.status, reassignment.approval_status, reassignment)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(reassignment.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <div className="text-sm text-muted-foreground truncate" title={reassignment.rationale}>
                              {reassignment.rationale || 'No rationale provided'}
                            </div>
                          </TableCell>
                          <TableCell>
                            {warnings.length > 0 ? (
                              <div className="flex flex-col gap-1">
                                {warnings.map((warning, idx) => (
                                  <Badge 
                                    key={idx} 
                                    variant="outline" 
                                    className={`text-xs gap-1 ${
                                      warning.type === 'out_of_scope'
                                        ? 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700'
                                        : warning.type === 'conflict' 
                                          ? 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700'
                                          : warning.type === 'cross_build'
                                            ? 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700'
                                            : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700'
                                    }`}
                                  >
                                    <AlertTriangle className="w-3 h-3" />
                                    {warning.type === 'out_of_scope' ? 'Out of Scope' 
                                      : warning.type === 'conflict' ? 'Conflict' 
                                      : warning.type === 'cross_build' ? 'Cross-Build' 
                                      : 'Late'}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
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
                      );
                    })}
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
                        <TableCell>{getStatusBadge(reassignment.status, reassignment.approval_status, reassignment)}</TableCell>
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
                        <TableCell>{getStatusBadge(reassignment.status, reassignment.approval_status, reassignment)}</TableCell>
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
              {/* Warnings Banner */}
              {getWarnings(selectedReassignment).length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-medium text-amber-800 dark:text-amber-200">Review Warnings</div>
                      {getWarnings(selectedReassignment).map((warning, idx) => (
                        <p key={idx} className="text-sm text-amber-700 dark:text-amber-300">
                          {warning.type === 'out_of_scope' && (
                            <>
                              <strong className="text-red-700 dark:text-red-400">⚠️ Out of Scope:</strong> The manager flagged this account as not belonging to their hierarchy. 
                              <strong> You must assign this account to someone outside their team or it will have no owner.</strong>
                            </>
                          )}
                          {warning.type === 'conflict' && (
                            <>
                              <strong>Conflict:</strong> There are {conflictMap.get(selectedReassignment.sfdc_account_id)} proposals for this account. 
                              Review carefully to avoid duplicate changes.
                            </>
                          )}
                          {warning.type === 'late' && (
                            <>
                              <strong>Late Submission:</strong> This proposal was created after the SLM already submitted their review. 
                              The SLM may not have seen this request.
                            </>
                          )}
                          {warning.type === 'cross_build' && (
                            <>
                              <strong className="text-purple-700 dark:text-purple-400">🔀 Cross-Build Conflict:</strong> {warning.message}. 
                              Changes in this build may conflict with decisions in other planning scenarios.
                            </>
                          )}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

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
