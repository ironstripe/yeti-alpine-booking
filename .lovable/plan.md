

# Group Course Planning Frontend UI

## Overview

This plan implements a comprehensive weekly planning interface for office staff to manage group course instructor assignments. The new page will be located at `/trainings/planning` (within the existing admin routes structure rather than `/admin/planning/groups` since the app doesn't have an `/admin` route prefix).

The UI will provide:
- Week-by-week navigation with date range display
- Generate instances button for target weeks
- Copy assignments from previous week functionality
- List of all courses with instructor assignment dropdowns
- Daily override modal for fine-grained control
- Summary statistics showing assignment completion

---

## Architecture Overview

```text
+-----------------------------------------------------------+
|                  WEEK NAVIGATION BAR                       |
|  [<] KW 5: 27. Jan - 02. Feb 2025 [>] [Heute]             |
|  [Woche generieren] [Von Vorwoche kopieren]                |
+-----------------------------------------------------------+
|                   SUMMARY STATS CARD                       |
|  Zuweisungsstatus: 7/10 Kurse zugewiesen (70%)            |
+-----------------------------------------------------------+
|                                                           |
|  +---------------------------+  +---------------------------+
|  | BLAUER PRINZ             |  | ROTER PRINZ              |
|  | Ski · Anfänger           |  | Ski · Fortgeschritten    |
|  | Mo-Fr 10:00-12:00        |  | Mo-Fr 10:00-12:00        |
|  | 8/12 Plätze              |  | 5/10 Plätze              |
|  |--------------------------|  |--------------------------|
|  | Lehrer:                  |  | Lehrer:                  |
|  | [Select: Max Müller ▼]   |  | [Select: Anna S. ▼]      |
|  | Hilfskraft:              |  | Hilfskraft:              |
|  | [Select: (keine) ▼]      |  | [Select: (keine) ▼]      |
|  | [Zuweisen] [Details]     |  | [Zuweisen] [Details]     |
|  +---------------------------+  +---------------------------+
|                                                           |
+-----------------------------------------------------------+
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/pages/GroupCoursePlanning.tsx` | Main planning page with week navigation |
| `src/components/planning/GroupPlanningHeader.tsx` | Week navigation and action buttons |
| `src/components/planning/GroupPlanningStats.tsx` | Summary statistics card |
| `src/components/planning/GroupPlanningCourseCard.tsx` | Individual course assignment card |
| `src/components/planning/DailyAssignmentModal.tsx` | Modal for per-day overrides |
| `src/hooks/useGroupPlanningData.ts` | Dedicated hook for planning view data |

## Files to Modify

| File | Changes |
|------|---------|
| `src/App.tsx` | Add route for `/trainings/planning` |
| `src/components/layout/AppSidebar.tsx` | Add navigation link to planning page |

---

## Technical Implementation

### 1. Create Planning Data Hook (`src/hooks/useGroupPlanningData.ts`)

This hook fetches all active group courses with their instances for a given week, including instructor assignments.

```typescript
interface GroupPlanningCourse {
  id: string;
  name: string;
  color: string;
  skillLevelId: string;
  skillLevelName: string;
  discipline: 'ski' | 'snowboard' | 'both';
  maxParticipants: number;
  meetingPoint: string | null;
  schedules: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }[];
  instances: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    instructorId: string | null;
    instructorName: string | null;
    assistantId: string | null;
    assistantName: string | null;
    currentParticipants: number;
  }[];
  // Computed: primary instructor for the week (if all same)
  weeklyInstructorId: string | null;
  weeklyAssistantId: string | null;
  // Assignment status
  isFullyAssigned: boolean;
  totalInstances: number;
  assignedInstances: number;
  totalParticipants: number;
}

interface UseGroupPlanningDataReturn {
  courses: GroupPlanningCourse[];
  isLoading: boolean;
  hasInstances: boolean;
  stats: {
    totalCourses: number;
    fullyAssigned: number;
    partiallyAssigned: number;
    unassigned: number;
    totalParticipants: number;
  };
}
```

**Query Strategy:**
1. Fetch all active `group_courses` with schedules and skill level info
2. Fetch all `group_course_instances` for the week range with instructor joins
3. Aggregate data to determine weekly instructor (if consistent across instances)
4. Calculate assignment status per course

### 2. Create Main Page (`src/pages/GroupCoursePlanning.tsx`)

```typescript
// Main features:
// - useState for currentWeek (Monday of the week)
// - useGroupPlanningData(currentWeek) for course list
// - useInstructors() for instructor dropdown options
// - useGenerateInstances(), useCopyPreviousWeekAssignments() mutations
// - Responsive grid layout of GroupPlanningCourseCard components
```

**Layout Structure:**
```tsx
<>
  <PageHeader
    title="Gruppenplanung"
    description="Wochenweise Lehrerzuweisung für Gruppenkurse"
  />
  
  <GroupPlanningHeader
    weekStart={currentWeek}
    onWeekChange={setCurrentWeek}
    onGenerate={() => generateMutation.mutate({ weekStart: currentWeek })}
    onCopyFromPrevious={() => copyMutation.mutate({ targetWeekStart: currentWeek })}
    isGenerating={generateMutation.isPending}
    isCopying={copyMutation.isPending}
    hasInstances={data.hasInstances}
  />

  <GroupPlanningStats stats={data.stats} />

  {data.isLoading ? (
    <LoadingSkeleton />
  ) : !data.hasInstances ? (
    <EmptyState onGenerate={handleGenerate} />
  ) : (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {data.courses.map(course => (
        <GroupPlanningCourseCard
          key={course.id}
          course={course}
          weekStart={currentWeek}
          instructors={instructors}
          onDetailsClick={() => setSelectedCourse(course)}
        />
      ))}
    </div>
  )}

  <DailyAssignmentModal
    open={!!selectedCourse}
    onOpenChange={() => setSelectedCourse(null)}
    course={selectedCourse}
    weekStart={currentWeek}
    instructors={instructors}
  />
</>
```

### 3. Create Header Component (`src/components/planning/GroupPlanningHeader.tsx`)

```typescript
interface GroupPlanningHeaderProps {
  weekStart: Date;
  onWeekChange: (date: Date) => void;
  onGenerate: () => void;
  onCopyFromPrevious: () => void;
  isGenerating: boolean;
  isCopying: boolean;
  hasInstances: boolean;
}
```

**Features:**
- Chevron buttons for prev/next week navigation
- Display "KW {n}: {start} - {end}" formatted
- "Heute" button to jump to current week
- "Woche generieren" button (primary, disabled if instances exist)
- "Von Vorwoche kopieren" button (secondary, disabled if no instances)
- Loading spinners on action buttons during mutations

### 4. Create Stats Component (`src/components/planning/GroupPlanningStats.tsx`)

Simple card showing:
- Total courses for the week
- Courses fully assigned / partially / unassigned with color coding
- Total participants across all instances
- Progress bar visual

```tsx
<Card>
  <CardContent className="py-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <span className="text-sm">{stats.fullyAssigned} zugewiesen</span>
        </div>
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-amber-500" />
          <span className="text-sm">{stats.partiallyAssigned} teilweise</span>
        </div>
        <div className="flex items-center gap-2">
          <XCircle className="h-5 w-5 text-red-500" />
          <span className="text-sm">{stats.unassigned} offen</span>
        </div>
      </div>
      <div className="text-sm text-muted-foreground">
        {stats.totalParticipants} Teilnehmer insgesamt
      </div>
    </div>
  </CardContent>
</Card>
```

### 5. Create Course Card (`src/components/planning/GroupPlanningCourseCard.tsx`)

```typescript
interface GroupPlanningCourseCardProps {
  course: GroupPlanningCourse;
  weekStart: Date;
  instructors: Instructor[];
  onDetailsClick: () => void;
}
```

**Features:**
- Color bar at top (from course.color)
- Course name, skill level badge, discipline badge
- Schedule summary (e.g., "Mo-Fr 10:00-12:00")
- Participant count with progress bar
- Two Select dropdowns: main instructor and assistant
- Status indicator: green check if fully assigned, amber warning if partial, red if unassigned
- "Zuweisen" button calls `useBulkAssignInstructor` mutation
- "Details" button opens DailyAssignmentModal

```tsx
<Card className={cn(
  "overflow-hidden",
  !course.isFullyAssigned && "border-amber-300"
)}>
  <div className="h-2" style={{ backgroundColor: course.color }} />
  <CardHeader className="pb-2">
    <div className="flex items-start justify-between">
      <h3 className="font-semibold">{course.name}</h3>
      <AssignmentStatusBadge course={course} />
    </div>
    <div className="flex gap-1.5 mt-1">
      <Badge variant="outline">{course.skillLevelName}</Badge>
      <Badge variant="outline">{course.discipline}</Badge>
    </div>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* Schedule info */}
    {/* Participant bar */}
    
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Lehrer</Label>
        <Select value={selectedInstructor} onValueChange={setSelectedInstructor}>
          <SelectTrigger className={!selectedInstructor ? 'border-destructive' : ''}>
            <SelectValue placeholder="Lehrer wählen..." />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            {instructors.map(i => (
              <SelectItem key={i.id} value={i.id}>
                {i.first_name} {i.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Hilfskraft</Label>
        <Select value={selectedAssistant} onValueChange={setSelectedAssistant}>
          <SelectTrigger>
            <SelectValue placeholder="(keine)" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="">Keine</SelectItem>
            {instructors.map(i => (
              <SelectItem key={i.id} value={i.id}>
                {i.first_name} {i.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>

    <div className="flex gap-2 pt-2">
      <Button 
        onClick={handleAssign}
        disabled={!selectedInstructor || isPending}
        className="flex-1"
      >
        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Zuweisen
      </Button>
      <Button variant="outline" onClick={onDetailsClick}>
        Details
      </Button>
    </div>
  </CardContent>
</Card>
```

### 6. Create Daily Assignment Modal (`src/components/planning/DailyAssignmentModal.tsx`)

```typescript
interface DailyAssignmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course: GroupPlanningCourse | null;
  weekStart: Date;
  instructors: Instructor[];
}
```

**Features:**
- Modal (shadcn Dialog) showing daily breakdown
- Table/grid with one row per instance (date + time slot)
- Each row has instructor and assistant dropdowns
- Uses `useAssignInstructor` mutation for individual instance updates
- Shows visual indicator if instructor differs from weekly assignment
- "Alle wie Woche" button to reset all days to weekly assignment

```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="max-w-2xl">
    <DialogHeader>
      <DialogTitle>
        <span className="inline-block w-3 h-3 rounded-full mr-2" 
              style={{ backgroundColor: course.color }} />
        {course.name} - Tagesdetails
      </DialogTitle>
      <DialogDescription>
        KW {weekNumber}: {format(weekStart, 'd.')} - {format(weekEnd, 'd. MMMM yyyy')}
      </DialogDescription>
    </DialogHeader>
    
    <div className="space-y-3 max-h-[60vh] overflow-y-auto">
      {course.instances.map(instance => (
        <div key={instance.id} className="flex items-center gap-4 p-3 border rounded-lg">
          <div className="w-32">
            <div className="font-medium">
              {format(parseISO(instance.date), 'EEE, d.M.')}
            </div>
            <div className="text-sm text-muted-foreground">
              {instance.startTime} - {instance.endTime}
            </div>
          </div>
          
          <div className="flex-1 grid grid-cols-2 gap-3">
            <Select
              value={instance.instructorId || ''}
              onValueChange={(v) => handleInstanceAssign(instance.id, v, false)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Lehrer..." />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="">Nicht zugewiesen</SelectItem>
                {instructors.map(i => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.first_name} {i.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select
              value={instance.assistantId || ''}
              onValueChange={(v) => handleInstanceAssign(instance.id, v, true)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Hilfskraft..." />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="">Keine</SelectItem>
                {instructors.map(i => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.first_name} {i.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="text-sm text-muted-foreground">
            {instance.currentParticipants} TN
          </div>
        </div>
      ))}
    </div>
    
    <DialogFooter>
      <Button variant="outline" onClick={() => onOpenChange(false)}>
        Schliessen
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 7. Routing Update (`src/App.tsx`)

Add the new route within the AppLayout protected routes:

```tsx
import GroupCoursePlanning from "./pages/GroupCoursePlanning";

// Inside the <Route element={<AppLayout />}> block:
<Route path="trainings/planning" element={<GroupCoursePlanning />} />
```

### 8. Navigation Update (`src/components/layout/AppSidebar.tsx`)

Add a link to the planning page in the Trainings section or as a sub-item:

```tsx
// In the navigation items array, find the Trainings section
{
  title: "Trainings",
  href: "/trainings",
  icon: GraduationCap,
  children: [
    { title: "Übersicht", href: "/trainings" },
    { title: "Wochenplanung", href: "/trainings/planning" },
  ]
}
```

---

## State Management

### Week State
- `currentWeek: Date` - Always points to Monday of selected week
- Navigation updates via `startOfWeek(addWeeks(currentWeek, 1))`

### Assignment State (per card)
- Local state for `selectedInstructor` and `selectedAssistant`
- Initialize from `course.weeklyInstructorId` when available
- "Zuweisen" button triggers `useBulkAssignInstructor` mutation
- On success, invalidate `['group-planning', weekStartString]` query

### Modal State
- `selectedCourse: GroupPlanningCourse | null`
- Individual instance updates use `useAssignInstructor` mutation
- Immediate optimistic updates for better UX

---

## Query Keys

| Key | Purpose |
|-----|---------|
| `['group-planning', weekStartString]` | Main planning data for a week |
| `['group-course-instances', courseId, weekStartString]` | Per-course instances (reused) |
| `['instructors']` | All instructors for dropdowns |

Invalidation pattern:
- Generate instances → invalidate `['group-planning', weekStartString]`
- Copy assignments → invalidate `['group-planning', weekStartString]`
- Bulk assign → invalidate `['group-planning', weekStartString]`
- Single instance assign → invalidate both planning and instances queries

---

## German UI Labels

| Component | Label |
|-----------|-------|
| Page title | Gruppenplanung |
| Description | Wochenweise Lehrerzuweisung für Gruppenkurse |
| Generate button | Woche generieren |
| Copy button | Von Vorwoche kopieren |
| Today button | Heute |
| Instructor label | Lehrer |
| Assistant label | Hilfskraft |
| Assign button | Zuweisen |
| Details button | Details |
| Fully assigned | Zugewiesen |
| Partially assigned | Teilweise zugewiesen |
| Not assigned | Nicht zugewiesen |
| Participants | Teilnehmer |
| Close button | Schliessen |
| Empty state | Keine Instanzen für diese Woche. Klicke "Woche generieren" um zu starten. |

---

## Loading & Error States

1. **Page Loading**: Skeleton cards with shimmer animation
2. **Action Loading**: Spinner on button + button disabled
3. **Empty State**: Illustration + prompt to generate
4. **Error Toast**: German error messages from mutations

---

## Edge Cases

1. **No Courses Active**: Show message "Keine aktiven Gruppenkurse vorhanden"
2. **Week Already Generated**: "Woche generieren" shows "(bereits generiert)" or is disabled
3. **No Previous Week Data**: "Von Vorwoche kopieren" disabled with tooltip explanation
4. **Instructor Conflicts**: Could add warning if instructor assigned to overlapping instances (future enhancement)
5. **Saturday Courses**: Filter out or show separately (they use `training_course_dates` instead)

---

## Testing Checklist

1. **Page Navigation**
   - Navigate to `/trainings/planning`
   - Verify current week is displayed correctly
   - Navigate prev/next weeks with chevrons
   - Click "Heute" to return to current week

2. **Generate Instances**
   - Navigate to future week with no instances
   - Click "Woche generieren"
   - Verify success toast with count
   - Verify course cards appear

3. **Weekly Assignment**
   - Select instructor from dropdown
   - Click "Zuweisen"
   - Verify success toast
   - Refresh page and verify persistence
   - Verify status indicator changes to green

4. **Copy Assignments**
   - Set up assignments in week A
   - Navigate to week B
   - Generate instances for week B
   - Click "Von Vorwoche kopieren"
   - Verify assignments match week A

5. **Daily Override**
   - Click "Details" on a course card
   - Change instructor for one day
   - Verify card still shows weekly instructor
   - Verify modal shows the override

6. **UI Feedback**
   - Verify loading spinners during mutations
   - Verify buttons disabled during loading
   - Verify error toasts on failures

