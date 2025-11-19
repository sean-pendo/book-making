import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import ManagerHierarchyView from '@/components/ManagerHierarchyView';
import ManagerBeforeAfterComparison from '@/components/ManagerBeforeAfterComparison';
import ManagerPendingApprovals from '@/components/ManagerPendingApprovals';
import ManagerReviewsAndNotes from '@/components/ManagerReviewsAndNotes';
import ManagerAIAssistant from '@/components/ManagerAIAssistant';

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

  // Approve all reassignments mutation
  const approveAllMutation = useMutation({
    mutationFn: async (buildId: string) => {
      // Fetch all pending reassignments for this build and manager
      const { data: reassignments, error: fetchError } = await supabase
        .from('manager_reassignments')
        .select('*')
        .eq('build_id', buildId)
        .eq('manager_user_id', user!.id)
        .eq('status', 'pending');

      if (fetchError) throw fetchError;
      if (!reassignments || reassignments.length === 0) {
        throw new Error('No pending reassignments found');
      }

      // Update all reassignments to approved
      const { error: updateError } = await supabase
        .from('manager_reassignments')
        .update({
          status: 'approved',
          approved_by: user!.id,
          approved_at: new Date().toISOString(),
        })
        .eq('build_id', buildId)
        .eq('manager_user_id', user!.id)
        .eq('status', 'pending');

      if (updateError) throw updateError;

      // Update all accounts with new owners
      for (const reassignment of reassignments) {
        const { error: accountError } = await supabase
          .from('accounts')
          .update({
            new_owner_id: reassignment.proposed_owner_id,
            new_owner_name: reassignment.proposed_owner_name,
          })
          .eq('sfdc_account_id', reassignment.sfdc_account_id)
          .eq('build_id', reassignment.build_id);

        if (accountError) throw accountError;
      }

      return reassignments.length;
    },
    onSuccess: (count) => {
      toast({
        title: 'All Books Approved',
        description: `Successfully approved ${count} reassignment${count !== 1 ? 's' : ''} and updated accounts.`,
      });
      queryClient.invalidateQueries({ queryKey: ['reassignments-for-review'] });
      queryClient.invalidateQueries({ queryKey: ['manager-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['manager-sales-reps'] });
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
      case 'pending':
        return <Badge variant="outline"><AlertCircle className="w-3 h-3 mr-1" />Pending Review</Badge>;
      case 'accepted':
        return <Badge className="bg-success/10 text-success hover:bg-success/20"><CheckCircle className="w-3 h-3 mr-1" />Accepted</Badge>;
      case 'declined':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Declined</Badge>;
      case 'in_review':
        return <Badge variant="secondary"><AlertCircle className="w-3 h-3 mr-1" />In Review</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Manager Dashboard</h1>
        <p className="text-muted-foreground">
          Review and manage account assignments for your team
        </p>
      </div>

      {!reviews || reviews.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No reviews assigned to you yet.</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue={reviews[0]?.id} value={selectedReview || reviews[0]?.id} onValueChange={setSelectedReview}>
          <TabsList className="mb-4">
            {reviews.map((review: any) => (
              <TabsTrigger key={review.id} value={review.id}>
                {review.builds?.name || 'Unnamed Build'} {getStatusBadge(review.status)}
              </TabsTrigger>
            ))}
          </TabsList>

          {reviews.map((review: any) => (
            <TabsContent key={review.id} value={review.id}>
              <div className="grid gap-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>{review.builds?.name || 'Unnamed Build'}</CardTitle>
                        <CardDescription>
                          {review.builds?.description || 'No description'} • 
                          Manager Level: <Badge variant="outline">{review.manager_level}</Badge> • 
                          Sent: {new Date(review.sent_at).toLocaleDateString()}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        {review.status === 'pending' && (
                          <>
                            <Button 
                              onClick={() => handleAccept(review.id)}
                              className="gap-2"
                            >
                              <CheckCircle className="w-4 h-4" />
                              Accept
                            </Button>
                            <Button 
                              onClick={() => handleDecline(review.id)}
                              variant="outline"
                              className="gap-2"
                            >
                              <XCircle className="w-4 h-4" />
                              Decline & Review
                            </Button>
                          </>
                        )}
                        {(review.status === 'in_review' || review.status === 'pending') && (
                          <Button 
                            onClick={() => approveAllMutation.mutate(review.build_id)}
                            disabled={approveAllMutation.isPending}
                            variant="default"
                            className="gap-2"
                          >
                            {approveAllMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle className="w-4 h-4" />
                            )}
                            Approve All Books
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {review.status === 'accepted' && (
                      <div className="bg-success/10 text-success p-4 rounded-lg mb-4">
                        <p className="font-medium">✓ This review has been accepted and assignments are locked.</p>
                      </div>
                    )}
                    {review.status === 'in_review' && (
                      <div className="bg-primary/10 text-primary p-4 rounded-lg mb-4">
                        <p className="font-medium">You can now reassign accounts and add notes below.</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Tabs defaultValue="team-view" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="team-view">Team View</TabsTrigger>
                    <TabsTrigger value="before-after">Before & After</TabsTrigger>
                    <TabsTrigger value="approvals">Pending Approvals</TabsTrigger>
                  </TabsList>

                  <TabsContent value="team-view" className="mt-6 relative">
                    <ManagerHierarchyView 
                      buildId={review.build_id}
                      managerLevel={review.manager_level}
                      managerName={review.manager_name}
                      reviewStatus={review.status}
                    />
                    <ManagerAIAssistant 
                      buildId={review.build_id}
                      buildName={review.builds?.name || 'Unnamed Build'}
                      managerName={review.manager_name}
                      managerLevel={review.manager_level}
                    />
                  </TabsContent>

                  <TabsContent value="before-after" className="mt-6">
                    <ManagerBeforeAfterComparison 
                      buildId={review.build_id}
                      managerLevel={review.manager_level}
                      managerName={review.manager_name}
                    />
                  </TabsContent>

                  <TabsContent value="approvals" className="mt-6">
                    <ManagerPendingApprovals buildId={review.build_id} />
                  </TabsContent>
                </Tabs>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
