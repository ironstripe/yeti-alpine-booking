

# Frontend Implementation for Advanced User Management

## Overview

This implementation adds role switching for multi-role users and a capabilities management UI for instructors on the detail page.

---

## Current State Analysis

| Component | Status |
|-----------|--------|
| `useUserRole` hook | Exists - fetches user roles from `user_roles` table |
| Role switching | Not implemented |
| `instructor_type` field | Exists in DB, not shown in UI |
| `capabilities` table | Populated with 25 entries |
| `set_instructor_capabilities` RPC | Created in previous migration |
| Instructor Detail Page | Exists with profile, schedule, stats cards |

---

## Implementation Plan

### 1. Create Active Role Context

A new context to manage which role the user is currently using.

**File**: `src/contexts/ActiveRoleContext.tsx`

```typescript
interface ActiveRoleContextType {
  activeRole: AppRole | null;
  setActiveRole: (role: AppRole) => void;
  clearActiveRole: () => void;
}
```

**Features**:
- Stores selected role in localStorage (`yety_active_role`)
- Auto-clears on logout
- Provides `activeRole` to all components

### 2. Create Role Switcher Modal

**File**: `src/components/auth/RoleSwitcherModal.tsx`

**UI Design**:
- Non-dismissible dialog (no close button, no click-outside)
- Title: "Rolle auswählen" (Choose Your Role)
- Subtitle: "Sie haben mehrere Rollen. Bitte wählen Sie, mit welcher Rolle Sie sich anmelden möchten."
- Buttons for each role with clear German labels:
  - `admin` → "Als Administrator anmelden"
  - `office` → "Als Büro-Mitarbeiter anmelden"  
  - `teacher` → "Als Skilehrer anmelden"

**Logic**:
- Rendered in `AuthenticatedComponents` when:
  - User is logged in
  - User has multiple roles
  - No active role is set
- On selection:
  - Saves role to ActiveRoleContext
  - Redirects based on role:
    - `admin`/`office` → `/` (admin dashboard)
    - `teacher` → `/instructor` (instructor portal)

### 3. Update App Navigation Logic

**Modify**: `src/App.tsx` - `AuthenticatedComponents`

- Add `RoleSwitcherModal` component
- Integrate with `ActiveRoleProvider`

**Modify**: `src/App.tsx` - Wrap with `ActiveRoleProvider`

### 4. Create Capabilities Hook

**File**: `src/hooks/useCapabilities.ts`

```typescript
export function useCapabilities() {
  // Fetch all capabilities
  return useQuery({
    queryKey: ["capabilities"],
    queryFn: async () => {
      const { data } = await supabase
        .from("capabilities")
        .select("*")
        .order("category")
        .order("name");
      return data;
    }
  });
}
```

### 5. Create Instructor Capabilities Hook

**File**: `src/hooks/useInstructorCapabilities.ts`

```typescript
export function useInstructorCapabilities(instructorId: string) {
  // Fetch instructor's current capabilities
  const query = useQuery({
    queryKey: ["instructor-capabilities", instructorId],
    queryFn: async () => {
      const { data } = await supabase
        .from("instructor_capabilities")
        .select("capability_id")
        .eq("instructor_id", instructorId);
      return data?.map(r => r.capability_id) || [];
    }
  });

  // Mutation to set capabilities using RPC
  const mutation = useMutation({
    mutationFn: async (capabilityIds: string[]) => {
      await supabase.rpc("set_instructor_capabilities", {
        p_instructor_id: instructorId,
        p_capability_ids: capabilityIds
      });
    }
  });

  return { ...query, setCapabilities: mutation };
}
```

### 6. Create Capabilities Manager Component

**File**: `src/components/instructors/detail/CapabilitiesManager.tsx`

**UI Design**:
- Grouped checkboxes by category (Ski, Snowboard, Betreuung, etc.)
- Each category as a collapsible accordion section
- Checkboxes with capability names
- Save button at bottom
- Loading states and success/error toasts

**Structure**:
```text
┌─────────────────────────────────────────┐
│ Qualifikationen                         │
├─────────────────────────────────────────┤
│ ▼ Ski (12)                              │
│   ☑ Windel-Wedelkurs                    │
│   ☐ Swiss Snow Kids Village             │
│   ☑ Blauer Prinz/Prinzessin             │
│   ...                                   │
├─────────────────────────────────────────┤
│ ▼ Snowboard (2)                         │
│   ☐ Anfänger                            │
│   ☐ Fortgeschritten                     │
├─────────────────────────────────────────┤
│ ▼ Betreuung (1)                         │
│   ☑ Mittagsbetreuung                    │
├─────────────────────────────────────────┤
│ ▼ Gästerennen (4)                       │
│   ☐ SKI-Rennen Kinder                   │
│   ...                                   │
├─────────────────────────────────────────┤
│           [Speichern]                   │
└─────────────────────────────────────────┘
```

### 7. Create Roles & Capabilities Card

**File**: `src/components/instructors/detail/RolesCapabilitiesCard.tsx`

**Sections**:
1. **Instructor Type Select**
   - Label: "Typ"
   - Options: "Lehrer" (teacher), "Assistent" (assistant)
   - Updates immediately on change via `useUpdateInstructor`

2. **Capabilities Manager** (embedded component)

### 8. Update Instructor Detail Page

**Modify**: `src/pages/InstructorDetail.tsx`

- Import `RolesCapabilitiesCard`
- Add card to the right column below `SeasonStatsCard`
- Only visible to admin/office users

---

## File Changes Summary

| File | Action |
|------|--------|
| `src/contexts/ActiveRoleContext.tsx` | Create |
| `src/components/auth/RoleSwitcherModal.tsx` | Create |
| `src/hooks/useCapabilities.ts` | Create |
| `src/hooks/useInstructorCapabilities.ts` | Create |
| `src/components/instructors/detail/CapabilitiesManager.tsx` | Create |
| `src/components/instructors/detail/RolesCapabilitiesCard.tsx` | Create |
| `src/App.tsx` | Modify - add ActiveRoleProvider + RoleSwitcherModal |
| `src/pages/InstructorDetail.tsx` | Modify - add RolesCapabilitiesCard |
| `src/hooks/useUserRole.ts` | Modify - add activeRole integration |

---

## Technical Implementation Details

### ActiveRoleContext Integration

```typescript
// App.tsx structure after changes
<ErrorBoundary>
  <QueryClientProvider>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <ActiveRoleProvider>
            <AppRoutes />
            <AuthenticatedComponents /> {/* Now includes RoleSwitcherModal */}
          </ActiveRoleProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
</ErrorBoundary>
```

### Role Labels (German)

| Role | Display Label | Button Label |
|------|---------------|--------------|
| `admin` | Administrator | Als Administrator anmelden |
| `office` | Büro | Als Büro-Mitarbeiter anmelden |
| `teacher` | Skilehrer | Als Skilehrer anmelden |

### Instructor Type Labels (German)

| Value | Display Label |
|-------|---------------|
| `teacher` | Lehrer (Gruppenleiter) |
| `assistant` | Assistent |

---

## UI/UX Considerations

1. **Role Switcher Modal**:
   - Shows full-screen on mobile
   - Cannot be dismissed without selection
   - Clear visual hierarchy for role options

2. **Capabilities Manager**:
   - Accordion grouping for easy navigation
   - Category counts show how many are selected
   - Optimistic UI with rollback on error

3. **Instructor Type**:
   - Inline select for quick changes
   - Immediate feedback with toast

---

## Testing Checklist

**Role Switcher**:
- Multi-role user sees modal on login
- Single-role user redirects directly
- Role persists across page refresh
- Logout clears active role

**Instructor Detail - Roles & Capabilities Card**:
- Only visible to admin/office
- Instructor type shows correct current value
- Changing instructor type updates database
- All 25 capabilities are listed and grouped
- Current capabilities are pre-selected
- Save button calls RPC and shows feedback
- Error handling with toast notifications

