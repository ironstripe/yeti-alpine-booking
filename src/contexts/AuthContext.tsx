import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import { User, Session, AuthChangeEvent } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Prevent double initialization in StrictMode
    if (initialized) return;
    
    let mounted = true;

    const initializeAuth = async () => {
      try {
        // Get initial session first
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        
        if (mounted) {
          if (initialSession) {
            // Validate session is not expired
            const expiresAt = initialSession.expires_at ? initialSession.expires_at * 1000 : 0;
            const isExpired = expiresAt < Date.now() + 30000; // 30s buffer
            
            if (!isExpired) {
              setSession(initialSession);
              setUser(initialSession.user);
            }
          }
          setLoading(false);
          setInitialized(true);
        }
      } catch (error) {
        console.error("Auth initialization error:", error);
        if (mounted) {
          setLoading(false);
          setInitialized(true);
        }
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, newSession: Session | null) => {
        // Only update on meaningful events
        if (!mounted) return;
        
        switch (event) {
          case "SIGNED_IN":
          case "TOKEN_REFRESHED":
            setSession(newSession);
            setUser(newSession?.user ?? null);
            setLoading(false);
            break;
          case "SIGNED_OUT":
            setSession(null);
            setUser(null);
            setLoading(false);
            break;
          case "USER_UPDATED":
            setUser(newSession?.user ?? null);
            break;
          // Ignore INITIAL_SESSION - we handle it in initializeAuth
          case "INITIAL_SESSION":
            // Only process if not yet initialized
            if (!initialized && mounted) {
              if (newSession) {
                const expiresAt = newSession.expires_at ? newSession.expires_at * 1000 : 0;
                const isExpired = expiresAt < Date.now() + 30000;
                if (!isExpired) {
                  setSession(newSession);
                  setUser(newSession.user);
                }
              }
              setLoading(false);
              setInitialized(true);
            }
            break;
        }
      }
    );

    initializeAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [initialized]);

  // Memoize all auth functions to prevent re-renders
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    return { error: error as Error | null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });
    return { error: error as Error | null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error as Error | null };
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      signIn,
      signUp,
      signOut,
      resetPassword,
    }),
    [user, session, loading, signIn, signUp, signOut, resetPassword]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
