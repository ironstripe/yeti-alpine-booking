import { useState } from "react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { UtensilsCrossed, Check, Leaf } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface LunchDaySelectorProps {
  selectedDates: string[];
  lunchDays: string[];
  onLunchDaysChange: (days: string[]) => void;
  isVegetarian?: boolean;
  onVegetarianChange?: (isVegetarian: boolean) => void;
  pricePerDay?: number;
  disabled?: boolean;
}

export function LunchDaySelector({
  selectedDates,
  lunchDays,
  onLunchDaysChange,
  isVegetarian = false,
  onVegetarianChange,
  pricePerDay = 25,
  disabled = false,
}: LunchDaySelectorProps) {
  const [open, setOpen] = useState(false);

  const toggleDay = (date: string) => {
    if (lunchDays.includes(date)) {
      onLunchDaysChange(lunchDays.filter((d) => d !== date));
    } else {
      onLunchDaysChange([...lunchDays, date]);
    }
  };

  const selectAll = () => {
    onLunchDaysChange([...selectedDates]);
  };

  const clearAll = () => {
    onLunchDaysChange([]);
  };

  const totalPrice = lunchDays.length * pricePerDay;
  const sortedDates = [...selectedDates].sort();
  const hasLunchDays = lunchDays.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-7 px-2 gap-1.5",
            hasLunchDays && "border-primary bg-primary/5"
          )}
          disabled={disabled || selectedDates.length === 0}
        >
          <UtensilsCrossed className="h-3.5 w-3.5" />
          {hasLunchDays ? (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] gap-0.5">
              {lunchDays.length}/{selectedDates.length}
              {isVegetarian && <Leaf className="h-2.5 w-2.5 text-green-600" />}
            </Badge>
          ) : (
            <span className="text-xs">Mittag</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Mittagsbetreuung</h4>
            <span className="text-xs text-muted-foreground">
              CHF {pricePerDay}/Tag
            </span>
          </div>

          {/* Day Grid */}
          <div className="flex flex-wrap gap-1.5">
            {sortedDates.map((date) => {
              const isSelected = lunchDays.includes(date);
              const dayLabel = format(parseISO(date), "EEE", { locale: de });
              const dateLabel = format(parseISO(date), "d.", { locale: de });

              return (
                <button
                  key={date}
                  onClick={() => toggleDay(date)}
                  className={cn(
                    "flex flex-col items-center justify-center w-12 h-12 rounded-lg border-2 transition-all",
                    isSelected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-muted hover:border-primary/50 bg-background"
                  )}
                >
                  <span className="text-[10px] uppercase font-medium">
                    {dayLabel}
                  </span>
                  <span className="text-sm font-semibold">{dateLabel}</span>
                  {isSelected && (
                    <Check className="h-3 w-3 mt-0.5" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Vegetarian Option - Only visible when days are selected */}
          {hasLunchDays && onVegetarianChange && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  Verpflegung:
                </Label>
                <RadioGroup
                  value={isVegetarian ? "vegetarian" : "normal"}
                  onValueChange={(value) => onVegetarianChange(value === "vegetarian")}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="normal" id="normal" className="h-3.5 w-3.5" />
                    <Label htmlFor="normal" className="text-xs cursor-pointer">
                      Normal
                    </Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RadioGroupItem value="vegetarian" id="vegetarian" className="h-3.5 w-3.5" />
                    <Label htmlFor="vegetarian" className="text-xs cursor-pointer flex items-center gap-1">
                      <Leaf className="h-3 w-3 text-green-600" />
                      Vegetarisch
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </>
          )}

          {/* Quick Actions */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={selectAll}
                disabled={lunchDays.length === selectedDates.length}
              >
                Alle
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={clearAll}
                disabled={lunchDays.length === 0}
              >
                Keine
              </Button>
            </div>

            {/* Total */}
            {hasLunchDays && (
              <div className="text-right">
                <span className="text-xs text-muted-foreground">
                  {lunchDays.length} × CHF {pricePerDay} ={" "}
                </span>
                <span className="font-semibold">CHF {totalPrice}</span>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
