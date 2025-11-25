import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, XCircle, AlertCircle, ClipboardCheck, FolderOpen, Calendar, User } from 'lucide-react';
import ManagerHierarchyView from '@/components/ManagerHierarchyView';
import ManagerBeforeAfterComparison from '@/components/ManagerBeforeAfterComparison';
import ManagerPendingApprovals from '@/components/ManagerPendingApprovals';
import ManagerReviewsAndNotes from '@/components/ManagerReviewsAndNotes';
import ManagerAIAssistant from '@/components/ManagerAIAssistant';
import SLMApprovalQueue from '@/components/SLMApprovalQueue';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function ManagerDashboard() {
  const { user, effectiveProfile } = useAuth();
  const [selectedReview, setSelectedReview] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch manager reviews assigned to this user
  const { data: reviews, isLoading, refetch } = useQuery({
    queryKey: ['manager-reviews', user?.id],
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
        .eq('manager_user_id', user!.id)
        .order('sent_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user,
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

  const selectedReviewData = reviews?.find((r: any) => r.id === selectedReview);

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

      {!reviews || reviews.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No builds have been shared with you yet.</p>
            <p className="text-sm text-muted-foreground mt-2">RevOps will share builds when they're ready for your review.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-12 gap-6">
          {/* Left Sidebar - Build List */}
          <div className="col-span-3">
            <Card className="sticky top-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Shared Builds ({reviews.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[calc(100vh-280px)]">
                  <div className="space-y-1 p-2">
                    {reviews.map((review: any) => (
                      <button
                        key={review.id}
                        onClick={() => setSelectedReview(review.id)}
                        className={`w-full text-left p-3 rounded-lg transition-colors ${
                          selectedReview === review.id 
                            ? 'bg-primary/10 border border-primary/20' 
                            : 'hover:bg-muted/50'
                        }`}
                      >
                        <div className="font-medium text-sm mb-1 truncate">
                          {review.builds?.name || 'Unnamed Build'}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                          <User className="w-3 h-3" />
                          <span>{review.manager_level}</span>
                          <span>•</span>
                          <Calendar className="w-3 h-3" />
                          <span>{new Date(review.sent_at).toLocaleDateString()}</span>
                        </div>
                        {getStatusBadge(review.status, true)}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="col-span-9">
            {selectedReviewData ? (
              <div className="space-y-6">
                {/* Build Header */}
                <Card>
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <CardTitle className="text-xl">{selectedReviewData.builds?.name || 'Unnamed Build'}</CardTitle>
                          {getStatusBadge(selectedReviewData.status)}
                        </div>
                        <CardDescription>
                          {selectedReviewData.builds?.description || 'No description'}
                        </CardDescription>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground pt-1">
                          <span className="flex items-center gap-1">
                            <User className="w-4 h-4" />
                            Your role: <Badge variant="outline" className="ml-1">{selectedReviewData.manager_level}</Badge>
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            Shared: {new Date(selectedReviewData.sent_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
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
                              onClick={() => handleAccept(selectedReviewData.id)}
                              size="sm"
                              className="gap-1"
                            >
                              <CheckCircle className="w-4 h-4" />
                              Accept All
                            </Button>
                          </>
                        )}
                        {effectiveProfile?.role === 'SLM' && selectedReviewData.status === 'in_review' && (
                          <Button 
                            onClick={() => approveAllMutation.mutate(selectedReviewData.build_id)}
                            disabled={approveAllMutation.isPending}
                            size="sm"
                            className="gap-1"
                          >
                            {approveAllMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle className="w-4 h-4" />
                            )}
                            Approve FLM Proposals
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  {selectedReviewData.status === 'accepted' && (
                    <CardContent className="pt-0">
                      <div className="bg-success/10 text-success p-3 rounded-lg text-sm">
                        <p className="font-medium">✓ You've accepted this build. Assignments are locked.</p>
                      </div>
                    </CardContent>
                  )}
                  {selectedReviewData.status === 'in_review' && (
                    <CardContent className="pt-0">
                      <div className="bg-primary/10 text-primary p-3 rounded-lg text-sm">
                        <p className="font-medium">You can now reassign accounts and add notes below.</p>
                      </div>
                    </CardContent>
                  )}
                </Card>

                {/* Content Tabs */}
                <Tabs defaultValue="team-view" className="w-full">
                  <TabsList className={`grid w-full ${effectiveProfile?.role === 'SLM' ? 'grid-cols-4' : 'grid-cols-3'}`}>
                    <TabsTrigger value="team-view">Team View</TabsTrigger>
                    <TabsTrigger value="before-after">Before & After</TabsTrigger>
                    <TabsTrigger value="approvals">My Proposals</TabsTrigger>
                    {effectiveProfile?.role === 'SLM' && (
                      <TabsTrigger value="slm-queue" className="gap-1">
                        <ClipboardCheck className="w-4 h-4" />
                        FLM Approvals
                      </TabsTrigger>
                    )}
                  </TabsList>

                  <TabsContent value="team-view" className="mt-6 relative">
                    <ManagerHierarchyView 
                      buildId={selectedReviewData.build_id}
                      managerLevel={selectedReviewData.manager_level}
                      managerName={selectedReviewData.manager_name}
                      reviewStatus={selectedReviewData.status}
                    />
                    <ManagerAIAssistant 
                      buildId={selectedReviewData.build_id}
                      buildName={selectedReviewData.builds?.name || 'Unnamed Build'}
                      managerName={selectedReviewData.manager_name}
                      managerLevel={selectedReviewData.manager_level}
                    />
                  </TabsContent>

                  <TabsContent value="before-after" className="mt-6">
                    <ManagerBeforeAfterComparison 
                      buildId={selectedReviewData.build_id}
                      managerLevel={selectedReviewData.manager_level}
                      managerName={selectedReviewData.manager_name}
                    />
                  </TabsContent>

                  <TabsContent value="approvals" className="mt-6">
                    <ManagerPendingApprovals buildId={selectedReviewData.build_id} />
                  </TabsContent>

                  {effectiveProfile?.role === 'SLM' && (
                    <TabsContent value="slm-queue" className="mt-6">
                      <SLMApprovalQueue 
                        buildId={selectedReviewData.build_id} 
                        slmName={selectedReviewData.manager_name}
                      />
                    </TabsContent>
                  )}
                </Tabs>
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">Select a build from the list to view details.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
