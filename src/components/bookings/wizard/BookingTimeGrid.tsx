import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RotateCcw, Copy } from "lucide-react";

// Operational hours (lift times)
const HOURS = [9, 10, 11, 12, 13, 14, 15];

export interface TimeSelection {
  date: string;
  startTime: string;
  endTime: string;
}

interface BookingTimeGridProps {
  selectedDates: string[];
  timeSelections: TimeSelection[];
  onSelectionChange: (selections: TimeSelection[]) => void;
  minDuration?: number; // in minutes
  maxDuration?: number; // in minutes
}

interface DragState {
  isActive: boolean;
  startDate: string | null;
  startHour: number | null;
  currentDate: string | null;
  currentHour: number | null;
}

export function BookingTimeGrid({
  selectedDates,
  timeSelections,
  onSelectionChange,
  minDuration = 60,
  maxDuration = 240,
}: BookingTimeGridProps) {
  const [dragState, setDragState] = useState<DragState>({
    isActive: false,
    startDate: null,
    startHour: null,
    currentDate: null,
    currentHour: null,
  });
  const [shiftPressed, setShiftPressed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sort dates chronologically
  const sortedDates = useMemo(() => 
    [...selectedDates].sort((a, b) => a.localeCompare(b)),
    [selectedDates]
  );

  // Track shift key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftPressed(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Get selection for a specific date
  const getSelectionForDate = useCallback(
    (date: string): TimeSelection | undefined => {
      return timeSelections.find((s) => s.date === date);
    },
    [timeSelections]
  );

  // Check if a cell is selected
  const isCellSelected = useCallback(
    (date: string, hour: number): boolean => {
      const selection = getSelectionForDate(date);
      if (!selection) return false;
      const startHour = parseInt(selection.startTime.split(":")[0]);
      const endHour = parseInt(selection.endTime.split(":")[0]);
      return hour >= startHour && hour < endHour;
    },
    [getSelectionForDate]
  );

  // Check if cell is in drag preview
  const isCellInDragPreview = useCallback(
    (date: string, hour: number): boolean => {
      if (!dragState.isActive || !dragState.startDate || dragState.startHour === null) {
        return false;
      }
      if (!dragState.currentDate || dragState.currentHour === null) {
        return false;
      }

      const startDateIndex = sortedDates.indexOf(dragState.startDate);
      const endDateIndex = sortedDates.indexOf(dragState.currentDate);
      const currentDateIndex = sortedDates.indexOf(date);

      const minDateIndex = Math.min(startDateIndex, endDateIndex);
      const maxDateIndex = Math.max(startDateIndex, endDateIndex);
      const minHour = Math.min(dragState.startHour, dragState.currentHour);
      const maxHour = Math.max(dragState.startHour, dragState.currentHour);

      return (
        currentDateIndex >= minDateIndex &&
        currentDateIndex <= maxDateIndex &&
        hour >= minHour &&
        hour <= maxHour
      );
    },
    [dragState, sortedDates]
  );

  // Handle mouse down on cell
  const handleCellMouseDown = useCallback(
    (date: string, hour: number, e: React.MouseEvent) => {
      e.preventDefault();
      
      // Shift+Click: Copy first day's selection to this day
      if (shiftPressed && timeSelections.length > 0) {
        const firstSelection = timeSelections[0];
        if (firstSelection) {
          const existingIndex = timeSelections.findIndex((s) => s.date === date);
          if (existingIndex >= 0) {
            // Replace existing
            const updated = [...timeSelections];
            updated[existingIndex] = {
              date,
              startTime: firstSelection.startTime,
              endTime: firstSelection.endTime,
            };
            onSelectionChange(updated);
          } else {
            // Add new
            onSelectionChange([
              ...timeSelections,
              {
                date,
                startTime: firstSelection.startTime,
                endTime: firstSelection.endTime,
              },
            ]);
          }
        }
        return;
      }

      // Start drag
      setDragState({
        isActive: true,
        startDate: date,
        startHour: hour,
        currentDate: date,
        currentHour: hour,
      });
    },
    [shiftPressed, timeSelections, onSelectionChange]
  );

  // Handle mouse enter on cell
  const handleCellMouseEnter = useCallback(
    (date: string, hour: number) => {
      if (!dragState.isActive) return;
      setDragState((prev) => ({
        ...prev,
        currentDate: date,
        currentHour: hour,
      }));
    },
    [dragState.isActive]
  );

  // Handle mouse up (end drag)
  const handleMouseUp = useCallback(() => {
    if (!dragState.isActive || !dragState.startDate || dragState.startHour === null) {
      setDragState({
        isActive: false,
        startDate: null,
        startHour: null,
        currentDate: null,
        currentHour: null,
      });
      return;
    }

    const startDateIndex = sortedDates.indexOf(dragState.startDate);
    const endDateIndex = sortedDates.indexOf(dragState.currentDate || dragState.startDate);
    const startHour = dragState.startHour;
    const endHour = dragState.currentHour ?? dragState.startHour;

    const minDateIndex = Math.min(startDateIndex, endDateIndex);
    const maxDateIndex = Math.max(startDateIndex, endDateIndex);
    const minHour = Math.min(startHour, endHour);
    const maxHour = Math.max(startHour, endHour) + 1; // End hour is exclusive

    // Validate duration
    const duration = (maxHour - minHour) * 60;
    if (duration < minDuration || duration > maxDuration) {
      setDragState({
        isActive: false,
        startDate: null,
        startHour: null,
        currentDate: null,
        currentHour: null,
      });
      return;
    }

    // Create/update selections for all dates in range
    const newSelections = [...timeSelections];
    const affectedDates = sortedDates.slice(minDateIndex, maxDateIndex + 1);

    for (const date of affectedDates) {
      const existingIndex = newSelections.findIndex((s) => s.date === date);
      const selection: TimeSelection = {
        date,
        startTime: `${minHour.toString().padStart(2, "0")}:00`,
        endTime: `${maxHour.toString().padStart(2, "0")}:00`,
      };

      if (existingIndex >= 0) {
        newSelections[existingIndex] = selection;
      } else {
        newSelections.push(selection);
      }
    }

    onSelectionChange(newSelections);
    setDragState({
      isActive: false,
      startDate: null,
      startHour: null,
      currentDate: null,
      currentHour: null,
    });
  }, [dragState, sortedDates, timeSelections, onSelectionChange, minDuration, maxDuration]);

  // Handle cell click (toggle selection for single cell)
  const handleCellClick = useCallback(
    (date: string, hour: number) => {
      const existingSelection = getSelectionForDate(date);
      
      if (existingSelection) {
        // Check if clicking on a selected cell - remove the selection
        const startHour = parseInt(existingSelection.startTime.split(":")[0]);
        const endHour = parseInt(existingSelection.endTime.split(":")[0]);
        
        if (hour >= startHour && hour < endHour) {
          // Remove this date's selection
          onSelectionChange(timeSelections.filter((s) => s.date !== date));
          return;
        }
      }
      
      // Add 1-hour selection at this cell
      const selection: TimeSelection = {
        date,
        startTime: `${hour.toString().padStart(2, "0")}:00`,
        endTime: `${(hour + 1).toString().padStart(2, "0")}:00`,
      };
      
      const existingIndex = timeSelections.findIndex((s) => s.date === date);
      if (existingIndex >= 0) {
        const updated = [...timeSelections];
        updated[existingIndex] = selection;
        onSelectionChange(updated);
      } else {
        onSelectionChange([...timeSelections, selection]);
      }
    },
    [getSelectionForDate, timeSelections, onSelectionChange]
  );

  // Global mouse up listener
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (dragState.isActive) {
        handleMouseUp();
      }
    };
    document.addEventListener("mouseup", handleGlobalMouseUp);
    return () => document.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [dragState.isActive, handleMouseUp]);

  // Calculate selection summary
  const selectionSummary = useMemo(() => {
    if (timeSelections.length === 0) return null;

    const sortedSelections = [...timeSelections].sort((a, b) => 
      a.date.localeCompare(b.date)
    );

    // Check if all have same time
    const firstTime = sortedSelections[0];
    const allSameTime = sortedSelections.every(
      (s) => s.startTime === firstTime.startTime && s.endTime === firstTime.endTime
    );

    const totalHours = sortedSelections.reduce((sum, s) => {
      const start = parseInt(s.startTime.split(":")[0]);
      const end = parseInt(s.endTime.split(":")[0]);
      return sum + (end - start);
    }, 0);

    if (allSameTime && sortedSelections.length > 1) {
      const firstDate = parseISO(sortedSelections[0].date);
      const lastDate = parseISO(sortedSelections[sortedSelections.length - 1].date);
      const hoursPerDay = parseInt(firstTime.endTime.split(":")[0]) - parseInt(firstTime.startTime.split(":")[0]);
      
      return `${format(firstDate, "EEE", { locale: de })} - ${format(lastDate, "EEE d. MMM", { locale: de })}, ${firstTime.startTime}-${firstTime.endTime} (${hoursPerDay}h × ${sortedSelections.length} Tage = ${totalHours}h)`;
    }

    return `${sortedSelections.length} Tage, ${totalHours}h total`;
  }, [timeSelections]);

  // Reset all selections
  const handleReset = () => {
    onSelectionChange([]);
  };

  // Copy first day to all days
  const handleCopyToAll = () => {
    if (timeSelections.length === 0 || sortedDates.length === 0) return;
    
    const firstSelection = timeSelections[0];
    const newSelections = sortedDates.map((date) => ({
      date,
      startTime: firstSelection.startTime,
      endTime: firstSelection.endTime,
    }));
    onSelectionChange(newSelections);
  };

  if (sortedDates.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        Bitte zuerst Datum(e) auswählen
      </div>
    );
  }

  return (
    <div className="space-y-3" ref={containerRef}>
      {/* Instructions */}
      <div className="text-xs text-muted-foreground">
        Klicken oder ziehen Sie, um Zeitblöcke auszuwählen.
        {timeSelections.length > 0 && (
          <span className="ml-1 text-primary">
            Shift+Klick kopiert auf andere Tage.
          </span>
        )}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div 
          className="grid select-none"
          style={{
            gridTemplateColumns: `60px repeat(${sortedDates.length}, minmax(70px, 1fr))`,
          }}
        >
          {/* Header row */}
          <div className="h-10" /> {/* Empty corner */}
          {sortedDates.map((date) => (
            <div
              key={date}
              className="h-10 flex items-center justify-center text-xs font-medium border-b border-l"
            >
              <div className="text-center">
                <div>{format(parseISO(date), "EEE", { locale: de })}</div>
                <div className="text-muted-foreground">{format(parseISO(date), "d.", { locale: de })}</div>
              </div>
            </div>
          ))}

          {/* Hour rows */}
          {HOURS.map((hour) => (
            <>
              {/* Time label */}
              <div
                key={`label-${hour}`}
                className="h-10 flex items-center justify-end pr-2 text-xs text-muted-foreground border-b"
              >
                {hour.toString().padStart(2, "0")}:00
              </div>
              
              {/* Cells for each date */}
              {sortedDates.map((date) => {
                const isSelected = isCellSelected(date, hour);
                const isPreview = isCellInDragPreview(date, hour);
                const selection = getSelectionForDate(date);
                const isStart = selection && parseInt(selection.startTime.split(":")[0]) === hour;

                  return (
                    <div
                      key={`${date}-${hour}`}
                      className={cn(
                        "h-10 border-b border-l cursor-pointer transition-colors relative",
                        isSelected && "bg-primary/30",
                        isPreview && !isSelected && "bg-accent border-dashed border-primary/30",
                        !isSelected && !isPreview && "hover:bg-muted/50 bg-accent/20"
                      )}
                      onMouseDown={(e) => handleCellMouseDown(date, hour, e)}
                      onMouseEnter={() => handleCellMouseEnter(date, hour)}
                    >
                    {isSelected && isStart && (
                      <div className="absolute inset-0 flex items-start justify-center pt-1">
                        <Badge variant="secondary" className="text-[10px] px-1 py-0">
                          {selection?.startTime}-{selection?.endTime}
                        </Badge>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>

      {/* Actions and Summary */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2">
          {timeSelections.length > 0 && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="h-7 text-xs"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Zurücksetzen
              </Button>
              {sortedDates.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyToAll}
                  className="h-7 text-xs"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Auf alle Tage
                </Button>
              )}
            </>
          )}
        </div>

        {selectionSummary && (
          <div className="text-sm bg-muted/50 rounded-md px-3 py-1.5">
            <span className="text-muted-foreground">Ausgewählt: </span>
            <span className="font-medium">{selectionSummary}</span>
          </div>
        )}
      </div>
    </div>
  );
}
