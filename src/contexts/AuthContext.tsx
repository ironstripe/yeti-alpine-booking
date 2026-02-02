import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
} from "react";
import { User, Session } from "@supabase/supabase-js";
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
  const initialized = useRef(false);

  useEffect(() => {
    // Set up auth state listener FIRST (so we don't miss events)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      // Update state synchronously
      setSession(newSession);
      setUser(newSession?.user ?? null);
      
      // Mark as initialized if not already
      if (!initialized.current) {
        initialized.current = true;
        setLoading(false);
      }
    });

    // THEN get initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      // Only update if we haven't been initialized by onAuthStateChange
      if (!initialized.current) {
        // Validate session is not expired
        if (initialSession?.expires_at) {
          const expiresAt = initialSession.expires_at * 1000; // Convert to ms
          const now = Date.now();
          const bufferMs = 30 * 1000; // 30 second buffer
          
          if (expiresAt - now < bufferMs) {
            // Session expired or about to expire - treat as logged out
            setSession(null);
            setUser(null);
          } else {
            setSession(initialSession);
            setUser(initialSession.user);
          }
        } else {
          setSession(initialSession);
          setUser(initialSession?.user ?? null);
        }
        initialized.current = true;
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error as Error | null };
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut, resetPassword }}>
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