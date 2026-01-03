import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, differenceInYears } from "date-fns";
import { de } from "date-fns/locale";
import {
  Clock,
  CalendarDays,
  Info,
  ArrowRight,
  MapPin,
  Users,
  Globe,
  Check,
  Search,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useBookingWizard } from "@/contexts/BookingWizardContext";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookingWarnings, type BookingWarning } from "./BookingWarnings";
import { MiniSchedulerGrid } from "./MiniSchedulerGrid";
import {
  MEETING_POINTS,
  isBeginnerLevel,
  canSelectAlternativeMeetingPoint,
} from "@/lib/meeting-point-utils";
import { LEVEL_OPTIONS } from "@/lib/level-utils";
import type { Tables } from "@/integrations/supabase/types";

// Available start and end times (lift hours: 09:00 - 16:00)
const START_TIMES = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00"];
const END_TIMES = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];
const LANGUAGES = [
  { value: "de", label: "🇩🇪 Deutsch" },
  { value: "en", label: "🇬🇧 English" },
  { value: "fr", label: "🇫🇷 Français" },
  { value: "it", label: "🇮🇹 Italiano" },
];

// Unusual 1h slots
const UNUSUAL_1H_SLOTS = ["10:00 - 11:00", "11:00 - 12:00", "14:00 - 15:00", "15:00 - 16:00"];

export function Step2ProductAllocation() {
  const {
    state,
    setProductType,
    setProductId,
    setSport,
    setDuration,
    setSelectedDates,
    setTimeSlot,
    setIncludeLunch,
    setInstructor,
    setAssignLater,
    setMeetingPoint,
    setLanguage,
    goToNextStep,
  } = useBookingWizard();

  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<string | null>(null);
  const [preferredTeacher, setPreferredTeacher] = useState("");

  // Fetch products from database
  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  // Calculate duration from start and end time
  const calculatedDuration = useMemo(() => {
    if (!startTime || !endTime) return null;
    const startHour = parseInt(startTime.split(":")[0]);
    const endHour = parseInt(endTime.split(":")[0]);
    return endHour - startHour;
  }, [startTime, endTime]);

  // Update wizard state when time changes
  useEffect(() => {
    if (startTime && endTime) {
      const timeSlotValue = `${startTime} - ${endTime}`;
      setTimeSlot(timeSlotValue);
      if (calculatedDuration) {
        setDuration(calculatedDuration);
      }
    }
  }, [startTime, endTime, calculatedDuration, setTimeSlot, setDuration]);

  // Filter end times to be after start time
  const availableEndTimes = useMemo(() => {
    if (!startTime) return END_TIMES;
    const startHour = parseInt(startTime.split(":")[0]);
    return END_TIMES.filter((time) => parseInt(time.split(":")[0]) > startHour);
  }, [startTime]);

  // Check if current selection is an unusual 1h slot
  const isUnusualSlot = useMemo(() => {
    if (calculatedDuration !== 1) return false;
    const timeSlotValue = `${startTime} - ${endTime}`;
    return UNUSUAL_1H_SLOTS.includes(timeSlotValue);
  }, [calculatedDuration, startTime, endTime]);

  // Extract participant levels for meeting point logic
  const participantLevels = useMemo(() => {
    return state.selectedParticipants.map((p) => p.level_current_season);
  }, [state.selectedParticipants]);

  const allBeginnersOnly = useMemo(() => {
    return participantLevels.every((level) => isBeginnerLevel(level));
  }, [participantLevels]);

  const canSelectAlternative = useMemo(() => {
    return canSelectAlternativeMeetingPoint(participantLevels);
  }, [participantLevels]);

  // Auto-set meeting point to Gorfion for beginners
  useEffect(() => {
    if (allBeginnersOnly && state.meetingPoint !== "sammelplatz_gorfion") {
      setMeetingPoint("sammelplatz_gorfion");
    }
  }, [allBeginnersOnly, state.meetingPoint, setMeetingPoint]);

  // Warnings
  const warnings = useMemo<BookingWarning[]>(() => {
    const result: BookingWarning[] = [];

    // Young child + long lesson warning
    if (state.productType === "private" && calculatedDuration && calculatedDuration > 1) {
      const youngParticipants = state.selectedParticipants.filter((p) => {
        const age = differenceInYears(new Date(), new Date(p.birth_date));
        return age < 6;
      });
      if (youngParticipants.length > 0) {
        const names = youngParticipants.map((p) => p.first_name).join(", ");
        result.push({
          id: "age-warning",
          type: "warning",
          icon: "age",
          message: `Intensive Session: ${names} (< 6J) - mehr als 1h anspruchsvoll`,
        });
      }
    }

    // Unusual time slot warning
    if (isUnusualSlot) {
      result.push({
        id: "unusual-slot",
        type: "warning",
        icon: "general",
        message: "Unübliche Startzeit für Einzelstunden",
      });
    }

    // Beginner meeting point info
    if (allBeginnersOnly && state.productType) {
      result.push({
        id: "beginner-meetingpoint",
        type: "info",
        icon: "beginner",
        message: "Anfänger → Sammelplatz Gorfion",
      });
    }

    return result;
  }, [state.productType, calculatedDuration, state.selectedParticipants, isUnusualSlot, allBeginnersOnly]);

  // Find matching product
  const selectedProduct = useMemo(() => {
    if (state.productType === "private" && state.duration && state.sport) {
      const durationMinutes = state.duration * 60;
      const sportName = state.sport === "ski" ? "Ski" : "Snowboard";
      return products.find(
        (p) =>
          p.type === "private" &&
          p.duration_minutes === durationMinutes &&
          p.name.includes(sportName)
      );
    }
    if (state.productType === "group" && state.selectedDates.length > 0) {
      const daysCount = state.selectedDates.length;
      return products.find(
        (p) => p.type === "group" && p.name.includes(`${daysCount} Tag`)
      );
    }
    return null;
  }, [products, state.productType, state.duration, state.sport, state.selectedDates.length]);

  // Update productId when product changes
  useEffect(() => {
    if (selectedProduct && selectedProduct.id !== state.productId) {
      setProductId(selectedProduct.id);
    }
  }, [selectedProduct, state.productId, setProductId]);

  // Find lunch product
  const lunchProduct = products.find((p) => p.type === "lunch");

  const handleDateSelect = (dates: Date[] | undefined) => {
    if (dates) {
      const dateStrings = dates.map((d) => format(d, "yyyy-MM-dd"));
      setSelectedDates(dateStrings);
    }
  };

  const handleSlotSelect = (
    instructor: Tables<"instructors">,
    date: string,
    timeStart: string,
    timeEnd: string
  ) => {
    setInstructor(instructor);
    const clickedDuration = parseInt(timeEnd.split(":")[0]) - parseInt(timeStart.split(":")[0]);
    if (clickedDuration === 1 && calculatedDuration && calculatedDuration > 1) {
      // Keep the duration they selected, just assign the instructor
    } else {
      setStartTime(timeStart);
      setEndTime(timeEnd);
    }
    goToNextStep();
  };

  const isGroupCourse = state.productType === "group";
  const showAvailabilityGrid = state.productType === "private" && state.selectedDates.length > 0 && startTime && endTime;

  if (productsLoading) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Laden...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 py-2 lg:grid-cols-5 items-start">
      {/* Left Column - Requirements (40%) */}
      <div className="space-y-3 lg:col-span-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
        {/* Product Type */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Buchungstyp</Label>
          <RadioGroup
            value={state.productType || ""}
            onValueChange={(value) => setProductType(value as "private" | "group")}
            className="grid grid-cols-2 gap-2"
          >
            <Label
              htmlFor="private"
              className={`flex cursor-pointer items-center gap-2 rounded-md border-2 p-2 transition-colors ${
                state.productType === "private"
                  ? "border-primary bg-primary/5"
                  : "border-muted hover:border-muted-foreground/30"
              }`}
            >
              <RadioGroupItem value="private" id="private" className="sr-only" />
              <span className="text-base">👤</span>
              <span className="text-sm font-medium">Privat</span>
            </Label>
            <Label
              htmlFor="group"
              className={`flex cursor-pointer items-center gap-2 rounded-md border-2 p-2 transition-colors ${
                state.productType === "group"
                  ? "border-primary bg-primary/5"
                  : "border-muted hover:border-muted-foreground/30"
              }`}
            >
              <RadioGroupItem value="group" id="group" className="sr-only" />
              <span className="text-base">👥</span>
              <span className="text-sm font-medium">Gruppe</span>
            </Label>
          </RadioGroup>
        </div>

        {/* Sport Selection (for private lessons) */}
        {state.productType === "private" && (
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sportart</Label>
            <ToggleGroup
              type="single"
              value={state.sport || ""}
              onValueChange={(value) => setSport((value as "ski" | "snowboard") || null)}
              className="justify-start gap-2"
            >
              <ToggleGroupItem value="ski" className="gap-1 px-3 h-8 text-sm">
                <span>⛷️</span>
                Ski
              </ToggleGroupItem>
              <ToggleGroupItem value="snowboard" className="gap-1 px-3 h-8 text-sm">
                <span>🏂</span>
                Snowboard
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}

        {/* Date Selection - No Card wrapper for alignment */}
        {state.productType && (
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              {state.productType === "private" ? "Datum" : "Kurstage"}
            </Label>
            <Calendar
              mode="multiple"
              selected={state.selectedDates.map((d) => parseISO(d))}
              onSelect={handleDateSelect}
              month={selectedMonth}
              onMonthChange={setSelectedMonth}
              locale={de}
              className="rounded-md border bg-background pointer-events-auto text-xs"
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
            />
            {state.selectedDates.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {state.selectedDates.sort().slice(0, 5).map((date) => (
                  <Badge key={date} variant="secondary" className="text-[10px] px-1.5 py-0">
                    {format(parseISO(date), "E d.", { locale: de })}
                  </Badge>
                ))}
                {state.selectedDates.length > 5 && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    +{state.selectedDates.length - 5}
                  </Badge>
                )}
              </div>
            )}
          </div>
        )}

        {/* Lunch Add-on (only for group) */}
        {state.productType === "group" && lunchProduct && state.selectedDates.length > 0 && (
          <div className="flex items-center gap-2 rounded-md border p-2">
            <Checkbox
              id="lunch"
              checked={state.includeLunch}
              onCheckedChange={(checked) => setIncludeLunch(checked as boolean)}
            />
            <label htmlFor="lunch" className="flex-1 cursor-pointer text-sm">
              {lunchProduct.name}
              <span className="ml-1 text-muted-foreground text-xs">CHF {lunchProduct.price}</span>
            </label>
          </div>
        )}

        {/* Price Preview - Compact */}
        {selectedProduct && (
          <div className="flex items-center justify-between rounded-md bg-muted/50 p-2">
            <div>
              <p className="text-xs font-medium">{selectedProduct.name}</p>
              {state.productType === "private" && state.selectedDates.length > 1 && (
                <p className="text-[10px] text-muted-foreground">
                  {state.selectedDates.length}× CHF {selectedProduct.price}
                </p>
              )}
            </div>
            <p className="text-lg font-bold">
              CHF{" "}
              {state.productType === "private"
                ? (selectedProduct.price * state.selectedDates.length).toFixed(0)
                : selectedProduct.price.toFixed(0)}
            </p>
          </div>
        )}

      </div>

      {/* Right Column - Controls + Live Availability (60%) */}
      <div className="lg:col-span-3 space-y-4 lg:pt-3">
        {/* Grid Control Bar - Time + Meeting Point */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <Clock className="h-3 w-3 inline mr-1" />
            Zeitfenster & Treffpunkt
          </Label>
          <div className="flex flex-wrap items-center gap-3 rounded-md border-2 p-2 min-h-[42px]">
            {state.productType === "private" && state.selectedDates.length > 0 ? (
              <>
                {/* Time Selection */}
                <div className="flex items-center gap-1.5">
                  <Select
                    value={startTime || ""}
                    onValueChange={(value) => {
                      setStartTime(value);
                      if (endTime && parseInt(value.split(":")[0]) >= parseInt(endTime.split(":")[0])) {
                        setEndTime(null);
                      }
                    }}
                  >
                    <SelectTrigger className="w-[72px] h-7 text-xs">
                      <SelectValue placeholder="Start" />
                    </SelectTrigger>
                    <SelectContent>
                      {START_TIMES.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <Select
                    value={endTime || ""}
                    onValueChange={setEndTime}
                    disabled={!startTime}
                  >
                    <SelectTrigger className="w-[72px] h-7 text-xs">
                      <SelectValue placeholder="Ende" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableEndTimes.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {calculatedDuration && (
                    <Badge variant="secondary" className="text-xs h-5 px-1.5">
                      {calculatedDuration}h
                    </Badge>
                  )}
                </div>

                {/* Separator */}
                <div className="w-px h-5 bg-border" />

                {/* Meeting Points - Horizontal Pills */}
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  {MEETING_POINTS.map((point) => {
                    const isSelected = state.meetingPoint === point.id;
                    const isLocked = allBeginnersOnly && point.id !== "sammelplatz_gorfion";
                    return (
                      <button
                        key={point.id}
                        onClick={() => !isLocked && setMeetingPoint(point.id)}
                        disabled={isLocked}
                        className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : isLocked
                            ? "cursor-not-allowed bg-muted/30 border-muted text-muted-foreground/50"
                            : "bg-background hover:bg-muted border-slate-300"
                        }`}
                      >
                        {point.name.replace("Sammelplatz ", "").replace("Kasse ", "")}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                {!state.productType 
                  ? "Wählen Sie Buchungstyp" 
                  : state.productType === "group"
                  ? "Für Gruppenkurse vom Büro zugeteilt"
                  : "Datum auswählen"}
              </span>
            )}
          </div>
        </div>

        {/* Sprache + Wunschlehrer + Ohne Lehrer Row (aligned with Sportart) */}
        {state.productType === "private" && (
          <div className="grid grid-cols-3 gap-3">
            {/* Language */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Globe className="h-3 w-3" />
                Sprache
              </Label>
              <Select value={state.language} onValueChange={setLanguage}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Preferred Teacher Search */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Search className="h-3 w-3" />
                Wunschlehrer
              </Label>
              <Input
                placeholder="Name suchen..."
                value={preferredTeacher}
                onChange={(e) => setPreferredTeacher(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            {/* Assign Later */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                Ohne Lehrer
              </Label>
              <div className="flex items-center gap-2 h-8 rounded-md border bg-background px-3">
                <Checkbox
                  id="assign-later"
                  checked={state.assignLater}
                  onCheckedChange={(checked) => setAssignLater(checked === true)}
                />
                <label htmlFor="assign-later" className="cursor-pointer text-sm">
                  Später zuweisen
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Slim Warning Bar */}
        {warnings.length > 0 && state.productType === "private" && state.selectedDates.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 px-3 py-1.5 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded text-[11px] text-amber-800 dark:text-amber-200">
            {warnings.map((w) => {
              const IconComponent = w.icon === "age" ? Users : w.icon === "beginner" ? MapPin : Clock;
              return (
                <div key={w.id} className="flex items-center gap-1">
                  <IconComponent className="h-3 w-3" />
                  <span>{w.message}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Availability Grid or Placeholder */}
        {isGroupCourse ? (
          <div className="flex flex-col items-center justify-center py-8 text-center rounded-lg border border-dashed">
            <Users className="h-10 w-10 text-muted-foreground mb-2" />
            <p className="font-medium text-sm">Gruppenkurse werden vom Büro zugeteilt</p>
            <p className="text-xs text-muted-foreground mt-1">
              Zuweisung nach Verfügbarkeit und Erfahrung.
            </p>
          </div>
        ) : showAvailabilityGrid ? (
          <MiniSchedulerGrid
            selectedDates={state.selectedDates}
            sport={state.sport}
            language={state.language}
            meetingPoint={state.meetingPoint}
            onSlotSelect={handleSlotSelect}
            selectedInstructor={state.instructor}
            preferredTeacher={preferredTeacher}
            selectedDuration={calculatedDuration}
            selectedStartTime={startTime}
            participantIds={state.selectedParticipants.map(p => p.id)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground rounded-lg border border-dashed">
            <Info className="h-6 w-6 mb-2" />
            <p className="text-sm">
              {!state.productType
                ? "Wählen Sie zunächst einen Buchungstyp"
                : state.selectedDates.length === 0
                ? "Wählen Sie mindestens ein Datum"
                : !startTime || !endTime
                ? "Wählen Sie ein Zeitfenster"
                : "Konfiguration vervollständigen"}
            </p>
          </div>
        )}

        {/* Selected instructor display */}
        {state.instructor && !isGroupCourse && (
          <div className="flex items-center gap-2 rounded-md border border-primary bg-primary/5 p-2">
            <Check className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">
              {state.instructor.first_name} {state.instructor.last_name}
            </span>
            <Badge variant="secondary" className="ml-auto text-xs">
              Ausgewählt
            </Badge>
          </div>
        )}

        {/* Instruction hint */}
        {showAvailabilityGrid && !state.instructor && (
          <p className="text-xs text-muted-foreground text-center">
            Klicken Sie auf einen grünen Slot um den Lehrer direkt zuzuweisen
          </p>
        )}
      </div>
    </div>
  );
}
