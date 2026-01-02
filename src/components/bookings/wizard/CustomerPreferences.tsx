import { useState } from "react";
import { Search, Info, X } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { useInstructors } from "@/hooks/useInstructors";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

interface CustomerPreferencesProps {
  preferredInstructorId: string | null;
  language: string;
  customerNotes: string;
  onPreferredInstructorChange: (id: string | null) => void;
  onLanguageChange: (language: string) => void;
  onCustomerNotesChange: (notes: string) => void;
}

const LANGUAGES = [
  { code: "de", label: "DE", flag: "🇩🇪", name: "Deutsch" },
  { code: "en", label: "EN", flag: "🇬🇧", name: "English" },
  { code: "fr", label: "FR", flag: "🇫🇷", name: "Français" },
  { code: "it", label: "IT", flag: "🇮🇹", name: "Italiano" },
];

export function CustomerPreferences({
  preferredInstructorId,
  language,
  customerNotes,
  onPreferredInstructorChange,
  onLanguageChange,
  onCustomerNotesChange,
}: CustomerPreferencesProps) {
  const { data: instructors } = useInstructors();
  const [searchOpen, setSearchOpen] = useState(false);

  const preferredInstructor = instructors?.find(
    (i) => i.id === preferredInstructorId
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Kundenwünsche
        </h3>
      </div>

      {/* Preferred Instructor */}
      <div className="space-y-2">
        <Label>Bevorzugter Skilehrer (optional)</Label>
        {preferredInstructor ? (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
            <span className="flex-1">
              {preferredInstructor.first_name} {preferredInstructor.last_name}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onPreferredInstructorChange(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Popover open={searchOpen} onOpenChange={setSearchOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-muted-foreground"
              >
                <Search className="mr-2 h-4 w-4" />
                Skilehrer suchen...
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
              <Command>
                <CommandInput placeholder="Skilehrer suchen..." />
                <CommandList>
                  <CommandEmpty>Keine Skilehrer gefunden.</CommandEmpty>
                  <CommandGroup>
                    {instructors
                      ?.filter((i) => i.status === "active")
                      .map((instructor) => (
                        <CommandItem
                          key={instructor.id}
                          value={`${instructor.first_name} ${instructor.last_name}`}
                          onSelect={() => {
                            onPreferredInstructorChange(instructor.id);
                            setSearchOpen(false);
                          }}
                        >
                          {instructor.first_name} {instructor.last_name}
                        </CommandItem>
                      ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
        <p className="flex items-start gap-1 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 flex-shrink-0" />
          Falls der Wunschlehrer nicht verfügbar ist, wird ein passender Ersatz
          zugeteilt.
        </p>
      </div>

      {/* Language Selection */}
      <div className="space-y-2">
        <Label>Sprache des Unterrichts</Label>
        <div className="flex gap-2">
          {LANGUAGES.map((lang) => (
            <Button
              key={lang.code}
              variant={language === lang.code ? "default" : "outline"}
              size="sm"
              className={cn(
                "flex-1 gap-1",
                language === lang.code && "ring-1 ring-offset-1"
              )}
              onClick={() => onLanguageChange(lang.code)}
            >
              <span>{lang.flag}</span>
              <span>{lang.label}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Special Notes */}
      <div className="space-y-2">
        <Label htmlFor="customer-notes">Besondere Hinweise</Label>
        <Textarea
          id="customer-notes"
          placeholder="z.B. Allergien, Ängste, besondere Bedürfnisse..."
          value={customerNotes}
          onChange={(e) => onCustomerNotesChange(e.target.value)}
          className="min-h-[80px]"
        />
      </div>
    </div>
  );
}