import { Users, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { useBookingWizard } from "@/contexts/BookingWizardContext";
import { InstructorSelection } from "./InstructorSelection";
import { MeetingPointSelection } from "./MeetingPointSelection";
import { CustomerPreferences } from "./CustomerPreferences";
import { BookingNotes } from "./BookingNotes";

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
  } = useBookingWizard();

  const isGroupCourse = state.productType === "group";

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
        <InstructorSelection
          selectedInstructor={state.instructor}
          assignLater={state.assignLater}
          onSelect={setInstructor}
          onAssignLaterChange={setAssignLater}
          selectedDates={state.selectedDates}
          sport={state.sport}
        />
      )}

      <Separator />

      {/* Meeting Point */}
      <MeetingPointSelection
        selectedPoint={state.meetingPoint}
        onChange={setMeetingPoint}
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