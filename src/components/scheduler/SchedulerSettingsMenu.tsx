import {
  Settings,
  Target,
  Maximize,
  Minimize,
  Users,
  ArrowUpDown,
  BookOpen,
  RotateCcw,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface SchedulerFilters {
  // Role filter
  roleFilter: string | null;
  // Capability filter (ski/snowboard)
  capabilityFilter: string | null;
  // Booking type filter
  bookingTypeFilter: string | null;
  // Sorting
  sortBy: string;
  // Display options
  showLegend: boolean;
  isPlanningMode: boolean;
  isFullscreen: boolean;
  compactMode: boolean;
}

interface SchedulerSettingsMenuProps {
  filters: SchedulerFilters;
  onFiltersChange: (filters: Partial<SchedulerFilters>) => void;
  compactStats?: { visible: number; total: number };
}

export function SchedulerSettingsMenu({
  filters,
  onFiltersChange,
  compactStats,
}: SchedulerSettingsMenuProps) {
  // Calculate active filter count (non-default values)
  // Note: bookingTypeFilter is excluded as it's now visible in the header
  const activeFilterCount = [
    filters.roleFilter !== null,
    filters.capabilityFilter !== null,
    filters.sortBy !== "name",
    filters.compactMode,
  ].filter(Boolean).length;

  const resetAllFilters = () => {
    onFiltersChange({
      roleFilter: null,
      capabilityFilter: null,
      bookingTypeFilter: null,
      sortBy: "name",
      compactMode: false,
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8 relative">
          <Settings className="h-4 w-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 bg-popover">
        <DropdownMenuLabel>Ansicht anpassen</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Mode Toggles */}
        <DropdownMenuCheckboxItem
          checked={filters.isPlanningMode}
          onCheckedChange={(checked) => onFiltersChange({ isPlanningMode: checked })}
        >
          <Target className="mr-2 h-4 w-4" />
          Planungsmodus
        </DropdownMenuCheckboxItem>

        <DropdownMenuCheckboxItem
          checked={filters.isFullscreen}
          onCheckedChange={(checked) => onFiltersChange({ isFullscreen: checked })}
        >
          {filters.isFullscreen ? (
            <Minimize className="mr-2 h-4 w-4" />
          ) : (
            <Maximize className="mr-2 h-4 w-4" />
          )}
          Vollbild
        </DropdownMenuCheckboxItem>

        <DropdownMenuCheckboxItem
          checked={filters.compactMode}
          onCheckedChange={(checked) => onFiltersChange({ compactMode: checked })}
        >
          <LayoutGrid className="mr-2 h-4 w-4" />
          Kompaktansicht
          {compactStats && (
            <span className="ml-auto text-xs text-muted-foreground">
              {compactStats.visible}/{compactStats.total}
            </span>
          )}
        </DropdownMenuCheckboxItem>

        <DropdownMenuSeparator />

        {/* Role Filter Submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Users className="mr-2 h-4 w-4" />
            <span>Lehrer anzeigen</span>
            {filters.roleFilter && (
              <span className="ml-auto text-xs text-muted-foreground">
                {filters.roleFilter === "instructor" ? "Skilehrer" : "Büro"}
              </span>
            )}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="bg-popover">
              <DropdownMenuRadioGroup
                value={filters.roleFilter || "all"}
                onValueChange={(v) => onFiltersChange({ roleFilter: v === "all" ? null : v })}
              >
                <DropdownMenuRadioItem value="all">Alle</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="instructor">Nur Skilehrer</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="office_staff">Nur Büromitarbeiter</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        {/* Capability Filter Submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className="mr-2 text-sm">⛷️</span>
            <span>Disziplin</span>
            {filters.capabilityFilter && (
              <span className="ml-auto text-xs text-muted-foreground">
                {filters.capabilityFilter === "ski" ? "Ski" : "Board"}
              </span>
            )}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="bg-popover">
              <DropdownMenuRadioGroup
                value={filters.capabilityFilter || "all"}
                onValueChange={(v) => onFiltersChange({ capabilityFilter: v === "all" ? null : v })}
              >
                <DropdownMenuRadioItem value="all">Alle</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="ski">⛷️ Ski</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="snowboard">🏂 Snowboard</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        {/* Sorting Submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ArrowUpDown className="mr-2 h-4 w-4" />
            <span>Sortierung</span>
            {filters.sortBy !== "name" && (
              <span className="ml-auto text-xs text-muted-foreground">
                {filters.sortBy === "group" ? "Gruppe" : "Privat"}
              </span>
            )}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="bg-popover">
              <DropdownMenuRadioGroup
                value={filters.sortBy}
                onValueChange={(v) => onFiltersChange({ sortBy: v })}
              >
                <DropdownMenuRadioItem value="name">Name (A-Z)</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="group">Gruppenkurse zuerst</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="private">Privatstunden zuerst</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        {/* Legend Toggle */}
        <DropdownMenuCheckboxItem
          checked={filters.showLegend}
          onCheckedChange={(checked) => onFiltersChange({ showLegend: checked })}
        >
          <BookOpen className="mr-2 h-4 w-4" />
          Legende anzeigen
        </DropdownMenuCheckboxItem>

        {/* Reset */}
        {activeFilterCount > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={resetAllFilters}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Alle Filter zurücksetzen
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
