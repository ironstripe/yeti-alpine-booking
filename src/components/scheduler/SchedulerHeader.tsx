import { format, addDays, subDays } from "date-fns";
import { de } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ViewMode = "daily" | "weekly" | "period";

interface SchedulerHeaderProps {
  date: Date;
  onDateChange: (date: Date) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  selectedInstructorId: string | null;
  onInstructorFilterChange: (id: string | null) => void;
  instructorOptions: { id: string; name: string }[];
}

export function SchedulerHeader({
  date,
  onDateChange,
  viewMode,
  onViewModeChange,
  selectedInstructorId,
  onInstructorFilterChange,
  instructorOptions,
}: SchedulerHeaderProps) {
  const goToPreviousDay = () => onDateChange(subDays(date, 1));
  const goToNextDay = () => onDateChange(addDays(date, 1));
  const goToToday = () => onDateChange(new Date());

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-4 border-b bg-card">
      {/* Date Navigation */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={goToPreviousDay}>
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "min-w-[200px] justify-start text-left font-normal"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(date, "EEEE, d. MMMM yyyy", { locale: de })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => d && onDateChange(d)}
              initialFocus
              locale={de}
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>

        <Button variant="outline" size="icon" onClick={goToNextDay}>
          <ChevronRight className="h-4 w-4" />
        </Button>

        <Button variant="ghost" size="sm" onClick={goToToday}>
          Heute
        </Button>
      </div>

      {/* View Mode & Filters */}
      <div className="flex items-center gap-3">
        {/* View Mode Toggle */}
        <Select value={viewMode} onValueChange={(v) => onViewModeChange(v as ViewMode)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Ansicht" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Tagesansicht</SelectItem>
            <SelectItem value="weekly">Wochenansicht</SelectItem>
            <SelectItem value="period">Zeitraum</SelectItem>
          </SelectContent>
        </Select>

        {/* Instructor Filter */}
        <Select
          value={selectedInstructorId || "all"}
          onValueChange={(v) => onInstructorFilterChange(v === "all" ? null : v)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Alle Lehrer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Lehrer</SelectItem>
            {instructorOptions.map((instructor) => (
              <SelectItem key={instructor.id} value={instructor.id}>
                {instructor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
