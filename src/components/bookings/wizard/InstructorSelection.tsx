import { useMemo } from "react";
import { User, Star, Check, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { useInstructors, getStatusConfig, getSpecializationLabel } from "@/hooks/useInstructors";
import { getLevelLabel } from "@/lib/instructor-utils";
import type { Tables } from "@/integrations/supabase/types";

interface InstructorSelectionProps {
  selectedInstructor: Tables<"instructors"> | null;
  assignLater: boolean;
  onSelect: (instructor: Tables<"instructors"> | null) => void;
  onAssignLaterChange: (value: boolean) => void;
  selectedDates: string[];
  sport: "ski" | "snowboard" | null;
}

const LANGUAGE_LABELS: Record<string, string> = {
  de: "Deutsch",
  en: "English",
  fr: "Français",
  it: "Italiano",
};

export function InstructorSelection({
  selectedInstructor,
  assignLater,
  onSelect,
  onAssignLaterChange,
  selectedDates,
  sport,
}: InstructorSelectionProps) {
  const { data: instructors, isLoading, pulsingIds } = useInstructors();
  const [showAll, setShowAll] = useState(false);

  // Sort instructors by optimization score (Fill-Before-Activate logic)
  const sortedInstructors = useMemo(() => {
    if (!instructors) return [];

    // Filter by sport if specified
    let filtered = instructors.filter((i) => i.status === "active");
    if (sport) {
      filtered = filtered.filter(
        (i) => i.specialization === sport || i.specialization === "both"
      );
    }

    // Sort by: 1. Has bookings on selected dates 2. Available 3. On-call 4. Others
    return filtered.sort((a, b) => {
      // Priority 1: Real-time status
      const statusOrder = { available: 0, on_call: 1, unavailable: 2 };
      const aStatus = statusOrder[a.real_time_status as keyof typeof statusOrder] ?? 2;
      const bStatus = statusOrder[b.real_time_status as keyof typeof statusOrder] ?? 2;

      if (aStatus !== bStatus) return aStatus - bStatus;

      // Priority 2: Has today's bookings (fill first)
      if (a.todayBookingsCount > 0 && b.todayBookingsCount === 0) return -1;
      if (b.todayBookingsCount > 0 && a.todayBookingsCount === 0) return 1;

      // Priority 3: Alphabetical
      return a.last_name.localeCompare(b.last_name);
    });
  }, [instructors, sport]);

  const displayedInstructors = showAll
    ? sortedInstructors
    : sortedInstructors.slice(0, 5);

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const getAvailabilityNote = (instructor: Tables<"instructors"> & { todayBookingsCount: number }) => {
    if (instructor.todayBookingsCount > 0) {
      return `Bereits ${instructor.todayBookingsCount}h heute → optimal auffüllen`;
    }
    if (instructor.real_time_status === "available") {
      return "Verfügbar an allen Tagen";
    }
    if (instructor.real_time_status === "on_call") {
      return "Auf Abruf";
    }
    return "Nicht verfügbar";
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-20 rounded bg-muted" />
            <div className="h-20 rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Skilehrer
        </h3>
        <p className="text-sm text-muted-foreground">
          Wer soll den Unterricht geben?
        </p>
      </div>

      {/* Smart recommendation hint */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center gap-2 p-3">
          <Star className="h-4 w-4 text-primary" />
          <p className="text-sm text-muted-foreground">
            Empfehlung basierend auf Verfügbarkeit
          </p>
        </CardContent>
      </Card>

      {/* Instructor list */}
      <div className="space-y-3">
        {displayedInstructors.map((instructor, index) => {
          const statusConfig = getStatusConfig(instructor.real_time_status);
          const isSelected = selectedInstructor?.id === instructor.id;
          const isPulsing = pulsingIds.has(instructor.id);
          const isRecommended = index === 0;

          return (
            <Card
              key={instructor.id}
              className={`cursor-pointer transition-all ${
                isSelected
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "hover:border-primary/50"
              } ${isPulsing ? "animate-pulse" : ""}`}
              onClick={() => onSelect(instructor)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Status dot + Avatar */}
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-muted text-sm">
                        {getInitials(instructor.first_name, instructor.last_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${statusConfig.color}`}
                    />
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {instructor.first_name} {instructor.last_name}
                      </span>
                      {isRecommended && (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <Star className="h-3 w-3" />
                          Empfohlen
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {getLevelLabel(instructor.level)} ·{" "}
                      {getSpecializationLabel(instructor.specialization)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {getAvailabilityNote(instructor)}
                    </p>
                    {instructor.languages && instructor.languages.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {instructor.languages
                          .map((l) => LANGUAGE_LABELS[l] || l)
                          .join(", ")}
                      </p>
                    )}
                  </div>

                  {/* Selection indicator */}
                  <div className="flex-shrink-0">
                    {isSelected ? (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-4 w-4" />
                      </div>
                    ) : (
                      <Button variant="outline" size="sm">
                        Wählen
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Show all toggle */}
      {sortedInstructors.length > 5 && (
        <Collapsible open={showAll} onOpenChange={setShowAll}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full gap-2">
              {showAll ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  Weniger anzeigen
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  Alle {sortedInstructors.length} Skilehrer anzeigen
                </>
              )}
            </Button>
          </CollapsibleTrigger>
        </Collapsible>
      )}

      {/* Assign later option */}
      <div className="flex items-center gap-3 rounded-lg border p-4">
        <Checkbox
          id="assign-later"
          checked={assignLater}
          onCheckedChange={(checked) => onAssignLaterChange(checked === true)}
        />
        <label htmlFor="assign-later" className="cursor-pointer text-sm">
          Später zuweisen (Buchung ohne Skilehrer erstellen)
        </label>
      </div>
    </div>
  );
}