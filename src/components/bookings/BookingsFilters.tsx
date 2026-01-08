import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Search, SlidersHorizontal, Columns3, X } from "lucide-react";
import { TicketFilters } from "@/hooks/useTickets";
import { EnhancedDatePicker } from "@/components/ui/enhanced-date-picker";

interface BookingsFiltersProps {
  searchInput: string;
  onSearchChange: (value: string) => void;
  filters: TicketFilters;
  onFiltersChange: (filters: TicketFilters) => void;
  visibleColumns: string[];
  onColumnsChange: (columns: string[]) => void;
}

const STATUS_OPTIONS = [
  { value: "confirmed", label: "Bestätigt" },
  { value: "draft", label: "Entwurf" },
  { value: "cancelled", label: "Storniert" },
];

const PRODUCT_TYPE_OPTIONS = [
  { value: "private", label: "Privatstunde" },
  { value: "group", label: "Gruppenkurs" },
  { value: "windel", label: "Windel-Wedelkurs" },
  { value: "kids_village", label: "Kids Village" },
];

const PAYMENT_STATUS_OPTIONS = [
  { value: "paid", label: "Bezahlt" },
  { value: "partial", label: "Teilbezahlt" },
  { value: "open", label: "Offen" },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: "cash", label: "Bar" },
  { value: "card", label: "Karte" },
  { value: "twint", label: "TWINT" },
  { value: "invoice", label: "Rechnung" },
];

const ALL_COLUMNS = [
  { id: "ticket", label: "Ticket" },
  { id: "customer", label: "Kunde" },
  { id: "course", label: "Kurs" },
  { id: "dateTime", label: "Datum & Zeit" },
  { id: "instructor", label: "Lehrer" },
  { id: "total", label: "Total" },
  { id: "status", label: "Status" },
];

export function BookingsFilters({
  searchInput,
  onSearchChange,
  filters,
  onFiltersChange,
  visibleColumns,
  onColumnsChange,
}: BookingsFiltersProps) {
  const [filterOpen, setFilterOpen] = useState(false);

  const hasActiveFilters = 
    filters.status.length > 0 ||
    filters.productType.length > 0 ||
    filters.paymentStatus.length > 0 ||
    filters.paymentMethod.length > 0 ||
    filters.dateFrom !== undefined ||
    filters.dateTo !== undefined;

  const activeFilterCount = [
    filters.status.length > 0,
    filters.productType.length > 0,
    filters.paymentStatus.length > 0,
    filters.paymentMethod.length > 0,
    filters.dateFrom !== undefined || filters.dateTo !== undefined,
  ].filter(Boolean).length;

  const toggleArrayFilter = (
    key: keyof Pick<TicketFilters, "status" | "productType" | "paymentStatus" | "paymentMethod">,
    value: string
  ) => {
    const current = filters[key];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onFiltersChange({ ...filters, [key]: updated });
  };

  const clearFilters = () => {
    onFiltersChange({
      ...filters,
      status: [],
      productType: [],
      paymentStatus: [],
      paymentMethod: [],
      dateFrom: undefined,
      dateTo: undefined,
    });
  };

  return (
    <div className="flex items-center gap-2 mb-4">
      {/* Search Input */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Ticket-Nr, Name, Tel, E-Mail..."
          value={searchInput}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filter Popover */}
      <Popover open={filterOpen} onOpenChange={setFilterOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Filter
            {activeFilterCount > 0 && (
              <span className="ml-1 rounded-full bg-primary text-primary-foreground text-xs px-1.5 py-0.5">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Filter</h4>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-auto py-1 px-2 text-xs"
                >
                  <X className="h-3 w-3 mr-1" />
                  Zurücksetzen
                </Button>
              )}
            </div>

            {/* Date Range */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Datumsbereich</Label>
              <div className="flex gap-2">
                <EnhancedDatePicker
                  value={filters.dateFrom}
                  onChange={(date) => onFiltersChange({ ...filters, dateFrom: date })}
                  placeholder="Von"
                />
                <EnhancedDatePicker
                  value={filters.dateTo}
                  onChange={(date) => onFiltersChange({ ...filters, dateTo: date })}
                  placeholder="Bis"
                />
              </div>
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Status</Label>
              <div className="space-y-1">
                {STATUS_OPTIONS.map((option) => (
                  <div key={option.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`status-${option.value}`}
                      checked={filters.status.includes(option.value)}
                      onCheckedChange={() => toggleArrayFilter("status", option.value)}
                    />
                    <label
                      htmlFor={`status-${option.value}`}
                      className="text-sm cursor-pointer"
                    >
                      {option.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Course Type */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Kursart</Label>
              <div className="space-y-1">
                {PRODUCT_TYPE_OPTIONS.map((option) => (
                  <div key={option.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`type-${option.value}`}
                      checked={filters.productType.includes(option.value)}
                      onCheckedChange={() => toggleArrayFilter("productType", option.value)}
                    />
                    <label
                      htmlFor={`type-${option.value}`}
                      className="text-sm cursor-pointer"
                    >
                      {option.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment Status */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Zahlungsstatus</Label>
              <div className="space-y-1">
                {PAYMENT_STATUS_OPTIONS.map((option) => (
                  <div key={option.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`payment-${option.value}`}
                      checked={filters.paymentStatus.includes(option.value)}
                      onCheckedChange={() => toggleArrayFilter("paymentStatus", option.value)}
                    />
                    <label
                      htmlFor={`payment-${option.value}`}
                      className="text-sm cursor-pointer"
                    >
                      {option.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Zahlungsart</Label>
              <div className="space-y-1">
                {PAYMENT_METHOD_OPTIONS.map((option) => (
                  <div key={option.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`method-${option.value}`}
                      checked={filters.paymentMethod.includes(option.value)}
                      onCheckedChange={() => toggleArrayFilter("paymentMethod", option.value)}
                    />
                    <label
                      htmlFor={`method-${option.value}`}
                      className="text-sm cursor-pointer"
                    >
                      {option.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Column Visibility */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon">
            <Columns3 className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Spalten anzeigen</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {ALL_COLUMNS.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={visibleColumns.includes(column.id)}
              onCheckedChange={(checked) => {
                if (checked) {
                  onColumnsChange([...visibleColumns, column.id]);
                } else {
                  onColumnsChange(visibleColumns.filter((c) => c !== column.id));
                }
              }}
            >
              {column.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
