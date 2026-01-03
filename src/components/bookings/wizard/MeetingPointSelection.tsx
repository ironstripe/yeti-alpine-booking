import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Lock } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BookingWarnings, type BookingWarning } from "./BookingWarnings";
import {
  MEETING_POINTS,
  isBeginnerLevel,
  canSelectAlternativeMeetingPoint,
} from "@/lib/meeting-point-utils";

interface MeetingPointSelectionProps {
  selectedPoint: string | null;
  onChange: (point: string) => void;
  participantLevels?: (string | null)[];
  instructorId?: string | null;
  selectedDates?: string[];
}

export function MeetingPointSelection({
  selectedPoint,
  onChange,
  participantLevels = [],
  instructorId,
  selectedDates = [],
}: MeetingPointSelectionProps) {
  // Check if all participants are beginners
  const allBeginnersOnly = useMemo(() => {
    if (participantLevels.length === 0) return true;
    return participantLevels.every((level) => isBeginnerLevel(level));
  }, [participantLevels]);

  const canSelectAlternative = useMemo(() => {
    return canSelectAlternativeMeetingPoint(participantLevels);
  }, [participantLevels]);

  // Auto-select Sammelplatz Gorfion for beginners
  useEffect(() => {
    if (allBeginnersOnly && selectedPoint !== "sammelplatz_gorfion") {
      onChange("sammelplatz_gorfion");
    }
  }, [allBeginnersOnly, selectedPoint, onChange]);

  // Fetch instructor's other bookings on the same dates to check meeting point changes
  const { data: instructorOtherBookings = [] } = useQuery({
    queryKey: ["instructor-bookings", instructorId, selectedDates],
    queryFn: async () => {
      if (!instructorId || selectedDates.length === 0) return [];
      
      const { data, error } = await supabase
        .from("ticket_items")
        .select("date, meeting_point, time_start, time_end")
        .eq("instructor_id", instructorId)
        .in("date", selectedDates)
        .not("meeting_point", "is", null)
        .order("time_start");

      if (error) throw error;
      return data || [];
    },
    enabled: !!instructorId && selectedDates.length > 0,
  });

  // Build warnings
  const warnings = useMemo<BookingWarning[]>(() => {
    const result: BookingWarning[] = [];

    // Beginner lock info
    if (allBeginnersOnly && participantLevels.length > 0) {
      result.push({
        id: "beginner-lock",
        type: "info",
        icon: "beginner",
        message: "Anfänger treffen sich am Sammelplatz Gorfion.",
      });
    }

    // Instructor location change warning
    if (instructorOtherBookings.length > 0 && selectedPoint) {
      const otherMeetingPoints = new Set(
        instructorOtherBookings
          .map((b) => b.meeting_point)
          .filter((mp) => mp && mp !== selectedPoint)
      );

      if (otherMeetingPoints.size > 0) {
        const previousLocations = Array.from(otherMeetingPoints)
          .map((id) => MEETING_POINTS.find((p) => p.id === id)?.name || id)
          .join(", ");

        result.push({
          id: "location-change",
          type: "warning",
          icon: "location",
          message: `Hinweis: Lehrer wechselt von ${previousLocations}. Mögliche kurze Verzögerung.`,
        });
      }
    }

    return result;
  }, [allBeginnersOnly, participantLevels.length, instructorOtherBookings, selectedPoint]);

  const selectedMeetingPoint = MEETING_POINTS.find((p) => p.id === selectedPoint);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Treffpunkt
        </h3>
        <p className="text-sm text-muted-foreground">
          Wo sollen sich Teilnehmer und Skilehrer treffen?
        </p>
      </div>

      {/* Warnings */}
      <BookingWarnings warnings={warnings} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MEETING_POINTS.map((point) => {
          const Icon = point.icon;
          const isSelected = selectedPoint === point.id;
          const isDefault = point.id === "sammelplatz_gorfion";
          const isLocked = allBeginnersOnly && !isDefault;

          return (
            <Card
              key={point.id}
              className={cn(
                "cursor-pointer transition-all relative",
                isSelected
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "hover:border-primary/50",
                isLocked && "opacity-50 cursor-not-allowed"
              )}
              onClick={() => {
                if (!isLocked) {
                  onChange(point.id);
                }
              }}
            >
              {isLocked && (
                <div className="absolute top-2 right-2">
                  <Lock className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
              <CardContent className="flex flex-col items-center p-4 text-center">
                <div
                  className={cn(
                    "mb-2 rounded-full p-3",
                    isSelected ? "bg-primary/10" : "bg-muted"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-6 w-6",
                      isSelected ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                </div>
                <span className={cn("font-medium text-sm", isSelected && "text-primary")}>
                  {point.name}
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Location details */}
      {selectedMeetingPoint && (
        <Card className="bg-muted/50">
          <CardContent className="flex items-start gap-3 p-4">
            <MapPin className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">{selectedMeetingPoint.name}</p>
              <p className="text-sm text-muted-foreground">
                {selectedMeetingPoint.description}
              </p>
              <a
                href={`https://www.google.com/maps?q=${selectedMeetingPoint.location}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                Auf Karte anzeigen
              </a>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
