import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface SearchableSelectProps<T> {
  items: T[];
  value: T | null;
  onChange: (item: T | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  renderItem: (item: T) => React.ReactNode;
  getItemKey: (item: T) => string;
  searchFn: (item: T, query: string) => boolean;
  emptyMessage?: string;
  /** Optional: Create new option shown at the bottom */
  onCreate?: {
    label: string;
    onClick: () => void;
  };
  disabled?: boolean;
  className?: string;
}

export function SearchableSelect<T>({
  items,
  value,
  onChange,
  placeholder = "Auswählen...",
  searchPlaceholder = "Suchen...",
  renderItem,
  getItemKey,
  searchFn,
  emptyMessage = "Keine Ergebnisse gefunden.",
  onCreate,
  disabled = false,
  className,
}: SearchableSelectProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const filteredItems = React.useMemo(() => {
    if (!query) return items;
    return items.filter((item) => searchFn(item, query));
  }, [items, query, searchFn]);

  const handleSelect = (item: T) => {
    onChange(item);
    setOpen(false);
    setQuery("");
  };

  const handleClear = () => {
    onChange(null);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="truncate">
            {value ? renderItem(value) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandEmpty>{emptyMessage}</CommandEmpty>
          <CommandGroup className="max-h-60 overflow-auto">
            {filteredItems.map((item) => {
              const key = getItemKey(item);
              const isSelected = value && getItemKey(value) === key;
              
              return (
                <CommandItem
                  key={key}
                  value={key}
                  onSelect={() => handleSelect(item)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      isSelected ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {renderItem(item)}
                </CommandItem>
              );
            })}
          </CommandGroup>

          {/* CREATE NEW - Always at the bottom, separated */}
          {onCreate && (
            <>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    onCreate.onClick();
                    setOpen(false);
                  }}
                  className="text-primary"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {onCreate.label}
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
