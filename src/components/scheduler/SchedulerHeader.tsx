import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, addDays, subDays } from "date-fns";
import { de } from "date-fns/locale";
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Target,
  Maximize,
  Minimize,
  X,
  CircleHelp,
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
import { MultiSelectToggle } from "./MultiSelectToggle";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export type ViewMode = "daily" | "3days" | "weekly" | "period";

interface SchedulerHeaderProps {
  date: Date;
  onDateChange: (date: Date) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  instructorOptions: { id: string; name: string }[];
  onInstructorSelect?: (id: string) => void;
  selectedTeacherId: string | null;
  onTeacherChange: (id: string | null) => void;
  hideAbsent: boolean;
  onHideAbsentChange: (value: boolean) => void;
  // Filter state
  filters: SchedulerFilters;
  onFiltersChange: (filters: Partial<SchedulerFilters>) => void;
  compactStats?: { visible: number; total: number };
  /** Mobile-only Liste/Raster switch */
  isMobileScheduler?: boolean;
  mobileView?: "list" | "grid";
  onMobileViewChange?: (view: "list" | "grid") => void;
}

export function SchedulerHeader({
  date,
  onDateChange,
  viewMode,
  onViewModeChange,
  instructorOptions,
  onInstructorSelect,
  selectedTeacherId,
  onTeacherChange,
  hideAbsent,
  onHideAbsentChange,
  filters,
  onFiltersChange,
  compactStats,
  isMobileScheduler = false,
  mobileView = "list",
  onMobileViewChange,
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
      <div className="flex flex-wrap items-center gap-1.5 px-2 py-1 md:px-3">
        {/* Date Navigation Group */}
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Datum auswählen">
          <Button variant="outline" size="icon" className="icon-action" onClick={goToPreviousDay} aria-label="Vorheriger Tag">
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="control-target min-w-[90px] justify-start px-2 text-left text-xs font-normal md:min-w-[110px]"
                aria-label={`Datum wählen: ${format(date, "EEEE, dd. MMMM yyyy", { locale: de })}`}
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

          <Button variant="outline" size="icon" className="icon-action" onClick={goToNextDay} aria-label="Nächster Tag">
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Button 
            variant="ghost" 
            size="icon" 
            className="icon-action" 
            onClick={goToToday}
            title="Heute"
            aria-label="Heute anzeigen"
          >
            <Target className="h-4 w-4" />
          </Button>
        </div>

        <div className="w-px h-6 bg-border hidden sm:block" />

        {/* Mobile: Liste | Raster */}
        {isMobileScheduler && (
          <ToggleGroup
            type="single"
            value={mobileView}
            onValueChange={(v) => v && onMobileViewChange?.(v as "list" | "grid")}
            className="bg-muted rounded-md p-0.5"
            aria-label="Mobile Darstellung"
          >
            <ToggleGroupItem value="list" className="control-target px-3 text-xs data-[state=on]:bg-background">
              Liste
            </ToggleGroupItem>
            <ToggleGroupItem value="grid" className="control-target px-3 text-xs data-[state=on]:bg-background">
              Raster
            </ToggleGroupItem>
          </ToggleGroup>
        )}

        {/* Compact View Mode Toggle */}
        {!(isMobileScheduler && mobileView === "list") && (
        <ToggleGroup 
          type="single" 
          value={viewMode} 
          onValueChange={(v) => v && onViewModeChange(v as ViewMode)}
          className="bg-muted rounded-md p-0.5"
          aria-label="Zeitraum"
        >
          <ToggleGroupItem 
            value="daily" 
            className="control-target px-3 text-xs data-[state=on]:bg-background"
          >
            Tag
          </ToggleGroupItem>
          <ToggleGroupItem 
            value="3days" 
            className="control-target px-3 text-xs data-[state=on]:bg-background"
          >
            3T
          </ToggleGroupItem>
          <ToggleGroupItem 
            value="weekly" 
            className="control-target px-3 text-xs data-[state=on]:bg-background"
          >
            Woche
          </ToggleGroupItem>
        </ToggleGroup>
        )}

        <Button
          variant="outline"
          className="control-target gap-1.5 px-2.5 text-xs"
          onClick={() => onFiltersChange({ isFullscreen: !filters.isFullscreen })}
          aria-pressed={filters.isFullscreen}
        >
          {filters.isFullscreen ? (
            <Minimize className="h-4 w-4" />
          ) : (
            <Maximize className="h-4 w-4" />
          )}
          {filters.isFullscreen ? "Vollbild verlassen" : "Vollbild"}
        </Button>

        {/* Spacer */}
        <div className="hidden flex-1 md:block" />

        {/* Right-aligned Actions */}
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {!isMobileScheduler && <MultiSelectToggle />}

          {/* Universal Search */}
          <SchedulerSearchTrigger onClick={() => setSearchOpen(true)} />

          {/* Settings Menu */}
          <SchedulerSettingsMenu
            filters={filters}
            onFiltersChange={onFiltersChange}
            compactStats={compactStats}
          />

          {/* Booking Type Quick Filter */}
          <ToggleGroup 
            type="single" 
            value={filters.bookingTypeFilter || "all"}
            onValueChange={(v) => v && onFiltersChange({ 
              bookingTypeFilter: v === "all" ? null : v 
            })}
            className="bg-muted rounded-md p-0.5"
            aria-label="Buchungsart filtern"
          >
            <ToggleGroupItem value="all" className="control-target px-2 text-xs data-[state=on]:bg-background">
              Alle
            </ToggleGroupItem>
            <ToggleGroupItem value="group" className="control-target px-2 text-xs data-[state=on]:bg-background">
              Gruppen
            </ToggleGroupItem>
            <ToggleGroupItem value="private" className="control-target px-2 text-xs data-[state=on]:bg-background">
              Privat
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-2 py-1 md:px-3">
        <div className="flex min-w-0 max-w-full items-center gap-1">
          <SearchableSelect
            items={instructorOptions}
            value={instructorOptions.find(i => i.id === selectedTeacherId) ?? null}
            onChange={i => onTeacherChange(i?.id ?? null)}
            placeholder={selectedTeacherId ? "Lehrperson nicht mehr aktiv" : "Alle Lehrpersonen"}
            searchPlaceholder="Lehrperson filtern..."
            renderItem={i => i.name}
            getItemKey={i => i.id}
            searchFn={(i, q) => i.name.toLocaleLowerCase().includes(q.toLocaleLowerCase())}
            className="control-target w-[230px] max-w-full text-xs"
          />
          {selectedTeacherId && <Button variant="ghost" size="icon" className="icon-action shrink-0" aria-label="Lehrpersonenauswahl zurücksetzen" title="Alle Lehrpersonen" onClick={() => onTeacherChange(null)}><X className="h-4 w-4" /></Button>}
        </div>
        <div className="flex items-center gap-2">
          <Switch id="scheduler-hide-absent" checked={hideAbsent} onCheckedChange={onHideAbsentChange} disabled={!!selectedTeacherId} aria-describedby="scheduler-absence-rule" />
          <Label htmlFor="scheduler-hide-absent" className="text-xs">Abwesende ausblenden</Label>
          <Popover><PopoverTrigger asChild><Button variant="ghost" size="icon" className="icon-action" aria-label="Abwesenheitsfilter erklären"><CircleHelp className="h-4 w-4" /></Button></PopoverTrigger><PopoverContent className="w-72 text-sm" id="scheduler-absence-rule">Nur im gesamten angezeigten Zeitraum bestätigt abwesende Lehrpersonen ohne geplanten Einsatz. Teilweise anwesende Personen und Personen auf Abruf bleiben sichtbar.</PopoverContent></Popover>
        </div>
        {selectedTeacherId && <span className="text-xs text-muted-foreground">Einzelauswahl: Abwesenheits-, Rollen- und Kompaktfilter pausiert.</span>}
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
