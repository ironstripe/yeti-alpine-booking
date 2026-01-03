import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, isWithinInterval } from "date-fns";
import { de } from "date-fns/locale";
import { Snowflake, Sun, AlertTriangle, Clock, CalendarDays, Info } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useBookingWizard } from "@/contexts/BookingWizardContext";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Calendar } from "@/components/ui/calendar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

// High season date ranges for current season
const HIGH_SEASON_RANGES = [
  { start: "2025-12-23", end: "2026-01-05" },
  { start: "2026-02-10", end: "2026-03-01" },
];

function isHighSeasonDate(dateStr: string): boolean {
  const date = parseISO(dateStr);
  return HIGH_SEASON_RANGES.some((range) =>
    isWithinInterval(date, { start: parseISO(range.start), end: parseISO(range.end) })
  );
}

const TIME_SLOTS = [
  { value: "09:00 - 10:00", label: "09:00", duration: 1 },
  { value: "09:00 - 11:00", label: "09:00", duration: 2 },
  { value: "09:00 - 13:00", label: "09:00", duration: 4 },
  { value: "10:00 - 11:00", label: "10:00", duration: 1 },
  { value: "10:00 - 12:00", label: "10:00", duration: 2 },
  { value: "10:00 - 14:00", label: "10:00", duration: 4 },
  { value: "11:00 - 12:00", label: "11:00", duration: 1 },
  { value: "11:00 - 13:00", label: "11:00", duration: 2 },
  { value: "12:00 - 13:00", label: "12:00", duration: 1 },
  { value: "13:00 - 14:00", label: "13:00", duration: 1 },
  { value: "13:00 - 15:00", label: "13:00", duration: 2 },
  { value: "14:00 - 15:00", label: "14:00", duration: 1 },
  { value: "14:00 - 16:00", label: "14:00", duration: 2 },
  { value: "14:00 - 18:00", label: "14:00", duration: 4 },
];

// Preferred 1h slots (09-10, 12-13, 13-14)
const PREFERRED_1H_SLOTS = ["09:00 - 10:00", "12:00 - 13:00", "13:00 - 14:00"];

// Unusual 1h slots (10-12 and 14-16 range)
const UNUSUAL_1H_SLOTS = ["10:00 - 11:00", "11:00 - 12:00", "14:00 - 15:00"];

// High season allowed slots (only 10:00 and 14:00, min 2h)
const HIGH_SEASON_SLOTS = TIME_SLOTS.filter(
  (slot) => (slot.label === "10:00" || slot.label === "14:00") && slot.duration >= 2
);

export function Step2ProductDates() {
  const {
    state,
    setProductType,
    setProductId,
    setSport,
    setDuration,
    setSelectedDates,
    setTimeSlot,
    setIncludeLunch,
  } = useBookingWizard();

  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());

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

  // Check if any selected date is in high season
  const hasHighSeasonDate = useMemo(() => {
    return state.selectedDates.some(isHighSeasonDate);
  }, [state.selectedDates]);

  // Filter time slots based on duration and high season
  const availableTimeSlots = useMemo(() => {
    if (!state.duration) return [];
    
    const durationSlots = TIME_SLOTS.filter((slot) => slot.duration === state.duration);
    
    if (hasHighSeasonDate) {
      // In high season, only allow 10:00 and 14:00 starts with min 2h
      return durationSlots.filter(
        (slot) => (slot.label === "10:00" || slot.label === "14:00")
      );
    }
    
    return durationSlots;
  }, [state.duration, hasHighSeasonDate]);

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
  useMemo(() => {
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

  if (isLoading) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Produkte werden geladen...
      </div>
    );
  }

  return (
    <div className="space-y-8 py-6">
      {/* Product Type Selection */}
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

      {/* Duration Selection (for private lessons) */}
      {state.productType === "private" && (
        <div className="space-y-3">
          <Label className="text-base font-semibold">Dauer</Label>
          <ToggleGroup
            type="single"
            value={state.duration?.toString() || ""}
            onValueChange={(value) => {
              setDuration(value ? parseInt(value) : null);
              setTimeSlot(null); // Reset time slot when duration changes
            }}
            className="justify-start gap-3"
          >
            {!hasHighSeasonDate && (
              <ToggleGroupItem value="1" className="flex items-center gap-2 px-6 py-3">
                <Clock className="h-4 w-4" />
                1 Stunde
                <Badge variant="secondary" className="ml-2">
                  CHF 95
                </Badge>
              </ToggleGroupItem>
            )}
            <ToggleGroupItem value="2" className="flex items-center gap-2 px-6 py-3">
              <Clock className="h-4 w-4" />
              2 Stunden
              <Badge variant="secondary" className="ml-2">
                CHF 180
              </Badge>
            </ToggleGroupItem>
            <ToggleGroupItem value="4" className="flex items-center gap-2 px-6 py-3">
              <Clock className="h-4 w-4" />
              4 Stunden
              <Badge variant="secondary" className="ml-2">
                CHF 340
              </Badge>
            </ToggleGroupItem>
          </ToggleGroup>
          {hasHighSeasonDate && (
            <p className="text-sm text-muted-foreground">
              In der Hochsaison beträgt die Mindestdauer 2 Stunden.
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
          
          {hasHighSeasonDate && (
            <Alert variant="destructive" className="bg-orange-50 border-orange-200">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-800">
                <strong>Hochsaison:</strong> Eingeschränkte Startzeiten (10:00 / 14:00) 
                und Mindestdauer 2h gelten.
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardContent className="p-0">
              <Calendar
                mode="multiple"
                selected={state.selectedDates.map((d) => parseISO(d))}
                onSelect={handleDateSelect}
                month={selectedMonth}
                onMonthChange={setSelectedMonth}
                locale={de}
                className="rounded-md"
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                modifiers={{
                  highSeason: (date) => isHighSeasonDate(format(date, "yyyy-MM-dd")),
                }}
                modifiersStyles={{
                  highSeason: {
                    backgroundColor: "hsl(var(--warning) / 0.2)",
                    borderRadius: "4px",
                  },
                }}
              />
            </CardContent>
          </Card>

          {state.selectedDates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {state.selectedDates.sort().map((date) => (
                <Badge
                  key={date}
                  variant={isHighSeasonDate(date) ? "destructive" : "secondary"}
                  className="text-xs"
                >
                  {format(parseISO(date), "EEE, d. MMM", { locale: de })}
                  {isHighSeasonDate(date) && " (HS)"}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Time Slot Selection (for private lessons) */}
      {state.productType === "private" && state.duration && state.selectedDates.length > 0 && (
        <div className="space-y-3">
          <Label className="text-base font-semibold">Startzeit</Label>
          
          {/* Info hint for 1h lessons */}
          {state.duration === 1 && (
            <Alert className="bg-blue-50 border-blue-200">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                Einzelstunden sind normalerweise um 09:00, 12:00 oder 13:00 Uhr möglich. 
                Andere Zeiten können bei Bedarf ausgewählt werden.
              </AlertDescription>
            </Alert>
          )}
          
          <RadioGroup
            value={state.timeSlot || ""}
            onValueChange={setTimeSlot}
            className="grid grid-cols-2 sm:grid-cols-3 gap-2"
          >
            {availableTimeSlots.map((slot) => {
              const isUnusual = state.duration === 1 && UNUSUAL_1H_SLOTS.includes(slot.value);
              const isPreferred = state.duration === 1 && PREFERRED_1H_SLOTS.includes(slot.value);
              
              return (
                <Label
                  key={slot.value}
                  htmlFor={slot.value}
                  className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 transition-colors ${
                    state.timeSlot === slot.value
                      ? "border-primary bg-primary/5"
                      : isUnusual
                        ? "border-muted bg-muted/30 hover:border-amber-400"
                        : "border-muted hover:border-muted-foreground/30"
                  }`}
                >
                  <RadioGroupItem value={slot.value} id={slot.value} className="sr-only" />
                  <span className={`font-mono text-sm ${isUnusual ? "text-muted-foreground" : ""}`}>
                    {slot.value}
                  </span>
                  {isUnusual && (
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                  )}
                </Label>
              );
            })}
          </RadioGroup>
          
          {/* Warning when unusual slot is selected */}
          {state.duration === 1 && state.timeSlot && UNUSUAL_1H_SLOTS.includes(state.timeSlot) && (
            <Alert className="bg-amber-50 border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                Diese Startzeit ist unüblich für Einzelstunden. Bitte bestätigen Sie die Auswahl.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Lunch Supervision Add-on (only for group lessons) */}
      {state.productType === "group" && lunchProduct && (
        <div className="space-y-3">
          <Label className="text-base font-semibold">Zusatzoptionen</Label>
          <Card className="p-4">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="lunch"
                checked={state.includeLunch}
                onCheckedChange={(checked) => setIncludeLunch(checked as boolean)}
              />
              <div className="flex-1">
                <label
                  htmlFor="lunch"
                  className="text-sm font-medium cursor-pointer"
                >
                  {lunchProduct.name}
                </label>
                <p className="text-xs text-muted-foreground">
                  {lunchProduct.description}
                </p>
              </div>
              <Badge variant="outline">CHF {lunchProduct.price}</Badge>
            </div>
          </Card>
        </div>
      )}

      {/* Price Preview */}
      {selectedProduct && (
        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{selectedProduct.name}</p>
                {state.productType === "private" && state.selectedDates.length > 1 && (
                  <p className="text-sm text-muted-foreground">
                    {state.selectedDates.length} Tage × CHF {selectedProduct.price}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">
                  CHF{" "}
                  {state.productType === "private"
                    ? (selectedProduct.price * state.selectedDates.length).toFixed(0)
                    : selectedProduct.price.toFixed(0)}
                </p>
                {state.includeLunch && lunchProduct && (
                  <p className="text-sm text-muted-foreground">
                    + CHF {(lunchProduct.price * state.selectedDates.length).toFixed(0)} Mittagsbetreuung
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
