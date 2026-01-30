

# Dev/Test Mode: Auto-Login to Instructor Portal

## ✅ IMPLEMENTED

The instructor portal now auto-logs in as a test instructor. No login screen required.

## How It Works

1. **DEV_BYPASS_AUTH = true** flag at top of `InstructorLayout.tsx`
2. When anyone opens `/instructor/*`, they're automatically logged in as Leila Azaroual
3. Loading spinner shows "Portal wird geladen..." during auto-login
4. No redirect to login page

## Test Instructors Available

| Token | Instructor | Email |
|-------|------------|-------|
| `tester-alpha-2026` | Leila Azaroual (DEFAULT) | leilaazaroual@bluewin.ch |
| `tester-beta-2026` | Max Bender | maxbender365@gmail.com |
| `tester-gamma-2026` | Christoph Buhler | christoph@powersurf.li |

To use a different test instructor, either:
- Change `DEFAULT_TEST_TOKEN` in `InstructorLayout.tsx`
- Use magic link: `/test-instructor/tester-beta-2026`

## Going to Production

In `src/components/instructor-portal/InstructorLayout.tsx`, change:
```typescript
const DEV_BYPASS_AUTH = false;
```
