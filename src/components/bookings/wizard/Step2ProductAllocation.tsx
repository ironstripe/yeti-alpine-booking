import { useState, useMemo, useEffect, useCallback, useRef } from "react";
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
  AlertTriangle,
  Sparkles,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useBookingWizard } from "@/contexts/BookingWizardContext";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookingWarnings, type BookingWarning } from "./BookingWarnings";
import { MiniSchedulerGrid } from "./MiniSchedulerGrid";
import { GroupSelector } from "./GroupSelector";
import { PeriodDayPlanner } from "./PeriodDayPlanner";
import { LunchSupervisionAddon } from "./LunchSupervisionAddon";
import { ParticipantBookingCard } from "./ParticipantBookingCard";
import {
  MEETING_POINTS,
  isBeginnerLevel,
  canSelectAlternativeMeetingPoint,
} from "@/lib/meeting-point-utils";
import { LEVEL_OPTIONS, mapLevelToCourseSkill, getLevelLabel } from "@/lib/level-utils";
import {
  getGroupRecommendationForParticipants,
  formatGroupTimes,
  GROUP_COURSE_TIMES,
} from "@/lib/group-course-utils";
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
    setSelectedGroupId,
    setGroupCourseType,
    setLunchDaysForParticipant,
    setVegetarianForParticipant,
    setUseParticipantSpecificBooking,
    setParticipantBooking,
    initializeParticipantBookings,
    copyBookingToAllParticipants,
    // Multi-select functions
    toggleMiniSchedulerSlot,
    clearMiniSchedulerSelection,
    applyMiniSchedulerSelection,
    setGroupInstructor,
    // Period day planner functions
    setDayInstructorOverride,
    setDayTimeOverride,
    addTimeBlock,
    updateTimeBlock,
    removeTimeBlock,
    removeDayInstructorOverride,
    removeDayTimeOverride,
  } = useBookingWizard();

  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState<string | null>(() => {
    // Initialize from context if timeSlot is already set (from prefill)
    if (state.timeSlot) {
      const parts = state.timeSlot.split(" - ");
      return parts[0] || null;
    }
    return null;
  });
  const [endTime, setEndTime] = useState<string | null>(() => {
    // Initialize from context if timeSlot is already set (from prefill)
    if (state.timeSlot) {
      const parts = state.timeSlot.split(" - ");
      return parts[1] || null;
    }
    return null;
  });
  const [preferredTeacher, setPreferredTeacher] = useState("");

  // Analyze participants for group course recommendations
  const groupRecommendation = useMemo(() => {
    return getGroupRecommendationForParticipants(state.selectedParticipants);
  }, [state.selectedParticipants]);

  // Detect if participants have different skill levels (for group course)
  const hasDifferentLevels = useMemo(() => {
    if (state.selectedParticipants.length <= 1) return false;
    const courseSkills = state.selectedParticipants.map((p) =>
      mapLevelToCourseSkill(p.level_current_season)
    );
    const uniqueSkills = new Set(courseSkills);
    return uniqueSkills.size > 1;
  }, [state.selectedParticipants]);

  // Detect if participants have age mismatches (toddlers vs older kids)
  const hasAgeMismatch = useMemo(() => {
    if (state.selectedParticipants.length <= 1) return false;
    const ageGroups = state.selectedParticipants.map((p) => {
      const age = differenceInYears(new Date(), new Date(p.birth_date));
      if (age >= 3 && age <= 4) return "toddler";
      if (age >= 16) return "adult";
      return "child";
    });
    const uniqueGroups = new Set(ageGroups);
    return uniqueGroups.size > 1;
  }, [state.selectedParticipants]);

  // Auto-enable participant-specific mode for group bookings with different levels
  useEffect(() => {
    if (
      state.productType === "group" &&
      state.selectedParticipants.length > 1 &&
      (hasDifferentLevels || hasAgeMismatch) &&
      !state.useParticipantSpecificBooking
    ) {
      // Clear shared group selection to avoid confusion
      setSelectedGroupId(null);
      // Initialize individual bookings for each participant
      initializeParticipantBookings();
      // Enable participant-specific mode
      setUseParticipantSpecificBooking(true);
      console.log("Step2: Auto-enabled participant-specific mode due to level/age mismatch");
    }
  }, [
    state.productType,
    state.selectedParticipants.length,
    hasDifferentLevels,
    hasAgeMismatch,
    state.useParticipantSpecificBooking,
    setSelectedGroupId,
    initializeParticipantBookings,
    setUseParticipantSpecificBooking,
  ]);

  // Handler for participant booking changes
  const handleParticipantBookingChange = useCallback(
    (participantId: string, booking: Parameters<typeof setParticipantBooking>[1]) => {
      setParticipantBooking(participantId, booking);
    },
    [setParticipantBooking]
  );

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

  // Ref to track the last timeSlot value written by local dropdowns.
  // This lets us distinguish local changes from external changes (e.g. applyMiniSchedulerSelection).
  const localTimeSlotRef = useRef<string | null>(state.timeSlot);

  // Write local startTime/endTime to context, and update the ref
  useEffect(() => {
    if (startTime && endTime) {
      const timeSlotValue = `${startTime} - ${endTime}`;
      // Only write to context if the value actually changed
      if (timeSlotValue !== state.timeSlot) {
        setTimeSlot(timeSlotValue);
      }
      localTimeSlotRef.current = timeSlotValue;
      if (calculatedDuration) {
        setDuration(calculatedDuration);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startTime, endTime, calculatedDuration]);

  // Sync from context to local when context changes externally (e.g. applyMiniSchedulerSelection)
  useEffect(() => {
    if (state.timeSlot && state.timeSlot !== localTimeSlotRef.current) {
      const parts = state.timeSlot.split(" - ");
      if (parts.length === 2) {
        setStartTime(parts[0]);
        setEndTime(parts[1]);
        localTimeSlotRef.current = state.timeSlot;
        console.log("Step2: Synced time from external context change:", parts[0], "-", parts[1]);
      }
    } else if (state.timeSlot && !startTime && !endTime) {
      // Initial sync when local state is empty
      const parts = state.timeSlot.split(" - ");
      if (parts.length === 2) {
        setStartTime(parts[0]);
        setEndTime(parts[1]);
        localTimeSlotRef.current = state.timeSlot;
        console.log("Step2: Initial sync from context:", parts[0], "-", parts[1]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.timeSlot]);

  // Derive time from scheduler appointments if timeSlot not yet set
  useEffect(() => {
    if (state.appointments && state.appointments.length > 0 && !state.timeSlot) {
      const firstAppt = state.appointments[0];
      const startHour = parseInt(firstAppt.startTime.split(":")[0]);
      const startMinutes = parseInt(firstAppt.startTime.split(":")[1] || "0");
      const totalEndMinutes = startHour * 60 + startMinutes + firstAppt.durationMinutes;
      const endHour = Math.floor(totalEndMinutes / 60);
      const endMinutes = totalEndMinutes % 60;
      const derivedEndTime = `${endHour.toString().padStart(2, "0")}:${endMinutes.toString().padStart(2, "0")}`;
      
      const timeSlotValue = `${firstAppt.startTime} - ${derivedEndTime}`;
      setTimeSlot(timeSlotValue);
      setStartTime(firstAppt.startTime);
      setEndTime(derivedEndTime);
      setDuration(firstAppt.durationMinutes / 60);
      
      console.log("Step2: Derived time from scheduler appointments:", timeSlotValue);
    }
  }, [state.appointments, state.timeSlot, setTimeSlot, setDuration]);

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

  // Auto-set meeting point to Gorfion for beginners (private) or as default (group)
  useEffect(() => {
    // For private lessons with beginners: lock to Gorfion
    if (state.productType === "private" && allBeginnersOnly && state.meetingPoint !== "sammelplatz_gorfion") {
      setMeetingPoint("sammelplatz_gorfion");
    }
    // For group courses: set default meeting point if not already set
    if (state.productType === "group" && !state.meetingPoint) {
      setMeetingPoint("sammelplatz_gorfion");
    }
  }, [state.productType, allBeginnersOnly, state.meetingPoint, setMeetingPoint]);

  // Auto-select "private" for adult participants when group is disabled
  useEffect(() => {
    if (groupRecommendation.hasAdults && !state.productType) {
      setProductType("private");
    }
  }, [groupRecommendation.hasAdults, state.productType, setProductType]);

  // Auto-navigate calendar to the month of prefilled dates
  useEffect(() => {
    if (state.selectedDates.length > 0) {
      const firstDate = parseISO(state.selectedDates[0]);
      const currentMonthStart = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
      const selectedMonthStart = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
      
      if (currentMonthStart.getTime() !== selectedMonthStart.getTime()) {
        setSelectedMonth(firstDate);
        console.log("Step2: Auto-navigated calendar to month:", firstDate);
      }
    }
  }, [state.selectedDates]);
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
    try {
      setInstructor(instructor);
      const clickedDuration = parseInt(timeEnd.split(":")[0]) - parseInt(timeStart.split(":")[0]);
      if (clickedDuration === 1 && calculatedDuration && calculatedDuration > 1) {
        // Keep the duration they selected, just assign the instructor
      } else {
        setStartTime(timeStart);
        setEndTime(timeEnd);
      }
      // Clear any multi-select when doing a normal slot selection
      if (state.miniSchedulerSelections.length > 0) {
        clearMiniSchedulerSelection();
      }
      // No auto-navigation - user must click "Weiter" to proceed
    } catch (error) {
      console.error("Error selecting slot:", error);
    }
  };

  // Handle applying the multi-selection to the wizard state
  const handleApplyMultiSelection = async () => {
    // Capture instructor IDs before clearing selections
    const instrIds = [...new Set(state.miniSchedulerSelections.map(s => s.instructorId))];
    
    applyMiniSchedulerSelection();
    
    // If multi-instructor, fetch instructor objects to populate group proposal
    if (instrIds.length > 1 && state.selectedParticipants.length > 1) {
      try {
        const { data: instructors } = await supabase
          .from("instructors")
          .select("*")
          .in("id", instrIds);
        
        if (instructors) {
          // Update group proposal with fetched instructor objects
          for (const instr of instructors) {
            setGroupInstructor(
              `mini-group-${instrIds.indexOf(instr.id) + 1}`,
              instr
            );
          }
        }
      } catch (err) {
        console.error("Failed to fetch instructors for group proposal:", err);
      }
    }
    
    setTimeout(() => {}, 0);
  };

  const isGroupCourse = state.productType === "group";
  // Show grid as soon as date is selected (before time selection)
  const showAvailabilityGrid = state.productType === "private" && state.selectedDates.length > 0;

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
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md border-2 p-2 transition-colors",
                state.productType === "group"
                  ? "border-primary bg-primary/5"
                  : "border-muted hover:border-muted-foreground/30",
                groupRecommendation.hasAdults && "opacity-50 cursor-not-allowed"
              )}
            >
              <RadioGroupItem 
                value="group" 
                id="group" 
                className="sr-only" 
                disabled={groupRecommendation.hasAdults}
              />
              <span className="text-base">👥</span>
              <span className="text-sm font-medium">Gruppe</span>
            </Label>
          </RadioGroup>
          
          {/* Adult restriction warning */}
          {groupRecommendation.hasAdults && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="h-3.5 w-3.5" />
              <AlertDescription className="text-xs">
                {groupRecommendation.hint}
              </AlertDescription>
            </Alert>
          )}
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

            {/* Period Day Planner - Show immediately for multi-day private lessons */}
            {state.productType === "private" && state.selectedDates.length > 1 && (
              <div className="mt-3">
                <PeriodDayPlanner
                  selectedDates={state.selectedDates}
                  baseInstructor={state.instructor}
                  baseTimeSlot={state.timeSlot}
                  dayInstructorOverrides={state.dayInstructorOverrides}
                  dayTimeOverrides={state.dayTimeOverrides}
                  onInstructorChange={setDayInstructorOverride}
                  onTimeChange={(date, startTime, endTime) => setDayTimeOverride(date, startTime, endTime)}
                  onAddTimeBlock={addTimeBlock}
                  onUpdateTimeBlock={updateTimeBlock}
                  onRemoveTimeBlock={removeTimeBlock}
                  onRemoveInstructorOverride={removeDayInstructorOverride}
                  onRemoveTimeOverride={removeDayTimeOverride}
                  sport={state.sport}
                />
              </div>
            )}
          </div>
        )}

        {/* Group Course Fixed Times Info */}
        {state.productType === "group" && state.selectedDates.length > 0 && (
          <div className="rounded-md border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Feste Kurszeiten
              </span>
            </div>
            <div className="text-sm text-blue-700 dark:text-blue-300">
              {groupRecommendation.hasToddlers ? (
                <span>🧒 Windel-Wedelkurs: <strong>10:00 - 12:00</strong> (nur vormittags)</span>
              ) : (
                <span>📚 Standard: <strong>10:00 - 12:00</strong> + <strong>14:00 - 16:00</strong></span>
              )}
            </div>
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
            {state.productType && state.selectedDates.length > 0 ? (
              <>
                {/* Time Selection - Only for private lessons */}
                {state.productType === "private" && (
                  <>
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
                  </>
                )}

                {/* Meeting Points - Horizontal Pills */}
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  {MEETING_POINTS.map((point) => {
                    const isSelected = state.meetingPoint === point.id;
                    // Only lock for private lessons with beginners; group courses always allow selection
                    const isLocked = state.productType === "private" && allBeginnersOnly && point.id !== "sammelplatz_gorfion";
                    return (
                      <button
                        key={point.id}
                        onClick={() => !isLocked && setMeetingPoint(point.id)}
                        disabled={isLocked}
                        className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : isLocked
                            ? "cursor-not-allowed bg-muted/30 border-muted/50 text-muted-foreground/40"
                            : "bg-background hover:bg-primary/10 hover:border-primary/50 border-border"
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

        {/* Group Course Selector or Availability Grid */}
        {isGroupCourse ? (
          <div className="space-y-4">
            {state.selectedDates.length > 0 ? (
              <>
                {/* Participant-specific booking mode (auto-enabled when levels differ) */}
                {state.useParticipantSpecificBooking ? (
                  <>
                    {/* Info banner explaining individual mode */}
                    <Alert className="bg-blue-50 border-blue-300">
                      <Sparkles className="h-4 w-4 text-blue-600" />
                      <AlertDescription className="text-blue-800">
                        <div className="space-y-1">
                          <p className="font-medium">Individuelle Buchung aktiviert</p>
                          <p className="text-sm">
                            {hasDifferentLevels
                              ? "Teilnehmer haben unterschiedliche Niveaus – jeder wird in den passenden Kurs eingeschrieben."
                              : "Teilnehmer haben unterschiedliche Altersgruppen – jeder wird in den passenden Kurs eingeschrieben."}
                          </p>
                        </div>
                      </AlertDescription>
                    </Alert>

                    {/* Individual participant cards */}
                    <div className="space-y-3">
                      {state.selectedParticipants.map((participant, index) => {
                        const booking = state.participantBookings[participant.id];
                        if (!booking) return null;

                        const firstParticipantBooking = state.participantBookings[state.selectedParticipants[0]?.id];
                        const hasDifference =
                          index > 0 &&
                          firstParticipantBooking &&
                          (booking.groupCourseId !== firstParticipantBooking.groupCourseId ||
                            booking.dates.length !== firstParticipantBooking.dates.length);

                        return (
                          <ParticipantBookingCard
                            key={participant.id}
                            participant={participant}
                            booking={booking}
                            onBookingChange={(newBooking) =>
                              handleParticipantBookingChange(participant.id, newBooking)
                            }
                            onCopyToAll={() => copyBookingToAllParticipants(participant.id)}
                            isFirst={index === 0}
                            showDifferenceWarning={hasDifference}
                          />
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    {/* Shared group booking mode (original behavior) */}
                    {/* Participant enrollment preview for multiple participants */}
                    {state.selectedParticipants.length > 1 && (
                      <Card className="bg-blue-50 border-blue-200">
                        <CardContent className="p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Users className="h-4 w-4 text-blue-600" />
                            <span className="text-sm font-medium text-blue-800">
                              {state.selectedParticipants.length} Teilnehmer werden in diese Gruppe eingeschrieben:
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {state.selectedParticipants.map((p) => (
                              <Badge key={p.id} variant="secondary" className="bg-white">
                                {p.first_name} {p.last_name}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <GroupSelector
                      selectedDates={state.selectedDates}
                      sport={state.sport}
                      participants={state.selectedParticipants}
                      selectedGroupId={state.selectedGroupId}
                      onGroupSelect={setSelectedGroupId}
                    />

                    {/* Lunch Supervision Add-on (only in shared mode) */}
                    {state.selectedParticipants.length > 0 && (
                      <div className="pt-2">
                        <LunchSupervisionAddon
                          selectedDates={state.selectedDates}
                          participants={state.selectedParticipants}
                          lunchSelections={state.lunchSelections}
                          vegetarianSelections={state.vegetarianSelections}
                          onLunchDaysChange={setLunchDaysForParticipant}
                          onVegetarianChange={setVegetarianForParticipant}
                          lunchPricePerDay={lunchProduct?.price || 25}
                        />
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center rounded-lg border border-dashed">
                <CalendarDays className="h-10 w-10 text-muted-foreground mb-2" />
                <p className="font-medium text-sm">Wählen Sie zuerst die Kurstage</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Dann werden verfügbare Gruppen angezeigt.
                </p>
              </div>
            )}
          </div>
        ) : showAvailabilityGrid ? (
          <div className={cn(
            "transition-opacity",
            state.assignLater && "opacity-50 pointer-events-none"
          )}>
            {/* Multi-select instruction hint */}
            {state.selectedDates.length > 1 && (
              <div className="flex items-center gap-2 mb-3 px-2.5 py-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-700 dark:text-blue-300">
                <Info className="h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  <strong>Tipp:</strong> Halte <kbd className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded text-[10px] font-mono">Ctrl</kbd> gedrückt, um mehrere Zeitslots auszuwählen.
                </span>
              </div>
            )}
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
              multiSelectSlots={state.miniSchedulerSelections}
              onMultiSelectToggle={toggleMiniSchedulerSlot}
            />
            
            {/* Multi-select action bar */}
            {state.miniSchedulerSelections.length > 0 && (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-primary bg-primary/5 p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="bg-primary/20 text-primary">
                    {state.miniSchedulerSelections.length} Slots ausgewählt
                  </Badge>
                  {(() => {
                    const instrMap = new Map<string, { name: string; count: number }>();
                    for (const s of state.miniSchedulerSelections) {
                      const entry = instrMap.get(s.instructorId);
                      if (entry) entry.count++;
                      else instrMap.set(s.instructorId, { name: s.instructorName, count: 1 });
                    }
                    if (instrMap.size > 1) {
                      return (
                        <span className="text-xs text-muted-foreground">
                          {[...instrMap.values()].map(v => `${v.name} (${v.count})`).join(", ")}
                        </span>
                      );
                    }
                    return null;
                  })()}
                  <span className="text-xs text-muted-foreground">
                    (Ctrl+Klick für weitere)
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearMiniSchedulerSelection}
                    className="h-7 text-xs"
                  >
                    Abbrechen
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleApplyMultiSelection}
                    className="h-7 text-xs"
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Auswahl übernehmen
                  </Button>
                </div>
              </div>
            )}
          </div>
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

        {/* Selected instructor display - hide when multi-group proposal is active */}
        {state.instructor && !isGroupCourse && (!state.privateGroupProposal || state.privateGroupProposal.groups.length <= 1) && (
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
