
# Extend Test Data Generator for Group Course Bookings

## Overview

Extend the existing test data generator to create group course enrollments with various capacity scenarios for testing the Group Capacity Planning feature.

## Data Model Understanding

The group course enrollment chain is:
```
group_courses (templates)
    -> training_groups (weekly instances per course)
    -> group_course_instances (specific day/time slots)
    -> group_course_enrollments (participant links)
        -> ticket_items -> tickets -> customers
        -> customer_participants (children)
```

Key tables:
- `group_courses`: Contains `max_participants`, `min_participants` (nullable, default ~4), `price_per_day`
- `training_groups`: `course_id`, `week_start`, `group_number`, `instructor_id`
- `group_course_enrollments`: Links `instance_id`, `ticket_item_id`, `participant_id`, `training_group_id`

## Implementation

### Part 1: UI Component Changes (`src/components/settings/TestDataGenerator.tsx`)

**Add State Variables:**
```typescript
const [generateGroupCourses, setGenerateGroupCourses] = useState(true);
const [weeksToGenerate, setWeeksToGenerate] = useState(8);
const [includeCapacityScenarios, setIncludeCapacityScenarios] = useState(true);
```

**Add UI Section (after private lesson settings):**
- Checkbox: "Gruppenkurs-Buchungen generieren"
- Number input: "Wochen generieren" (1-12, default 8)
- Checkbox: "Kapazitäts-Szenarien einschliessen"
- Info text explaining the distribution

**Update Result Interface:**
```typescript
interface GenerationResult {
  success: boolean;
  created?: {
    tickets: number;
    items: number;
  };
  dateRange?: { start: string; end: string };
  error?: string;
  // NEW
  groupCourses?: {
    trainingGroups: number;
    enrollments: number;
    customersCreated: number;
  };
}
```

**Update API Call:** Pass new parameters to edge function

**Update Result Display:** Show group course generation stats

### Part 2: Edge Function Changes (`supabase/functions/generate-test-bookings/index.ts`)

**Update Request Interface:**
```typescript
interface GenerateRequest {
  startDate: string;
  bookingCount: number;
  daysSpread: number;
  generateGroupCourses?: boolean;
  weeksToGenerate?: number;
  includeCapacityScenarios?: boolean;
}
```

**Add Group Course Generation Logic:**

1. **Fetch active group courses** (weekly type only, `course_type = 'weekly'`)
2. **For each week in range:**
   - Calculate Monday of that week
   - Create training_group for each active course
   - Determine participant count based on scenario:
     - 50% OK (between min and max)
     - 20% Overbooked (+4 to +12 over max)
     - 20% Underbooked (1 to min-1)
     - 10% Empty (0 participants)
3. **For each enrollment:**
   - Create/reuse customer
   - Create customer_participant (child with Swiss/German name)
   - Create ticket with group product
   - Create ticket_item linked to a group course instance
   - Create enrollment linking everything

**Helper Functions to Add:**

```typescript
// Scenario selection
function getRandomScenario(): 'ok' | 'overbooked' | 'underbooked' | 'empty'

// Get Monday of week
function getMonday(date: Date): string

// Random Swiss/German child names
function getRandomChildFirstName(): string
function getRandomSwissLastName(): string

// Random birthdate for children (4-14 years old)
function getRandomChildBirthDate(): string

// Get or create test customer
async function getOrCreateTestCustomer(supabase: any): Promise<Customer>

// Main group course generator
async function generateGroupCourseData(
  supabase: any,
  startDate: Date,
  weeks: number,
  includeScenarios: boolean
): Promise<GroupCourseResult>
```

**Name Lists (Swiss/German):**
```typescript
const CHILD_FIRST_NAMES = [
  'Emma', 'Mia', 'Sofia', 'Anna', 'Lena', 'Laura', 'Julia', 'Sara',
  'Noah', 'Liam', 'Leon', 'Lucas', 'Felix', 'Tim', 'Max', 'Paul',
  'Leonie', 'Nina', 'Lara', 'Elena', 'Emilia', 'Valentina',
  'David', 'Jan', 'Lukas', 'Nico', 'Julian', 'Finn'
];

const SWISS_LAST_NAMES = [
  'Müller', 'Meier', 'Schmid', 'Keller', 'Weber', 'Huber', 'Schneider',
  'Meyer', 'Steiner', 'Fischer', 'Gerber', 'Brunner', 'Baumann', 'Frei',
  'Moser', 'Widmer', 'Wyss', 'Graf', 'Roth', 'Bühler'
];
```

### Part 3: Full Generation Flow for One Enrollment

```
1. Select random customer (or create new)
2. Create customer_participant:
   - first_name: random from CHILD_FIRST_NAMES
   - last_name: customer's last name
   - birth_date: random 4-14 years ago
3. Find group_course_instance for the course/week
4. Create ticket:
   - customer_id, status: 'confirmed'
   - total_amount: course.price_per_day * 5 (week)
   - paid_amount: 70% paid, 30% pending
5. Create ticket_item:
   - ticket_id, product_id: course.product_id
   - participant_id, date, time_start, time_end
6. Create group_course_enrollment:
   - instance_id, ticket_item_id, participant_id
   - training_group_id, attendance_status: 'registered'
```

## Changes Summary

| File | Changes |
|------|---------|
| `TestDataGenerator.tsx` | Add group course UI options, update result display |
| `generate-test-bookings/index.ts` | Add group course generation logic, helper functions |

## Technical Notes

- Uses existing `group_course_instances` - requires instances to exist for the weeks being generated
- Creates `training_groups` records for capacity planning
- 70% of group bookings marked as paid
- Names are Swiss/German appropriate
- Backward compatible - existing private lesson generation unchanged
- Falls back gracefully if no active weekly courses exist
