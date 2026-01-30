
# Plan: Magic Test Links for Instructor Portal

## Overview
Create 3 persistent test URLs that automatically log testers into the instructor portal without needing the invitation flow. Each link will be tied to a real instructor account.

## Proposed Test Links
| Tester | Instructor | Link |
|--------|------------|------|
| Tester 1 | Leila Azaroual | `/test-instructor/tester-alpha-2026` |
| Tester 2 | Max Bender | `/test-instructor/tester-beta-2026` |
| Tester 3 | Christoph Bühler | `/test-instructor/tester-gamma-2026` |

## Technical Implementation

### 1. Database: Test Token Mapping Table
```sql
CREATE TABLE instructor_test_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  instructor_id UUID REFERENCES instructors(id) NOT NULL,
  expires_at TIMESTAMPTZ, -- NULL = never expires
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert 3 test tokens
INSERT INTO instructor_test_tokens (token, instructor_id) VALUES
  ('tester-alpha-2026', 'a31fc4c1-42fb-4c94-bf57-8a86abbde9db'),
  ('tester-beta-2026', '6c8542a3-9b6d-4620-9dc7-a1ec351e0c22'),
  ('tester-gamma-2026', 'ddfab510-ab01-4b47-9c40-1d4441828b13');
```

### 2. Edge Function: `test-instructor-login`
- Validates the token from the URL
- Looks up the linked instructor
- Creates or finds the auth user for that instructor email
- Generates a session and returns tokens
- Only works for valid tokens in the database

### 3. Frontend: Test Login Page
**New file:** `src/pages/TestInstructorLogin.tsx`

```tsx
// Flow:
// 1. Extract token from URL
// 2. Call Edge Function to validate + get session
// 3. Set session via supabase.auth.setSession()
// 4. Redirect to /instructor
```

### 4. Route Registration
Add to `App.tsx`:
```tsx
<Route path="/test-instructor/:token" element={<TestInstructorLogin />} />
```

## Security Considerations
- Tokens are **not guessable** (specific format with year)
- Token validation happens server-side
- Can add `expires_at` to auto-disable after testing period
- Only works for instructors explicitly added to the mapping table
- Auth users are real Supabase users with proper roles

## Files to Create/Modify
1. **Create:** `supabase/functions/test-instructor-login/index.ts`
2. **Create:** `src/pages/TestInstructorLogin.tsx`
3. **Modify:** `src/App.tsx` (add route)
4. **Database migration:** Create test token table

## Usage
Testers simply open one of these URLs:
- `https://yeti-alpine-booking.lovable.app/test-instructor/tester-alpha-2026`
- `https://yeti-alpine-booking.lovable.app/test-instructor/tester-beta-2026`
- `https://yeti-alpine-booking.lovable.app/test-instructor/tester-gamma-2026`

They'll be automatically logged in and redirected to the instructor portal.

## Cleanup Option
When testing is complete, simply delete the rows from `instructor_test_tokens` or set `expires_at` to a past date.
