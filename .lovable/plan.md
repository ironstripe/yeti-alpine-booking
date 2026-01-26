

# Generate More Test Bookings - Implementation Plan

## Current State
- **321 tickets** and **316 ticket_items** exist in the database
- Only **4 lessons** are scheduled for today (2026-01-26)
- Only **12 lessons** in the next week
- **26 instructors** and **560 customers** available
- **10 products** (private and group)

## Approach Options

### Option A: Database Seeding Edge Function (Recommended)
Create an edge function that generates realistic test bookings directly in the database. This is the cleanest solution as it:
- Generates data on-demand with a single button click
- Creates realistic bookings with proper relationships
- Can target specific date ranges
- Avoids file upload complexity

### Option B: Enhanced CSV Generator
Create downloadable CSVs with more bookings to use with the existing import wizard.

---

## Recommended: Option A - Test Data Generator

### New Edge Function: `generate-test-bookings`

**Features:**
- Generate X bookings starting from a specific date
- Randomly assign instructors, participants, and products
- Create realistic time slots (09:00-11:00, 10:00-12:00, 14:00-16:00)
- Distribute across different lesson types (private/group)
- Set proper statuses and prices

### New UI: Test Data Generator Button

Add a button in **Settings → Datenimport** to trigger the generator:

```text
┌─────────────────────────────────────────────────┐
│ 🧪 Testdaten generieren                         │
│                                                 │
│ Startdatum: [2026-01-26    ]                   │
│ Anzahl Buchungen: [50     ]                     │
│ Tagesverteilung: [5-10 pro Tag]                │
│                                                 │
│ [Generieren]                                    │
└─────────────────────────────────────────────────┘
```

---

## Technical Implementation

### File 1: `supabase/functions/generate-test-bookings/index.ts`

**Logic:**
1. Fetch all active instructors, products, customers, and participants
2. Generate N tickets with random customer assignments
3. For each ticket, create 1-3 ticket_items:
   - Random date within range
   - Random time slot (morning/afternoon)
   - Random instructor assignment
   - Random product (private 2h most common)
   - Set `instructor_confirmation: "confirmed"` so they appear in scheduler
4. Calculate proper pricing and totals
5. Return summary of created records

### File 2: `src/components/settings/TestDataGenerator.tsx`

**Features:**
- Date picker for start date
- Number input for booking count
- "Generate" button that calls the edge function
- Progress indicator
- Success/error feedback

### File 3: Update `src/pages/SettingsDataImport.tsx`

Add the `TestDataGenerator` component below the existing import wizard.

---

## Generated Booking Distribution

Per generated booking:
- **70%** Private 2h lessons
- **20%** Private 1h lessons  
- **10%** Group course enrollments

Time slot distribution:
- **40%** Morning (09:00-11:00 or 10:00-12:00)
- **40%** Afternoon (14:00-16:00)
- **20%** Full day (09:00-16:00 with lunch)

Status distribution:
- **80%** Confirmed with instructor assigned
- **20%** Pending (no instructor yet)

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/functions/generate-test-bookings/index.ts` | Create | Edge function to generate bookings |
| `src/components/settings/TestDataGenerator.tsx` | Create | UI component with form |
| `src/pages/SettingsDataImport.tsx` | Modify | Add TestDataGenerator below wizard |

---

## Expected Outcome

After clicking "Generieren" with 50 bookings:
- ~50 new tickets created
- ~75-100 new ticket_items (some tickets have multiple lessons)
- Distributed across the next 7-14 days
- Instructor assignments visible in scheduler
- Mix of statuses for testing different views

This gives you a one-click solution to populate the scheduler with realistic test data whenever needed.

