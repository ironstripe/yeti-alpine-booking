import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { searchCities, CityMatch, getCountryFlag } from "@/lib/plz-lookup";
import { cn } from "@/lib/utils";

interface CityAutocompleteProps {
  value: string;
  onChange: (city: string) => void;
  onSelect: (match: CityMatch) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

export function CityAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Ort eingeben...",
  className,
  id,
}: CityAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<CityMatch[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value.length >= 2) {
      const matches = searchCities(value, 8);
      setSuggestions(matches);
      setIsOpen(matches.length > 0);
    } else {
      setSuggestions([]);
      setIsOpen(false);
    }
    setHighlightedIndex(-1);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
          handleSelect(suggestions[highlightedIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        break;
    }
  };

  const handleSelect = (match: CityMatch) => {
    onSelect(match);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => value.length >= 2 && suggestions.length > 0 && setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto">
          {suggestions.map((match, index) => (
            <button
              key={`${match.plz}-${match.city}`}
              type="button"
              className={cn(
                "w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between",
                highlightedIndex === index && "bg-accent text-accent-foreground"
              )}
              onClick={() => handleSelect(match)}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <span className="font-medium">{match.city}</span>
              <span className="text-muted-foreground text-xs flex items-center gap-1">
                <span>{getCountryFlag(match.country)}</span>
                <span>{match.plz}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
