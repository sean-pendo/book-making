import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { notifyReviewAssigned } from '@/services/slackNotificationService';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Loader2, Send, Users, Copy, Check, AlertCircle, ChevronsUpDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

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
  const { user, effectiveProfile } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedManager, setSelectedManager] = useState<string>(''); // For when no managerName provided
  const [sendToAllSLMs, setSendToAllSLMs] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [shareableLink, setShareableLink] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [managerSearchOpen, setManagerSearchOpen] = useState(false);
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [slackNotificationsSent, setSlackNotificationsSent] = useState(0);
  const [slackNotificationsFailed, setSlackNotificationsFailed] = useState(0);
  const queryClient = useQueryClient();

  // Fetch build name for notifications
  const { data: buildData } = useQuery({
    queryKey: ['build-name', buildId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('builds')
        .select('name')
        .eq('id', buildId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Fetch ALL users (but we'll filter based on hierarchy rules)
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

  // Fetch FLM → SLM mapping from sales_reps
  const { data: managerHierarchy } = useQuery({
    queryKey: ['manager-hierarchy', buildId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_reps')
        .select('flm, slm')
        .eq('build_id', buildId);

      if (error) throw error;
      
      // Build FLM → SLM mapping and SLM → FLMs mapping
      const flmToSlm = new Map<string, string>();
      const slmToFlms = new Map<string, Set<string>>();
      
      data?.forEach(rep => {
        if (rep.flm && rep.slm) {
          flmToSlm.set(rep.flm, rep.slm);
          if (!slmToFlms.has(rep.slm)) {
            slmToFlms.set(rep.slm, new Set());
          }
          slmToFlms.get(rep.slm)!.add(rep.flm);
        }
      });
      
      return { flmToSlm, slmToFlms };
    },
    enabled: open,
  });

  // Get unique SLM names
  const { data: slmNames } = useQuery({
    queryKey: ['slm-names', buildId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_reps')
        .select('slm')
        .eq('build_id', buildId);

      if (error) throw error;
      return [...new Set(data?.map(r => r.slm).filter(Boolean) as string[])].sort();
    },
    enabled: open,
  });

  // Get unique FLM names for selection
  const { data: flmNames } = useQuery({
    queryKey: ['flm-names', buildId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_reps')
        .select('flm')
        .eq('build_id', buildId);

      if (error) throw error;
      return [...new Set(data?.map(r => r.flm).filter(Boolean) as string[])].sort();
    },
    enabled: open && !managerName,
  });

  // Group managers by SLM hierarchy
  const groupedManagers = useMemo(() => {
    if (!managerHierarchy || !slmNames || !flmNames) return null;
    
    const { slmToFlms } = managerHierarchy;
    const groups: Array<{ slm: string; flms: string[] }> = [];
    
    // Sort SLMs and add their FLMs
    slmNames.forEach(slm => {
      const flms = slmToFlms.get(slm);
      groups.push({
        slm,
        flms: flms ? Array.from(flms).sort() : [],
      });
    });
    
    return groups;
  }, [managerHierarchy, slmNames, flmNames]);

  // Combined list of managers for dropdown (flat list for searching)
  const allManagers = useMemo(() => {
    const managers = [
      ...(slmNames || []).map(name => ({ name, level: 'SLM' as const })),
      ...(flmNames || []).map(name => ({ name, level: 'FLM' as const })),
    ].filter((m, i, arr) => arr.findIndex(x => x.name === m.name) === i);
    return managers;
  }, [slmNames, flmNames]);

  // Get the selected manager details (from prop or dropdown)
  const targetManager = useMemo(() => {
    if (managerName && managerLevel) {
      return { name: managerName, level: managerLevel };
    }
    if (selectedManager) {
      const selected = allManagers.find(m => `${m.level}:${m.name}` === selectedManager);
      return selected || null;
    }
    return null;
  }, [managerName, managerLevel, selectedManager, allManagers]);

  // Filter users based on hierarchy rules
  const filteredUsers = useMemo(() => {
    if (!availableUsers || !targetManager || !managerHierarchy) {
      return availableUsers || [];
    }

    const { flmToSlm, slmToFlms } = managerHierarchy;
    
    // Get valid manager names for this share
    const validManagerNames = new Set<string>();
    
    if (targetManager.level === 'FLM') {
      // Sharing FLM book: can share with this FLM or the SLM above
      validManagerNames.add(targetManager.name);
      const slmAbove = flmToSlm.get(targetManager.name);
      if (slmAbove) {
        validManagerNames.add(slmAbove);
      }
    } else if (targetManager.level === 'SLM') {
      // Sharing SLM book: can share with this SLM or any FLM under them
      validManagerNames.add(targetManager.name);
      const flmsUnder = slmToFlms.get(targetManager.name);
      if (flmsUnder) {
        flmsUnder.forEach(flm => validManagerNames.add(flm));
      }
    }

    // Filter users: exclude RevOps and only show users whose name matches valid managers
    return availableUsers.filter(u => {
      const role = u.role?.toUpperCase();
      if (role === 'REVOPS') return false;
      return validManagerNames.has(u.full_name || '');
    });
  }, [availableUsers, targetManager, managerHierarchy]);

  // Show hint about valid recipients
  const recipientHint = useMemo(() => {
    if (!targetManager || !managerHierarchy) return null;
    
    const { flmToSlm, slmToFlms } = managerHierarchy;
    
    if (targetManager.level === 'FLM') {
      const slmAbove = flmToSlm.get(targetManager.name);
      return `Can be shared with: ${targetManager.name} (FLM)${slmAbove ? ` or ${slmAbove} (SLM)` : ''}`;
    } else if (targetManager.level === 'SLM') {
      const flmsUnder = slmToFlms.get(targetManager.name);
      const flmList = flmsUnder ? Array.from(flmsUnder).join(', ') : 'none';
      return `Can be shared with: ${targetManager.name} (SLM) or FLMs: ${flmList}`;
    }
    return null;
  }, [targetManager, managerHierarchy]);

  // Fetch existing reviews to check for duplicates
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
        // Send all SLM books to all non-RevOps users
        const upserts: any[] = [];
        const nonRevOpsUsers = availableUsers?.filter(u => u.role?.toUpperCase() !== 'REVOPS') || [];
        
        for (const slmName of slmNames) {
          for (const userProfile of nonRevOpsUsers) {
            upserts.push({
              build_id: buildId,
              manager_user_id: userProfile.id,
              manager_name: slmName,
              manager_level: 'SLM',
              sent_by: user!.id,
              sent_at: new Date().toISOString(),
              shared_scope: 'full',
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

        if (!targetManager) {
          throw new Error('Please select which manager\'s book to share.');
        }

        // Determine shared_scope and visible_flms
        const selectedUser = availableUsers?.find(u => u.id === selectedUserId);
        const selectedUserRole = selectedUser?.role?.toUpperCase();
        const selectedUserName = selectedUser?.full_name;
        
        let sharedScope = 'full';
        let visibleFlms: string[] | null = null;
        
        // If sharing SLM book with an FLM, scope to only their FLM portion
        if (targetManager.level === 'SLM' && selectedUserRole === 'FLM') {
          const flmsUnder = managerHierarchy?.slmToFlms.get(targetManager.name);
          if (flmsUnder && selectedUserName && flmsUnder.has(selectedUserName)) {
            sharedScope = 'flm_only';
            visibleFlms = [selectedUserName];
          }
        }

        const reviewData: any = {
          build_id: buildId,
          manager_user_id: selectedUserId,
          manager_name: targetManager.name,
          manager_level: targetManager.level,
          sent_by: user!.id,
          sent_at: new Date().toISOString(),
          shared_scope: sharedScope,
        };
        
        if (visibleFlms) {
          reviewData.visible_flms = visibleFlms;
        }

        const { error } = await supabase
          .from('manager_reviews')
          .upsert(reviewData, {
            onConflict: 'build_id,manager_user_id,manager_name',
            ignoreDuplicates: false,
          });

        if (error) throw error;
        return 1;
      }
    },
    onSuccess: async (count) => {
      queryClient.invalidateQueries({ queryKey: ['existing-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['manager-reviews'] });
      
      // Generate shareable link
      const baseUrl = window.location.origin;
      let link = '';
      
      if (sendToAllSLMs && slmNames && slmNames.length > 0) {
        link = `${baseUrl}/manager-dashboard?buildId=${buildId}`;
      } else if (targetManager && selectedUserId) {
        link = `${baseUrl}/manager-dashboard?buildId=${buildId}&managerName=${encodeURIComponent(targetManager.name)}`;
      } else {
        link = `${baseUrl}/manager-dashboard?buildId=${buildId}`;
      }
      
      // Send Slack notifications and track results
      const buildName = buildData?.name || 'Unknown Build';
      const assignedBy = effectiveProfile?.full_name || 'RevOps';
      let sentCount = 0;
      let failedCount = 0;
      
      if (sendToAllSLMs && availableUsers) {
        // Notify all non-RevOps users
        const nonRevOpsUsers = availableUsers.filter(u => u.role?.toUpperCase() !== 'REVOPS');
        const notifications = await Promise.allSettled(
          nonRevOpsUsers
            .filter(u => u.email)
            .map(userProfile => 
              notifyReviewAssigned(userProfile.email!, buildName, 'SLM', assignedBy)
            )
        );
        
        notifications.forEach(result => {
          if (result.status === 'fulfilled' && (result.value.sent || result.value.success)) {
            sentCount++;
          } else {
            failedCount++;
          }
        });
      } else if (selectedUserId) {
        // Notify the specific user
        const selectedUser = availableUsers?.find(u => u.id === selectedUserId);
        if (selectedUser?.email && targetManager) {
          const result = await notifyReviewAssigned(
            selectedUser.email, 
            buildName, 
            targetManager.level, 
            assignedBy
          );
          if (result.sent || result.success) {
            sentCount = 1;
          } else {
            failedCount = 1;
          }
        }
      }
      
      setSlackNotificationsSent(sentCount);
      setSlackNotificationsFailed(failedCount);
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
    setSlackNotificationsSent(0);
    setSlackNotificationsFailed(0);
    onClose();
  };

  // Get display name for selected manager
  const selectedManagerDisplay = useMemo(() => {
    if (!selectedManager) return null;
    const manager = allManagers.find(m => `${m.level}:${m.name}` === selectedManager);
    return manager ? `${manager.name} (${manager.level})` : null;
  }, [selectedManager, allManagers]);

  // Get display name for selected user
  const selectedUserDisplay = useMemo(() => {
    if (!selectedUserId) return null;
    const user = availableUsers?.find(u => u.id === selectedUserId);
    return user ? `${user.full_name || user.email} (${user.role})` : null;
  }, [selectedUserId, availableUsers]);

  // Show all users if no filtering (for bulk send or no target selected)
  const usersToShow = targetManager ? filteredUsers : (availableUsers?.filter(u => u.role?.toUpperCase() !== 'REVOPS') || []);

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
            {/* Slack notification confirmation */}
            {(slackNotificationsSent > 0 || slackNotificationsFailed > 0) && (
              <div className={`p-3 rounded-lg border ${
                slackNotificationsFailed === 0 
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                  : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
              }`}>
                <div className="flex items-center gap-2">
                  {slackNotificationsFailed === 0 ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                  )}
                  <span className={`text-sm font-medium ${
                    slackNotificationsFailed === 0 
                      ? 'text-green-700 dark:text-green-300' 
                      : 'text-amber-700 dark:text-amber-300'
                  }`}>
                    {slackNotificationsSent > 0 && (
                      <>Slack notification{slackNotificationsSent > 1 ? 's' : ''} sent ({slackNotificationsSent})</>
                    )}
                    {slackNotificationsFailed > 0 && slackNotificationsSent > 0 && ', '}
                    {slackNotificationsFailed > 0 && (
                      <>{slackNotificationsFailed} failed</>
                    )}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {slackNotificationsSent > 0 
                    ? 'The recipient(s) have been notified via Slack.'
                    : 'Slack notifications could not be delivered.'}
                </p>
              </div>
            )}

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
              {managerName ? (
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
              ) : (
                <div className="space-y-2">
                  <Label>Select Manager's Book to Share</Label>
                  <Popover open={managerSearchOpen} onOpenChange={setManagerSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={managerSearchOpen}
                        className={cn(
                          "w-full justify-between font-normal h-10",
                          !selectedManager && "text-muted-foreground"
                        )}
                        onClick={() => {
                          // If "All" was selected, deselect it
                          if (sendToAllSLMs) {
                            setSendToAllSLMs(false);
                          }
                        }}
                      >
                        {selectedManagerDisplay || "Choose a manager..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[350px] p-0 max-h-[400px]" align="start">
                      <Command className="border-0">
                        <CommandInput placeholder="Type to filter..." className="border-0" />
                        <CommandList className="max-h-[350px]">
                          <CommandEmpty>No manager found.</CommandEmpty>
                          
                          {/* SLMs Group */}
                          <CommandGroup heading="SLMs (Second Line Managers)">
                            {(slmNames || []).map((slm) => (
                              <CommandItem
                                key={`SLM:${slm}`}
                                value={slm}
                                onSelect={() => {
                                  setSelectedManager(`SLM:${slm}`);
                                  setSendToAllSLMs(false);
                                  setManagerSearchOpen(false);
                                }}
                                className="flex items-center justify-between"
                              >
                                <span>{slm}</span>
                                <Badge variant="secondary" className="ml-2">SLM</Badge>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                          
                          <CommandSeparator />
                          
                          {/* FLMs grouped by SLM */}
                          {groupedManagers?.map((group) => (
                            <CommandGroup key={group.slm} heading={`FLMs under ${group.slm}`}>
                              {group.flms.map((flm) => (
                                <CommandItem
                                  key={`FLM:${flm}`}
                                  value={flm}
                                  onSelect={() => {
                                    setSelectedManager(`FLM:${flm}`);
                                    setSendToAllSLMs(false);
                                    setManagerSearchOpen(false);
                                  }}
                                  className="flex items-center justify-between pl-4"
                                >
                                  <span>{flm}</span>
                                  <Badge variant="outline" className="ml-2">FLM</Badge>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          ))}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground">
                    Select which FLM or SLM's book of business to share
                  </p>
                </div>
              )}

              {/* Recipient hint */}
              {recipientHint && (
                <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-700 dark:text-blue-300 text-sm">
                    {recipientHint}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label>Assign to User</Label>
                <Popover open={userSearchOpen} onOpenChange={setUserSearchOpen}>
                  <PopoverTrigger asChild>
                      <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={userSearchOpen}
                      className={cn(
                        "w-full justify-between font-normal h-10",
                        !selectedUserId && "text-muted-foreground"
                      )}
                      onClick={() => {
                        // If "All" was selected, deselect it
                        if (sendToAllSLMs) {
                          setSendToAllSLMs(false);
                        }
                      }}
                    >
                      {selectedUserDisplay || "Choose a user..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[350px] p-0 max-h-[400px]" align="start">
                    <Command className="border-0">
                      <CommandInput placeholder="Type to filter..." className="border-0" />
                      <CommandList className="max-h-[350px]">
                        <CommandEmpty>No user found.</CommandEmpty>
                        <CommandGroup>
                          {usersToShow.map((u) => (
                            <CommandItem
                              key={u.id}
                              value={u.full_name || u.email || u.id}
                              onSelect={() => {
                                setSelectedUserId(u.id);
                                setSendToAllSLMs(false);
                                setUserSearchOpen(false);
                              }}
                              className="flex items-center justify-between"
                            >
                              <span>{u.full_name || u.email}</span>
                              <Badge variant="outline" className="ml-2">{u.role}</Badge>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {targetManager && usersToShow.length === 0 && (
                  <p className="text-xs text-amber-600">
                    No users match the valid recipients. Users need full_name matching a manager name.
                  </p>
                )}
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
                      if (!sendToAllSLMs) {
                        // If turning ON "All", clear selections
                        setSelectedUserId('');
                        setSelectedManager('');
                      }
                    }}
                  >
                    <Users className="w-4 h-4" />
                    {sendToAllSLMs ? '✓ Sending All SLM Books' : 'Send All SLM Books to All Managers'}
                  </Button>
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              // Generate link based on current selection
              const baseUrl = window.location.origin;
              let link = '';
              
              if (sendToAllSLMs && slmNames && slmNames.length > 0) {
                link = `${baseUrl}/manager-dashboard?buildId=${buildId}`;
              } else if (targetManager) {
                link = `${baseUrl}/manager-dashboard?buildId=${buildId}&managerName=${encodeURIComponent(targetManager.name)}`;
              } else {
                link = `${baseUrl}/manager-dashboard?buildId=${buildId}`;
              }
              
              navigator.clipboard.writeText(link).then(() => {
                setCopied(true);
                toast({
                  title: 'Link Copied',
                  description: 'Shareable link copied to clipboard.',
                });
                setTimeout(() => setCopied(false), 2000);
              }).catch(() => {
                toast({
                  title: 'Copy Failed',
                  description: 'Could not copy link to clipboard.',
                  variant: 'destructive',
                });
              });
            }}
            disabled={!targetManager && !sendToAllSLMs}
            className="gap-2"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            Copy Link
          </Button>
          <Button
            onClick={() => sendToManagerMutation.mutate()}
            disabled={
              ((!selectedUserId || !targetManager) && !sendToAllSLMs) ||
              sendToManagerMutation.isPending ||
              !availableUsers ||
              availableUsers.length === 0
            }
          >
            {sendToManagerMutation.isPending && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            Send & Copy Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
