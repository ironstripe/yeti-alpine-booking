import { useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Calendar, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DateRange, getDateRangePresets } from "@/hooks/useReportsData";
import { cn } from "@/lib/utils";

interface DateRangeSelectorProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
}

export function DateRangeSelector({ dateRange, onDateRangeChange }: DateRangeSelectorProps) {
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const presets = getDateRangePresets();

  const handlePresetSelect = (preset: { label: string; getValue: () => DateRange }) => {
    onDateRangeChange(preset.getValue());
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2">
            {dateRange.label}
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {presets.map((preset) => (
            <DropdownMenuItem
              key={preset.label}
              onClick={() => handlePresetSelect(preset)}
            >
              {preset.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Popover open={isCustomOpen} onOpenChange={setIsCustomOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon">
            <Calendar className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <CalendarComponent
            mode="range"
            selected={{
              from: dateRange.start,
              to: dateRange.end,
            }}
            onSelect={(range) => {
              if (range?.from && range?.to) {
                onDateRangeChange({
                  start: range.from,
                  end: range.to,
                  label: `${format(range.from, "dd.MM.yyyy")} - ${format(range.to, "dd.MM.yyyy")}`
                });
                setIsCustomOpen(false);
              }
            }}
            numberOfMonths={2}
            locale={de}
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>

      <span className="text-sm text-muted-foreground">
        📅 {format(dateRange.start, "dd.MM.yyyy", { locale: de })} - {format(dateRange.end, "dd.MM.yyyy", { locale: de })}
      </span>
    </div>
  );
}
