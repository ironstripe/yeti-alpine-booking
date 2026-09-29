
- Edge functions: staff-only functions call `requireRole` from `supabase/functions/_shared/staffAuth.ts`; test/debug functions call `testFunctionsDisabled` (off unless ALLOW_TEST_FUNCTIONS=true). Why: all functions run with verify_jwt=false, so authorization must be in code.
