import { format } from "date-fns";
import { de } from "date-fns/locale";
import { User, Users, Calendar, MapPin, MessageSquare, GraduationCap } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { useBookingWizard, WizardStep } from "@/contexts/BookingWizardContext";
import { calculateAge, getAgeDisplay, getLevelLabel } from "@/lib/participant-utils";
import { getLevelLabel as getInstructorLevel } from "@/lib/instructor-utils";
import { getSpecializationLabel } from "@/hooks/useInstructors";

interface BookingSummaryCardsProps {
  onEditStep: (step: WizardStep) => void;
}

const MEETING_POINT_LABELS: Record<string, string> = {
  hotel_gorfion: "Hotel Gorfion",
  malbipark: "Malbipark",
  kasse_taeli: "Kasse Täli",
};

const LANGUAGE_LABELS: Record<string, string> = {
  de: "Deutsch",
  en: "English",
  fr: "Français",
  it: "Italiano",
};

export function BookingSummaryCards({ onEditStep }: BookingSummaryCardsProps) {
  const { state } = useBookingWizard();

  return (
    <div className="space-y-4">
      {/* Customer Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Kunde
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => onEditStep(1)}>
            Ändern
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          {state.customer && (
            <div className="space-y-1">
              <p className="font-medium">
                {state.customer.first_name} {state.customer.last_name}
              </p>
              <p className="text-sm text-muted-foreground">
                {state.customer.email}
                {state.customer.phone && ` · ${state.customer.phone}`}
              </p>
              {(state.customer.street || state.customer.city) && (
                <p className="text-sm text-muted-foreground">
                  {[state.customer.street, state.customer.zip, state.customer.city, state.customer.country]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Participants Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Teilnehmer
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => onEditStep(1)}>
            Ändern
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {state.selectedParticipants.map((participant) => (
            <div key={participant.id} className="flex items-center gap-3">
              <User className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <span className="font-medium">
                  {participant.first_name} {participant.last_name}
                </span>
                {participant.isGuest && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    Gast
                  </Badge>
                )}
              </div>
              <span className="text-sm text-muted-foreground">
                {getAgeDisplay(calculateAge(participant.birth_date))} ·{" "}
                {getLevelLabel(participant.level_current_season || participant.level_last_season)} ·{" "}
                {participant.sport === "snowboard" ? "Snowboard" : "Ski"}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Course Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Kurs
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => onEditStep(2)}>
            Ändern
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <p className="font-medium">
            {state.productType === "private" ? "Privatstunde" : "Gruppenkurs"}
            {state.duration && ` · ${state.duration} Stunden`}
            {state.sport && ` · ${state.sport === "snowboard" ? "Snowboard" : "Ski"}`}
          </p>
          <div className="space-y-1">
            {state.selectedDates.map((dateStr) => {
              const date = new Date(dateStr);
              return (
                <div key={dateStr} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>{format(date, "EEE, dd.MM.yyyy", { locale: de })}</span>
                  {state.timeSlot && <span>{state.timeSlot}</span>}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Instructor & Details Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Skilehrer & Details
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => onEditStep(3)}>
            Ändern
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {/* Instructor */}
          {state.productType === "private" && (
            <div className="flex items-start gap-2">
              <GraduationCap className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                {state.instructor ? (
                  <>
                    <p className="font-medium">
                      {state.instructor.first_name} {state.instructor.last_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {getInstructorLevel(state.instructor.level)} ·{" "}
                      {state.instructor.languages?.map((l) => LANGUAGE_LABELS[l] || l).join(", ")}
                    </p>
                  </>
                ) : state.assignLater ? (
                  <p className="text-muted-foreground">Wird später zugewiesen</p>
                ) : (
                  <p className="text-muted-foreground">Kein Skilehrer ausgewählt</p>
                )}
              </div>
            </div>
          )}

          {/* Meeting Point */}
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span>Treffpunkt: {MEETING_POINT_LABELS[state.meetingPoint || ""] || state.meetingPoint}</span>
          </div>

          {/* Language */}
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span>Unterrichtssprache: {LANGUAGE_LABELS[state.language] || state.language}</span>
          </div>

          {/* Customer Notes */}
          {state.customerNotes && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-sm">
                <span className="font-medium">Kundenwunsch: </span>
                "{state.customerNotes}"
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}