

# Fix: Instructor Avatar Upload - HEIC Format Issue

## Root Cause
The uploaded image is in HEIC format (Apple's native format) but saved with a `.jpeg` extension. Browsers cannot display HEIC files. The file input uses `accept="image/*"` which allows iOS to send raw HEIC without conversion.

## Solution

**File: `src/components/instructors/EditInstructorModal.tsx`**

Two changes:

1. **Restrict accepted formats** on the file input to `accept="image/jpeg,image/png,image/webp"` instead of `accept="image/*"`. This tells iOS to automatically convert HEIC to JPEG before passing the file to the browser.

2. **Force correct content type** in the upload call by explicitly setting `contentType` based on `file.type`, and always use a consistent extension derived from the MIME type (not from the filename). This prevents MIME/extension mismatches.

```typescript
// Derive extension from MIME type, not filename
const extMap: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png', 
  'image/webp': 'webp',
};
const fileExt = extMap[file.type] || 'jpg';
const filePath = `${instructor.id}.${fileExt}`;

await supabase.storage
  .from("instructor-avatars")
  .upload(filePath, file, { 
    upsert: true, 
    contentType: file.type 
  });
```

## Files Modified
1. `src/components/instructors/EditInstructorModal.tsx` — restrict accept types, use MIME-based extension, set explicit contentType

