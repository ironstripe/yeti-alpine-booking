import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, addDays, subDays } from "date-fns";
import { de } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Search, User, Filter } from "lucide-react";
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
import { DayNavigator } from "./DayNavigator";

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
  visibleDates = [],
  onJumpToDay,
}: SchedulerHeaderProps) {
  const navigate = useNavigate();
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
    // Clear filter and scroll to instructor
    onInstructorFilterChange(null);
    onInstructorSelect?.(instructor.id);
  };

  const handleCustomerSelect = (customer: SchedulerCustomer) => {
    setCustomerSearchOpen(false);
    setCustomerQuery("");
    toast.info(`${customer.first_name || ""} ${customer.last_name} ausgewählt. Wähle jetzt Zeitslots.`);
    // Navigate to booking wizard with customer pre-selected
    navigate(`/bookings/new?customerId=${customer.id}`);
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between p-4 border-b bg-card flex-1">
      {/* Date Navigation */}
      <div className="flex items-center gap-2 flex-wrap">
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

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 border-l pl-3 ml-2">
          <span className="text-xs text-muted-foreground mr-1">Ansicht:</span>
          <div className="flex bg-muted rounded-md p-0.5">
            <Button 
              variant={viewMode === "daily" ? "secondary" : "ghost"}
              size="sm" 
              className="px-2 h-7 text-xs"
              onClick={() => onViewModeChange("daily")}
            >
              1 Tag
            </Button>
            <Button 
              variant={viewMode === "3days" ? "secondary" : "ghost"}
              size="sm" 
              className="px-2 h-7 text-xs"
              onClick={() => onViewModeChange("3days")}
            >
              3 Tage
            </Button>
            <Button 
              variant={viewMode === "weekly" ? "secondary" : "ghost"}
              size="sm" 
              className="px-2 h-7 text-xs"
              onClick={() => onViewModeChange("weekly")}
            >
              1 Woche
            </Button>
          </div>
        </div>

        {/* Quick-select date buttons */}
        <div className="flex items-center gap-1 border-l pl-2 ml-1">
          <Button 
            variant="ghost" 
            size="sm" 
            className="px-2 h-8 text-xs"
            onClick={() => onDateChange(addDays(new Date(), 1))}
          >
            +1
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="px-2 h-8 text-xs"
            onClick={() => onDateChange(addDays(new Date(), 2))}
          >
            +2
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="px-2 h-8 text-xs"
            onClick={() => onDateChange(addDays(new Date(), 3))}
          >
            +3
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="px-2 h-8 text-xs"
            onClick={() => onDateChange(addDays(new Date(), 7))}
          >
            1W
          </Button>
        </div>

        {/* Jump to Day Navigator - only for multi-day views */}
        {viewMode !== "daily" && visibleDates.length > 1 && onJumpToDay && (
          <DayNavigator dates={visibleDates} onJumpToDay={onJumpToDay} />
        )}
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Capability Filter */}
        <Select 
          value={capabilityFilter || "all"} 
          onValueChange={(v) => onCapabilityFilterChange(v === "all" ? null : v)}
        >
          <SelectTrigger className="w-[150px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Qualifikation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle zeigen</SelectItem>
            <SelectItem value="ski">Ski hervorheben</SelectItem>
            <SelectItem value="snowboard">Snowboard hervorheben</SelectItem>
          </SelectContent>
        </Select>

        {/* Teacher Search */}
        <Popover open={teacherSearchOpen} onOpenChange={setTeacherSearchOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[180px] justify-start">
              <Search className="mr-2 h-4 w-4" />
              <span className="truncate">Lehrer suchen...</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[250px] p-0" align="end">
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
            <Button variant="outline" className="w-[180px] justify-start">
              <User className="mr-2 h-4 w-4" />
              <span className="truncate">Kunde suchen...</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="end">
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
    </div>
  );
}
