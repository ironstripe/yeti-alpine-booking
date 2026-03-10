

# Fix: Instructor Avatar Not Displaying After Upload

## Problem
The upload succeeds (confirmed via network logs: 200 status, file stored, DB updated). However, the avatar doesn't show because:

1. The `avatar_url` saved to the database is the raw storage URL without a cache-buster
2. When the page re-renders after query invalidation, the browser/CDN serves a cached empty response for that URL
3. On subsequent page loads, the same caching issue persists since the URL never changes even when the image is re-uploaded

## Solution

Append a cache-busting timestamp to the `avatar_url` whenever it's rendered, not just in the edit modal's local state.

### Changes

**File: `src/components/instructors/EditInstructorModal.tsx`**
- Save the avatar_url to DB **with** a cache-buster query param (e.g. `?t=1710000000000`)
- This ensures every upload produces a unique URL that bypasses cache

Change line 140 from:
```typescript
await updateInstructor.mutateAsync({ avatar_url: publicUrl });
```
to:
```typescript
await updateInstructor.mutateAsync({ avatar_url: urlWithCacheBust });
```

This way the DB stores a URL like `...jpeg?t=1710000000000`, which changes with each upload, preventing caching issues.

No other files need changes -- the detail page and card already render `instructor.avatar_url` via `AvatarImage`.

## Files Modified
1. `src/components/instructors/EditInstructorModal.tsx` -- save cache-busted URL to database

