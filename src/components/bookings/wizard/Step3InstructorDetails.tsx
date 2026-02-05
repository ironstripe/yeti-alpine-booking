import { useMemo, useEffect } from "react";
import { Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { useBookingWizard } from "@/contexts/BookingWizardContext";
import { InstructorSelection } from "./InstructorSelection";
import { MeetingPointSelection } from "./MeetingPointSelection";
import { CustomerPreferences } from "./CustomerPreferences";
import { BookingNotes } from "./BookingNotes";
import { AvailabilityStatus } from "./AvailabilityStatus";
import { PeriodDayPlanner } from "./PeriodDayPlanner";
import { useInstructorAvailabilityCheck } from "@/hooks/useInstructorAvailabilityCheck";

export function Step3InstructorDetails() {
  const {
    state,
    setInstructor,
    setAssignLater,
    setMeetingPoint,
    setPreferredInstructorId,
    setLanguage,
    setCustomerNotes,
    setInternalNotes,
    setInstructorNotes,
    setDayInstructorOverride,
    setDayTimeOverride,
    addTimeBlock,
    updateTimeBlock,
    removeTimeBlock,
    removeDayInstructorOverride,
    removeDayTimeOverride,
  } = useBookingWizard();

  const isGroupCourse = state.productType === "group";
  const isMultiDayPrivate = state.productType === "private" && state.selectedDates.length > 1;

  // Availability check for multi-day private lessons
  const { mutate: checkAvailability, data: conflicts, isPending: isCheckingAvailability, reset: resetConflicts } = useInstructorAvailabilityCheck();

  // Trigger availability check when instructor or dates change
  useEffect(() => {
    if (isMultiDayPrivate && state.instructorId && state.selectedDates.length > 1) {
      const sortedDates = [...state.selectedDates].sort();
      const startTime = state.timeSlot?.split(" - ")[0] || "10:00";
      const endTime = state.timeSlot?.split(" - ")[1] || "12:00";
      
      checkAvailability({
        instructorId: state.instructorId,
        startDate: sortedDates[0],
        endDate: sortedDates[sortedDates.length - 1],
        startTime,
        endTime,
      });
    } else {
      resetConflicts();
    }
  }, [state.instructorId, state.selectedDates, state.timeSlot, isMultiDayPrivate]);

  // Extract participant levels for meeting point logic
  const participantLevels = useMemo(() => {
    return state.selectedParticipants.map((p) => p.level_current_season);
  }, [state.selectedParticipants]);

  return (
    <div className="space-y-8 py-6">
      {/* Instructor Selection - only for private lessons */}
      {isGroupCourse ? (
        <Card className="bg-muted/50">
          <CardContent className="flex items-start gap-3 p-4">
            <Users className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">Gruppenkurse werden vom Büro zugeteilt</p>
              <p className="text-sm text-muted-foreground">
                Die Zuweisung erfolgt nach Verfügbarkeit und Erfahrung der Skilehrer.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <InstructorSelection
            selectedInstructor={state.instructor}
            assignLater={state.assignLater}
            onSelect={setInstructor}
            onAssignLaterChange={setAssignLater}
            selectedDates={state.selectedDates}
            sport={state.sport}
          />
          
          {/* Availability check for multi-day period bookings */}
          {isMultiDayPrivate && state.instructorId && !state.assignLater && (
            <AvailabilityStatus
              conflicts={conflicts}
              isLoading={isCheckingAvailability}
              instructorName={state.instructor ? `${state.instructor.first_name} ${state.instructor.last_name}` : undefined}
            />
          )}
          
          {/* Per-day planning for multi-day private lessons */}
          {isMultiDayPrivate && !state.assignLater && (
            <PeriodDayPlanner
              selectedDates={state.selectedDates}
              baseInstructor={state.instructor}
              baseTimeSlot={state.timeSlot}
              dayInstructorOverrides={state.dayInstructorOverrides}
              dayTimeOverrides={state.dayTimeOverrides}
              onInstructorChange={setDayInstructorOverride}
              onTimeChange={setDayTimeOverride}
              onAddTimeBlock={addTimeBlock}
              onUpdateTimeBlock={updateTimeBlock}
              onRemoveTimeBlock={removeTimeBlock}
              onRemoveInstructorOverride={removeDayInstructorOverride}
              onRemoveTimeOverride={removeDayTimeOverride}
              sport={state.sport}
            />
          )}
        </>
      )}

      <Separator />

      {/* Meeting Point - pass participant levels and instructor info */}
      <MeetingPointSelection
        selectedPoint={state.meetingPoint}
        onChange={setMeetingPoint}
        participantLevels={participantLevels}
        instructorId={state.instructorId}
        selectedDates={state.selectedDates}
      />

      <Separator />

      {/* Customer Preferences */}
      <CustomerPreferences
        preferredInstructorId={state.preferredInstructorId}
        language={state.language}
        customerNotes={state.customerNotes}
        onPreferredInstructorChange={setPreferredInstructorId}
        onLanguageChange={setLanguage}
        onCustomerNotesChange={setCustomerNotes}
      />

      <Separator />

      {/* Booking Notes */}
      <BookingNotes
        internalNotes={state.internalNotes}
        instructorNotes={state.instructorNotes}
        onInternalNotesChange={setInternalNotes}
        onInstructorNotesChange={setInstructorNotes}
      />
    </div>
  );
}
