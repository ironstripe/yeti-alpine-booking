import * as React from "react";
import { format, parse, isValid, setYear, getYear } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarIcon, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
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

interface EnhancedDatePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: (date: Date) => boolean;
  className?: string;
  minYear?: number;
  maxYear?: number;
}

export function EnhancedDatePicker({
  value,
  onChange,
  placeholder = "Datum wählen",
  disabled,
  className,
  minYear = 1950,
  maxYear = new Date().getFullYear(),
}: EnhancedDatePickerProps) {
  const [inputValue, setInputValue] = React.useState("");
  const [displayMonth, setDisplayMonth] = React.useState<Date>(value ?? new Date());
  const [isOpen, setIsOpen] = React.useState(false);

  // Sync input value when prop value changes
  React.useEffect(() => {
    if (value) {
      setInputValue(format(value, "dd.MM.yyyy"));
      setDisplayMonth(value);
    } else {
      setInputValue("");
    }
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);

    // Try to parse the date when complete
    if (newValue.length === 10) {
      const parsed = parse(newValue, "dd.MM.yyyy", new Date());
      if (isValid(parsed)) {
        const year = getYear(parsed);
        if (year >= minYear && year <= maxYear) {
          onChange(parsed);
          setDisplayMonth(parsed);
        }
      }
    }
  };

  const handleInputBlur = () => {
    // Validate and format on blur
    if (inputValue) {
      const parsed = parse(inputValue, "dd.MM.yyyy", new Date());
      if (isValid(parsed)) {
        const year = getYear(parsed);
        if (year >= minYear && year <= maxYear) {
          setInputValue(format(parsed, "dd.MM.yyyy"));
          onChange(parsed);
        } else {
          // Reset to previous valid value
          setInputValue(value ? format(value, "dd.MM.yyyy") : "");
        }
      } else {
        // Reset to previous valid value
        setInputValue(value ? format(value, "dd.MM.yyyy") : "");
      }
    }
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    onChange(date);
    if (date) {
      setInputValue(format(date, "dd.MM.yyyy"));
      setDisplayMonth(date);
    }
    setIsOpen(false);
  };

  const handleYearChange = (yearStr: string) => {
    const year = parseInt(yearStr, 10);
    const newMonth = setYear(displayMonth, year);
    setDisplayMonth(newMonth);
  };

  const handleMonthNavigation = (direction: "prev" | "next" | "prevYear" | "nextYear") => {
    setDisplayMonth((current) => {
      const currentYear = getYear(current);
      const currentMonth = current.getMonth();
      
      switch (direction) {
        case "prev":
          return new Date(currentYear, currentMonth - 1, 1);
        case "next":
          return new Date(currentYear, currentMonth + 1, 1);
        case "prevYear":
          return new Date(currentYear - 1, currentMonth, 1);
        case "nextYear":
          return new Date(currentYear + 1, currentMonth, 1);
        default:
          return current;
      }
    });
  };

  // Generate year options
  const years = React.useMemo(() => {
    const result = [];
    for (let year = maxYear; year >= minYear; year--) {
      result.push(year);
    }
    return result;
  }, [minYear, maxYear]);

  return (
    <div className={cn("flex gap-2", className)}>
      <Input
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        placeholder="TT.MM.JJJJ"
        className="w-[120px]"
        maxLength={10}
      />
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "flex-1 justify-start text-left font-normal",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value ? format(value, "PPP", { locale: de }) : <span>{placeholder}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          {/* Custom header with year navigation */}
          <div className="flex items-center justify-between gap-1 border-b p-2">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handleMonthNavigation("prevYear")}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handleMonthNavigation("prev")}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {format(displayMonth, "MMMM", { locale: de })}
              </span>
              <Select
                value={String(getYear(displayMonth))}
                onValueChange={handleYearChange}
              >
                <SelectTrigger className="h-7 w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {years.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handleMonthNavigation("next")}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handleMonthNavigation("nextYear")}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Calendar
            mode="single"
            selected={value}
            onSelect={handleCalendarSelect}
            month={displayMonth}
            onMonthChange={setDisplayMonth}
            disabled={disabled}
            className="pointer-events-auto"
            classNames={{
              caption: "hidden", // Hide default caption since we have custom header
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
