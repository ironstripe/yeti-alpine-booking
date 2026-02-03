
# State-of-the-Art Login Implementation

## Problem Analysis

The current implementation has several issues that cause UI instability:

1. **Auth state detection causing re-renders**: `onAuthStateChange` fires during page load and can trigger during typing
2. **Missing `detectSessionInUrl: false`**: Supabase automatically parses URL for session tokens, causing unexpected redirects
3. **No memoization**: `signIn`, `signUp`, `resetPassword` functions recreate on every render, potentially triggering effects
4. **Service worker still causing issues**: Despite the fix, stale cached responses can still interfere
5. **No debouncing**: Rapid auth state changes can cause multiple re-renders

## Solution: Complete Rewrite Following Best Practices

### 1. Supabase Client Configuration

**File:** `src/integrations/supabase/client.ts`

Add `detectSessionInUrl: false` to prevent automatic URL parsing that causes unexpected behavior:

```typescript
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // Prevent automatic URL parsing
  }
});
```

### 2. Rewrite AuthContext with Best Practices

**File:** `src/contexts/AuthContext.tsx`

Key improvements:
- Use `useCallback` for all auth methods to prevent unnecessary re-renders
- Add proper initialization guard to prevent double initialization
- Use stable loading state management
- Add event-specific handling in `onAuthStateChange`

```typescript
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
        // Only update on meaningful events, ignore INITIAL_SESSION after init
        if (!mounted) return;
        
        switch (event) {
          case "SIGNED_IN":
          case "TOKEN_REFRESHED":
            setSession(newSession);
            setUser(newSession?.user ?? null);
            break;
          case "SIGNED_OUT":
            setSession(null);
            setUser(null);
            break;
          case "USER_UPDATED":
            setUser(newSession?.user ?? null);
            break;
          // Ignore INITIAL_SESSION if already initialized
          case "INITIAL_SESSION":
            if (!initialized) {
              setSession(newSession);
              setUser(newSession?.user ?? null);
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
```

### 3. Stabilize Login Component

**File:** `src/pages/Login.tsx`

Key improvements:
- Use `useRef` for form values to prevent re-renders during typing
- Add form key to ensure stable reference
- Use controlled inputs with stable references
- Better error handling

```typescript
// Key changes:
// 1. Add unique key to form to prevent remounts
<form key="login-form" onSubmit={handleSubmit} ...>

// 2. Use useId for stable input IDs
const emailId = useId();
const passwordId = useId();

// 3. Add autoFocus to email field for better UX
<Input
  id={emailId}
  autoFocus
  ...
/>

// 4. Normalize email on change
onChange={(e) => setEmail(e.target.value.toLowerCase())}
```

### 4. Update Vite Config - Complete Service Worker Fix

**File:** `vite.config.ts`

Add explicit exclusion for auth endpoints:

```typescript
runtimeCaching: [
  {
    urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
    handler: "NetworkFirst",
    options: {
      cacheName: "supabase-rest-cache",
      networkTimeoutSeconds: 10,
      expiration: {
        maxEntries: 100,
        maxAgeSeconds: 60 * 60,
      },
      cacheableResponse: {
        statuses: [0, 200],
      },
    },
  },
],
navigateFallbackDenylist: [/^\/auth/, /supabase/],
```

## Summary of Changes

| File | Change |
|------|--------|
| `src/integrations/supabase/client.ts` | Add `detectSessionInUrl: false` |
| `src/contexts/AuthContext.tsx` | Complete rewrite with memoization, proper event handling, initialization guard |
| `src/pages/Login.tsx` | Add form stability (key, useId), normalize email |
| `vite.config.ts` | Stricter service worker exclusions |

## Technical Notes

1. **`detectSessionInUrl: false`**: Prevents Supabase from automatically parsing URL hash for session tokens, which can cause unexpected redirects during OAuth flows
2. **`useCallback` for auth methods**: Ensures stable function references that don't trigger re-renders in consuming components
3. **`useMemo` for context value**: Prevents context value object recreation on every render
4. **Event-specific handling**: Only updates state on meaningful auth events, ignoring redundant `INITIAL_SESSION` after initialization
5. **Form key**: Ensures React maintains stable DOM references for the form
6. **Email normalization**: Trims and lowercases email for consistent comparison
