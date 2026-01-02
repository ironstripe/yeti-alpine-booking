import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, addDays, subDays } from "date-fns";
import { de } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Search, User, Filter, LayoutGrid, Target } from "lucide-react";
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
  const goToToday = () => onDateChange(new Date());

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
    <div className="flex items-center gap-2 px-3 py-2 border-b bg-card">
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
          className="px-2 h-6 text-[11px]"
          onClick={() => onViewModeChange("daily")}
        >
          1T
        </Button>
        <Button 
          variant={viewMode === "3days" ? "secondary" : "ghost"}
          size="sm" 
          className="px-2 h-6 text-[11px]"
          onClick={() => onViewModeChange("3days")}
        >
          3T
        </Button>
        <Button 
          variant={viewMode === "weekly" ? "secondary" : "ghost"}
          size="sm" 
          className="px-2 h-6 text-[11px]"
          onClick={() => onViewModeChange("weekly")}
        >
          7T
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
  );
}
