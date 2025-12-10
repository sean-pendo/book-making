import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { X, MessageSquare, Bell, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const SLACK_APP_URL = 'https://slack.com/apps'; // Replace with your actual Slack app install URL
const DISMISSED_KEY = 'slack-app-prompt-dismissed';

interface SlackAppPromptProps {
  variant?: 'banner' | 'card';
  onDismiss?: () => void;
}

export function SlackAppPrompt({ variant = 'banner', onDismiss }: SlackAppPromptProps) {
  const { profile } = useAuth();
  const [isDismissed, setIsDismissed] = useState(true);

  useEffect(() => {
    // Check if user has dismissed this prompt before
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    const dismissedTime = dismissed ? parseInt(dismissed, 10) : 0;
    const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);
    
    // Show again after 7 days if dismissed
    if (!dismissed || daysSinceDismissed > 7) {
      setIsDismissed(false);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, Date.now().toString());
    setIsDismissed(true);
    onDismiss?.();
  };

  const handleInstall = () => {
    // Mark as dismissed after clicking install
    localStorage.setItem(DISMISSED_KEY, Date.now().toString());
    setIsDismissed(true);
    // Open Slack app installation page
    window.open(SLACK_APP_URL, '_blank');
  };

  if (isDismissed) return null;

  // Only show to pendo.io users
  if (!profile?.email?.endsWith('@pendo.io')) return null;

  if (variant === 'banner') {
    return (
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-3 relative">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5" />
            <p className="text-sm font-medium">
              Get notifications in Slack! Install the Book Builder app to receive real-time updates on reviews, approvals, and more.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={handleInstall}
              className="bg-white text-purple-600 hover:bg-gray-100"
            >
              Add to Slack
            </Button>
            <button
              onClick={handleDismiss}
              className="p-1 hover:bg-white/10 rounded"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-100 rounded-lg">
              <MessageSquare className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Connect to Slack</CardTitle>
              <CardDescription>Get notified about important updates</CardDescription>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-purple-100 rounded text-gray-400 hover:text-gray-600"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-purple-500" />
            <span>Review assignments & approvals</span>
          </div>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-purple-500" />
            <span>Build status updates</span>
          </div>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-purple-500" />
            <span>Direct messages from team members</span>
          </div>
        </div>
        <Button 
          onClick={handleInstall}
          className="w-full bg-purple-600 hover:bg-purple-700"
        >
          <MessageSquare className="h-4 w-4 mr-2" />
          Add Book Builder to Slack
        </Button>
        <p className="text-xs text-gray-500 text-center">
          You can always install later from Settings
        </p>
      </CardContent>
    </Card>
  );
}

