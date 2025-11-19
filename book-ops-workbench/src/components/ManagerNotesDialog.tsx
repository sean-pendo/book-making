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
import { Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ManagerNotesDialogProps {
  open: boolean;
  onClose: () => void;
  account: any;
  buildId: string;
}

export default function ManagerNotesDialog({
  open,
  onClose,
  account,
  buildId,
}: ManagerNotesDialogProps) {
  const { user } = useAuth();
  const [noteText, setNoteText] = useState('');
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
      const { error } = await supabase.from('manager_notes').insert({
        build_id: buildId,
        sfdc_account_id: account.sfdc_account_id,
        manager_user_id: user!.id,
        note_text: noteText,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Note Added',
        description: noteText.substring(0, 100) + (noteText.length > 100 ? '...' : ''),
      });
      setNoteText('');
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
          <div>
            <Textarea
              placeholder="Add a note about this account..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
            />
            <Button
              onClick={() => addNoteMutation.mutate()}
              disabled={!noteText.trim() || addNoteMutation.isPending}
              className="mt-2"
            >
              {addNoteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Note
            </Button>
          </div>

          <div>
            <h4 className="font-medium mb-2">Previous Notes</h4>
            <ScrollArea className="h-[300px] rounded-md border p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : !notes || notes.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No notes yet</p>
              ) : (
                <div className="space-y-4">
                  {notes.map((note: any) => (
                    <div key={note.id} className="border-b pb-3 last:border-0">
                      <div className="flex items-start justify-between mb-1">
                        <div className="text-sm font-medium">
                          {note.profiles?.full_name || note.profiles?.email || 'Unknown User'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(note.created_at).toLocaleDateString()} at{' '}
                          {new Date(note.created_at).toLocaleTimeString()}
                        </div>
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
