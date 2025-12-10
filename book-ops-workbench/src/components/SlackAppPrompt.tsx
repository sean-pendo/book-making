import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { X, MessageSquare, Bell, CheckCircle2, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const DISMISSED_KEY = 'slack-app-prompt-dismissed-forever';

interface SlackAppPromptProps {
  variant?: 'banner' | 'card';
  onDismiss?: () => void;
}

export function SlackAppPrompt({ variant = 'banner', onDismiss }: SlackAppPromptProps) {
  const { profile } = useAuth();
  const [isDismissed, setIsDismissed] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Check if user has permanently dismissed this prompt
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (!dismissed) {
      setIsDismissed(false);
    }
  }, []);

  const handleDismissForever = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setIsDismissed(true);
    setShowModal(false);
    onDismiss?.();
  };

  const handleOpenModal = () => {
    setShowModal(true);
  };

  const handleGotIt = () => {
    // Mark as dismissed forever when they click "Got it"
    localStorage.setItem(DISMISSED_KEY, 'true');
    setIsDismissed(true);
    setShowModal(false);
    onDismiss?.();
  };

  if (isDismissed) return null;

  // Only show to pendo.io users
  if (!profile?.email?.endsWith('@pendo.io')) return null;

  return (
    <>
      {/* Banner */}
      {variant === 'banner' && (
        <div className="bg-gradient-to-r from-primary/90 to-primary text-primary-foreground px-4 py-3 relative">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5" />
              <p className="text-sm font-medium">
                Get notifications in Slack! Add the Book Builder app to receive real-time updates.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={handleOpenModal}
                className="bg-background text-foreground hover:bg-background/90"
              >
                Learn How
              </Button>
              <button
                onClick={handleDismissForever}
                className="p-1 hover:bg-white/10 rounded"
                aria-label="Dismiss forever"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instructions Modal */}
      <Dialog open={showModal} onOpenChange={(open) => !open && setShowModal(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              Add Book Builder to Slack
            </DialogTitle>
            <DialogDescription>
              Get notified about reviews, approvals, and build updates
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* What you'll get */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">What you'll receive:</p>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Review assignments & approvals</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Build status updates</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Welcome messages & notifications</span>
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg border">
              <p className="text-sm font-medium text-foreground flex items-center gap-2">
                <Search className="h-4 w-4" />
                How to add the app:
              </p>
              <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                <li>Open <strong>Slack</strong> on your desktop or browser</li>
                <li>Click <strong>"Apps"</strong> in the left sidebar</li>
                <li>Search for <strong className="text-foreground">"Book Builder"</strong></li>
                <li>Click to add it to your workspace</li>
              </ol>
              
              <div className="mt-3 p-3 bg-background rounded border-2 border-dashed border-primary/30">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <MessageSquare className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Book Builder</p>
                    <p className="text-xs text-muted-foreground">Search for this in Slack Apps</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={handleDismissForever}
              className="flex-1"
            >
              Maybe Later
            </Button>
            <Button 
              onClick={handleGotIt}
              className="flex-1"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Got It!
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
