

# Instructor Profile Edit Feature

## Overview

Implement an edit modal for the instructor profile page that allows admin/office staff to modify instructor details by clicking the "Bearbeiten" button on the ProfileInfoCard component.

---

## Current State

- The `ProfileInfoCard` component already has a "Bearbeiten" button that calls `onEdit()`
- The `InstructorDetail` page currently shows a toast placeholder: "Bearbeiten-Funktion kommt bald..."
- There is **no** `useUpdateInstructor` hook yet
- The `NewInstructorModal` contains all form fields and validation logic we can reuse
- The pattern from `CustomerInfoCard` shows inline editing, but a modal approach (like `NewInstructorModal`) is more appropriate for the amount of fields

---

## Implementation Approach

I will create an **EditInstructorModal** component (dialog-based) that reuses the form structure from `NewInstructorModal` but pre-populates it with existing instructor data.

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/hooks/useUpdateInstructor.ts` | Mutation hook for updating instructor data |
| `src/components/instructors/EditInstructorModal.tsx` | Edit dialog with form |

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/InstructorDetail.tsx` | Add modal state and render EditInstructorModal |

---

## Technical Implementation

### 1. Create `useUpdateInstructor` Hook

```typescript
// src/hooks/useUpdateInstructor.ts

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { TablesUpdate } from "@/integrations/supabase/types";

type InstructorUpdate = TablesUpdate<"instructors">;

export function useUpdateInstructor(instructorId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: InstructorUpdate) => {
      const { data, error } = await supabase
        .from("instructors")
        .update(updates)
        .eq("id", instructorId)
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          if (error.message.includes("email")) {
            throw new Error("Diese E-Mail-Adresse wird bereits verwendet.");
          }
          if (error.message.includes("phone")) {
            throw new Error("Diese Telefonnummer wird bereits verwendet.");
          }
        }
        throw error;
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructor", instructorId] });
      queryClient.invalidateQueries({ queryKey: ["instructors"] });
      toast.success("Skilehrer aktualisiert");
    },
    onError: (error) => {
      toast.error("Fehler beim Speichern", {
        description: error.message,
      });
    },
  });
}
```

### 2. Create `EditInstructorModal` Component

The modal will:
- Accept `instructor` prop with current data
- Use `useForm` with Zod validation (same schema as NewInstructorModal)
- Pre-populate form with existing instructor values
- Use `useEffect` with `open` dependency for proper reset (following memory pattern)
- Include all editable fields from the instructors table

Form sections:
1. **Persönliche Daten** - first_name, last_name, birth_date, gender
2. **Kontaktdaten** - email, phone
3. **Adresse** - street, zip, city, country
4. **Qualifikationen** - level, specialization, languages
5. **Anstellung** - hourly_rate, status, role, entry_date
6. **Bankverbindung** - bank_name, iban, ahv_number
7. **Notizen** - notes

### 3. Update `InstructorDetail.tsx`

```typescript
// Add state and modal
const [editModalOpen, setEditModalOpen] = useState(false);

// Update handleEdit
const handleEdit = () => {
  setEditModalOpen(true);
};

// Add modal to render
{instructor && (
  <EditInstructorModal
    key={instructor.id}
    open={editModalOpen}
    onOpenChange={setEditModalOpen}
    instructor={instructor}
  />
)}
```

---

## Schema Alignment

Based on the `instructors` table schema, all these fields will be editable:

| Field | Type | Required |
|-------|------|----------|
| first_name | string | Yes |
| last_name | string | Yes |
| email | string | Yes |
| phone | string | Yes |
| birth_date | date | No |
| gender | string | No |
| level | string | No |
| specialization | string | No |
| hourly_rate | number | Yes |
| status | string | No |
| role | string | No |
| entry_date | date | No |
| languages | string[] | No |
| street | string | No |
| zip | string | No |
| city | string | No |
| country | string | No |
| bank_name | string | No |
| iban | string | No |
| ahv_number | string | No |
| notes | string | No |

---

## Form Reset Strategy

Following the project's established pattern from memory:
1. Pass a unique `key` prop based on `instructor.id` to force remount
2. Include `open` state in `useEffect` dependency array for form reset

```typescript
useEffect(() => {
  if (open && instructor) {
    reset({
      first_name: instructor.first_name,
      last_name: instructor.last_name,
      // ... all fields
    });
    setIbanValue(instructor.iban || "");
    setAhvValue(instructor.ahv_number || "");
  }
}, [open, instructor, reset]);
```

---

## UI Details

| Element | Behavior |
|---------|----------|
| Modal title | "Skilehrer bearbeiten" |
| Save button | "Speichern" with loading spinner |
| Cancel button | "Abbrechen" - resets form and closes |
| Validation errors | Red text below each field |
| IBAN/AHV | Format on blur, show green check when valid |

---

## German Translations

| Key | Translation |
|-----|-------------|
| Modal title | Skilehrer bearbeiten |
| Save button | Speichern |
| Cancel button | Abbrechen |
| Success toast | Skilehrer aktualisiert |
| Error toast | Fehler beim Speichern |

---

## Security Considerations

- Only admin/office users can see the ProfileInfoCard with edit button (via `useUserRole`)
- RLS policies on `instructors` table already allow authenticated users to update
- The modal is only rendered when instructor data exists

---

## Testing Checklist

1. Navigate to `/instructors/:id` page
2. Click "Bearbeiten" button in ProfileInfoCard
3. Verify modal opens with pre-populated data
4. Modify some fields
5. Click "Speichern" - verify success toast and data update
6. Reopen modal - verify new data persists
7. Test validation by clearing required fields
8. Test cancel button resets changes

