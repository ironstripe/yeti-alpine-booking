import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { Snowflake, Sun, AlertTriangle, Clock, CalendarDays, Info, ArrowRight } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    setIncludeLunch,
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

  // Calculate duration from start and end time
  const calculatedDuration = useMemo(() => {
    if (!startTime || !endTime) return null;
    const startHour = parseInt(startTime.split(":")[0]);
    const endHour = parseInt(endTime.split(":")[0]);
    return endHour - startHour;
  }, [startTime, endTime]);

  // Update wizard state when time changes
  useMemo(() => {
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
            <CardContent className="p-0">
              <Calendar
                mode="multiple"
                selected={state.selectedDates.map((d) => parseISO(d))}
                onSelect={handleDateSelect}
                month={selectedMonth}
                onMonthChange={setSelectedMonth}
                locale={de}
                className="rounded-md pointer-events-auto"
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
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
