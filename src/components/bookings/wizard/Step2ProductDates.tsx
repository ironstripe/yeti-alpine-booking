import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, differenceInYears } from "date-fns";
import { de } from "date-fns/locale";
import { Snowflake, Sun, AlertTriangle, Clock, CalendarDays, Info, ArrowRight, Users, Mountain, Minus, Plus, SplitSquareHorizontal, User } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useBookingWizard, type ParticipantBookingDetails } from "@/contexts/BookingWizardContext";
import { groupParticipants, type ParticipantGroup } from "@/lib/private-lesson-grouping";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RangeDatePicker } from "@/components/ui/range-date-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookingWarnings, type BookingWarning } from "./BookingWarnings";
import { LunchSupervisionAddon } from "./LunchSupervisionAddon";
import { ParticipantBookingCard } from "./ParticipantBookingCard";
import { BookingTimeGrid } from "./BookingTimeGrid";
import { PrivateGroupProposal } from "./PrivateGroupProposal";
import { usePrivateLessonRates, useHighSeasonPeriods } from "@/hooks/usePrivateLessonRates";
import {
  calculatePrivateLessonPrice,
  formatCHF,
  MAX_PERSONS,
  ADDITIONAL_PERSON_RATE,
} from "@/lib/pricing/private-lesson-pricing";

// Available start and end times (lift hours: 09:00 - 16:00)
const START_TIMES = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00"];
const END_TIMES = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];

// Preferred 1h slots (09-10, 12-13, 13-14)
const PREFERRED_1H_SLOTS = ["09:00 - 10:00", "12:00 - 13:00", "13:00 - 14:00"];

// Unusual 1h slots (10-12 and 14-16 range)
const UNUSUAL_1H_SLOTS = ["10:00 - 11:00", "11:00 - 12:00", "14:00 - 15:00", "15:00 - 16:00"];

export function Step2ProductDates() {
  const {
    state,
    setProductType,
    setProductId,
    setSport,
    setDuration,
    setSelectedDates,
    setTimeSlot,
    setNumberOfPersons,
    setLunchDaysForParticipant,
    setVegetarianForParticipant,
    setUseParticipantSpecificBooking,
    setParticipantBooking,
    initializeParticipantBookings,
    copyBookingToAllParticipants,
    setTimeSelections,
    setPrivateGroupProposal,
  } = useBookingWizard();

  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<string | null>(null);

  // Fetch products from database
  const { data: products = [], isLoading } = useQuery({
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

  // Fetch private lesson rates and high season periods
  const { data: rates = [] } = usePrivateLessonRates();
  const { data: highSeasonPeriods = [] } = useHighSeasonPeriods();

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

  // Auto-sync numberOfPersons with selected participants for private lessons
  useEffect(() => {
    if (state.productType === "private") {
      const count = Math.min(Math.max(state.selectedParticipants.length, 1), MAX_PERSONS);
      if (count !== state.numberOfPersons) {
        setNumberOfPersons(count);
      }
    }
  }, [state.productType, state.selectedParticipants.length, state.numberOfPersons, setNumberOfPersons]);

  // Auto-run grouping algorithm for multi-participant private lessons
  const groupingResult = useMemo(() => {
    if (
      state.productType !== "private" ||
      state.selectedParticipants.length <= 1
    ) {
      return null;
    }
    return groupParticipants(state.selectedParticipants);
  }, [state.productType, state.selectedParticipants]);

  // Sync grouping result to context whenever it changes
  useEffect(() => {
    if (!groupingResult || !groupingResult.needsMultipleGroups) {
      // Clear proposal if not needed
      if (state.privateGroupProposal) {
        setPrivateGroupProposal(null);
      }
      return;
    }

    // Build proposal from algorithm result
    const baseStartTime = startTime || state.timeSlot?.split(" - ")[0] || null;
    const baseEndTime = endTime || state.timeSlot?.split(" - ")[1] || null;

    setPrivateGroupProposal({
      groups: groupingResult.groups.map((g) => ({
        id: g.id,
        participantIds: g.members.map((m) => m.participant.id),
        instructorId: null,
        instructor: null,
        startTime: baseStartTime,
        endTime: baseEndTime,
      })),
      warnings: groupingResult.warnings,
    });
  }, [groupingResult?.needsMultipleGroups, groupingResult?.groups.length, state.selectedParticipants.length]);

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

  // Calculate private lesson price using time-based pricing
  const privateLessonPrice = useMemo(() => {
    if (state.productType !== "private" || !startTime || !endTime || state.selectedDates.length === 0) {
      return null;
    }
    const firstDate = state.selectedDates[0] ? new Date(state.selectedDates[0]) : null;
    return calculatePrivateLessonPrice(
      firstDate,
      startTime,
      endTime,
      state.numberOfPersons,
      rates,
      highSeasonPeriods
    );
  }, [state.productType, startTime, endTime, state.selectedDates, state.numberOfPersons, rates, highSeasonPeriods]);

  // Check for young children (under 6) with duration > 1h
  const youngChildWarning = useMemo<BookingWarning | null>(() => {
    if (state.productType !== "private") return null;
    if (!calculatedDuration || calculatedDuration <= 1) return null;

    const youngParticipants = state.selectedParticipants.filter((p) => {
      const age = differenceInYears(new Date(), new Date(p.birth_date));
      return age < 6;
    });

    if (youngParticipants.length === 0) return null;

    const names = youngParticipants.map((p) => p.first_name).join(", ");
    return {
      id: "age-warning",
      type: "warning",
      icon: "age",
      message: `Intensive Session: Für ${names} (unter 6 Jahren) ist mehr als 1 Stunde sehr anspruchsvoll.`,
    };
  }, [state.productType, calculatedDuration, state.selectedParticipants]);

  // Find matching product (for group courses only now)
  const selectedProduct = useMemo(() => {
    if (state.productType === "group" && state.selectedDates.length > 0) {
      const daysCount = state.selectedDates.length;
      return products.find(
        (p) => p.type === "group" && p.name.includes(`${daysCount} Tag`)
      );
    }
    return null;
  }, [products, state.productType, state.selectedDates.length]);

  // Update productId when product changes (for group courses)
  useEffect(() => {
    if (selectedProduct && selectedProduct.id !== state.productId) {
      setProductId(selectedProduct.id);
    }
  }, [selectedProduct, state.productId, setProductId]);

  // Set default productId for private lessons
  useEffect(() => {
    if (state.productType === "private" && !state.productId) {
      const privateProduct = products.find(p => p.type === "private");
      if (privateProduct) {
        setProductId(privateProduct.id);
      }
    }
  }, [state.productType, state.productId, products, setProductId]);

  // Find lunch product
  const lunchProduct = products.find((p) => p.type === "lunch");

  const handleDateSelect = (dates: Date[] | undefined) => {
    if (dates) {
      const dateStrings = dates.map((d) => format(d, "yyyy-MM-dd"));
      setSelectedDates(dateStrings);
    }
  };

  // Calculate total for multiple days
  const totalForAllDays = useMemo(() => {
    if (!privateLessonPrice || state.selectedDates.length === 0) return 0;
    return privateLessonPrice.totalPrice * state.selectedDates.length;
  }, [privateLessonPrice, state.selectedDates.length]);

  // NEW: Detect if participants have different skill levels (including "unknown" for missing levels)
  const hasDifferentLevels = useMemo(() => {
    if (state.selectedParticipants.length < 2) return false;
    
    // Normalize levels - treat null/undefined as "unknown" to detect when some have levels and others don't
    const normalizedLevels = state.selectedParticipants.map(
      (p) => p.level_current_season || "unknown"
    );
    const uniqueLevels = new Set(normalizedLevels);
    
    // Different if more than one unique level
    return uniqueLevels.size > 1;
  }, [state.selectedParticipants]);

  // NEW: Detect if participants have very different ages (e.g., toddler + teen)
  const hasAgeMismatch = useMemo(() => {
    const ages = state.selectedParticipants.map((p) => {
      if (!p.birth_date) return null;
      return differenceInYears(new Date(), new Date(p.birth_date));
    }).filter((a): a is number => a !== null);
    
    if (ages.length < 2) return false;
    const hasToddler = ages.some((a) => a >= 3 && a <= 4);
    const hasOlder = ages.some((a) => a > 4);
    return hasToddler && hasOlder;
  }, [state.selectedParticipants]);

  // NEW: Handler for enabling participant-specific mode
  const handleEnableParticipantMode = () => {
    initializeParticipantBookings();
    setUseParticipantSpecificBooking(true);
  };

  // Auto-enable participant-specific mode for group bookings with different levels
  useEffect(() => {
    // Only auto-enable for group courses with multiple participants having different levels
    if (
      state.productType === "group" &&
      state.selectedParticipants.length > 1 &&
      (hasDifferentLevels || hasAgeMismatch) &&
      !state.useParticipantSpecificBooking
    ) {
      // Initialize participant bookings and enable individual mode
      initializeParticipantBookings();
      setUseParticipantSpecificBooking(true);
    }
  }, [
    state.productType,
    state.selectedParticipants.length,
    hasDifferentLevels,
    hasAgeMismatch,
    state.useParticipantSpecificBooking,
    initializeParticipantBookings,
    setUseParticipantSpecificBooking,
  ]);

  // NEW: Handler for participant booking changes
  const handleParticipantBookingChange = (booking: ParticipantBookingDetails) => {
    setParticipantBooking(booking.participantId, booking);
  };

  // NEW: Check if participant's booking differs from first participant
  const checkBookingDifference = (participantId: string): boolean => {
    if (!state.useParticipantSpecificBooking) return false;
    const firstId = state.selectedParticipants[0]?.id;
    if (!firstId || participantId === firstId) return false;
    
    const first = state.participantBookings[firstId];
    const current = state.participantBookings[participantId];
    if (!first || !current) return false;
    
    return (
      first.productType !== current.productType ||
      first.groupCourseId !== current.groupCourseId ||
      first.dates.length !== current.dates.length ||
      first.dates.some((d) => !current.dates.includes(d))
    );
  };

  if (isLoading) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Produkte werden geladen...
      </div>
    );
  }

  // NEW: Render participant-specific booking mode
  if (state.useParticipantSpecificBooking) {
    return (
      <div className="space-y-6 py-6">
        {/* Header with toggle */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <SplitSquareHorizontal className="h-5 w-5" />
              Individuelle Buchung
            </h3>
            <p className="text-sm text-muted-foreground">
              Jeder Teilnehmer kann unterschiedliche Kurse und Tage buchen
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="participant-mode" className="text-sm">Individuell</Label>
            <Switch
              id="participant-mode"
              checked={state.useParticipantSpecificBooking}
              onCheckedChange={setUseParticipantSpecificBooking}
            />
          </div>
        </div>

        {/* Participant Cards */}
        <div className="space-y-4">
          {state.selectedParticipants.map((participant, index) => (
            <ParticipantBookingCard
              key={participant.id}
              participant={participant}
              booking={state.participantBookings[participant.id] || {
                participantId: participant.id,
                productType: "group",
                productId: null,
                groupCourseId: null,
                dates: [],
                startTime: null,
                endTime: null,
                lunchDays: [],
                isVegetarian: false,
              }}
              onBookingChange={handleParticipantBookingChange}
              onCopyToAll={() => copyBookingToAllParticipants(state.selectedParticipants[0].id)}
              isFirst={index === 0}
              showDifferenceWarning={checkBookingDifference(participant.id)}
            />
          ))}
        </div>
      </div>
    );
  }

  // Helper to get level label inline
  const getLevelDisplayLabel = (level: string | null): string => {
    if (!level) return "Nicht angegeben";
    const levelMap: Record<string, string> = {
      anfaenger: "Anfänger",
      blue_prince: "Blue Prince",
      blue_king: "Blue King",
      red_prince: "Red Prince",
      red_king: "Red King",
      black_prince: "Black Prince",
      black_king: "Black King",
    };
    return levelMap[level] || level;
  };

  return (
    <div className="space-y-8 py-6">
      {/* Different Levels Warning - For private lessons (manual enable) */}
      {(hasDifferentLevels || hasAgeMismatch) && state.selectedParticipants.length > 1 && !state.useParticipantSpecificBooking && state.productType !== "group" && (
        <Alert className="bg-amber-50 border-amber-300 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <div className="space-y-3">
              <p className="font-medium">
                {hasDifferentLevels 
                  ? "Teilnehmer haben unterschiedliche Niveaus!" 
                  : "Teilnehmer haben sehr unterschiedliche Altersgruppen!"
                }
              </p>
              
              {/* Show each participant's level */}
              <div className="flex flex-wrap gap-2">
                {state.selectedParticipants.map((p) => {
                  const age = p.birth_date 
                    ? differenceInYears(new Date(), new Date(p.birth_date))
                    : null;
                  return (
                    <Badge 
                      key={p.id} 
                      variant="outline" 
                      className="bg-white/50 text-xs"
                    >
                      <User className="h-3 w-3 mr-1" />
                      {p.first_name}: {getLevelDisplayLabel(p.level_current_season)}
                      {age !== null && ` (${age}J)`}
                    </Badge>
                  );
                })}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                <span className="text-sm">
                  Mit "Individuelle Buchung" kann jeder Teilnehmer den passenden Kurs erhalten.
                </span>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleEnableParticipantMode}
                  className="shrink-0"
                >
                  <SplitSquareHorizontal className="h-4 w-4 mr-1" />
                  Individuelle Buchung aktivieren
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Toggle for participant-specific mode (always available) */}
      {state.selectedParticipants.length > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Label htmlFor="participant-mode-toggle" className="text-xs text-muted-foreground">
            Individuelle Buchung
          </Label>
          <Switch
            id="participant-mode-toggle"
            checked={state.useParticipantSpecificBooking}
            onCheckedChange={(checked) => {
              if (checked) {
                handleEnableParticipantMode();
              } else {
                setUseParticipantSpecificBooking(false);
              }
            }}
          />
        </div>
      )}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Buchungstyp</Label>
        <RadioGroup
          value={state.productType || ""}
          onValueChange={(value) => setProductType(value as "private" | "group")}
          className="grid grid-cols-2 gap-4"
        >
          <Label
            htmlFor="private"
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
              state.productType === "private"
                ? "border-primary bg-primary/5"
                : "border-muted hover:border-muted-foreground/30"
            }`}
          >
            <RadioGroupItem value="private" id="private" className="sr-only" />
            <span className="text-2xl">👤</span>
            <span className="font-medium">Privatstunde</span>
            <span className="text-xs text-muted-foreground">
              1:1 oder Kleingruppe
            </span>
          </Label>
          <Label
            htmlFor="group"
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
              state.productType === "group"
                ? "border-primary bg-primary/5"
                : "border-muted hover:border-muted-foreground/30"
            }`}
          >
            <RadioGroupItem value="group" id="group" className="sr-only" />
            <span className="text-2xl">👥</span>
            <span className="font-medium">Gruppenkurs</span>
            <span className="text-xs text-muted-foreground">
              5-12 Teilnehmer
            </span>
          </Label>
        </RadioGroup>

        {/* Participant Level Summary - shown when group is selected with multiple participants */}
        {state.productType === "group" && state.selectedParticipants.length > 1 && !state.useParticipantSpecificBooking && (
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="p-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Teilnehmer-Niveaus:</span>
                  {state.selectedParticipants.map((p) => (
                    <Badge key={p.id} variant="outline" className="text-xs">
                      {p.first_name}: {getLevelDisplayLabel(p.level_current_season)}
                    </Badge>
                  ))}
                </div>
                {hasDifferentLevels && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleEnableParticipantMode}
                    className="text-xs h-7"
                  >
                    <SplitSquareHorizontal className="h-3 w-3 mr-1" />
                    Einzeln buchen
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Sport Selection (for private lessons) */}
      {state.productType === "private" && (
        <div className="space-y-3">
          <Label className="text-base font-semibold">Sportart</Label>
          <ToggleGroup
            type="single"
            value={state.sport || ""}
            onValueChange={(value) => setSport(value as "ski" | "snowboard" || null)}
            className="justify-start gap-3"
          >
            <ToggleGroupItem
              value="ski"
              className="flex items-center gap-2 px-6 py-3"
            >
              <Snowflake className="h-4 w-4" />
              Ski
            </ToggleGroupItem>
            <ToggleGroupItem
              value="snowboard"
              className="flex items-center gap-2 px-6 py-3"
            >
              <Sun className="h-4 w-4" />
              Snowboard
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}

      {/* Time Selection (for private lessons) */}
      {state.productType === "private" && (
        <div className="space-y-3">
          <Label className="text-base font-semibold">Zeitfenster</Label>
          
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground mb-1 block">Startzeit</Label>
              <Select
                value={startTime || ""}
                onValueChange={(value) => {
                  setStartTime(value);
                  // Reset end time if it's not valid anymore
                  if (endTime && parseInt(value.split(":")[0]) >= parseInt(endTime.split(":")[0])) {
                    setEndTime(null);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Start wählen" />
                </SelectTrigger>
                <SelectContent>
                  {START_TIMES.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <ArrowRight className="h-4 w-4 text-muted-foreground mt-5" />
            
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground mb-1 block">Endzeit</Label>
              <Select
                value={endTime || ""}
                onValueChange={setEndTime}
                disabled={!startTime}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Ende wählen" />
                </SelectTrigger>
                <SelectContent>
                  {availableEndTimes.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {calculatedDuration && (
              <div className="flex items-center gap-2 mt-5">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Badge variant="secondary">
                  {calculatedDuration} {calculatedDuration === 1 ? "Stunde" : "Stunden"}
                </Badge>
              </div>
            )}
          </div>
          
          {/* Info hint for 1h lessons */}
          {calculatedDuration === 1 && (
            <Alert className="bg-blue-50 border-blue-200">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                Einzelstunden sind normalerweise um 09:00, 12:00 oder 13:00 Uhr möglich. 
                Andere Zeiten können bei Bedarf ausgewählt werden.
              </AlertDescription>
            </Alert>
          )}
          
          {/* Warning when unusual slot is selected */}
          {isUnusualSlot && (
            <Alert className="bg-amber-50 border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                Diese Startzeit ist unüblich für Einzelstunden. Bitte bestätigen Sie die Auswahl.
              </AlertDescription>
            </Alert>
          )}

          {/* Age warning for young children with long lessons */}
          {youngChildWarning && (
            <BookingWarnings warnings={[youngChildWarning]} />
          )}
        </div>
      )}

      {/* Number of Persons (for private lessons) - Auto-synced with selected participants */}
      {state.productType === "private" && (
        <div className="space-y-3">
          <Label className="text-base font-semibold">
            <Users className="mr-2 inline h-4 w-4" />
            Anzahl Personen
          </Label>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-muted rounded-lg px-4 py-2">
              <span className="font-semibold text-lg">
                {state.numberOfPersons}
              </span>
              <span className="text-sm text-muted-foreground">
                {state.numberOfPersons === 1 ? "Person" : "Personen"}
              </span>
            </div>
            <span className="text-sm text-muted-foreground">
              (basierend auf {state.selectedParticipants.length} ausgewählten Teilnehmern, max. {MAX_PERSONS})
            </span>
          </div>

          {state.numberOfPersons > 1 && (
            <p className="text-sm text-muted-foreground">
              +{formatCHF(ADDITIONAL_PERSON_RATE)} pro zusätzliche Person pro Stunde
            </p>
          )}
        </div>
      )}

      {/* Date Selection */}
      {state.productType && (
        <div className="space-y-3">
          <Label className="text-base font-semibold">
            <CalendarDays className="mr-2 inline h-4 w-4" />
            {state.productType === "private" ? "Datum wählen" : "Kurstage wählen"}
          </Label>

          <Card>
            <CardContent className="p-4">
              <RangeDatePicker
                selected={state.selectedDates.map((d) => parseISO(d))}
                onSelect={handleDateSelect}
                month={selectedMonth}
                onMonthChange={setSelectedMonth}
                minDate={new Date()}
                showQuickActions={true}
              />
            </CardContent>
          </Card>

          {state.selectedDates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {state.selectedDates.sort().map((date) => (
                <Badge
                  key={date}
                  variant="secondary"
                  className="text-xs"
                >
                  {format(parseISO(date), "EEE, d. MMM", { locale: de })}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Unified Time Selection Grid (for multi-day private lessons) */}
      {state.productType === "private" && state.selectedDates.length > 1 && (
        <div className="space-y-3">
          <Label className="text-base font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Zeitauswahl
          </Label>
          <Card>
            <CardContent className="p-4">
              <BookingTimeGrid
                selectedDates={state.selectedDates}
                timeSelections={state.timeSelections}
                onSelectionChange={setTimeSelections}
                minDuration={60}
                maxDuration={240}
              />
            </CardContent>
          </Card>
        </div>
      )}


      {/* Lunch Supervision Add-on (only for group lessons) */}
      {state.productType === "group" && state.selectedDates.length > 0 && state.selectedParticipants.length > 0 && (
        <div className="space-y-3">
          <Label className="text-base font-semibold">Zusatzoptionen</Label>
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

      {/* High Season Warning for Private Lessons */}
      {privateLessonPrice?.warnings.map((warning, index) => (
        <Alert key={index} className="bg-amber-50 border-amber-200">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            {warning}
          </AlertDescription>
        </Alert>
      ))}

      {/* Price Preview - Private Lessons with time-based pricing */}
      {state.productType === "private" && privateLessonPrice && privateLessonPrice.totalPrice > 0 && (
        <Card className="bg-muted/50">
          <CardContent className="p-4 space-y-3">
            {/* High Season Badge */}
            {privateLessonPrice.isHighSeason && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                  <Mountain className="h-3 w-3 mr-1" />
                  Hochsaison
                </Badge>
              </div>
            )}

            {/* Price Breakdown */}
            <div className="space-y-1">
              <p className="font-medium">Preisberechnung pro Tag:</p>
              <div className="text-sm text-muted-foreground space-y-0.5">
                {privateLessonPrice.breakdown.map((item, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>
                      {item.timeSlot} ({item.isPeak ? "Hauptzeit" : "Randzeit"})
                    </span>
                    <span>{formatCHF(item.rate)}</span>
                  </div>
                ))}
                {state.numberOfPersons > 1 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>
                      Zusatzpersonen ({state.numberOfPersons - 1} × {privateLessonPrice.durationHours}h × {formatCHF(ADDITIONAL_PERSON_RATE)})
                    </span>
                    <span>{formatCHF(privateLessonPrice.additionalPersonsPrice)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Daily Total */}
            <div className="flex justify-between border-t pt-2">
              <span className="font-medium">Pro Tag:</span>
              <span className="font-medium">{formatCHF(privateLessonPrice.totalPrice)}</span>
            </div>

            {/* Grand Total for multiple days */}
            {state.selectedDates.length > 1 && (
              <div className="flex justify-between text-lg font-bold">
                <span>{state.selectedDates.length} Tage Total:</span>
                <span>{formatCHF(totalForAllDays)}</span>
              </div>
            )}

            {/* Single day total */}
            {state.selectedDates.length === 1 && (
              <div className="flex justify-between text-2xl font-bold">
                <span>Total:</span>
                <span>{formatCHF(privateLessonPrice.totalPrice)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Multi-Group Proposal for private lessons with incompatible participants */}
      {groupingResult?.needsMultipleGroups && state.privateGroupProposal && (
        <PrivateGroupProposal
          algorithmGroups={groupingResult.groups}
          algorithmWarnings={groupingResult.warnings}
          rates={rates}
          highSeasonPeriods={highSeasonPeriods}
        />
      )}

      {/* Price Preview - Group Courses (unchanged) */}
      {state.productType === "group" && selectedProduct && (
        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{selectedProduct.name}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">
                  CHF {selectedProduct.price.toFixed(0)}
                </p>
                {(() => {
                  const totalLunchDays = Object.values(state.lunchSelections).reduce(
                    (sum, days) => sum + days.length,
                    0
                  );
                  const lunchPrice = totalLunchDays * (lunchProduct?.price || 25);
                  return totalLunchDays > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      + CHF {lunchPrice.toFixed(0)} Mittagsbetreuung ({totalLunchDays} Tage)
                    </p>
                  ) : null;
                })()}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
