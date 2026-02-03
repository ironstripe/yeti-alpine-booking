
# Fix: Auth Listener Being Unsubscribed After Initialization

## Problem

The `onAuthStateChange` listener is being unsubscribed immediately after initialization due to a dependency array issue:

```typescript
useEffect(() => {
  if (initialized) return;  // Returns early on re-run
  // ... setup listener ...
  return () => subscription.unsubscribe();  // But cleanup STILL runs!
}, [initialized]);  // Re-runs when initialized changes
```

**Flow:**
1. `initialized = false` → listener set up
2. `setInitialized(true)` → effect re-runs
3. Early return at `if (initialized)` → **but cleanup runs first, unsubscribing!**
4. No listener active → `SIGNED_IN` event not received → user stays on login page

## Solution

Remove `initialized` from the dependency array and use a ref to track initialization state. The listener should be set up once and never torn down until component unmounts.

### Code Changes

**File:** `src/contexts/AuthContext.tsx`

```typescript
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import { User, Session, AuthChangeEvent } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// ... interface unchanged ...

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Use ref instead of state to avoid effect re-runs
  const initializedRef = useRef(false);

  useEffect(() => {
    // Prevent double initialization in StrictMode
    if (initializedRef.current) return;
    initializedRef.current = true;
    
    let mounted = true;

    // Set up auth state listener FIRST (before getSession)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, newSession: Session | null) => {
        if (!mounted) return;
        
        console.log("Auth event:", event); // Debug logging
        
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
          case "INITIAL_SESSION":
            if (newSession) {
              setSession(newSession);
              setUser(newSession.user);
            }
            setLoading(false);
            break;
        }
      }
    );

    // Get initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (mounted && initialSession) {
        setSession(initialSession);
        setUser(initialSession.user);
      }
      if (mounted) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []); // Empty dependency array - run once only

  // ... rest of the file unchanged ...
}
```

## Key Changes

| Change | Reason |
|--------|--------|
| `useRef` instead of `useState` for `initialized` | Refs don't trigger re-renders, preventing cleanup |
| Empty dependency array `[]` | Effect runs once, listener stays active |
| Removed session expiry check | Supabase handles token refresh automatically |
| Simplified `INITIAL_SESSION` handling | Always set session if present |

## Technical Notes

- The ref pattern (`initializedRef`) is the standard way to handle "run once" effects in StrictMode
- The listener must stay active to receive `SIGNED_IN` events after login
- Empty dependency array ensures cleanup only runs on unmount, not on state changes
