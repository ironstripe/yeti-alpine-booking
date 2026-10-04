import { toast } from "sonner";
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
  Maximize2,
  X,
  ArrowLeft,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useBookingWizard } from "@/contexts/BookingWizardContext";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RangeDatePicker } from "@/components/ui/range-date-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BookingWarning } from "./BookingWarnings";
import { MiniSchedulerGrid } from "./MiniSchedulerGrid";
import { SchedulerAvailabilityScope, TeacherAvailabilityList } from "./TeacherAvailabilityList";
import { SlotBookingPopover, type SlotBookingData } from "./SlotBookingPopover";
import { GroupSelector } from "./GroupSelector";
import { PeriodDayPlanner } from "./PeriodDayPlanner";
import { PlannedAppointmentsCard } from "./PlannedAppointmentsCard";
import { LunchSupervisionAddon } from "./LunchSupervisionAddon";
import { ParticipantBookingCard } from "./ParticipantBookingCard";
import {
  MEETING_POINTS,
  isBeginnerLevel,
  canSelectAlternativeMeetingPoint,
} from "@/lib/meeting-point-utils";
import { mapLevelToCourseSkill } from "@/lib/level-utils";
import { useCurrentSeason } from "@/hooks/useSeasons";
import {
  getGroupRecommendationForParticipants,
} from "@/lib/group-course-utils";
import type { Tables } from "@/integrations/supabase/types";
import { buildWizardTimeSlot, parseWizardTimeSlot } from "@/lib/privatePlan";
import { buildIntendedIntervals, type IntendedInterval } from "@/lib/teacherShortlist";

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
    movePlannedDate,
    setTimeSlot,
    setInstructor,
    setAssignLater,
    setMeetingPoint,
    setLanguage,
    setSelectedGroupId,
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
    // Period day planner functions
    setDayInstructorOverride,
    setDayTimeOverride,
    addTimeBlock,
    updateTimeBlock,
    removeTimeBlock,
    removeDayInstructorOverride,
    removeDayTimeOverride,
    setCartItemParticipants,
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Time-first teacher choice: compact list by default, existing scheduler as alternative.
  const [teacherView, setTeacherView] = useState<"list" | "scheduler">("list");
  const [showTimeRequired, setShowTimeRequired] = useState(false);
  const timeControlsRef = useRef<HTMLDivElement>(null);
  const startTimeTriggerRef = useRef<HTMLButtonElement>(null);
  const endTimeTriggerRef = useRef<HTMLButtonElement>(null);
  const timeRequiredTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeCartItemRef = useRef(state.activeCartItemId);
  const locallyOwnedTimeSlotRef = useRef<string | null>(state.timeSlot);
  
  // Slot popover state
  const [popoverSlot, setPopoverSlot] = useState<{
    // null = "Später zuweisen": participant entry without a teacher slot
    instructorId: string | null;
    instructorName: string | null;
    date: string;
    startTime: string;
    endTime: string;
    /** Set when opened from the teacher list: exact intervals, read-only in the dialog */
    plannedIntervals?: IntendedInterval[];
  } | null>(null);

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
    const ageGroups = state.selectedParticipants.filter((p) => !!p.birth_date).map((p) => {
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

  // Fetch current season for product filtering
  const { data: currentSeason } = useCurrentSeason();

  // Fetch products from database (filtered by current season)
  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["products", "active", currentSeason?.id],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (currentSeason?.id) {
        query = query.eq("season_id", currentSeason.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!currentSeason?.id,
  });

  const calculatedDuration = useMemo(
    () => buildWizardTimeSlot(startTime, endTime)?.duration ?? null,
    [startTime, endTime],
  );

  const updateTimeWindow = useCallback((nextStart: string | null, nextEnd: string | null) => {
    setStartTime(nextStart);
    setEndTime(nextEnd);
    const next = buildWizardTimeSlot(nextStart, nextEnd);
    const nextTimeSlot = next ? `${next.startTime} - ${next.endTime}` : null;
    locallyOwnedTimeSlotRef.current = nextTimeSlot;
    setTimeSlot(nextTimeSlot);
    setDuration(next?.duration ?? null);
  }, [setDuration, setTimeSlot]);

  // Adopt external changes (cart switch, scheduler plan/prefill, cleared plan), including null.
  // Locally owned partial selections stay visible while their persisted slot is deliberately null.
  useEffect(() => {
    const activeItemChanged = activeCartItemRef.current !== state.activeCartItemId;
    const contextChangedExternally = locallyOwnedTimeSlotRef.current !== state.timeSlot;
    if (activeItemChanged || contextChangedExternally) {
      const external = parseWizardTimeSlot(state.timeSlot);
      setStartTime(external?.startTime ?? null);
      setEndTime(external?.endTime ?? null);
      locallyOwnedTimeSlotRef.current = state.timeSlot;
      activeCartItemRef.current = state.activeCartItemId;
    }
  }, [state.activeCartItemId, state.timeSlot]);

  useEffect(() => () => {
    if (timeRequiredTimerRef.current) clearTimeout(timeRequiredTimerRef.current);
  }, []);

  const focusMissingTime = useCallback(() => {
    setShowTimeRequired(true);
    (startTime ? endTimeTriggerRef.current : startTimeTriggerRef.current)?.focus({ preventScroll: true });
    timeControlsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (timeRequiredTimerRef.current) clearTimeout(timeRequiredTimerRef.current);
    timeRequiredTimerRef.current = setTimeout(() => setShowTimeRequired(false), 1800);
  }, [startTime]);

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
      locallyOwnedTimeSlotRef.current = timeSlotValue;
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
        if (!p.birth_date) return false; // unknown age: no inferred warning
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
      // Open the SlotBookingPopover instead of just selecting
      setInstructor(instructor);
      setPopoverSlot({
        instructorId: instructor.id,
        instructorName: `${instructor.first_name} ${instructor.last_name}`,
        date,
        startTime: timeStart,
        endTime: timeEnd,
      });
    } catch (error) {
      console.error("Error selecting slot:", error);
    }
  };

  // Handle adding a slot config to the cart
  const handleSlotAddToCart = (data: SlotBookingData) => {
    // Link participants before changing root-level timing. The timing update can
    // synchronously refresh the active cart snapshot, so keep this update first.
    if (state.activeCartItemId) {
      setCartItemParticipants(state.activeCartItemId, data.participantIds);
    }

    // Update the active cart item with the slot data
    if (data.startTime && data.endTime) {
      setTimeSlot(`${data.startTime} - ${data.endTime}`);
      setDuration(data.duration);
    }
    setMeetingPoint(data.meetingPoint);
    
    // Set the dates if not already set
    if (data.date && !state.selectedDates.includes(data.date)) {
      setSelectedDates([...state.selectedDates, data.date]);
    }
  };

  // Exact intervals this item will book (same derivation as the save path, no default times)
  const intervalPlan = useMemo(
    () =>
      buildIntendedIntervals({
        selectedDates: state.selectedDates,
        timeSlot: state.timeSlot,
        appointments: state.appointments,
        timeSelections: state.timeSelections,
        dayTimeOverrides: state.dayTimeOverrides,
        dayInstructorOverrides: state.dayInstructorOverrides,
      }),
    [state.selectedDates, state.timeSlot, state.appointments, state.timeSelections, state.dayTimeOverrides, state.dayInstructorOverrides],
  );

  // Teacher list selection: same teacher setter + participant dialog, for ALL planned intervals.
  const handleListSelect = (instructor: Tables<"instructors">, intervals: IntendedInterval[]) => {
    if (intervals.length === 0) return;
    setInstructor(instructor);
    setPopoverSlot({
      instructorId: instructor.id,
      instructorName: `${instructor.first_name} ${instructor.last_name}`,
      date: intervals[0].date,
      startTime: intervals[0].startTime,
      endTime: intervals[0].endTime,
      plannedIntervals: intervals,
    });
  };

  // Planned-mode dialog result: link participants + meeting point only; dates/times stay as planned.
  const handleListAddToCart = (data: SlotBookingData) => {
    if (state.activeCartItemId) {
      setCartItemParticipants(state.activeCartItemId, data.participantIds);
    }
    setMeetingPoint(data.meetingPoint);
  };

  const focusAppointment = useCallback(() => {
    if (startTime && endTime) {
      startTimeTriggerRef.current?.focus({ preventScroll: true });
      timeControlsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      focusMissingTime();
    }
  }, [startTime, endTime, focusMissingTime]);

  // Fullscreen ESC handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // Handle applying the multi-selection to the wizard state
  const handleApplyMultiSelection = async () => {
    const err = applyMiniSchedulerSelection();
    if (err) toast.error(err); // selection is kept
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
    <div className="space-y-6 py-2">
      <section aria-labelledby="booking-section-title" className="space-y-3 border-b pb-6">
        <div>
          <h2 id="booking-section-title" className="text-base font-semibold text-foreground">Buchung</h2>
          <p className="text-sm text-muted-foreground">Unterrichtsart und Sport festlegen.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Buchungstyp</Label>
            <RadioGroup
              value={state.productType || ""}
              onValueChange={(value) => setProductType(value as "private" | "group")}
              className="grid grid-cols-2 gap-2"
            >
              <Label htmlFor="private" className={cn("control-target flex cursor-pointer items-center gap-2 rounded-md border-2 px-3 transition-colors", state.productType === "private" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30")}>
                <RadioGroupItem value="private" id="private" className="sr-only" />
                <span aria-hidden="true">👤</span><span className="text-sm font-medium">Privat</span>
              </Label>
              <Label htmlFor="group" className={cn("control-target flex cursor-pointer items-center gap-2 rounded-md border-2 px-3 transition-colors", state.productType === "group" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30", groupRecommendation.hasAdults && "cursor-not-allowed opacity-50")}>
                <RadioGroupItem value="group" id="group" className="sr-only" disabled={groupRecommendation.hasAdults} />
                <span aria-hidden="true">👥</span><span className="text-sm font-medium">Gruppe</span>
              </Label>
            </RadioGroup>
          </div>
          {state.productType === "private" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sportart</Label>
              <ToggleGroup type="single" value={state.sport || ""} onValueChange={(value) => setSport((value as "ski" | "snowboard") || null)} className="grid grid-cols-2 gap-2">
                <ToggleGroupItem value="ski" className="control-target gap-1 px-3 text-sm"><span aria-hidden="true">⛷️</span>Ski</ToggleGroupItem>
                <ToggleGroupItem value="snowboard" className="control-target gap-1 px-3 text-sm"><span aria-hidden="true">🏂</span>Snowboard</ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
        </div>
        {groupRecommendation.hasAdults && (
          <Alert variant="destructive" className="py-2"><AlertTriangle className="h-3.5 w-3.5" /><AlertDescription className="text-xs">{groupRecommendation.hint}</AlertDescription></Alert>
        )}
      </section>

      {state.productType && (
        <section aria-labelledby="date-section-title" className="space-y-4 border-b pb-6">
          <div>
            <h2 id="date-section-title" className="text-base font-semibold text-foreground">Termin</h2>
            <p className="text-sm text-muted-foreground">Datum, Zeit und Treffpunkt festlegen.</p>
          </div>
          <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]">
          <div className="min-w-0 space-y-1.5">
            <Label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><CalendarDays className="h-3 w-3" />{state.productType === "private" ? "Datum" : "Kurstage"}</Label>
            <RangeDatePicker
              selected={state.selectedDates.map((d) => parseISO(d))}
              onSelect={(dates) => handleDateSelect(dates)}
              month={selectedMonth}
              onMonthChange={setSelectedMonth}
              minDate={new Date(new Date().setHours(0, 0, 0, 0))}
              showQuickActions={true}
              showSelectionSummary={false}
              className="rounded-md border bg-background text-xs"
            />
            {state.selectedDates.length > 1 && (
              <div className="flex flex-wrap items-center gap-1" aria-label={`${state.selectedDates.length} ausgewählte Tage`}>
                <span className="mr-1 text-xs text-muted-foreground">{state.selectedDates.length} Tage</span>
                {[...state.selectedDates].sort().slice(0, 4).map((date) => (
                  <Badge key={date} variant="secondary" className="px-1.5 py-0 text-[10px]">
                    {format(parseISO(date), "EEE d. MMM", { locale: de })}
                  </Badge>
                ))}
                {state.selectedDates.length > 4 && <Badge variant="outline" className="px-1.5 py-0 text-[10px]">+{state.selectedDates.length - 4}</Badge>}
              </div>
            )}
          </div>

          <div ref={timeControlsRef} className={cn("min-w-0 scroll-mt-24 space-y-3 rounded-md border p-3 transition-shadow", showTimeRequired && "ring-2 ring-destructive ring-offset-2 ring-offset-background")}>
            {state.selectedDates.length > 0 ? (
              <div className="grid gap-3">
                {state.productType === "private" && (
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Clock className="h-3 w-3" />Zeitfenster</Label>
                    <div className="flex items-center gap-2">
                      <Select value={startTime || ""} onValueChange={(value) => { const nextEnd = endTime && parseInt(value.split(":")[0]) >= parseInt(endTime.split(":")[0]) ? null : endTime; updateTimeWindow(value, nextEnd); }}>
                        <SelectTrigger ref={startTimeTriggerRef} aria-invalid={showTimeRequired && !startTime} className="control-target min-w-0 flex-1 text-sm"><SelectValue placeholder="Start" /></SelectTrigger>
                        <SelectContent>{START_TIMES.map((time) => <SelectItem key={time} value={time}>{time}</SelectItem>)}</SelectContent>
                      </Select>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <Select value={endTime || ""} onValueChange={(value) => updateTimeWindow(startTime, value)} disabled={!startTime}>
                        <SelectTrigger ref={endTimeTriggerRef} aria-invalid={showTimeRequired && !!startTime && !endTime} className="control-target min-w-0 flex-1 text-sm"><SelectValue placeholder="Ende" /></SelectTrigger>
                        <SelectContent>{availableEndTimes.map((time) => <SelectItem key={time} value={time}>{time}</SelectItem>)}</SelectContent>
                      </Select>
                      {calculatedDuration && <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-xs">{calculatedDuration}h</Badge>}
                    </div>
                  </div>
                )}
                {state.productType === "private" && (
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Globe className="h-3 w-3" />
                      Sprache
                    </Label>
                    <Select value={state.language} onValueChange={setLanguage}>
                      <SelectTrigger className="control-target text-sm">
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
              </div>
            ) : <p className="text-sm text-muted-foreground">Datum auswählen</p>}

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><MapPin className="h-3 w-3" />Treffpunkt</Label>
              <div className="flex flex-wrap gap-1.5">
                {MEETING_POINTS.map((point) => {
                  const isSelected = state.meetingPoint === point.id;
                  const isLocked = state.productType === "private" && allBeginnersOnly && point.id !== "sammelplatz_gorfion";
                  return (
                    <Button
                      key={point.id}
                      type="button"
                      variant={isSelected ? "secondary" : "outline"}
                      size="sm"
                      disabled={isLocked}
                      onClick={() => !isLocked && setMeetingPoint(point.id)}
                      className="control-target h-9 text-xs"
                    >
                      {point.name.replace("Sammelplatz ", "").replace("Kasse ", "")}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
          </div>

          {state.productType === "private" && state.appointments !== null && <PlannedAppointmentsCard />}
          {state.productType === "private" && state.appointments === null && state.selectedDates.length > 1 && (
            <PeriodDayPlanner selectedDates={state.selectedDates} baseInstructor={state.instructor} baseTimeSlot={state.timeSlot} dayInstructorOverrides={state.dayInstructorOverrides} dayTimeOverrides={state.dayTimeOverrides} onInstructorChange={setDayInstructorOverride} onDateChange={movePlannedDate} onTimeChange={setDayTimeOverride} onAddTimeBlock={addTimeBlock} onUpdateTimeBlock={updateTimeBlock} onRemoveTimeBlock={removeTimeBlock} onRemoveInstructorOverride={removeDayInstructorOverride} onRemoveTimeOverride={removeDayTimeOverride} sport={state.sport} />
          )}
          {state.productType === "group" && state.selectedDates.length > 0 && (
            <div className="rounded-md border bg-muted/40 p-3"><div className="mb-2 flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" /><span className="text-sm font-medium">Feste Kurszeiten</span></div><p className="text-sm text-muted-foreground">{groupRecommendation.hasToddlers ? <>🧒 Windel-Wedelkurs: <strong>10:00 - 12:00</strong> (nur vormittags)</> : <>📚 Standard: <strong>10:00 - 12:00</strong> + <strong>14:00 - 16:00</strong></>}</p></div>
          )}
        </section>
      )}

      {state.productType === "private" && (
        <section aria-labelledby="assignment-section-title" className="space-y-4 border-b pb-6">
          <div>
            <h2 id="assignment-section-title" className="text-base font-semibold text-foreground">Lehrerzuweisung</h2>
            <p className="text-sm text-muted-foreground">Lehrperson jetzt auswählen oder die Zuweisung offenlassen.</p>
          </div>
          <RadioGroup value={state.assignLater ? "later" : "now"} onValueChange={(value) => setAssignLater(value === "later")} className="grid gap-2 sm:grid-cols-2" aria-label="Zeitpunkt der Lehrerzuweisung">
            <Label htmlFor="assignment-now" className={cn("control-target flex cursor-pointer items-center gap-3 rounded-md border-2 px-3", !state.assignLater ? "border-primary bg-primary/5" : "border-border")}>
              <RadioGroupItem id="assignment-now" value="now" /><span className="text-sm font-medium">Jetzt auswählen</span>
            </Label>
            <Label htmlFor="assignment-later" className={cn("control-target flex cursor-pointer items-center gap-3 rounded-md border-2 px-3", state.assignLater ? "border-primary bg-primary/5" : "border-border")}>
              <RadioGroupItem id="assignment-later" value="later" /><span className="text-sm font-medium">Später zuweisen</span>
            </Label>
          </RadioGroup>

          {state.assignLater && (
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-sm text-foreground">Datum und Zeit werden jetzt gebucht. Die Lehrperson wird später zugewiesen.</p>
              {(!startTime || !endTime) && (
                <div className="mt-2">
                  <p className="text-sm text-destructive">
                    {!startTime ? "Startzeit fehlt. Endzeit fehlt." : "Endzeit fehlt."}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="control-target mt-2"
                    onClick={focusMissingTime}
                  >
                    Zeitfenster wählen
                  </Button>
                </div>
              )}
            </div>
          )}
          <div
            aria-hidden={state.assignLater}
            className={cn("space-y-3", state.assignLater && "hidden")}
          >
            <div className="space-y-1.5">
              <Label htmlFor="preferred-teacher" className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Search className="h-3 w-3" />
                Wunschlehrer
              </Label>
              <Input
                id="preferred-teacher"
                placeholder="Name suchen..."
                value={preferredTeacher}
                onChange={(e) => setPreferredTeacher(e.target.value)}
                className="control-target text-sm"
              />
            </div>
            {showAvailabilityGrid ? (
              <SchedulerAvailabilityScope selectedDates={state.selectedDates}>
                {(schedulerData) => (
                  <>
                    <div className={cn(teacherView !== "list" && "hidden")}>
                      <TeacherAvailabilityList
                        plan={intervalPlan}
                        sport={state.sport}
                        language={state.language}
                        data={schedulerData}
                        preferredTeacher={preferredTeacher}
                        selectedInstructorId={state.instructorId}
                        onSelect={handleListSelect}
                        onFocusMissingTime={focusMissingTime}
                        onChangeAppointment={focusAppointment}
                        onAssignLater={() => setAssignLater(true)}
                        onClearPreferredTeacher={() => setPreferredTeacher("")}
                        onSearchOtherTimes={() => setTeacherView("scheduler")}
                      />
                    </div>
                    {/* Existing scheduler stays mounted while the list is shown (state preserved) */}
                    <div className={cn("space-y-3", teacherView !== "scheduler" && "hidden")}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="control-target gap-1"
                        onClick={() => {
                          setIsFullscreen(false);
                          setTeacherView("list");
                        }}
                      >
                        <ArrowLeft className="h-4 w-4" />
                        Zurück zur Lehrerliste
                      </Button>
                      <div className={cn("min-w-0 transition-opacity", isFullscreen && "fixed inset-0 z-50 overflow-auto bg-background p-4")}>
                        {isFullscreen ? (
                          <div className="mb-3 flex items-center justify-between rounded-md bg-muted px-2 py-1.5"><span className="text-sm font-medium">Scheduler (Vollbild)</span><Button variant="ghost" size="sm" className="control-target" onClick={() => setIsFullscreen(false)}><X className="mr-1 h-4 w-4" />ESC zum Schließen</Button></div>
                        ) : <div className="mb-1 flex justify-end"><Button variant="ghost" size="sm" className="control-target gap-1 text-xs" onClick={() => setIsFullscreen(true)}><Maximize2 className="h-3 w-3" />Vollbild</Button></div>}
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
                          schedulerData={schedulerData}
                        />
                        {state.miniSchedulerSelections.length > 0 && (
                          <div className="mt-3 space-y-3 rounded-md border border-primary bg-primary/5 p-3">
                            <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{state.miniSchedulerSelections.length} {state.miniSchedulerSelections.length === 1 ? "Termin" : "Termine"} ausgewählt</Badge><span className="text-xs text-muted-foreground">Mit „Mehrere Termine auswählen“ oder Strg/⌘ + Klick hinzufügen</span></div>
                            <div className="divide-y rounded-md border bg-background">{[...state.miniSchedulerSelections].sort((a,b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)).map((slot) => <div key={slot.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs"><span className="min-w-0"><strong>{format(parseISO(slot.date), "EEE, dd.MM.yyyy", { locale: de })}</strong><span className="text-muted-foreground"> · {slot.startTime}–{slot.endTime} · {slot.instructorName}</span></span><Button type="button" variant="ghost" size="icon" className="icon-action shrink-0" aria-label={`Termin ${slot.date} ${slot.startTime} entfernen`} onClick={() => toggleMiniSchedulerSlot({ instructorId: slot.instructorId, instructorName: slot.instructorName, date: slot.date, startTime: slot.startTime, endTime: slot.endTime })}><X className="h-3.5 w-3.5" /></Button></div>)}</div>
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="sm" onClick={clearMiniSchedulerSelection} className="control-target text-xs">
                                Abbrechen
                              </Button>
                              <Button variant="outline" size="sm" onClick={handleApplyMultiSelection} className="control-target text-xs">
                                <Check className="mr-1 h-3 w-3" />
                                Auswahl übernehmen
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                      {!state.instructor && (
                        <p className="text-center text-xs text-muted-foreground">
                          Klicken Sie auf einen grünen Slot, um Teilnehmer zuzuweisen und in den Warenkorb zu legen.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </SchedulerAvailabilityScope>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-8 text-center text-muted-foreground">
                <Info className="mb-2 h-6 w-6" />
                <p className="text-sm">Wählen Sie mindestens ein Datum</p>
              </div>
            )}
            {state.instructor && (!state.privateGroupProposal || state.privateGroupProposal.groups.length <= 1) && <div className="flex items-center gap-2 rounded-md border border-primary bg-primary/5 p-2"><Check className="h-4 w-4 text-primary" /><span className="text-sm font-medium">{state.instructor.first_name} {state.instructor.last_name}</span><Badge variant="secondary" className="ml-auto text-xs">Ausgewählt</Badge></div>}
          </div>
        </section>
      )}

      <section aria-labelledby="participants-section-title" className="space-y-3 border-b pb-6">
        <div>
          <h2 id="participants-section-title" className="text-base font-semibold text-foreground">Teilnehmer</h2>
          <p className="text-sm text-muted-foreground">Personen für dieses Produkt.</p>
        </div>
        {(() => {
          const activeItem = state.cartItems.find((item) => item.id === state.activeCartItemId);
          const ids = state.productType === "group"
            ? state.selectedParticipants.map((participant) => participant.id)
            : activeItem?.assignedParticipantIds ?? [];
          const people = ids
            .map((id) =>
              state.localParticipants.find((participant) => participant.id === id)
              ?? state.selectedParticipants.find((participant) => participant.id === id)
            )
            .filter(Boolean);
          return people.length > 0 ? (
            <div className="divide-y rounded-md border">
              {people.map((person) => person && (
                <div key={person.id} className="flex items-center gap-2 px-3 py-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {person.first_name} {person.last_name || ""}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Noch keine Teilnehmer zugewiesen.
            </p>
          );
        })()}
        {state.productType === "private" && state.assignLater && (
          <Button type="button" variant="outline" size="sm" className="control-target" disabled={!startTime || !endTime || state.selectedDates.length === 0} onClick={() => { if (!startTime || !endTime) { focusMissingTime(); return; } const dates = [...state.selectedDates].sort(); setPopoverSlot({ instructorId: null, instructorName: null, date: dates[0], startTime, endTime }); }}><Users className="mr-1 h-4 w-4" />Teilnehmer hinzufügen</Button>
        )}
      </section>

      {warnings.length > 0 && state.productType === "private" && state.selectedDates.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground">{warnings.map((w) => { const IconComponent = w.icon === "age" ? Users : w.icon === "beginner" ? MapPin : Clock; return <div key={w.id} className="flex items-center gap-1"><IconComponent className="h-3 w-3" /><span>{w.message}</span></div>; })}</div>
      )}

      {isGroupCourse && (
        <section aria-label="Kursauswahl" className="space-y-4">
          {state.selectedDates.length > 0 ? state.useParticipantSpecificBooking ? (
            <><Alert className="bg-muted/40"><Sparkles className="h-4 w-4 text-muted-foreground" /><AlertDescription><p className="font-medium">Individuelle Buchung aktiviert</p><p className="text-sm">{hasDifferentLevels ? "Teilnehmer haben unterschiedliche Niveaus – jeder wird in den passenden Kurs eingeschrieben." : "Teilnehmer haben unterschiedliche Altersgruppen – jeder wird in den passenden Kurs eingeschrieben."}</p></AlertDescription></Alert><div className="space-y-3">{state.selectedParticipants.map((participant, index) => { const booking = state.participantBookings[participant.id]; if (!booking) return null; const first = state.participantBookings[state.selectedParticipants[0]?.id]; const differs = index > 0 && first && (booking.groupCourseId !== first.groupCourseId || booking.dates.length !== first.dates.length); return <ParticipantBookingCard key={participant.id} participant={participant} booking={booking} onBookingChange={(next) => handleParticipantBookingChange(participant.id, next)} onCopyToAll={() => copyBookingToAllParticipants(participant.id)} isFirst={index === 0} showDifferenceWarning={!!differs} />; })}</div></>
          ) : (
            <><GroupSelector selectedDates={state.selectedDates} sport={state.sport} participants={state.selectedParticipants} selectedGroupId={state.selectedGroupId} onGroupSelect={setSelectedGroupId} />{state.selectedParticipants.length > 0 && <LunchSupervisionAddon selectedDates={state.selectedDates} participants={state.selectedParticipants} lunchSelections={state.lunchSelections} vegetarianSelections={state.vegetarianSelections} onLunchDaysChange={setLunchDaysForParticipant} onVegetarianChange={setVegetarianForParticipant} lunchPricePerDay={lunchProduct?.price || 25} />}</>
          ) : <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-8 text-center"><CalendarDays className="mb-2 h-10 w-10 text-muted-foreground" /><p className="text-sm font-medium">Wählen Sie zuerst die Kurstage</p></div>}
        </section>
      )}

      {popoverSlot && (
        <SlotBookingPopover
          open={!!popoverSlot}
          onClose={() => setPopoverSlot(null)}
          instructorId={popoverSlot.instructorId}
          instructorName={popoverSlot.instructorName}
          date={popoverSlot.date}
          allDates={popoverSlot.instructorId || popoverSlot.plannedIntervals ? undefined : state.selectedDates}
          plannedIntervals={popoverSlot.plannedIntervals}
          startTime={popoverSlot.startTime}
          endTime={popoverSlot.endTime}
          preselectedCustomerId={state.customerId}
          sport={state.sport}
          defaultMeetingPoint={state.meetingPoint || "sammelplatz_gorfion"}
          onAddToCart={popoverSlot.plannedIntervals ? handleListAddToCart : handleSlotAddToCart}
        />
      )}
    </div>
  );
}
