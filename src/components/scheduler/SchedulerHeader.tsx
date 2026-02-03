import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, addDays, subDays } from "date-fns";
import { de } from "date-fns/locale";
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Target,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { SchedulerSearchDialog, SchedulerSearchTrigger } from "./SchedulerSearchDialog";
import { SchedulerSettingsMenu, type SchedulerFilters } from "./SchedulerSettingsMenu";

export type ViewMode = "daily" | "3days" | "weekly" | "period";

interface SchedulerHeaderProps {
  date: Date;
  onDateChange: (date: Date) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  instructorOptions: { id: string; name: string }[];
  onInstructorSelect?: (id: string) => void;
  // Filter state
  filters: SchedulerFilters;
  onFiltersChange: (filters: Partial<SchedulerFilters>) => void;
  compactStats?: { visible: number; total: number };
}

export function SchedulerHeader({
  date,
  onDateChange,
  viewMode,
  onViewModeChange,
  instructorOptions,
  onInstructorSelect,
  filters,
  onFiltersChange,
  compactStats,
}: SchedulerHeaderProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchOpen, setSearchOpen] = useState(false);

  const goToPreviousDay = () => onDateChange(subDays(date, 1));
  const goToNextDay = () => onDateChange(addDays(date, 1));
  const goToToday = () => {
    onDateChange(new Date());
    onViewModeChange("daily");
  };

  const handleInstructorSelect = (id: string) => {
    onInstructorSelect?.(id);
  };

  return (
    <div className="flex flex-col border-b bg-card w-full">
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Date Navigation Group */}
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToPreviousDay}>
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-8 min-w-[90px] md:min-w-[110px] justify-start text-left font-normal px-2 text-xs"
              >
                <CalendarIcon className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                {format(date, isMobile ? "dd.MM." : "EEE, dd.MM.", { locale: de })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-popover" align="start">
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

          <Button variant="outline" size="icon" className="h-8 w-8" onClick={goToNextDay}>
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8" 
            onClick={goToToday}
            title="Heute"
          >
            <Target className="h-4 w-4" />
          </Button>
        </div>

        <div className="w-px h-6 bg-border hidden sm:block" />

        {/* Compact View Mode Toggle */}
        <ToggleGroup 
          type="single" 
          value={viewMode} 
          onValueChange={(v) => v && onViewModeChange(v as ViewMode)}
          className="bg-muted rounded-md p-0.5"
        >
          <ToggleGroupItem 
            value="daily" 
            className="px-3 h-7 text-xs data-[state=on]:bg-background"
          >
            Tag
          </ToggleGroupItem>
          <ToggleGroupItem 
            value="3days" 
            className="px-3 h-7 text-xs data-[state=on]:bg-background"
          >
            3T
          </ToggleGroupItem>
          <ToggleGroupItem 
            value="weekly" 
            className="px-3 h-7 text-xs data-[state=on]:bg-background"
          >
            Woche
          </ToggleGroupItem>
        </ToggleGroup>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right-aligned Actions */}
        <div className="flex items-center gap-1.5">
          {/* Universal Search */}
          <SchedulerSearchTrigger onClick={() => setSearchOpen(true)} />

          {/* Settings Menu */}
          <SchedulerSettingsMenu
            filters={filters}
            onFiltersChange={onFiltersChange}
            compactStats={compactStats}
          />

          {/* Quick Add Button */}
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigate("/bookings/new")}
            title="Neue Buchung"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Search Dialog */}
      <SchedulerSearchDialog
        instructorOptions={instructorOptions}
        onInstructorSelect={handleInstructorSelect}
        open={searchOpen}
        onOpenChange={setSearchOpen}
      />
    </div>
  );
}
