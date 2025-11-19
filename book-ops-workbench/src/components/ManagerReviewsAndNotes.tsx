import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, MessageSquare, FileText, Clock, CheckCircle, XCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ManagerReviewsAndNotesProps {
  buildId: string;
}

export default function ManagerReviewsAndNotes({ buildId }: ManagerReviewsAndNotesProps) {
  
  // Fetch all notes for this build
  const { data: notes, isLoading: notesLoading } = useQuery({
    queryKey: ['all-manager-notes', buildId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manager_notes')
        .select(`
          *,
          profiles:manager_user_id (
            full_name,
            email
          ),
          accounts:sfdc_account_id (
            account_name,
            new_owner_name
          )
        `)
        .eq('build_id', buildId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Fetch all reassignment requests for this build
  const { data: reassignments, isLoading: reassignmentsLoading } = useQuery({
    queryKey: ['all-reassignments', buildId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manager_reassignments')
        .select(`
          *,
          profiles:manager_user_id (
            full_name,
            email
          )
        `)
        .eq('build_id', buildId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

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

  if (notesLoading || reassignmentsLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue="notes" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="notes" className="gap-2">
          <MessageSquare className="w-4 h-4" />
          Notes ({notes?.length || 0})
        </TabsTrigger>
        <TabsTrigger value="requests" className="gap-2">
          <FileText className="w-4 h-4" />
          Reassignment Requests ({reassignments?.length || 0})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="notes">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Manager Notes
            </CardTitle>
            <CardDescription>All notes added by managers for this build</CardDescription>
          </CardHeader>
          <CardContent>
            {!notes || notes.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No notes added yet</p>
            ) : (
              <ScrollArea className="h-[600px]">
                <div className="space-y-4">
                  {notes.map((note: any) => (
                    <Card key={note.id} className="border-l-4 border-l-primary">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="font-medium">
                              {note.accounts?.account_name || 'Unknown Account'}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Owner: {note.accounts?.new_owner_name || 'Unassigned'}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">
                              {new Date(note.created_at).toLocaleDateString()}
                            </div>
                            <div className="text-xs font-medium">
                              {note.profiles?.full_name || note.profiles?.email || 'Unknown'}
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

      <TabsContent value="requests">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Reassignment Requests
            </CardTitle>
            <CardDescription>All proposed account reassignments by managers</CardDescription>
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
                    <TableHead>Requested By</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Rationale</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reassignments.map((request: any) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">{request.account_name}</TableCell>
                      <TableCell>{request.current_owner_name}</TableCell>
                      <TableCell>
                        <div className="font-medium text-primary">{request.proposed_owner_name}</div>
                      </TableCell>
                      <TableCell>{getStatusBadge(request.status)}</TableCell>
                      <TableCell className="text-sm">
                        {request.profiles?.full_name || request.profiles?.email || 'Unknown'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(request.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="text-sm text-muted-foreground truncate" title={request.rationale}>
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
      </TabsContent>
    </Tabs>
  );
}
