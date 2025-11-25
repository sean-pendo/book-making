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
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Loader2, Send, Users, Copy, Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

interface SendToManagerDialogProps {
  open: boolean;
  onClose: () => void;
  buildId: string;
  managerName?: string; // Optional: specific FLM/SLM name to send
  managerLevel?: 'FLM' | 'SLM'; // Optional: specific manager level
}

export default function SendToManagerDialog({
  open,
  onClose,
  buildId,
  managerName,
  managerLevel,
}: SendToManagerDialogProps) {
  const { user } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [sendToAllSLMs, setSendToAllSLMs] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [shareableLink, setShareableLink] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();

  // Fetch ALL users (any role can receive manager books)
  const { data: availableUsers, isLoading: usersLoading } = useQuery({
    queryKey: ['all-users'],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');

      if (error) throw error;
      return profiles;
    },
  });

  // Get unique SLM names if sending to all SLMs
  const { data: slmNames } = useQuery({
    queryKey: ['slm-names', buildId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_reps')
        .select('slm')
        .eq('build_id', buildId);

      if (error) throw error;
      return [...new Set(data?.map(r => r.slm).filter(Boolean) as string[])];
    },
    enabled: open,
  });

  // Fetch existing reviews to check for duplicates (user + manager name combo)
  const { data: existingReviews } = useQuery({
    queryKey: ['existing-reviews', buildId, managerName],
    queryFn: async () => {
      const query = supabase
        .from('manager_reviews')
        .select('manager_user_id, manager_name')
        .eq('build_id', buildId);
      
      if (managerName) {
        query.eq('manager_name', managerName);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const sendToManagerMutation = useMutation({
    mutationFn: async () => {
      if (sendToAllSLMs && slmNames) {
        // Send all SLM books to all users - upsert to allow duplicate sends
        const upserts: any[] = [];
        
        for (const slmName of slmNames) {
          for (const userProfile of availableUsers || []) {
            upserts.push({
              build_id: buildId,
              manager_user_id: userProfile.id,
              manager_name: slmName,
              manager_level: 'SLM',
              sent_by: user!.id,
              sent_at: new Date().toISOString(),
            });
          }
        }

        const { error } = await supabase
          .from('manager_reviews')
          .upsert(upserts, {
            onConflict: 'build_id,manager_user_id,manager_name',
            ignoreDuplicates: false,
          });
        
        if (error) throw error;
        return upserts.length;
      } else {
        // Send specific manager's book to selected user
        if (!selectedUserId) {
          throw new Error('Please select a user.');
        }

        const targetManagerName = managerName || 'General';
        const targetManagerLevel = managerLevel || 'FLM';

        const { error } = await supabase
          .from('manager_reviews')
          .upsert({
            build_id: buildId,
            manager_user_id: selectedUserId,
            manager_name: targetManagerName,
            manager_level: targetManagerLevel,
            sent_by: user!.id,
            sent_at: new Date().toISOString(),
          }, {
            onConflict: 'build_id,manager_user_id,manager_name',
            ignoreDuplicates: false,
          });

        if (error) throw error;
        return 1;
      }
    },
    onSuccess: (count, variables) => {
      queryClient.invalidateQueries({ queryKey: ['existing-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['manager-reviews'] });
      
      // Generate shareable link
      const baseUrl = window.location.origin;
      let link = '';
      
      if (sendToAllSLMs && slmNames && slmNames.length > 0) {
        // For "send all SLMs", generate link with buildId only (manager dashboard will show all)
        link = `${baseUrl}/manager-dashboard?buildId=${buildId}`;
      } else if (managerName && selectedUserId) {
        // For specific manager, include managerName in query params
        link = `${baseUrl}/manager-dashboard?buildId=${buildId}&managerName=${encodeURIComponent(managerName)}`;
      } else {
        // Fallback to just buildId
        link = `${baseUrl}/manager-dashboard?buildId=${buildId}`;
      }
      
      setShareableLink(link);
      setShowSuccessDialog(true);
      setSelectedUserId('');
      setSendToAllSLMs(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareableLink);
      setCopied(true);
      toast({
        title: 'Link Copied',
        description: 'Shareable link copied to clipboard.',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: 'Copy Failed',
        description: 'Could not copy link to clipboard. Please copy manually.',
        variant: 'destructive',
      });
    }
  };

  const handleSuccessClose = () => {
    setShowSuccessDialog(false);
    setShareableLink('');
    setCopied(false);
    onClose();
  };

  return (
    <>
      {/* Success Dialog with Link */}
      <Dialog open={showSuccessDialog} onOpenChange={handleSuccessClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-600" />
              Sent Successfully
            </DialogTitle>
            <DialogDescription>
              Manager access has been granted. Share this link to provide direct access.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Shareable Link</Label>
              <div className="flex gap-2">
                <Input
                  value={shareableLink}
                  readOnly
                  className="flex-1 font-mono text-sm"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyLink}
                  className="flex-shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Click the link to select it, or use the copy button to share with the manager.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleSuccessClose}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main Send Dialog */}
      <Dialog open={open && !showSuccessDialog} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5" />
            Map Manager to User
          </DialogTitle>
          <DialogDescription>
            Select which user should receive access to this manager's book of business
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {usersLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : !availableUsers || availableUsers.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No user accounts found in the system.
            </p>
          ) : (
            <>
              {managerName && (
                <div className="bg-primary/10 border border-primary/20 p-4 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Manager</span>
                    <span className="font-semibold">{managerName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Level</span>
                    <Badge variant="outline">{managerLevel}</Badge>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Assign to User</Label>
                <Select 
                  value={selectedUserId} 
                  onValueChange={(value) => {
                    setSelectedUserId(value);
                    setSendToAllSLMs(false);
                  }}
                  disabled={sendToAllSLMs}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a user..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.full_name || user.email}
                        <Badge variant="outline" className="ml-2">
                          {user.role}
                        </Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!managerName && (
                <>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">Or</span>
                    </div>
                  </div>

                  <Button
                    variant={sendToAllSLMs ? "default" : "outline"}
                    className="w-full gap-2"
                    onClick={() => {
                      setSendToAllSLMs(!sendToAllSLMs);
                      setSelectedUserId('');
                    }}
                  >
                    <Users className="w-4 h-4" />
                    Send All SLM Books to All Users
                  </Button>
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => sendToManagerMutation.mutate()}
            disabled={
              (!selectedUserId && !sendToAllSLMs) ||
              sendToManagerMutation.isPending ||
              !availableUsers ||
              availableUsers.length === 0
            }
          >
            {sendToManagerMutation.isPending && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
