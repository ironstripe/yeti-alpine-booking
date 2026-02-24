import { format } from "date-fns";
import { de } from "date-fns/locale";
import { User, Users, Calendar, MapPin, MessageSquare, GraduationCap, UtensilsCrossed, Leaf } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { useBookingWizard, WizardStep } from "@/contexts/BookingWizardContext";
import { calculateAge, getAgeDisplay, getLevelLabel } from "@/lib/participant-utils";
import { formatPhoneDisplay } from "@/lib/phone-utils";
import { getLevelLabel as getInstructorLevel } from "@/lib/instructor-utils";
import { getSpecializationLabel } from "@/hooks/useInstructors";
import { InlineTimeBlockEditor } from "./InlineTimeBlockEditor";

// Helper to format dates as short day names
const formatDayNames = (dates: string[]): string => {
  const dayAbbreviations: Record<string, string> = {
    "Mo": "Mo", "Di": "Di", "Mi": "Mi", "Do": "Do", "Fr": "Fr", "Sa": "Sa", "So": "So"
  };
  return dates
    .map(d => format(new Date(d), "EEE", { locale: de }))
    .map(day => dayAbbreviations[day] || day)
    .join(", ");
};

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
          <Button variant="ghost" size="sm" onClick={() => onEditStep(2)}>
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
                {state.customer.phone && ` · ${formatPhoneDisplay(state.customer.phone)}`}
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
          <Button variant="ghost" size="sm" onClick={() => onEditStep(2)}>
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
          <Button variant="ghost" size="sm" onClick={() => onEditStep(1)}>
            Ändern
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <p className="font-medium">
            {state.productType === "private" ? "Privatstunde" : "Gruppenkurs"}
            {state.duration && ` · ${state.duration} Stunden`}
            {state.sport && ` · ${state.sport === "snowboard" ? "Snowboard" : "Ski"}`}
          </p>
          
          {/* Multi-group: show per-group time info */}
          {state.productType === "private" && state.privateGroupProposal && state.privateGroupProposal.groups.length > 1 ? (
            <div className="space-y-3">
              {state.privateGroupProposal.groups.map((group, idx) => {
                const groupParticipants = state.selectedParticipants.filter(p => group.participantIds.includes(p.id));
                const gStart = group.startTime || state.timeSlot?.split(" - ")[0] || "10:00";
                const gEnd = group.endTime || state.timeSlot?.split(" - ")[1] || "12:00";
                return (
                  <div key={group.id} className="rounded-lg border p-2 space-y-1">
                    <p className="text-sm font-medium">
                      Gruppe {idx + 1}: {gStart} - {gEnd}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {groupParticipants.map(p => p.first_name).join(", ")}
                    </p>
                  </div>
                );
              })}
              <div className="space-y-1">
                {state.selectedDates.sort().map((dateStr) => (
                  <div key={dateStr} className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{format(new Date(dateStr), "EEE, dd.MM.yyyy", { locale: de })}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {state.selectedDates.sort().map((dateStr) => {
                const date = new Date(dateStr);
                const [baseStart, baseEnd] = state.timeSlot?.split(" - ") || ["10:00", "12:00"];
                
                return (
                  <div key={dateStr} className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>{format(date, "EEE, dd.MM.yyyy", { locale: de })}</span>
                    </div>
                    
                    {state.productType === "private" ? (
                      <InlineTimeBlockEditor
                        dateStr={dateStr}
                        baseStartTime={baseStart}
                        baseEndTime={baseEnd}
                        duration={state.duration}
                      />
                    ) : (
                      state.timeSlot && (
                        <div className="ml-6 text-sm text-muted-foreground">
                          {state.timeSlot}
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lunch Care Card - Only for group courses with lunch selections */}
      {state.productType === "group" && (() => {
        // Collect lunch data from either individual or shared mode
        const lunchData: Array<{
          participantId: string;
          participantName: string;
          days: string[];
          isVegetarian: boolean;
        }> = [];
        
        if (state.useParticipantSpecificBooking && Object.keys(state.participantBookings).length > 0) {
          for (const participant of state.selectedParticipants) {
            const booking = state.participantBookings[participant.id];
            if (booking && booking.lunchDays.length > 0) {
              lunchData.push({
                participantId: participant.id,
                participantName: `${participant.first_name} ${participant.last_name || ""}`.trim(),
                days: booking.lunchDays,
                isVegetarian: booking.isVegetarian,
              });
            }
          }
        } else {
          for (const participant of state.selectedParticipants) {
            const days = state.lunchSelections[participant.id] || [];
            if (days.length > 0) {
              lunchData.push({
                participantId: participant.id,
                participantName: `${participant.first_name} ${participant.last_name || ""}`.trim(),
                days: days,
                isVegetarian: state.vegetarianSelections[participant.id] || false,
              });
            }
          }
        }
        
        if (lunchData.length === 0) return null;
        
        return (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Mittagsbetreuung
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => onEditStep(1)}>
                Ändern
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {lunchData.map((item) => (
                <div key={item.participantId} className="flex items-start gap-3">
                  <UtensilsCrossed className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <span className="font-medium">{item.participantName}</span>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{formatDayNames(item.days)}</span>
                      {item.isVegetarian && (
                        <Badge variant="secondary" className="bg-green-100 text-green-800 gap-1 text-xs">
                          <Leaf className="h-3 w-3" />
                          Vegetarisch
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })()}

      {/* Instructor & Details Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Skilehrer & Details
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => onEditStep(1)}>
            Ändern
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {/* Multi-group instructor summary */}
          {state.privateGroupProposal && state.privateGroupProposal.groups.length > 1 ? (
            <div className="space-y-2">
              {state.privateGroupProposal.groups.map((group, idx) => {
                const groupParticipants = state.selectedParticipants.filter(p => group.participantIds.includes(p.id));
                return (
                  <div key={group.id} className="flex items-start gap-2">
                    <GraduationCap className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">
                        Gruppe {idx + 1}: {group.instructor
                          ? `${group.instructor.first_name} ${group.instructor.last_name}`
                          : "Wird später zugewiesen"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {groupParticipants.map(p => p.first_name).join(", ")}
                        {group.startTime && group.endTime && ` · ${group.startTime} - ${group.endTime}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Single instructor */
            state.productType === "private" && (
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
            )
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