import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { AppSidebar } from '@/components/AppSidebar';
import { ThemeToggle } from '@/components/ThemeToggle';
import { FeedbackWidget } from '@/components/FeedbackWidget';
import { SlackAppPrompt } from '@/components/SlackAppPrompt';
import { useAuth } from '@/contexts/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const { user, loading, effectiveProfile } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        
        <div className="flex-1 flex flex-col">
          {/* Slack App Install Prompt */}
          <SlackAppPrompt variant="banner" />
          
          {/* Header - z-40 to stay above scrolling cards (z-10) but below modals (z-50) */}
          <header className="h-16 flex items-center gap-4 border-b bg-gradient-subtle backdrop-blur-sm px-6 sticky top-0 z-40">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate('/')}
                  className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer"
                  aria-label="Go to home"
                >
                  <img src="/favicon.png" alt="Book Builder" className="h-8 w-8 rounded-lg" />
                  <h1 className="text-xl font-bold text-gradient">Book Builder</h1>
                </button>
                {effectiveProfile?.role?.toUpperCase() === 'REVOPS' && (
                  <Badge variant="outline" className="status-info font-medium">
                    RevOps Admin Access
                  </Badge>
                )}
              </div>
            </div>
            <ThemeToggle />
          </header>
          
          {/* Main content */}
          <main className="flex-1 p-6 bg-gradient-subtle overflow-auto">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
      
      {/* Feedback Widget - always visible */}
      <FeedbackWidget />
    </SidebarProvider>
  );
};