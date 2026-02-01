
# Event Module Implementation Plan - Gästeskirennen

## ✅ Completed Phases

- **Phase 1**: Database Schema (events, event_categories, event_participants tables with RLS)
- **Phase 2**: Navigation & Routing (sidebar, bottom nav, App.tsx routes)
- **Phase 3**: Events List Page + EventCard + useEvents hook
- **Phase 4**: Event Detail Page with Tabs (Participants, Startlists, Results, Settings)
- **Phase 5**: Startlist Tab + Start Number Assignment
- **Phase 6**: Results Tab + Entry Table

## 🔄 Remaining Phases (TODO)

- **Phase 7**: Instructor Portal Integration (add race tab, instructor race page)
- **Phase 8**: Fine-tune Settings Tab

---

## Overview

Implement a complete Event module for managing weekly ski races with two components:
1. **Course Race (10:00)**: Group course participants with 3+ attendance days (free)
2. **Guest Race (11:30)**: Private lesson guests and walk-ins (CHF 20)

---

## Phase 1: Database Schema

### 1.1 Events Table

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Gästeskirennen',
  event_date DATE NOT NULL,
  event_type TEXT DEFAULT 'race' CHECK (event_type IN ('race', 'ceremony', 'other')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'registration_open', 'registration_closed', 'in_progress', 'completed', 'cancelled')),
  
  course_race_time TIME DEFAULT '10:00',
  guest_race_time TIME DEFAULT '11:30',
  result_ceremony_time TIME DEFAULT '15:30',
  instructor_deadline TIMESTAMP WITH TIME ZONE,
  guest_fee DECIMAL(10,2) DEFAULT 20.00,
  
  total_numbers INTEGER DEFAULT 100,
  reserve_per_group INTEGER DEFAULT 1,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 1.2 Event Categories Table (Start Groups)

```sql
CREATE TABLE event_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_type TEXT NOT NULL CHECK (category_type IN ('course', 'guest')),
  training_id UUID REFERENCES group_courses(id),
  discipline TEXT CHECK (discipline IN ('ski', 'snowboard')),
  age_group TEXT CHECK (age_group IN ('child', 'adult')),
  start_time TIME,
  sort_order INTEGER DEFAULT 0,
  start_number_from INTEGER,
  start_number_to INTEGER,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 1.3 Event Participants Table

```sql
CREATE TABLE event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES event_categories(id),
  participant_id UUID REFERENCES customer_participants(id),
  ticket_item_id UUID REFERENCES ticket_items(id),
  
  guest_first_name TEXT,
  guest_last_name TEXT,
  guest_birth_year INTEGER,
  guest_phone TEXT,
  guest_email TEXT,
  
  source TEXT NOT NULL CHECK (source IN ('group_course', 'private_course', 'walkin')),
  days_attended INTEGER DEFAULT 0,
  
  confirmed_by_instructor UUID REFERENCES instructors(id),
  opted_out BOOLEAN DEFAULT false,
  opt_out_reason TEXT,
  
  start_number INTEGER,
  
  fee_amount DECIMAL(10,2),
  payment_status TEXT DEFAULT 'not_applicable' CHECK (payment_status IN ('not_applicable', 'pending', 'paid', 'waived')),
  
  finish_time_ms INTEGER,
  rank_in_category INTEGER,
  is_disqualified BOOLEAN DEFAULT false,
  disqualification_reason TEXT,
  
  checked_in BOOLEAN DEFAULT false,
  checked_in_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(event_id, participant_id)
);
```

### 1.4 RLS Policies

```sql
-- Events: Admin/Office full access, authenticated read
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin/office can manage events" ON events FOR ALL USING (is_admin_or_office(auth.uid()));
CREATE POLICY "Authenticated can view events" ON events FOR SELECT USING (auth.role() = 'authenticated');

-- Event Categories: Same pattern
ALTER TABLE event_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin/office can manage event_categories" ON event_categories FOR ALL USING (is_admin_or_office(auth.uid()));
CREATE POLICY "Authenticated can view event_categories" ON event_categories FOR SELECT USING (auth.role() = 'authenticated');

-- Event Participants: Admin/Office full, instructors can update their own
ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin/office can manage event_participants" ON event_participants FOR ALL USING (is_admin_or_office(auth.uid()));
CREATE POLICY "Authenticated can view event_participants" ON event_participants FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Instructors can update opt_out" ON event_participants FOR UPDATE 
  USING (confirmed_by_instructor = get_instructor_for_user(auth.uid()))
  WITH CHECK (confirmed_by_instructor = get_instructor_for_user(auth.uid()));
```

### 1.5 Database Function: Create Weekly Race

```sql
CREATE OR REPLACE FUNCTION create_next_friday_race_event()
RETURNS UUID AS $$
DECLARE
  next_friday DATE;
  new_event_id UUID;
BEGIN
  next_friday := date_trunc('week', CURRENT_DATE) + INTERVAL '4 days';
  IF next_friday <= CURRENT_DATE THEN
    next_friday := next_friday + INTERVAL '7 days';
  END IF;
  
  -- Check if exists
  SELECT id INTO new_event_id FROM events WHERE event_date = next_friday;
  IF new_event_id IS NOT NULL THEN
    RETURN new_event_id;
  END IF;
  
  INSERT INTO events (name, event_date, status, instructor_deadline)
  VALUES (
    'Gästeskirennen',
    next_friday,
    'registration_open',
    next_friday - INTERVAL '2 days' + TIME '18:00'
  )
  RETURNING id INTO new_event_id;
  
  RETURN new_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Phase 2: Navigation & Routing

### 2.1 Add to Sidebar

**File: `src/components/layout/AppSidebar.tsx`**

Add Trophy icon import and new nav item after "Trainings":

```typescript
import { Trophy } from "lucide-react";

const navItems = [
  // ... existing items
  { title: "Trainings", url: "/trainings", icon: GraduationCap },
  { title: "Events", url: "/events", icon: Trophy }, // NEW
  { title: "Wochenplanung", url: "/trainings/planning", icon: LayoutGrid },
  // ...
];
```

### 2.2 Add Routes

**File: `src/App.tsx`**

```typescript
import Events from "./pages/Events";
import EventDetail from "./pages/EventDetail";

// Inside AppLayout routes:
<Route path="events" element={<Events />} />
<Route path="events/:id" element={<EventDetail />} />
```

### 2.3 Add to Bottom Nav (Mobile)

**File: `src/components/layout/BottomNav.tsx`**

Add Events to `secondaryNavItems`:

```typescript
{ title: "Events", url: "/events", icon: Trophy },
```

---

## Phase 3: Events List Page

### 3.1 Create Events Page

**File: `src/pages/Events.tsx`**

- Header with "Neues Event" button
- Two sections: "Anstehend" and "Vergangen"
- EventCard component for each event
- Shows participant counts and status badge

### 3.2 Create Event Card Component

**File: `src/components/events/EventCard.tsx`**

```text
+------------------------------------------+
| 🏆 Gästeskirennen                        |
| Freitag, 07. Februar 2025                |
|                                          |
| 24 Kursteilnehmer  |  8 Gäste            |
|                                          |
| [Anmeldung offen]           [Verwalten →]|
+------------------------------------------+
```

### 3.3 Create Events Hook

**File: `src/hooks/useEvents.ts`**

```typescript
export function useEvents() { ... }
export function useEvent(eventId: string) { ... }
export function useCreateEvent() { ... }
export function useUpdateEvent() { ... }
export function useEventParticipants(eventId: string) { ... }
```

---

## Phase 4: Event Detail Page

### 4.1 Create Event Detail Page

**File: `src/pages/EventDetail.tsx`**

- Header with event name, date, status badge
- Stats row: Kursteilnehmer, Gäste, Bezahlt, Deadline
- Tabs: Teilnehmer, Startlisten, Ergebnisse, Einstellungen

### 4.2 Participants Tab

**File: `src/components/events/EventParticipantsTab.tsx`**

Two sections:

**Course Race (10:00)**
- Accordion per training/level (e.g., "Blue Stars", "Red Stars")
- Each shows participants with opt-out checkbox
- "Aus Kursen importieren" button

**Guest Race (11:30)**
- Table with all guest participants
- "Gast anmelden" button
- Payment status column

### 4.3 Import from Courses Dialog

**File: `src/components/events/ImportFromCoursesDialog.tsx`**

- Select week to import from
- Shows eligible participants (3+ days attendance)
- Checkbox to select which trainings to import
- Creates event_participants records

### 4.4 Add Guest Dialog

**File: `src/components/events/AddGuestDialog.tsx`**

- Source selection: Private lesson / Walk-in
- For private lesson: Search existing bookings
- For walk-in: Manual entry (name, birth year, phone, email, category)
- Payment status toggle

---

## Phase 5: Startlist Tab

### 5.1 Startlist Tab Component

**File: `src/components/events/EventStartlistsTab.tsx`**

- "Startnummern zuweisen" button
- Preview per category (collapsible)
- "Alle drucken" and per-category print buttons

### 5.2 Start Number Assignment Logic

**File: `src/lib/event-utils.ts`**

```typescript
export function assignStartNumbers(event: Event): EventParticipant[] {
  // Sort by category sort_order
  // Assign sequential numbers within category
  // Skip one number between categories (reserve)
  // Return updated participants array
}
```

### 5.3 Printable Startlist Component

**File: `src/components/events/StartlistPrint.tsx`**

- A4 print layout
- Group header with category name and time
- Table: Startnr, Name, Jahrgang
- Print CSS for page breaks

---

## Phase 6: Results Tab

### 6.1 Results Entry Tab

**File: `src/components/events/EventResultsTab.tsx`**

- Category selector dropdown
- Results entry table with editable time fields
- Auto-calculate ranks on save
- DSQ checkbox column
- "Rangliste drucken" and "Urkunden drucken" buttons

### 6.2 Results Entry Table

**File: `src/components/events/ResultsEntryTable.tsx`**

```text
| # | Name           | Zeit (mm:ss.ms) | Rang | DSQ |
|---|----------------|-----------------|------|-----|
| 1 | Max Muster     | [0:45.32      ] |  1.  | [ ] |
| 2 | Anna Beispiel  | [0:47.18      ] |  2.  | [ ] |
| 3 | Tim Test       | [           -  ] |  -   | [x] |
```

### 6.3 Printable Results & Certificates

**File: `src/components/events/ResultsPrint.tsx`**

- Rangliste: Category header, ranked results table
- Urkunde: Certificate template per participant with rank

---

## Phase 7: Instructor Portal Integration

### 7.1 Add Race Tab to Instructor Layout

**File: `src/components/instructor-portal/InstructorLayout.tsx`**

Add new nav item:

```typescript
{ title: "Rennen", url: "/instructor/race", icon: Trophy },
```

### 7.2 Instructor Race Page

**File: `src/pages/InstructorRace.tsx`**

- Show next race date and deadline
- Alert if deadline passed (read-only mode)
- List of "my" participants (from assigned courses)
- Checkbox to opt-out with reason field
- Save button (disabled after deadline)

### 7.3 Race Participants Hook

**File: `src/hooks/useInstructorRaceParticipants.ts`**

```typescript
export function useNextRaceEvent() { ... }
export function useMyRaceParticipants(eventId: string) { ... }
export function useToggleRaceParticipation() { ... }
```

---

## Phase 8: Settings Tab

### 8.1 Event Settings Tab

**File: `src/components/events/EventSettingsTab.tsx`**

- Event date/time settings
- Instructor deadline
- Guest fee
- Start number settings
- Default categories (can add/remove/reorder)
- Status management (open/close registration)

---

## File Structure Summary

```text
src/
├── pages/
│   ├── Events.tsx                    # Events list page
│   ├── EventDetail.tsx               # Event detail with tabs
│   └── InstructorRace.tsx            # Instructor portal race page
├── components/
│   └── events/
│       ├── EventCard.tsx             # Event list item
│       ├── EventStatusBadge.tsx      # Status badge component
│       ├── EventParticipantsTab.tsx  # Participants management tab
│       ├── CategoryAccordion.tsx     # Course category accordion
│       ├── ImportFromCoursesDialog.tsx
│       ├── AddGuestDialog.tsx
│       ├── EventStartlistsTab.tsx
│       ├── StartlistPrint.tsx
│       ├── EventResultsTab.tsx
│       ├── ResultsEntryTable.tsx
│       ├── ResultsPrint.tsx
│       ├── CertificatePrint.tsx
│       └── EventSettingsTab.tsx
├── hooks/
│   ├── useEvents.ts                  # Event CRUD operations
│   └── useInstructorRaceParticipants.ts
└── lib/
    └── event-utils.ts                # Start number assignment logic
```

---

## Implementation Order

| Step | Task | Estimated Complexity |
|------|------|---------------------|
| 1 | Database migration (tables, RLS, functions) | Medium |
| 2 | Navigation updates (sidebar, routes, bottom nav) | Low |
| 3 | Events list page + EventCard + useEvents hook | Medium |
| 4 | Event detail page structure with tabs | Medium |
| 5 | Participants tab (course section) | High |
| 6 | Participants tab (guest section + dialogs) | High |
| 7 | Startlist tab + print | Medium |
| 8 | Results tab + entry table | High |
| 9 | Results/Certificate printing | Medium |
| 10 | Instructor portal integration | Medium |
| 11 | Settings tab | Low |

---

## Key Technical Decisions

1. **Separate event_categories table**: Allows flexible category management per event
2. **Participant linking**: Links to customer_participants when available, falls back to guest_* fields for walk-ins
3. **Opt-out model**: Course participants are auto-added, instructors can only remove (not add)
4. **Start numbers**: Assigned on-demand via "Zuweisen" button, not auto-assigned
5. **Results**: Manual time entry (no timing system integration for MVP)
6. **Instructor deadline**: Enforced in UI, not database (allows admin override)
