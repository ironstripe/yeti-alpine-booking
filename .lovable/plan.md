

# Dev/Test Mode: Auto-Login to Instructor Portal

## Summary
Remove all login requirements for `/instructor/*` routes during the testing period. When anyone opens the instructor portal, they will automatically be logged in as a default test instructor without seeing any login screen.

## How It Works

1. **Detect Test Mode**: A simple flag (`DEV_BYPASS_AUTH = true`) in the code
2. **Auto-Create Session**: When `InstructorLayout` mounts and there's no user, it automatically calls the `test-instructor-login` edge function with a default token
3. **No Flickering**: Show a loading spinner while auto-login happens, then render the portal
4. **Uses Existing Token**: Leverages `tester-alpha-2026` (Leila Azaroual) as the default test instructor

## Technical Changes

### 1. `src/components/instructor-portal/InstructorLayout.tsx`

Add auto-login logic at the top of the component:

```typescript
const DEV_BYPASS_AUTH = true; // Set to false when going to production
const DEFAULT_TEST_TOKEN = "tester-alpha-2026";

export function InstructorLayout({ children }: InstructorLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut, loading: authLoading } = useAuth();
  const { isTeacher, isAdminOrOffice, loading: roleLoading, instructorId } = useUserRole();
  const { data: pendingCount } = usePendingBookingsCount();
  const [autoLoginAttempted, setAutoLoginAttempted] = useState(false);

  // DEV MODE: Auto-login when no user
  useEffect(() => {
    if (!DEV_BYPASS_AUTH) return;
    if (authLoading) return;
    if (user) return; // Already logged in
    if (autoLoginAttempted) return; // Prevent retry loop

    const performAutoLogin = async () => {
      setAutoLoginAttempted(true);
      try {
        const { data, error } = await supabase.functions.invoke("test-instructor-login", {
          body: { token: DEFAULT_TEST_TOKEN }
        });
        
        if (!error && data?.access_token && data?.refresh_token) {
          await supabase.auth.setSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
          });
          localStorage.setItem("yety_active_role", "teacher");
        }
      } catch (err) {
        console.error("Auto-login failed:", err);
      }
    };

    performAutoLogin();
  }, [authLoading, user, autoLoginAttempted]);

  // Remove redirect-to-login logic when DEV_BYPASS_AUTH is true
  useEffect(() => {
    if (DEV_BYPASS_AUTH) return; // Skip login redirect in dev mode
    // ... existing redirect logic only runs when DEV_BYPASS_AUTH = false
  }, [...]);

  // Show loading while auto-login is in progress
  if (DEV_BYPASS_AUTH && !user && !autoLoginAttempted) {
    return <LoadingSpinner message="Portal wird geladen..." />;
  }
  if (authLoading || roleLoading) {
    return <LoadingSpinner />;
  }

  // ... rest of the component
}
```

### 2. Remove `/test-instructor/:token` Route Dependency

The magic link route (`TestInstructorLogin.tsx`) will still work, but it's no longer required. Opening `/instructor` directly will auto-login.

## Test Instructors Available

| Token | Instructor | Email |
|-------|------------|-------|
| `tester-alpha-2026` | Leila Azaroual | leilaazaroual@bluewin.ch |
| `tester-beta-2026` | Max Bender | maxbender365@gmail.com |
| `tester-gamma-2026` | Christoph Buhler | christoph@powersurf.li |

The default is **Leila Azaroual**. To switch, change `DEFAULT_TEST_TOKEN` or use the magic link.

## Going to Production

When ready for production, simply set:
```typescript
const DEV_BYPASS_AUTH = false;
```

This will:
- Re-enable the login screen requirement
- Disable auto-login behavior
- Keep magic test links working for QA/testing

## Files to Modify
- `src/components/instructor-portal/InstructorLayout.tsx`

