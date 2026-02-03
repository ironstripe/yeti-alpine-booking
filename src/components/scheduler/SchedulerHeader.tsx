import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, addDays, subDays } from "date-fns";
import { de } from "date-fns/locale";
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  CalendarDays, 
  CalendarRange, 
  Search, 
  User, 
  Filter, 
  LayoutGrid, 
  Target,
  Users,
  Maximize,
  Minimize,
  Crosshair,
  CalendarCheck,
  ArrowUpDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useSchedulerCustomerSearch, type SchedulerCustomer } from "@/hooks/useSchedulerCustomerSearch";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { SchedulerLegend } from "./SchedulerLegend";
export type ViewMode = "daily" | "3days" | "weekly" | "period";

interface SchedulerHeaderProps {
  date: Date;
  onDateChange: (date: Date) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  selectedInstructorId: string | null;
  onInstructorFilterChange: (id: string | null) => void;
  instructorOptions: { id: string; name: string }[];
  onInstructorSelect?: (id: string) => void;
  capabilityFilter: string | null;
  onCapabilityFilterChange: (filter: string | null) => void;
  visibleDates?: Date[];
  onJumpToDay?: (index: number) => void;
  compactMode?: boolean;
  onCompactModeChange?: (compact: boolean) => void;
  compactStats?: { visible: number; total: number };
  // NEW: Role filter
  roleFilter: string | null;
  onRoleFilterChange: (filter: string | null) => void;
  // NEW: Fullscreen mode
  isFullscreen: boolean;
  onFullscreenToggle: (fullscreen: boolean) => void;
  // NEW: Planning mode
  isPlanningMode: boolean;
  onPlanningModeToggle: (planning: boolean) => void;
  // NEW: Booking type filter
  bookingTypeFilter: string | null;
  onBookingTypeFilterChange: (filter: string | null) => void;
  // NEW: Sort functionality
  sortBy: string;
  onSortChange: (sort: string) => void;
}

export function SchedulerHeader({
  date,
  onDateChange,
  viewMode,
  onViewModeChange,
  selectedInstructorId,
  onInstructorFilterChange,
  instructorOptions,
  onInstructorSelect,
  capabilityFilter,
  onCapabilityFilterChange,
  compactMode = false,
  onCompactModeChange,
  compactStats,
  roleFilter,
  onRoleFilterChange,
  isFullscreen,
  onFullscreenToggle,
  isPlanningMode,
  onPlanningModeToggle,
  bookingTypeFilter,
  onBookingTypeFilterChange,
  sortBy,
  onSortChange,
}: SchedulerHeaderProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [teacherSearchOpen, setTeacherSearchOpen] = useState(false);
  const [teacherQuery, setTeacherQuery] = useState("");
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");

  const { data: customers = [], isLoading: customersLoading } = useSchedulerCustomerSearch(customerQuery);

  const goToPreviousDay = () => onDateChange(subDays(date, 1));
  const goToNextDay = () => onDateChange(addDays(date, 1));
  const goToToday = () => {
    onDateChange(new Date());
    onViewModeChange("daily");
  };

  // Filter instructors by search query
  const filteredInstructors = instructorOptions.filter((instructor) =>
    instructor.name.toLowerCase().includes(teacherQuery.toLowerCase())
  );

  const handleTeacherSelect = (instructor: { id: string; name: string }) => {
    setTeacherSearchOpen(false);
    setTeacherQuery("");
    onInstructorFilterChange(null);
    onInstructorSelect?.(instructor.id);
  };

  const handleCustomerSelect = (customer: SchedulerCustomer) => {
    setCustomerSearchOpen(false);
    setCustomerQuery("");
    toast.info(`${customer.first_name || ""} ${customer.last_name} ausgewählt. Wähle jetzt Zeitslots.`);
    navigate(`/bookings/new?customerId=${customer.id}`);
  };

  return (
    <div className="flex flex-col border-b bg-card">
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

      {/* View Mode Toggle */}
      <div className="flex bg-muted rounded-md p-0.5">
        <Button 
          variant={viewMode === "daily" ? "secondary" : "ghost"}
          size="sm" 
          className="px-3 h-7 text-xs"
          onClick={() => onViewModeChange("daily")}
        >
          <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
          Tag
        </Button>
        <Button 
          variant={viewMode === "3days" ? "secondary" : "ghost"}
          size="sm" 
          className="px-3 h-7 text-xs"
          onClick={() => onViewModeChange("3days")}
        >
          <CalendarRange className="h-3.5 w-3.5 mr-1.5" />
          3 Tage
        </Button>
        <Button 
          variant={viewMode === "weekly" ? "secondary" : "ghost"}
          size="sm" 
          className="px-3 h-7 text-xs"
          onClick={() => onViewModeChange("weekly")}
        >
          <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
          Woche
        </Button>
      </div>

      <div className="w-px h-6 bg-border hidden md:block" />

      {/* Search Fields */}
      <div className="flex items-center gap-1 hidden md:flex">
        {/* Teacher Search */}
        <Popover open={teacherSearchOpen} onOpenChange={setTeacherSearchOpen}>
          <PopoverTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 w-8 p-0 lg:w-[110px] lg:px-2 lg:justify-start"
            >
              <Search className="h-3.5 w-3.5 lg:mr-1.5" />
              <span className="hidden lg:inline text-xs truncate">Lehrer...</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[250px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput 
                placeholder="Name eingeben..." 
                value={teacherQuery}
                onValueChange={setTeacherQuery}
              />
              <CommandList>
                <CommandEmpty>Kein Lehrer gefunden</CommandEmpty>
                <CommandGroup>
                  {filteredInstructors.map((instructor) => (
                    <CommandItem
                      key={instructor.id}
                      value={instructor.id}
                      onSelect={() => handleTeacherSelect(instructor)}
                    >
                      {instructor.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Customer Search */}
        <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
          <PopoverTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 w-8 p-0 lg:w-[110px] lg:px-2 lg:justify-start"
            >
              <User className="h-3.5 w-3.5 lg:mr-1.5" />
              <span className="hidden lg:inline text-xs truncate">Kunde...</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput 
                placeholder="Name oder Email..." 
                value={customerQuery}
                onValueChange={setCustomerQuery}
              />
              <CommandList>
                <CommandEmpty>
                  {customerQuery.length < 2 
                    ? "Mind. 2 Zeichen eingeben" 
                    : customersLoading 
                      ? "Suche..." 
                      : "Kein Kunde gefunden"
                  }
                </CommandEmpty>
                <CommandGroup>
                  {customers.map((customer) => (
                    <CommandItem
                      key={customer.id}
                      value={customer.id}
                      onSelect={() => handleCustomerSelect(customer)}
                    >
                      <div className="flex flex-col">
                        <span>{customer.first_name} {customer.last_name}</span>
                        <span className="text-xs text-muted-foreground">{customer.email}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right-aligned Utilities */}
      <div className="flex items-center gap-1">
        {/* Role Filter - NEW */}
        <Select 
          value={roleFilter || "all"} 
          onValueChange={(v) => onRoleFilterChange(v === "all" ? null : v)}
        >
          <SelectTrigger className="w-8 h-8 p-0 md:w-[120px] md:px-2 [&>span]:hidden md:[&>span]:inline">
            <Users className="h-3.5 w-3.5 md:mr-1" />
            <SelectValue placeholder="Rolle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="instructor">Skilehrer</SelectItem>
            <SelectItem value="office_staff">Büropersonal</SelectItem>
          </SelectContent>
        </Select>

        {/* Capability Filter */}
        <Select 
          value={capabilityFilter || "all"} 
          onValueChange={(v) => onCapabilityFilterChange(v === "all" ? null : v)}
        >
          <SelectTrigger className="w-8 h-8 p-0 md:w-[100px] md:px-2 [&>span]:hidden md:[&>span]:inline">
            <Filter className="h-3.5 w-3.5 md:mr-1" />
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="ski">Ski</SelectItem>
            <SelectItem value="snowboard">Board</SelectItem>
          </SelectContent>
        </Select>

        {/* Booking Type Filter - NEW */}
        <Select 
          value={bookingTypeFilter || "all"} 
          onValueChange={(v) => onBookingTypeFilterChange(v === "all" ? null : v)}
        >
          <SelectTrigger className="w-8 h-8 p-0 md:w-[100px] md:px-2 [&>span]:hidden md:[&>span]:inline">
            <CalendarCheck className="h-3.5 w-3.5 md:mr-1" />
            <SelectValue placeholder="Typ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="private">Privat</SelectItem>
            <SelectItem value="group">Gruppe</SelectItem>
          </SelectContent>
        </Select>

        {/* Sort Dropdown - NEW */}
        <Select value={sortBy} onValueChange={onSortChange}>
          <SelectTrigger className="w-8 h-8 p-0 md:w-[100px] md:px-2 [&>span]:hidden md:[&>span]:inline">
            <ArrowUpDown className="h-3.5 w-3.5 md:mr-1" />
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name A-Z</SelectItem>
            <SelectItem value="group">Gruppe</SelectItem>
            <SelectItem value="private">Privat</SelectItem>
          </SelectContent>
        </Select>

        {/* Planning Mode Toggle - NEW */}
        <Button
          variant={isPlanningMode ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => onPlanningModeToggle(!isPlanningMode)}
          title={isPlanningMode ? "Planungsmodus beenden" : "Planungsmodus"}
        >
          <Crosshair className="h-3.5 w-3.5" />
        </Button>

        {/* Fullscreen Toggle - NEW */}
        <Button
          variant={isFullscreen ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={() => onFullscreenToggle(!isFullscreen)}
          title={isFullscreen ? "Vollbild beenden (Esc)" : "Vollbild"}
        >
          {isFullscreen ? (
            <Minimize className="h-3.5 w-3.5" />
          ) : (
            <Maximize className="h-3.5 w-3.5" />
          )}
        </Button>

        {/* Compact Mode Toggle */}
        {onCompactModeChange && (
          <Button
            variant={compactMode ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => onCompactModeChange(!compactMode)}
            title={compactMode ? `Alle anzeigen (${compactStats?.total || 0})` : "Kompaktansicht"}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      </div>
      
      {/* Legend Row */}
      <SchedulerLegend className="px-3 py-1.5 border-t bg-muted/30" />
    </div>
  );
}
