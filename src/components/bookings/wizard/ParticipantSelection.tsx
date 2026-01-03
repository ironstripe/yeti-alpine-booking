import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus, User, AlertTriangle, Loader2, ArrowRight, TrendingUp } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { de } from "date-fns/locale";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { calculateAge, getAgeDisplay } from "@/lib/participant-utils";
import { 
  LEVEL_OPTIONS, 
  getLevelLabel, 
  getLevelBadgeColor, 
  getNextLevel,
  isLevelUpgrade 
} from "@/lib/level-utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EnhancedDatePicker } from "@/components/ui/enhanced-date-picker";

import type { SelectedParticipant } from "@/contexts/BookingWizardContext";

interface ParticipantSelectionProps {
  customerId: string;
  selectedParticipants: SelectedParticipant[];
  onToggle: (participant: SelectedParticipant) => void;
  onAddParticipant: (participant: Omit<SelectedParticipant, "id" | "isGuest">) => void;
  onAddGuest: (participant: Omit<SelectedParticipant, "id" | "isGuest">) => void;
}

const participantSchema = z.object({
  first_name: z.string().min(1, "Vorname ist erforderlich").max(100),
  birth_date: z.date({ required_error: "Geburtsdatum ist erforderlich" }),
  level_last_season: z.string().optional(),
  level_current_season: z.string().optional(),
  sport: z.string().default("ski"),
});

type ParticipantFormData = z.infer<typeof participantSchema>;

const sportOptions = [
  { value: "ski", label: "Ski" },
  { value: "snowboard", label: "Snowboard" },
];

export function ParticipantSelection({
  customerId,
  selectedParticipants,
  onToggle,
  onAddParticipant,
  onAddGuest,
}: ParticipantSelectionProps) {
  const [isAddingParticipant, setIsAddingParticipant] = useState(false);
  const [isAddingGuest, setIsAddingGuest] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { data: participants, isLoading, refetch } = useQuery({
    queryKey: ["customer-participants", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_participants")
        .select("*")
        .eq("customer_id", customerId)
        .order("first_name");

      if (error) throw error;
      return data;
    },
    enabled: !!customerId,
  });

  const form = useForm<ParticipantFormData>({
    resolver: zodResolver(participantSchema),
    defaultValues: {
      first_name: "",
      level_last_season: "",
      level_current_season: "",
      sport: "ski",
    },
  });

  // Watch level_last_season to auto-suggest current season level
  const levelLastSeason = form.watch("level_last_season");

  useEffect(() => {
    if (levelLastSeason) {
      const suggestedLevel = getNextLevel(levelLastSeason);
      if (suggestedLevel) {
        form.setValue("level_current_season", suggestedLevel);
      }
    }
  }, [levelLastSeason, form]);

  const handleAddParticipant = async (data: ParticipantFormData) => {
    setIsSaving(true);
    try {
      const { data: newParticipant, error } = await supabase
        .from("customer_participants")
        .insert({
          customer_id: customerId,
          first_name: data.first_name,
          last_name: null,
          birth_date: format(data.birth_date, "yyyy-MM-dd"),
          level_last_season: data.level_last_season || null,
          level_current_season: data.level_current_season || null,
          sport: data.sport,
        })
        .select()
        .single();

      if (error) throw error;

      // Auto-select the new participant
      onAddParticipant({
        first_name: newParticipant.first_name,
        last_name: newParticipant.last_name,
        birth_date: newParticipant.birth_date,
        level_last_season: newParticipant.level_last_season,
        level_current_season: newParticipant.level_current_season,
        sport: newParticipant.sport,
      });

      // Also toggle it to be selected
      onToggle({
        id: newParticipant.id,
        first_name: newParticipant.first_name,
        last_name: newParticipant.last_name,
        birth_date: newParticipant.birth_date,
        level_last_season: newParticipant.level_last_season,
        level_current_season: newParticipant.level_current_season,
        sport: newParticipant.sport,
      });

      refetch();
      form.reset();
      setIsAddingParticipant(false);
    } catch (error) {
      console.error("Error adding participant:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddGuest = (data: ParticipantFormData) => {
    onAddGuest({
      first_name: data.first_name,
      last_name: null,
      birth_date: format(data.birth_date, "yyyy-MM-dd"),
      level_last_season: data.level_last_season || null,
      level_current_season: data.level_current_season || null,
      sport: data.sport,
    });
    form.reset();
    setIsAddingGuest(false);
  };

  const isSelected = (id: string) => selectedParticipants.some((p) => p.id === id);
  const isAtLimit = selectedParticipants.length >= 6;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const renderLevelDisplay = (lastSeason: string | null, currentSeason: string | null) => {
    const hasUpgrade = isLevelUpgrade(lastSeason, currentSeason);
    
    if (lastSeason && currentSeason) {
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <Badge variant="secondary" className={cn("text-xs", getLevelBadgeColor(lastSeason))}>
            {getLevelLabel(lastSeason)}
          </Badge>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <Badge variant="secondary" className={cn("text-xs", getLevelBadgeColor(currentSeason))}>
            {getLevelLabel(currentSeason)}
          </Badge>
          {hasUpgrade && (
            <Badge variant="outline" className="text-xs text-green-600 border-green-300 gap-1">
              <TrendingUp className="h-3 w-3" />
              aufgestuft
            </Badge>
          )}
        </div>
      );
    }
    
    if (currentSeason) {
      return (
        <Badge variant="secondary" className={cn("text-xs", getLevelBadgeColor(currentSeason))}>
          {getLevelLabel(currentSeason)}
        </Badge>
      );
    }
    
    if (lastSeason) {
      return (
        <Badge variant="secondary" className={cn("text-xs", getLevelBadgeColor(lastSeason))}>
          {getLevelLabel(lastSeason)} (letzte Saison)
        </Badge>
      );
    }
    
    return null;
  };

  const renderParticipantForm = (isGuest: boolean) => (
    <Card className={isGuest ? "border-dashed" : ""}>
      <CardContent className="p-4">
        {isGuest && (
          <div className="mb-4 flex items-center gap-2">
            <Badge variant="outline">Gast</Badge>
            <span className="text-sm text-muted-foreground">
              Wird nicht dauerhaft zum Kunden hinzugefügt
            </span>
          </div>
        )}
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(isGuest ? handleAddGuest : handleAddParticipant)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="first_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Vorname <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Lisa"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="birth_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Geburtsdatum <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <EnhancedDatePicker
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Datum wählen"
                      disabled={(date) =>
                        date > new Date() || date < new Date("1900-01-01")
                      }
                      minYear={2000}
                      maxYear={new Date().getFullYear()}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sport"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sport</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {sportOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="level_last_season"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Level letzte Saison</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Auswählen..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LEVEL_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="level_current_season"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Level diese Saison</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Auswählen..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LEVEL_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {levelLastSeason && getNextLevel(levelLastSeason) && (
                      <FormDescription className="text-xs text-muted-foreground">
                        💡 Vorschlag basierend auf letzter Saison
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  form.reset();
                  if (isGuest) {
                    setIsAddingGuest(false);
                  } else {
                    setIsAddingParticipant(false);
                  }
                }}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={isSaving && !isGuest}>
                {isSaving && !isGuest && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isGuest ? "Gast hinzufügen" : "Hinzufügen"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Warning if at limit */}
      {isAtLimit && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Maximal 6 Teilnehmer pro Buchung erlaubt.
          </AlertDescription>
        </Alert>
      )}

      {/* Existing participants */}
      {participants && participants.length > 0 && (
        <div className="space-y-2">
          {participants.map((participant) => {
            const selected = isSelected(participant.id);
            const age = calculateAge(participant.birth_date);

            return (
              <Card
                key={participant.id}
                className={cn(
                  "cursor-pointer transition-all hover:border-primary/50",
                  selected && "border-primary bg-primary/5"
                )}
                onClick={() => {
                  if (!selected && isAtLimit) return;
                  onToggle({
                    id: participant.id,
                    first_name: participant.first_name,
                    last_name: participant.last_name,
                    birth_date: participant.birth_date,
                    level_last_season: participant.level_last_season,
                    level_current_season: participant.level_current_season,
                    sport: participant.sport,
                  });
                }}
              >
                <CardContent className="flex items-center gap-3 p-3">
                  <div
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded border-2 transition-all",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30"
                    )}
                  >
                    {selected && <Check className="h-4 w-4" />}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">
                      {participant.first_name} {participant.last_name}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>{getAgeDisplay(age)}</span>
                      {participant.sport && (
                        <>
                          <span>·</span>
                          <span className="capitalize">{participant.sport}</span>
                        </>
                      )}
                    </div>
                    {(participant.level_last_season || participant.level_current_season) && (
                      <div className="mt-1">
                        {renderLevelDisplay(participant.level_last_season, participant.level_current_season)}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Guest participants (temporary) */}
      {selectedParticipants.filter((p) => p.isGuest).map((guest) => {
        const age = calculateAge(guest.birth_date);
        return (
          <Card key={guest.id} className="border-primary bg-primary/5">
            <CardContent className="flex items-center gap-3 p-3">
              <div className="flex h-6 w-6 items-center justify-center rounded border-2 border-primary bg-primary text-primary-foreground">
                <Check className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{guest.first_name}</p>
                  <Badge variant="outline" className="text-xs">
                    Gast
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>{getAgeDisplay(age)}</span>
                  {guest.sport && (
                    <>
                      <span>·</span>
                      <span className="capitalize">{guest.sport}</span>
                    </>
                  )}
                </div>
                {(guest.level_last_season || guest.level_current_season) && (
                  <div className="mt-1">
                    {renderLevelDisplay(guest.level_last_season, guest.level_current_season)}
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(guest);
                }}
              >
                Entfernen
              </Button>
            </CardContent>
          </Card>
        );
      })}

      {/* Add participant button */}
      {!isAddingParticipant && !isAddingGuest && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setIsAddingParticipant(true)}
          disabled={isAtLimit}
        >
          <Plus className="mr-2 h-4 w-4" />
          Teilnehmer hinzufügen
        </Button>
      )}

      {/* Add participant form */}
      {isAddingParticipant && renderParticipantForm(false)}


      {/* Empty state */}
      {(!participants || participants.length === 0) &&
        selectedParticipants.filter((p) => p.isGuest).length === 0 &&
        !isAddingParticipant &&
        !isAddingGuest && (
          <div className="py-8 text-center">
            <User className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-muted-foreground">
              Keine Teilnehmer registriert
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setIsAddingParticipant(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Ersten Teilnehmer hinzufügen
            </Button>
          </div>
        )}
    </div>
  );
}
