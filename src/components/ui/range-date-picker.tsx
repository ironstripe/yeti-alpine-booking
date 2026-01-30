import * as React from "react";
import { useState, useCallback, useRef, useEffect } from "react";
import { DayPicker, DateRange } from "react-day-picker";
import { format, eachDayOfInterval, startOfWeek, endOfWeek, isAfter, isBefore, isSameDay, parseISO, addDays } from "date-fns";
import { de } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export interface RangeDatePickerProps {
  selected: Date[];
  onSelect: (dates: Date[]) => void;
  disabled?: (date: Date) => boolean;
  month?: Date;
  onMonthChange?: (month: Date) => void;
  className?: string;
  /** Minimum date that can be selected */
  minDate?: Date;
  /** Show quick action buttons */
  showQuickActions?: boolean;
}

export function RangeDatePicker({
  selected,
  onSelect,
  disabled,
  month,
  onMonthChange,
  className,
  minDate = new Date(),
  showQuickActions = true,
}: RangeDatePickerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Date | null>(null);
  const [dragPreview, setDragPreview] = useState<DateRange | null>(null);
  const [isRangeMode, setIsRangeMode] = useState(false);
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Internal month state if not controlled
  const [internalMonth, setInternalMonth] = useState<Date>(month || new Date());
  const currentMonth = month || internalMonth;
  const handleMonthChange = onMonthChange || setInternalMonth;

  // Check if date is disabled
  const isDateDisabled = useCallback(
    (date: Date) => {
      if (disabled?.(date)) return true;
      if (minDate && isBefore(date, minDate) && !isSameDay(date, minDate)) return true;
      return false;
    },
    [disabled, minDate]
  );

  // Check if date is selected
  const isDateSelected = useCallback(
    (date: Date) => {
      return selected.some((d) => isSameDay(d, date));
    },
    [selected]
  );

  // Check if date is in drag preview
  const isInDragPreview = useCallback(
    (date: Date) => {
      if (!dragPreview?.from || !dragPreview?.to) return false;
      const from = dragPreview.from <= dragPreview.to ? dragPreview.from : dragPreview.to;
      const to = dragPreview.from <= dragPreview.to ? dragPreview.to : dragPreview.from;
      return (
        (isAfter(date, from) || isSameDay(date, from)) &&
        (isBefore(date, to) || isSameDay(date, to))
      );
    },
    [dragPreview]
  );

  // Handle drag start
  const handleDayMouseDown = useCallback(
    (date: Date, e: React.MouseEvent) => {
      if (isDateDisabled(date)) return;
      e.preventDefault();
      
      if (isRangeMode) {
        // Range mode: first click sets start, second click sets end
        if (!rangeStart) {
          setRangeStart(date);
          setDragPreview({ from: date, to: date });
        } else {
          // Complete range selection
          const from = rangeStart <= date ? rangeStart : date;
          const to = rangeStart <= date ? date : rangeStart;
          const rangeDates = eachDayOfInterval({ start: from, end: to }).filter(
            (d) => !isDateDisabled(d)
          );
          const newSelected = [...selected];
          rangeDates.forEach((d) => {
            if (!newSelected.some((s) => isSameDay(s, d))) {
              newSelected.push(d);
            }
          });
          onSelect(newSelected.sort((a, b) => a.getTime() - b.getTime()));
          setRangeStart(null);
          setDragPreview(null);
          setIsRangeMode(false);
        }
        return;
      }
      
      // Normal mode: start drag
      setIsDragging(true);
      setDragStart(date);
      setDragPreview({ from: date, to: date });
    },
    [isDateDisabled, isRangeMode, rangeStart, selected, onSelect]
  );

  // Handle drag over day
  const handleDayMouseEnter = useCallback(
    (date: Date) => {
      if (isRangeMode && rangeStart) {
        // Update preview in range mode
        setDragPreview({ from: rangeStart, to: date });
        return;
      }
      
      if (!isDragging || !dragStart) return;
      const from = dragStart <= date ? dragStart : date;
      const to = dragStart <= date ? date : dragStart;
      setDragPreview({ from, to });
    },
    [isDragging, dragStart, isRangeMode, rangeStart]
  );

  // Handle drag end
  const handleMouseUp = useCallback(() => {
    if (!isDragging || !dragPreview?.from || !dragPreview?.to) {
      setIsDragging(false);
      setDragStart(null);
      return;
    }

    const from = dragPreview.from <= dragPreview.to ? dragPreview.from : dragPreview.to;
    const to = dragPreview.from <= dragPreview.to ? dragPreview.to : dragPreview.from;
    
    // If only one day selected (no drag), toggle it
    if (isSameDay(from, to)) {
      const isCurrentlySelected = isDateSelected(from);
      if (isCurrentlySelected) {
        onSelect(selected.filter((d) => !isSameDay(d, from)));
      } else {
        onSelect([...selected, from].sort((a, b) => a.getTime() - b.getTime()));
      }
    } else {
      // Multi-day drag: add all days in range
      const rangeDates = eachDayOfInterval({ start: from, end: to }).filter(
        (d) => !isDateDisabled(d)
      );
      const newSelected = [...selected];
      rangeDates.forEach((d) => {
        if (!newSelected.some((s) => isSameDay(s, d))) {
          newSelected.push(d);
        }
      });
      onSelect(newSelected.sort((a, b) => a.getTime() - b.getTime()));
    }

    setIsDragging(false);
    setDragStart(null);
    setDragPreview(null);
  }, [isDragging, dragPreview, selected, onSelect, isDateDisabled, isDateSelected]);

  // Add global mouse up listener for drag
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        handleMouseUp();
      }
    };
    
    document.addEventListener("mouseup", handleGlobalMouseUp);
    return () => document.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [isDragging, handleMouseUp]);

  // Touch handling for mobile
  const handleTouchStart = useCallback(
    (date: Date, e: React.TouchEvent) => {
      if (isDateDisabled(date)) return;
      e.preventDefault();
      setIsDragging(true);
      setDragStart(date);
      setDragPreview({ from: date, to: date });
    },
    [isDateDisabled]
  );

  // Quick action: select weekdays of current week view
  const selectWeekdays = useCallback(() => {
    const start = startOfWeek(currentMonth, { locale: de, weekStartsOn: 1 });
    const end = endOfWeek(currentMonth, { locale: de, weekStartsOn: 1 });
    const weekDays = eachDayOfInterval({ start, end }).filter((d) => {
      const day = d.getDay();
      return day !== 0 && day !== 6 && !isDateDisabled(d);
    });
    const newSelected = [...selected];
    weekDays.forEach((d) => {
      if (!newSelected.some((s) => isSameDay(s, d))) {
        newSelected.push(d);
      }
    });
    onSelect(newSelected.sort((a, b) => a.getTime() - b.getTime()));
  }, [currentMonth, selected, onSelect, isDateDisabled]);

  // Quick action: select full week
  const selectFullWeek = useCallback(() => {
    const start = startOfWeek(currentMonth, { locale: de, weekStartsOn: 1 });
    const end = endOfWeek(currentMonth, { locale: de, weekStartsOn: 1 });
    const weekDays = eachDayOfInterval({ start, end }).filter((d) => !isDateDisabled(d));
    const newSelected = [...selected];
    weekDays.forEach((d) => {
      if (!newSelected.some((s) => isSameDay(s, d))) {
        newSelected.push(d);
      }
    });
    onSelect(newSelected.sort((a, b) => a.getTime() - b.getTime()));
  }, [currentMonth, selected, onSelect, isDateDisabled]);

  // Clear all
  const clearSelection = useCallback(() => {
    onSelect([]);
    setIsRangeMode(false);
    setRangeStart(null);
    setDragPreview(null);
  }, [onSelect]);

  // Get modifiers for the calendar
  const modifiers = {
    selected: selected,
    dragPreview: dragPreview
      ? eachDayOfInterval({
          start:
            dragPreview.from && dragPreview.to
              ? dragPreview.from <= dragPreview.to
                ? dragPreview.from
                : dragPreview.to
              : dragPreview.from || new Date(),
          end:
            dragPreview.from && dragPreview.to
              ? dragPreview.from <= dragPreview.to
                ? dragPreview.to
                : dragPreview.from
              : dragPreview.to || new Date(),
        })
      : [],
    rangeStart: rangeStart ? [rangeStart] : [],
  };

  // Selection summary
  const selectionSummary = React.useMemo(() => {
    if (selected.length === 0) return null;
    const sorted = [...selected].sort((a, b) => a.getTime() - b.getTime());
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (selected.length === 1) {
      return format(first, "EEE d. MMM", { locale: de });
    }
    return `${format(first, "EEE d.", { locale: de })} - ${format(last, "EEE d. MMM", { locale: de })} (${selected.length} Tage)`;
  }, [selected]);

  return (
    <div className={cn("space-y-3", className)} ref={containerRef}>
      {/* Mode toggle and quick actions */}
      {showQuickActions && (
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={isRangeMode ? "range" : "single"}
            onValueChange={(v) => {
              setIsRangeMode(v === "range");
              setRangeStart(null);
              setDragPreview(null);
            }}
            className="h-8"
          >
            <ToggleGroupItem value="single" className="text-xs h-8 px-3">
              Einzeln
            </ToggleGroupItem>
            <ToggleGroupItem value="range" className="text-xs h-8 px-3">
              Zeitraum
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="flex gap-1 ml-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={selectWeekdays}
            >
              Mo-Fr
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={selectFullWeek}
            >
              Ganze Woche
            </Button>
            {selected.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-destructive hover:text-destructive"
                onClick={clearSelection}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Range mode hint */}
      {isRangeMode && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
          {rangeStart
            ? `Startdatum: ${format(rangeStart, "d. MMM", { locale: de })} — Jetzt Enddatum wählen`
            : "Klicken Sie auf das Startdatum"}
        </div>
      )}

      {/* Calendar */}
      <DayPicker
        mode="multiple"
        selected={selected}
        month={currentMonth}
        onMonthChange={handleMonthChange}
        locale={de}
        weekStartsOn={1}
        showOutsideDays={false}
        disabled={disabled}
        modifiers={modifiers}
        modifiersClassNames={{
          selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
          dragPreview: "bg-primary/30 text-primary-foreground",
          rangeStart: "ring-2 ring-primary ring-offset-1",
        }}
        className={cn("p-3 pointer-events-auto select-none")}
        classNames={{
          months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
          month: "space-y-4",
          caption: "flex justify-center pt-1 relative items-center",
          caption_label: "text-sm font-medium",
          nav: "space-x-1 flex items-center",
          nav_button: cn(
            buttonVariants({ variant: "outline" }),
            "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
          ),
          nav_button_previous: "absolute left-1",
          nav_button_next: "absolute right-1",
          table: "w-full border-collapse space-y-1",
          head_row: "flex",
          head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
          row: "flex w-full mt-2",
          cell: cn(
            "h-9 w-9 text-center text-sm p-0 relative",
            "[&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
            "focus-within:relative focus-within:z-20"
          ),
          day: cn(
            buttonVariants({ variant: "ghost" }),
            "h-9 w-9 p-0 font-normal aria-selected:opacity-100 cursor-pointer"
          ),
          day_selected:
            "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
          day_today: "bg-accent text-accent-foreground",
          day_outside: "day-outside text-muted-foreground opacity-50",
          day_disabled: "text-muted-foreground opacity-50 cursor-not-allowed",
          day_hidden: "invisible",
        }}
        components={{
          IconLeft: () => <ChevronLeft className="h-4 w-4" />,
          IconRight: () => <ChevronRight className="h-4 w-4" />,
          Day: ({ date, displayMonth, ...props }) => {
            const isDisabled = isDateDisabled(date);
            const isSelected = isDateSelected(date);
            const inPreview = isInDragPreview(date) && !isSelected;
            const isRangeStartDate = rangeStart && isSameDay(date, rangeStart);

            return (
              <button
                {...props}
                type="button"
                disabled={isDisabled}
                onMouseDown={(e) => handleDayMouseDown(date, e)}
                onMouseEnter={() => handleDayMouseEnter(date)}
                onTouchStart={(e) => handleTouchStart(date, e)}
                className={cn(
                  buttonVariants({ variant: "ghost" }),
                  "h-9 w-9 p-0 font-normal cursor-pointer transition-colors",
                  isSelected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                  inPreview && "bg-primary/30",
                  isRangeStartDate && "ring-2 ring-primary ring-offset-1",
                  isDisabled && "text-muted-foreground opacity-50 cursor-not-allowed",
                  !isDisabled && !isSelected && !inPreview && "hover:bg-accent hover:text-accent-foreground",
                  isSameDay(date, new Date()) && !isSelected && "bg-accent text-accent-foreground"
                )}
              >
                {format(date, "d")}
              </button>
            );
          },
        }}
      />

      {/* Selection summary */}
      {selectionSummary && (
        <div className="flex items-center justify-between text-sm bg-muted/50 rounded-md px-3 py-2">
          <span className="text-muted-foreground">Ausgewählt:</span>
          <span className="font-medium">{selectionSummary}</span>
        </div>
      )}
    </div>
  );
}

RangeDatePicker.displayName = "RangeDatePicker";
