import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

type UserRole = 'REVOPS' | 'SLM' | 'FLM';
type UserRegion = 'AMER' | 'EMEA' | 'GLOBAL';

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  team: string | null;
  teams: string[] | null;
  region: UserRegion | null;
  developer: boolean | null;
}

interface ImpersonatedUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  team: string | null;
  teams: string[] | null;
  region: UserRegion | null;
  developer: boolean | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  impersonatedUser: ImpersonatedUser | null;
  effectiveProfile: Profile | ImpersonatedUser | null; // The profile to use (original or impersonated)
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, profile: Partial<Profile>) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<boolean>;
  setImpersonatedUser: (user: ImpersonatedUser | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [impersonatedUser, setImpersonatedUser] = useState<ImpersonatedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // The effective profile is either the impersonated user or the real user's profile
  const effectiveProfile = impersonatedUser || profile;

  const loadProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error loading profile:', error);
        return;
      }

      // If no profile exists, create one with REVOPS role
      if (!data) {
        const { data: user } = await supabase.auth.getUser();
        if (user?.user) {
          try {
            const { data: newProfile, error: createError } = await supabase
              .from('profiles')
              .insert([{
                id: userId,
                email: user.user.email,
                full_name: user.user.user_metadata?.full_name || 'Admin User',
                role: 'REVOPS' as UserRole,
                region: 'GLOBAL' as UserRegion,
                teams: ['AMER'],
              }])
              .select()
              .single();

            if (createError) {
              console.error('Error creating profile:', createError);
              return;
            }

            setProfile(newProfile as Profile);
            
            toast({
              title: "Welcome!",
              description: "Your admin profile has been created with RevOps permissions.",
            });
            return;
          } catch (createError) {
            console.error('Error creating profile:', createError);
            return;
          }
        }
      }

      setProfile(data as Profile);
    } catch (error) {
      console.error('Error loading profile:', error);
    }
  };

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Load profile after successful auth
          setTimeout(() => {
            loadProfile(session.user.id);
          }, 0);
        } else {
          setProfile(null);
        }
        
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        loadProfile(session.user.id);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        toast({
          title: "Sign In Failed",
          description: error.message,
          variant: "destructive",
        });
      }
      
      return { error };
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, profileData: Partial<Profile>) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) {
        toast({
          title: "Sign Up Failed",
          description: error.message,
          variant: "destructive",
        });
        return { error };
      }

      // Create profile
      if (data.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([{
            id: data.user.id,
            email: data.user.email,
            ...profileData,
          }]);

        if (profileError) {
          console.error('Error creating profile:', profileError);
        }
      }

      toast({
        title: "Account Created",
        description: "Please check your email to verify your account.",
      });

      return { error: null };
    } finally {
      setLoading(false);
    }
  };

  // Enhanced signOut with proper cleanup
  // Force refresh authentication and profile data
  const refreshAuth = async () => {
    try {
      console.log('🔄 Force refreshing authentication...');
      
      const { data: { session }, error } = await supabase.auth.refreshSession();
      if (error) {
        console.error('Error refreshing session:', error);
        return false;
      }
      
      if (session?.user) {
        setSession(session);
        setUser(session.user);
        await loadProfile(session.user.id);
        console.log('✅ Authentication refreshed successfully');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error refreshing auth:', error);
      return false;
    }
  };

  const signOut = async () => {
    try {
      // Clean up impersonation state
      setImpersonatedUser(null);
      
      // Clean up auth state
      const cleanupAuthState = () => {
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith('supabase.auth.') || key.includes('sb-')) {
            localStorage.removeItem(key);
          }
        });
      };

      cleanupAuthState();
      
      // Attempt global sign out
      try {
        await supabase.auth.signOut({ scope: 'global' });
      } catch (err) {
        console.warn('Global signout failed, continuing with cleanup');
      }
      
      setUser(null);
      setSession(null);
      setProfile(null);
      
      toast({
        title: "Signed Out",
        description: "You have been successfully signed out.",
      });

      // Force page reload for clean state
      window.location.href = '/auth';
    } catch (error) {
      console.error('Error signing out:', error);
      // Force reload even if error occurs
      window.location.href = '/auth';
    }
  };

  const value = {
    user,
    session,
    profile,
    impersonatedUser,
    effectiveProfile,
    loading,
    signIn,
    signUp,
    signOut,
    refreshAuth,
    setImpersonatedUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};