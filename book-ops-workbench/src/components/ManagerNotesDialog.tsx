import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Loader2, MessageSquare, AlertCircle, HelpCircle, CheckCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ManagerNotesDialogProps {
  open: boolean;
  onClose: () => void;
  account: any;
  buildId: string;
}

type NoteCategory = 'general' | 'concern' | 'question' | 'approval';
type NoteStatus = 'open' | 'resolved' | 'escalated';

export default function ManagerNotesDialog({
  open,
  onClose,
  account,
  buildId,
}: ManagerNotesDialogProps) {
  const { user } = useAuth();
  const [noteText, setNoteText] = useState('');
  const [category, setCategory] = useState<NoteCategory>('general');
  const [status, setStatus] = useState<NoteStatus>('open');
  const [tags, setTags] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const queryClient = useQueryClient();

  const { data: notes, isLoading } = useQuery({
    queryKey: ['manager-notes', buildId, account?.sfdc_account_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manager_notes')
        .select(`
          *,
          profiles:manager_user_id (
            full_name,
            email
          )
        `)
        .eq('build_id', buildId)
        .eq('sfdc_account_id', account.sfdc_account_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: open && !!account,
  });

  const addNoteMutation = useMutation({
    mutationFn: async () => {
      const tagArray = tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [];

      const { error } = await supabase.from('manager_notes').insert({
        build_id: buildId,
        sfdc_account_id: account.sfdc_account_id,
        manager_user_id: user!.id,
        note_text: noteText,
        category,
        status,
        tags: tagArray,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Note Added',
        description: noteText.substring(0, 100) + (noteText.length > 100 ? '...' : ''),
      });
      setNoteText('');
      setCategory('general');
      setStatus('open');
      setTags('');
      // Invalidate all note-related queries to refresh the display
      queryClient.invalidateQueries({ queryKey: ['manager-notes'] });
      queryClient.invalidateQueries({ queryKey: ['manager-all-notes'] });
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

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'concern': return <AlertCircle className="w-4 h-4" />;
      case 'question': return <HelpCircle className="w-4 h-4" />;
      case 'approval': return <CheckCircle className="w-4 h-4" />;
      default: return <MessageSquare className="w-4 h-4" />;
    }
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'concern': return 'destructive';
      case 'question': return 'secondary';
      case 'approval': return 'default';
      default: return 'outline';
    }
  };

  const getStatusColor = (stat: string) => {
    switch (stat) {
      case 'open': return 'default';
      case 'resolved': return 'secondary';
      case 'escalated': return 'destructive';
      default: return 'outline';
    }
  };

  const filteredNotes = notes?.filter((note: any) => {
    const categoryMatch = filterCategory === 'all' || note.category === filterCategory;
    const statusMatch = filterStatus === 'all' || note.status === filterStatus;
    return categoryMatch && statusMatch;
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Notes for {account?.account_name}</DialogTitle>
          <DialogDescription>
            Add notes visible to your hierarchy and RevOps team
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-3">
            <div>
              <Label htmlFor="note-text">Note</Label>
              <Textarea
                id="note-text"
                placeholder="Add a note about this account..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={4}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="note-category">Category</Label>
                <Select value={category} onValueChange={(val) => setCategory(val as NoteCategory)}>
                  <SelectTrigger id="note-category" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" />
                        General
                      </div>
                    </SelectItem>
                    <SelectItem value="concern">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        Concern
                      </div>
                    </SelectItem>
                    <SelectItem value="question">
                      <div className="flex items-center gap-2">
                        <HelpCircle className="w-4 h-4" />
                        Question
                      </div>
                    </SelectItem>
                    <SelectItem value="approval">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        Approval
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="note-status">Status</Label>
                <Select value={status} onValueChange={(val) => setStatus(val as NoteStatus)}>
                  <SelectTrigger id="note-status" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="escalated">Escalated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="note-tags">Tags (comma-separated)</Label>
              <Input
                id="note-tags"
                placeholder="high-arr, cre-account, geographic-mismatch"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="mt-1"
              />
            </div>

            <Button
              onClick={() => addNoteMutation.mutate()}
              disabled={!noteText.trim() || addNoteMutation.isPending}
              className="w-full"
            >
              {addNoteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Note
            </Button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium">Previous Notes ({filteredNotes?.length || 0})</h4>
              <div className="flex gap-2">
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-[130px] h-8">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="concern">Concerns</SelectItem>
                    <SelectItem value="question">Questions</SelectItem>
                    <SelectItem value="approval">Approvals</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[130px] h-8">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="escalated">Escalated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <ScrollArea className="h-[300px] rounded-md border p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : !filteredNotes || filteredNotes.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {notes && notes.length > 0 ? 'No notes match the selected filters' : 'No notes yet'}
                </p>
              ) : (
                <div className="space-y-4">
                  {filteredNotes.map((note: any) => (
                    <div key={note.id} className="border-b pb-3 last:border-0">
                      <div className="flex items-start justify-between mb-2">
                        <div className="text-sm font-medium">
                          {note.profiles?.full_name || note.profiles?.email || 'Unknown User'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(note.created_at).toLocaleDateString()} at{' '}
                          {new Date(note.created_at).toLocaleTimeString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={getCategoryColor(note.category) as any} className="flex items-center gap-1">
                          {getCategoryIcon(note.category)}
                          {note.category || 'general'}
                        </Badge>
                        <Badge variant={getStatusColor(note.status) as any}>
                          {note.status || 'open'}
                        </Badge>
                        {note.tags && note.tags.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {note.tags.map((tag: string, idx: number) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{note.note_text}</p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
