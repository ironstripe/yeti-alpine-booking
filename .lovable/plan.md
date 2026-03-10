

# Add Profile Picture to Instructor Profiles

## Current State
The `instructors` table has no column for a profile image. The UI shows initials in an `AvatarFallback` component everywhere.

## Plan

### 1. Database: Add `avatar_url` column to `instructors` table
```sql
ALTER TABLE public.instructors ADD COLUMN avatar_url TEXT;
```

### 2. Storage: Create `instructor-avatars` bucket
```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('instructor-avatars', 'instructor-avatars', true);
```
With RLS policies allowing authenticated users to upload/view.

### 3. UI Changes

**`src/components/instructors/EditInstructorModal.tsx`**
- Add an avatar upload section at the top of the form
- File input that uploads to `instructor-avatars/{instructor_id}.jpg`
- On successful upload, update `avatar_url` on the instructor record
- Show current avatar preview with option to change

**`src/pages/InstructorDetail.tsx`**
- Use `AvatarImage` with `instructor.avatar_url` in the hero section (falls back to initials if no image)

**`src/components/instructors/detail/ProfileInfoCard.tsx`**
- No changes needed (avatar is in the hero section)

**Instructor list views** (wherever instructor avatars are shown)
- Update to use `AvatarImage` when `avatar_url` is present

### 4. Files Modified
1. Database migration — add `avatar_url` column + storage bucket + RLS policies
2. `src/components/instructors/EditInstructorModal.tsx` — avatar upload UI
3. `src/pages/InstructorDetail.tsx` — display avatar image

