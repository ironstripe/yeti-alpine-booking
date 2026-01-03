import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, differenceInYears } from "date-fns";
import { de } from "date-fns/locale";
import {
  Snowflake,
  Sun,
  Clock,
  CalendarDays,
  Info,
  ArrowRight,
  MapPin,
  Users,
  Globe,
  Check,
  AlertTriangle,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useBookingWizard } from "@/contexts/BookingWizardContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Calendar } from "@/components/ui/calendar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
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
import type { Tables } from "@/integrations/supabase/types";

// Available start and end times (lift hours: 09:00 - 16:00)
const START_TIMES = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00"];
const END_TIMES = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];
const LANGUAGES = [
  { value: "de", label: "Deutsch" },
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "it", label: "Italiano" },
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
          message: `Intensive Session: Für ${names} (unter 6 Jahren) ist mehr als 1 Stunde sehr anspruchsvoll.`,
        });
      }
    }

    // Unusual time slot warning
    if (isUnusualSlot) {
      result.push({
        id: "unusual-slot",
        type: "warning",
        icon: "general",
        message: "Diese Startzeit ist unüblich für Einzelstunden.",
      });
    }

    // Beginner meeting point info
    if (allBeginnersOnly && state.productType) {
      result.push({
        id: "beginner-meetingpoint",
        type: "info",
        icon: "beginner",
        message: "Anfänger treffen sich immer am Sammelplatz Gorfion.",
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
    // If they clicked a specific time, use that
    const clickedDuration = parseInt(timeEnd.split(":")[0]) - parseInt(timeStart.split(":")[0]);
    if (clickedDuration === 1 && calculatedDuration && calculatedDuration > 1) {
      // Keep the duration they selected, just assign the instructor
    } else {
      setStartTime(timeStart);
      setEndTime(timeEnd);
    }
    // Advance to summary
    goToNextStep();
  };

  const isGroupCourse = state.productType === "group";
  const showAvailabilityGrid = state.productType === "private" && state.selectedDates.length > 0 && startTime && endTime;

  if (productsLoading) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Laden...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 py-4 lg:grid-cols-5">
      {/* Left Column - Requirements */}
      <div className="space-y-4 lg:col-span-2">
        {/* Product Type */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Buchungstyp</Label>
          <RadioGroup
            value={state.productType || ""}
            onValueChange={(value) => setProductType(value as "private" | "group")}
            className="grid grid-cols-2 gap-2"
          >
            <Label
              htmlFor="private"
              className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 p-3 transition-colors ${
                state.productType === "private"
                  ? "border-primary bg-primary/5"
                  : "border-muted hover:border-muted-foreground/30"
              }`}
            >
              <RadioGroupItem value="private" id="private" className="sr-only" />
              <span className="text-lg">👤</span>
              <span className="text-sm font-medium">Privat</span>
            </Label>
            <Label
              htmlFor="group"
              className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 p-3 transition-colors ${
                state.productType === "group"
                  ? "border-primary bg-primary/5"
                  : "border-muted hover:border-muted-foreground/30"
              }`}
            >
              <RadioGroupItem value="group" id="group" className="sr-only" />
              <span className="text-lg">👥</span>
              <span className="text-sm font-medium">Gruppe</span>
            </Label>
          </RadioGroup>
        </div>

        {/* Sport Selection (for private lessons) */}
        {state.productType === "private" && (
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Sportart</Label>
            <ToggleGroup
              type="single"
              value={state.sport || ""}
              onValueChange={(value) => setSport((value as "ski" | "snowboard") || null)}
              className="justify-start gap-2"
            >
              <ToggleGroupItem value="ski" className="gap-1.5 px-4">
                <span className="text-base">⛷️</span>
                Ski
              </ToggleGroupItem>
              <ToggleGroupItem value="snowboard" className="gap-1.5 px-4">
                <span className="text-base">🏂</span>
                Snowboard
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}

        {/* Date Selection */}
        {state.productType && (
          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" />
              {state.productType === "private" ? "Datum" : "Kurstage"}
            </Label>
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <Calendar
                  mode="multiple"
                  selected={state.selectedDates.map((d) => parseISO(d))}
                  onSelect={handleDateSelect}
                  month={selectedMonth}
                  onMonthChange={setSelectedMonth}
                  locale={de}
                  className="rounded-md pointer-events-auto text-sm"
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                />
              </CardContent>
            </Card>
            {state.selectedDates.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {state.selectedDates.sort().map((date) => (
                  <Badge key={date} variant="secondary" className="text-xs">
                    {format(parseISO(date), "E, d. MMM", { locale: de })}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Time Selection (for private lessons) */}
        {state.productType === "private" && state.selectedDates.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              Zeitfenster
            </Label>
            <div className="flex items-center gap-2">
              <Select
                value={startTime || ""}
                onValueChange={(value) => {
                  setStartTime(value);
                  if (endTime && parseInt(value.split(":")[0]) >= parseInt(endTime.split(":")[0])) {
                    setEndTime(null);
                  }
                }}
              >
                <SelectTrigger className="flex-1">
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
              <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Select
                value={endTime || ""}
                onValueChange={setEndTime}
                disabled={!startTime}
              >
                <SelectTrigger className="flex-1">
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
                <Badge variant="secondary" className="flex-shrink-0">
                  {calculatedDuration}h
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Meeting Point */}
        {state.productType && state.selectedDates.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              Treffpunkt
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {MEETING_POINTS.map((point) => {
                const isSelected = state.meetingPoint === point.id;
                const isLocked = allBeginnersOnly && point.id !== "sammelplatz_gorfion";
                const Icon = point.icon;

                return (
                  <button
                    key={point.id}
                    onClick={() => !isLocked && setMeetingPoint(point.id)}
                    disabled={isLocked}
                    className={`flex items-center gap-2 rounded-lg border-2 p-2 text-left transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : isLocked
                        ? "cursor-not-allowed border-muted bg-muted/30 opacity-50"
                        : "border-muted hover:border-muted-foreground/30"
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="text-xs font-medium truncate">{point.name}</span>
                    {isSelected && <Check className="h-3 w-3 text-primary ml-auto" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Language */}
        {state.productType && (
          <div className="space-y-2">
            <Label className="text-sm font-semibold flex items-center gap-1.5">
              <Globe className="h-4 w-4" />
              Sprache
            </Label>
            <Select value={state.language} onValueChange={setLanguage}>
              <SelectTrigger>
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
        )}

        {/* Lunch Add-on (only for group) */}
        {state.productType === "group" && lunchProduct && state.selectedDates.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border p-3">
            <Checkbox
              id="lunch"
              checked={state.includeLunch}
              onCheckedChange={(checked) => setIncludeLunch(checked as boolean)}
            />
            <label htmlFor="lunch" className="flex-1 cursor-pointer text-sm">
              {lunchProduct.name}
              <span className="ml-2 text-muted-foreground">CHF {lunchProduct.price}</span>
            </label>
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && <BookingWarnings warnings={warnings} />}

        {/* Price Preview */}
        {selectedProduct && (
          <Card className="bg-muted/50">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{selectedProduct.name}</p>
                  {state.productType === "private" && state.selectedDates.length > 1 && (
                    <p className="text-xs text-muted-foreground">
                      {state.selectedDates.length} Tage × CHF {selectedProduct.price}
                    </p>
                  )}
                </div>
                <p className="text-xl font-bold">
                  CHF{" "}
                  {state.productType === "private"
                    ? (selectedProduct.price * state.selectedDates.length).toFixed(0)
                    : selectedProduct.price.toFixed(0)}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Assign Later for private lessons */}
        {state.productType === "private" && showAvailabilityGrid && (
          <div className="flex items-center gap-2 rounded-lg border p-3">
            <Checkbox
              id="assign-later"
              checked={state.assignLater}
              onCheckedChange={(checked) => setAssignLater(checked === true)}
            />
            <label htmlFor="assign-later" className="cursor-pointer text-sm">
              Später zuweisen (ohne Skilehrer)
            </label>
          </div>
        )}
      </div>

      {/* Right Column - Live Availability */}
      <div className="lg:col-span-3">
        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4" />
              {isGroupCourse ? "Gruppeninfo" : "Verfügbare Skilehrer"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isGroupCourse ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Users className="h-12 w-12 text-muted-foreground mb-3" />
                <p className="font-medium">Gruppenkurse werden vom Büro zugeteilt</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Die Zuweisung erfolgt nach Verfügbarkeit und Erfahrung der Skilehrer.
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
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <Info className="h-8 w-8 mb-2" />
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
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-primary bg-primary/5 p-3">
                <Check className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {state.instructor.first_name} {state.instructor.last_name}
                </span>
                <Badge variant="secondary" className="ml-auto">
                  Ausgewählt
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}