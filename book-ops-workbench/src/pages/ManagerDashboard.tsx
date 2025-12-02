import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, XCircle, AlertCircle, ClipboardCheck, FolderOpen, Calendar, User, Shield, RotateCcw, Send, Trash2 } from 'lucide-react';
import ManagerHierarchyView from '@/components/ManagerHierarchyView';
import ManagerBeforeAfterComparison from '@/components/ManagerBeforeAfterComparison';
import ManagerPendingApprovals from '@/components/ManagerPendingApprovals';
import ManagerReviewsAndNotes from '@/components/ManagerReviewsAndNotes';
import SLMApprovalQueue from '@/components/SLMApprovalQueue';
import BookImpactSummary from '@/components/BookImpactSummary';

export default function ManagerDashboard() {
  const { user, effectiveProfile } = useAuth();
  const [selectedReview, setSelectedReview] = useState<string | null>(null);
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showAcceptAllDialog, setShowAcceptAllDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const queryClient = useQueryClient();

  const isRevOps = effectiveProfile?.role?.toUpperCase() === 'REVOPS';

  // Fetch all managers for RevOps admin view
  const { data: allManagers } = useQuery({
    queryKey: ['all-managers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manager_reviews')
        .select('manager_user_id, manager_name, manager_level')
        .order('manager_name');

      if (error) throw error;

      // Deduplicate managers
      const uniqueManagers = new Map();
      data?.forEach((m) => {
        if (!uniqueManagers.has(m.manager_user_id)) {
          uniqueManagers.set(m.manager_user_id, m);
        }
      });
      return Array.from(uniqueManagers.values());
    },
    enabled: isRevOps,
  });

  // Determine which user ID to query for
  const targetUserId = isRevOps && selectedManagerId ? selectedManagerId : user?.id;

  // Fetch manager reviews assigned to target user
  const { data: reviews, isLoading, refetch } = useQuery({
    queryKey: ['manager-reviews', targetUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manager_reviews')
        .select(`
          *,
          builds:build_id (
            id,
            name,
            description,
            version_tag,
            target_date
          )
        `)
        .eq('manager_user_id', targetUserId!)
        .order('sent_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!targetUserId,
  });

  // Get selected review data
  const selectedReviewData = reviews?.find(r => r.id === selectedReview);

  // Fetch count of pending FLM proposals for the selected build (only for SLMs)
  const { data: pendingFLMProposalsCount } = useQuery({
    queryKey: ['pending-flm-proposals-count', selectedReviewData?.build_id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('manager_reassignments')
        .select('*', { count: 'exact', head: true })
        .eq('build_id', selectedReviewData!.build_id)
        .eq('approval_status', 'pending_slm');

      if (error) throw error;
      return count || 0;
    },
    enabled: !!selectedReviewData?.build_id && effectiveProfile?.role?.toUpperCase() === 'SLM',
  });

  // Fetch count of this manager's own pending reassignments (for Accept All Original warning)
  const { data: myPendingReassignmentsCount } = useQuery({
    queryKey: ['my-pending-reassignments-count', selectedReviewData?.build_id, user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('manager_reassignments')
        .select('*', { count: 'exact', head: true })
        .eq('build_id', selectedReviewData!.build_id)
        .eq('manager_user_id', user!.id);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!selectedReviewData?.build_id && !!user?.id,
  });

  const handleAccept = async (reviewId: string) => {
    try {
      const { error } = await supabase
        .from('manager_reviews')
        .update({ 
          status: 'accepted',
          reviewed_at: new Date().toISOString()
        })
        .eq('id', reviewId);

      if (error) throw error;

      toast({
        title: 'Review Accepted',
        description: 'Assignments have been locked and marked as approved.',
      });
      refetch();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDecline = async (reviewId: string) => {
    try {
      const { error } = await supabase
        .from('manager_reviews')
        .update({ 
          status: 'in_review',
          reviewed_at: new Date().toISOString()
        })
        .eq('id', reviewId);

      if (error) throw error;

      toast({
        title: 'Review Declined',
        description: 'You can now reassign accounts and add notes.',
      });
      refetch();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // SLM approves FLM proposals - moves them to pending_revops for final approval
  const approveAllMutation = useMutation({
    mutationFn: async (buildId: string) => {
      // Fetch all pending_slm reassignments for FLMs under this SLM
      const { data: reassignments, error: fetchError } = await supabase
        .from('manager_reassignments')
        .select('*')
        .eq('build_id', buildId)
        .eq('approval_status', 'pending_slm');

      if (fetchError) throw fetchError;
      if (!reassignments || reassignments.length === 0) {
        throw new Error('No pending FLM proposals found');
      }

      // Update all reassignments to pending_revops (awaiting RevOps final approval)
      const { error: updateError } = await supabase
        .from('manager_reassignments')
        .update({
          approval_status: 'pending_revops',
          slm_approved_by: user!.id,
          slm_approved_at: new Date().toISOString(),
        })
        .eq('build_id', buildId)
        .eq('approval_status', 'pending_slm');

      if (updateError) throw updateError;

      return reassignments.length;
    },
    onSuccess: (count) => {
      toast({
        title: 'FLM Proposals Approved',
        description: `Approved ${count} proposal${count !== 1 ? 's' : ''}. Sent to RevOps for final approval.`,
      });
      queryClient.invalidateQueries({ queryKey: ['reassignments-for-review'] });
      queryClient.invalidateQueries({ queryKey: ['manager-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['manager-sales-reps'] });
      queryClient.invalidateQueries({ queryKey: ['slm-pending-approvals'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Accept All Original - deletes manager's reassignments, keeps notes
  const acceptAllOriginalMutation = useMutation({
    mutationFn: async (buildId: string) => {
      // Delete all reassignments made by this manager for this build
      const { error } = await supabase
        .from('manager_reassignments')
        .delete()
        .eq('build_id', buildId)
        .eq('manager_user_id', user!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Original Assignments Accepted',
        description: 'All your reassignment proposals have been discarded. Your notes are preserved.',
      });
      setShowAcceptAllDialog(false);
      queryClient.invalidateQueries({ queryKey: ['my-pending-reassignments-count'] });
      queryClient.invalidateQueries({ queryKey: ['manager-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['manager-all-reassignments'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Submit for Review - locks the review
  const submitForReviewMutation = useMutation({
    mutationFn: async (reviewId: string) => {
      const { error } = await supabase
        .from('manager_reviews')
        .update({ 
          status: 'accepted',
          reviewed_at: new Date().toISOString()
        })
        .eq('id', reviewId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Review Submitted',
        description: 'Your review has been submitted. You can still add notes but cannot edit assignments.',
      });
      setShowSubmitDialog(false);
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete a review
  const deleteReviewMutation = useMutation({
    mutationFn: async (reviewId: string) => {
      const { error } = await supabase
        .from('manager_reviews')
        .delete()
        .eq('id', reviewId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Review Deleted',
        description: 'The shared review has been removed.',
      });
      setShowDeleteDialog(false);
      setSelectedReview(null);
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const getStatusBadge = (status: string, small = false) => {
    const iconSize = small ? "w-2.5 h-2.5" : "w-3 h-3";
    const textSize = small ? "text-xs" : "";
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className={`${textSize} bg-amber-50 text-amber-700 border-amber-300`}><AlertCircle className={`${iconSize} mr-1`} />Needs Review</Badge>;
      case 'accepted':
        return <Badge className={`${textSize} bg-success/10 text-success hover:bg-success/20`}><CheckCircle className={`${iconSize} mr-1`} />Accepted</Badge>;
      case 'declined':
        return <Badge variant="destructive" className={textSize}><XCircle className={`${iconSize} mr-1`} />Declined</Badge>;
      case 'in_review':
        return <Badge variant="secondary" className={textSize}><AlertCircle className={`${iconSize} mr-1`} />In Review</Badge>;
      default:
        return <Badge className={textSize}>{status}</Badge>;
    }
  };

  // Auto-select first review if none selected
  useEffect(() => {
    if (reviews && reviews.length > 0 && !selectedReview) {
      setSelectedReview(reviews[0].id);
    }
  }, [reviews, selectedReview]);

  // Reset selected review when manager changes
  useEffect(() => {
    setSelectedReview(null);
  }, [selectedManagerId]);

  const isAdminViewing = isRevOps && selectedManagerId;

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Manager Dashboard</h1>
        <p className="text-muted-foreground">
          Review and manage account assignments for your team
        </p>
      </div>

      {/* RevOps Admin Mode Banner & Manager Selector */}
      {isRevOps && (
        <Card className="mb-6 border-primary/50 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg">Admin Mode</CardTitle>
                <Badge variant="outline" className="ml-2">RevOps</Badge>
              </div>
            </div>
            <CardDescription>
              View any manager's dashboard to see their assigned builds and review status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Viewing as:</span>
              <Select 
                value={selectedManagerId || ''} 
                onValueChange={(val) => setSelectedManagerId(val || null)}
              >
                <SelectTrigger className="w-[300px]">
                  <SelectValue placeholder="Select a manager to view..." />
                </SelectTrigger>
                <SelectContent>
                  {allManagers?.map((manager: any) => (
                    <SelectItem key={manager.manager_user_id} value={manager.manager_user_id}>
                      <div className="flex items-center gap-2">
                        <span>{manager.manager_name}</span>
                        <Badge variant="secondary" className="text-xs">{manager.manager_level}</Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedManagerId && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setSelectedManagerId(null)}
                >
                  Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Show prompt for RevOps to select a manager */}
      {isRevOps && !selectedManagerId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="w-12 h-12 mx-auto mb-4 text-primary opacity-50" />
            <p className="text-muted-foreground">Select a manager above to view their dashboard</p>
            <p className="text-sm text-muted-foreground mt-2">
              You're in Admin Mode. Choose any manager to see their builds and review status.
            </p>
          </CardContent>
        </Card>
      ) : !reviews || reviews.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">
              {isAdminViewing 
                ? "No builds have been shared with this manager yet."
                : "No builds have been shared with you yet."
              }
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              RevOps will share builds when they're ready for review.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Build Selector & Header */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-3">
                  {/* Build Dropdown */}
                  <div className="flex items-center gap-3">
                    <Select value={selectedReview || ''} onValueChange={setSelectedReview}>
                      <SelectTrigger className="w-[350px]">
                        <SelectValue placeholder="Select a shared build..." />
                      </SelectTrigger>
                      <SelectContent>
                        {reviews.map((review: any) => (
                          <SelectItem key={review.id} value={review.id}>
                            <div className="flex items-center gap-2">
                              <span>{review.builds?.name || 'Unnamed Build'}</span>
                              <span className="text-xs text-muted-foreground">
                                ({review.manager_level} • {new Date(review.sent_at).toLocaleDateString()})
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedReviewData && getStatusBadge(selectedReviewData.status)}
                    {selectedReviewData && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDeleteDialog(true)}
                        className="text-destructive border-destructive/50 hover:bg-destructive/10"
                        title="Remove this shared review"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete
                      </Button>
                    )}
                  </div>
                  
                  {selectedReviewData && (
                    <>
                      <CardDescription>
                        {selectedReviewData.builds?.description || 'No description'}
                      </CardDescription>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          Manager: <Badge variant="outline" className="ml-1">{selectedReviewData.manager_name}</Badge>
                        </span>
                        <span className="flex items-center gap-1">
                          Level: <Badge variant="outline" className="ml-1">{selectedReviewData.manager_level}</Badge>
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          Shared: {new Date(selectedReviewData.sent_at).toLocaleDateString()}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                
                {selectedReviewData && !isAdminViewing && (
                  <div className="flex gap-2">
                    {/* Pending status: Manager hasn't started reviewing yet */}
                    {selectedReviewData.status === 'pending' && (
                      <>
                        <Button 
                          onClick={() => handleDecline(selectedReviewData.id)}
                          variant="outline"
                          size="sm"
                          className="gap-1"
                        >
                          <XCircle className="w-4 h-4" />
                          Review & Edit
                        </Button>
                        <Button 
                          onClick={() => setShowSubmitDialog(true)}
                          size="sm"
                          className="gap-1"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Accept All & Submit
                        </Button>
                      </>
                    )}
                    
                    {/* In Review status: Manager is actively reviewing */}
                    {selectedReviewData.status === 'in_review' && (
                      <>
                        {/* Accept All Original - only show if manager has pending reassignments */}
                        {(myPendingReassignmentsCount ?? 0) > 0 && (
                          <Button 
                            onClick={() => setShowAcceptAllDialog(true)}
                            variant="outline"
                            size="sm"
                            className="gap-1"
                          >
                            <RotateCcw className="w-4 h-4" />
                            Accept All Original
                          </Button>
                        )}
                        
                        {/* Submit for Review */}
                        <Button 
                          onClick={() => setShowSubmitDialog(true)}
                          size="sm"
                          className="gap-1"
                        >
                          <Send className="w-4 h-4" />
                          Submit for Review
                        </Button>
                      </>
                    )}
                    
                    {/* SLM: Approve FLM Proposals - only when there are pending proposals */}
                    {effectiveProfile?.role?.toUpperCase() === 'SLM' && selectedReviewData.status === 'in_review' && (pendingFLMProposalsCount ?? 0) > 0 && (
                      <Button 
                        onClick={() => approveAllMutation.mutate(selectedReviewData.build_id)}
                        disabled={approveAllMutation.isPending}
                        size="sm"
                        variant="secondary"
                        className="gap-1"
                      >
                        {approveAllMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle className="w-4 h-4" />
                        )}
                        Approve FLM Proposals ({pendingFLMProposalsCount})
                      </Button>
                    )}
                  </div>
                )}
                {isAdminViewing && (
                  <Badge variant="secondary" className="h-fit">
                    <Shield className="w-3 h-3 mr-1" />
                    View Only
                  </Badge>
                )}
              </div>
            </CardHeader>
            {selectedReviewData?.status === 'accepted' && (
              <CardContent className="pt-0">
                <div className="bg-success/10 text-success p-3 rounded-lg text-sm">
                  <p className="font-medium">✓ You've accepted this build. Assignments are locked.</p>
                </div>
              </CardContent>
            )}
            {selectedReviewData?.status === 'in_review' && (
              <CardContent className="pt-0">
                <div className="bg-primary/10 text-primary p-3 rounded-lg text-sm">
                  <p className="font-medium">You can now reassign accounts and add notes below.</p>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Book Impact Summary */}
          {selectedReviewData && (
            <BookImpactSummary
              buildId={selectedReviewData.build_id}
              managerName={selectedReviewData.manager_name}
              managerLevel={selectedReviewData.manager_level as 'FLM' | 'SLM'}
              visibleFlms={selectedReviewData.visible_flms as string[] | undefined}
            />
          )}

          {/* Content Tabs - Full Width */}
          {selectedReviewData && (
            <Tabs defaultValue="team-view" className="w-full">
              <TabsList className={`grid w-full ${effectiveProfile?.role?.toUpperCase() === 'SLM' ? 'grid-cols-4' : 'grid-cols-3'}`}>
                <TabsTrigger value="team-view">Team View</TabsTrigger>
                <TabsTrigger value="before-after">Before & After</TabsTrigger>
                <TabsTrigger value="approvals">My Proposals</TabsTrigger>
                {effectiveProfile?.role?.toUpperCase() === 'SLM' && (
                  <TabsTrigger value="slm-queue" className="gap-1">
                    <ClipboardCheck className="w-4 h-4" />
                    FLM Approvals
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="team-view" className="mt-6">
                <ManagerHierarchyView 
                  buildId={selectedReviewData.build_id}
                  managerLevel={selectedReviewData.manager_level as 'SLM' | 'FLM'}
                  managerName={selectedReviewData.manager_name}
                  reviewStatus={selectedReviewData.status}
                  sharedScope={selectedReviewData.shared_scope as 'full' | 'flm_only' | undefined}
                  visibleFlms={selectedReviewData.visible_flms as string[] | undefined}
                />
              </TabsContent>

              <TabsContent value="before-after" className="mt-6">
                <ManagerBeforeAfterComparison 
                  buildId={selectedReviewData.build_id}
                  managerLevel={selectedReviewData.manager_level as 'SLM' | 'FLM'}
                  managerName={selectedReviewData.manager_name}
                />
              </TabsContent>

              <TabsContent value="approvals" className="mt-6">
                <ManagerPendingApprovals 
                  buildId={selectedReviewData.build_id} 
                  managerLevel={selectedReviewData.manager_level as 'FLM' | 'SLM'}
                />
              </TabsContent>

              {effectiveProfile?.role?.toUpperCase() === 'SLM' && (
                <TabsContent value="slm-queue" className="mt-6">
                  <SLMApprovalQueue 
                    buildId={selectedReviewData.build_id} 
                    slmName={selectedReviewData.manager_name}
                  />
                </TabsContent>
              )}
            </Tabs>
          )}
        </div>
      )}

      {/* Submit for Review Confirmation Dialog */}
      <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Review?</DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <p>
                Once submitted, you <strong>won't be able to edit assignments</strong> or propose reassignments for this build.
              </p>
              <p>
                You can still add notes after submission.
              </p>
              {/* Warning for SLMs with pending FLM proposals */}
              {effectiveProfile?.role?.toUpperCase() === 'SLM' && (pendingFLMProposalsCount ?? 0) > 0 && (
                <div className="bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                  <p className="font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {pendingFLMProposalsCount} pending FLM proposal{pendingFLMProposalsCount !== 1 ? 's' : ''} not yet reviewed
                  </p>
                  <p className="text-sm mt-1 text-amber-700 dark:text-amber-300">
                    You can submit now and review FLM proposals later, or go to "FLM Approvals" tab to review them first.
                  </p>
                </div>
              )}
              <p className="text-muted-foreground text-sm">
                Your review will be sent to RevOps for final approval.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmitDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => selectedReviewData && submitForReviewMutation.mutate(selectedReviewData.id)}
              disabled={submitForReviewMutation.isPending}
              className="gap-1"
            >
              {submitForReviewMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Submit Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Accept All Original Confirmation Dialog */}
      <Dialog open={showAcceptAllDialog} onOpenChange={setShowAcceptAllDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept All Original Assignments?</DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <p>
                This will accept all <strong>original assignments</strong> as they were proposed by RevOps.
              </p>
              {(myPendingReassignmentsCount ?? 0) > 0 && (
                <div className="bg-destructive/10 text-destructive p-3 rounded-lg">
                  <p className="font-medium">
                    ⚠️ You have {myPendingReassignmentsCount} pending reassignment{myPendingReassignmentsCount !== 1 ? 's' : ''} that will be discarded.
                  </p>
                </div>
              )}
              <p className="text-muted-foreground text-sm">
                Your notes will be preserved. You will still need to submit your review after this.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAcceptAllDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => selectedReviewData && acceptAllOriginalMutation.mutate(selectedReviewData.build_id)}
              disabled={acceptAllOriginalMutation.isPending}
              variant="destructive"
              className="gap-1"
            >
              {acceptAllOriginalMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              Discard Reassignments
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Review Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Shared Review?</DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <p>
                This will remove the shared review from your list. The build itself will not be affected.
              </p>
              {selectedReviewData && (
                <div className="bg-muted p-3 rounded-lg text-sm">
                  <p><strong>Build:</strong> {selectedReviewData.builds?.name}</p>
                  <p><strong>Manager:</strong> {selectedReviewData.manager_name} ({selectedReviewData.manager_level})</p>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => selectedReviewData && deleteReviewMutation.mutate(selectedReviewData.id)}
              disabled={deleteReviewMutation.isPending}
              variant="destructive"
              className="gap-1"
            >
              {deleteReviewMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Delete Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
