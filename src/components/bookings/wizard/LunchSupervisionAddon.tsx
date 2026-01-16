import { useState, useEffect, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { UtensilsCrossed, Leaf, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { SelectedParticipant } from "@/contexts/BookingWizardContext";

interface LunchSupervisionAddonProps {
  selectedDates: string[];
  participants: SelectedParticipant[];
  lunchSelections: Record<string, string[]>;
  vegetarianSelections: Record<string, boolean>;
  onLunchDaysChange: (participantId: string, days: string[]) => void;
  onVegetarianChange: (participantId: string, isVegetarian: boolean) => void;
  lunchPricePerDay?: number;
}

export function LunchSupervisionAddon({
  selectedDates,
  participants,
  lunchSelections,
  vegetarianSelections,
  onLunchDaysChange,
  onVegetarianChange,
  lunchPricePerDay = 25,
}: LunchSupervisionAddonProps) {
  const [isEnabled, setIsEnabled] = useState(false);

  // Check if any lunch days are already selected
  const hasAnyLunchDays = useMemo(() => {
    return Object.values(lunchSelections).some(days => days.length > 0);
  }, [lunchSelections]);

  // Sync enabled state with selections
  useEffect(() => {
    if (hasAnyLunchDays && !isEnabled) {
      setIsEnabled(true);
    }
  }, [hasAnyLunchDays, isEnabled]);

  // When enabled, pre-select all days for all participants
  useEffect(() => {
    if (isEnabled && !hasAnyLunchDays && selectedDates.length > 0) {
      participants.forEach(p => {
        onLunchDaysChange(p.id, [...selectedDates]);
      });
    }
  }, [isEnabled, hasAnyLunchDays, selectedDates, participants, onLunchDaysChange]);

  // When disabled, clear all selections
  const handleToggle = (checked: boolean) => {
    setIsEnabled(checked);
    if (!checked) {
      participants.forEach(p => {
        onLunchDaysChange(p.id, []);
        onVegetarianChange(p.id, false);
      });
    }
  };

  const toggleDay = (participantId: string, date: string) => {
    const currentDays = lunchSelections[participantId] || [];
    if (currentDays.includes(date)) {
      onLunchDaysChange(participantId, currentDays.filter(d => d !== date));
    } else {
      onLunchDaysChange(participantId, [...currentDays, date].sort());
    }
  };

  const selectAllDays = (participantId: string) => {
    onLunchDaysChange(participantId, [...selectedDates]);
  };

  const deselectAllDays = (participantId: string) => {
    onLunchDaysChange(participantId, []);
  };

  // Calculate totals
  const totalLunchDays = useMemo(() => {
    return Object.values(lunchSelections).reduce((sum, days) => sum + days.length, 0);
  }, [lunchSelections]);

  const totalLunchPrice = totalLunchDays * lunchPricePerDay;

  const sortedDates = [...selectedDates].sort();

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header Toggle */}
      <div
        className={cn(
          "flex items-center justify-between p-4 cursor-pointer transition-colors",
          isEnabled ? "bg-primary/5 border-b" : "hover:bg-muted/50"
        )}
        onClick={() => handleToggle(!isEnabled)}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "p-2 rounded-lg",
              isEnabled ? "bg-primary/10 text-primary" : "bg-muted"
            )}
          >
            <UtensilsCrossed className="h-5 w-5" />
          </div>
          <div>
            <div className="font-medium">Mittagsbetreuung</div>
            <div className="text-sm text-muted-foreground">
              Betreuung inkl. Mittagessen (12:00 – 14:00 Uhr)
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            CHF {lunchPricePerDay}.– / Tag
          </span>
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>

      {/* Expanded Content */}
      {isEnabled && sortedDates.length > 0 && (
        <div className="p-4 space-y-4">
          {participants.map((participant) => {
            const participantLunchDays = lunchSelections[participant.id] || [];
            const isVegetarian = vegetarianSelections[participant.id] || false;

            return (
              <div
                key={participant.id}
                className="p-4 bg-muted/30 rounded-lg space-y-3"
              >
                {/* Participant Header */}
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {participant.first_name} {participant.last_name || ""}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => selectAllDays(participant.id)}
                      disabled={participantLunchDays.length === sortedDates.length}
                    >
                      Alle
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => deselectAllDays(participant.id)}
                      disabled={participantLunchDays.length === 0}
                    >
                      Keine
                    </Button>
                  </div>
                </div>

                {/* Day Selection */}
                <div className="flex flex-wrap gap-2">
                  {sortedDates.map((date) => {
                    const isSelected = participantLunchDays.includes(date);
                    const dayLabel = format(parseISO(date), "EEE", { locale: de });
                    const dateLabel = format(parseISO(date), "d.", { locale: de });

                    return (
                      <button
                        key={date}
                        type="button"
                        onClick={() => toggleDay(participant.id, date)}
                        className={cn(
                          "flex flex-col items-center justify-center w-14 h-14 rounded-lg border-2 transition-all",
                          isSelected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-muted hover:border-primary/50 bg-background"
                        )}
                      >
                        <span className="text-[10px] uppercase font-medium">
                          {dayLabel}
                        </span>
                        <span className="text-sm font-semibold">{dateLabel}</span>
                        {isSelected && <Check className="h-3 w-3 mt-0.5" />}
                      </button>
                    );
                  })}
                </div>

                {/* Vegetarian Option - Only visible when days are selected */}
                {participantLunchDays.length > 0 && (
                  <div className="flex items-center gap-4 pt-2 border-t">
                    <span className="text-sm text-muted-foreground">
                      Verpflegung:
                    </span>
                    <RadioGroup
                      value={isVegetarian ? "vegetarian" : "normal"}
                      onValueChange={(v) =>
                        onVegetarianChange(participant.id, v === "vegetarian")
                      }
                      className="flex gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem
                          value="normal"
                          id={`normal-${participant.id}`}
                        />
                        <Label
                          htmlFor={`normal-${participant.id}`}
                          className="text-sm cursor-pointer"
                        >
                          Normal
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem
                          value="vegetarian"
                          id={`veg-${participant.id}`}
                        />
                        <Label
                          htmlFor={`veg-${participant.id}`}
                          className="text-sm flex items-center gap-1 cursor-pointer"
                        >
                          <Leaf className="h-3 w-3 text-green-600" />
                          Vegetarisch
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                )}

                {/* Per-Participant Summary */}
                {participantLunchDays.length > 0 && (
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <span>
                      {participantLunchDays.length}{" "}
                      {participantLunchDays.length === 1 ? "Tag" : "Tage"} × CHF{" "}
                      {lunchPricePerDay} = CHF{" "}
                      {participantLunchDays.length * lunchPricePerDay}
                    </span>
                    {isVegetarian && (
                      <Badge variant="outline" className="text-green-600 border-green-200">
                        <Leaf className="h-3 w-3 mr-1" />
                        Vegetarisch
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Total Summary */}
          {totalLunchDays > 0 && (
            <div className="flex justify-between items-center pt-3 border-t font-medium">
              <span>Mittagsbetreuung Total:</span>
              <span className="text-lg">CHF {totalLunchPrice.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}

      {/* No course days selected warning */}
      {isEnabled && sortedDates.length === 0 && (
        <div className="p-4 text-sm text-muted-foreground">
          Bitte zuerst Kurstage auswählen.
        </div>
      )}
    </div>
  );
}
