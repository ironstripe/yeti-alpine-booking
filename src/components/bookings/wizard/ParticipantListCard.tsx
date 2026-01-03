import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus, User, AlertTriangle, Loader2, Pencil } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { calculateAge, getAgeDisplay } from "@/lib/participant-utils";
import { LEVEL_OPTIONS, getLevelLabel, getLevelBadgeColor } from "@/lib/level-utils";
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
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EnhancedDatePicker } from "@/components/ui/enhanced-date-picker";
import { ParticipantEditDialog } from "./ParticipantEditDialog";
import type { SelectedParticipant } from "@/contexts/BookingWizardContext";
import type { Tables } from "@/integrations/supabase/types";

interface ParticipantListCardProps {
  customerId: string;
  selectedParticipants: SelectedParticipant[];
  onToggle: (participant: SelectedParticipant) => void;
  onAddParticipant: (participant: Omit<SelectedParticipant, "id" | "isGuest">) => void;
}

const participantSchema = z.object({
  first_name: z.string().min(1, "Vorname ist erforderlich").max(100),
  birth_date: z.date({ required_error: "Geburtsdatum ist erforderlich" }),
  level_current_season: z.string().optional(),
  sport: z.string().default("ski"),
});

type ParticipantFormData = z.infer<typeof participantSchema>;

export function ParticipantListCard({
  customerId,
  selectedParticipants,
  onToggle,
  onAddParticipant,
}: ParticipantListCardProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<Tables<"customer_participants"> | null>(null);

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
      level_current_season: "",
      sport: "ski",
    },
  });

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
          level_current_season: data.level_current_season || null,
          sport: data.sport,
        })
        .select()
        .single();

      if (error) throw error;

      // Auto-select the new participant
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
      setIsAdding(false);
    } catch (error) {
      console.error("Error adding participant:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const isSelected = (id: string) => selectedParticipants.some((p) => p.id === id);
  const isAtLimit = selectedParticipants.length >= 6;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Teilnehmer
          {selectedParticipants.length > 0 && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ({selectedParticipants.length} ausgewählt)
            </span>
          )}
        </h3>
      </div>

      {/* Limit warning */}
      {isAtLimit && (
        <Alert variant="destructive" className="mb-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5" />
          <AlertDescription className="text-xs">
            Max. 6 Teilnehmer pro Buchung
          </AlertDescription>
        </Alert>
      )}

      {/* Participant grid */}
      <div className="space-y-1.5">
        {participants && participants.length > 0 ? (
          participants.map((participant) => {
            const selected = isSelected(participant.id);
            const age = calculateAge(participant.birth_date);
            const levelLabel = participant.level_current_season
              ? getLevelLabel(participant.level_current_season)
              : null;

            return (
              <div
                key={participant.id}
                className={cn(
                  "group flex items-center gap-2 rounded-md border px-3 py-2 transition-all cursor-pointer",
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
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
                {/* Checkbox */}
                <div
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-all",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/30"
                  )}
                >
                  {selected && <Check className="h-3 w-3" />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {participant.first_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {getAgeDisplay(age)}
                    </span>
                    {levelLabel && (
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px] h-5 px-1.5",
                          getLevelBadgeColor(participant.level_current_season!)
                        )}
                      >
                        {levelLabel}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Edit button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingParticipant(participant);
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
            );
          })
        ) : (
          <div className="py-6 text-center">
            <User className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              Keine Teilnehmer registriert
            </p>
          </div>
        )}
      </div>

      {/* Add new participant form */}
      {isAdding ? (
        <div className="mt-3 rounded-md border border-dashed p-3">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleAddParticipant)} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Vorname *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Lisa"
                          className="h-8 text-sm"
                          autoComplete="off"
                        />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="birth_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Geburtsdatum *</FormLabel>
                      <FormControl>
                        <EnhancedDatePicker
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Datum"
                          disabled={(date) =>
                            date > new Date() || date < new Date("1900-01-01")
                          }
                          minYear={2000}
                          maxYear={new Date().getFullYear()}
                        />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="sport"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Sport</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="ski">⛷️ Ski</SelectItem>
                          <SelectItem value="snowboard">🏂 Snowboard</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="level_current_season"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Level</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Auswählen" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {LEVEL_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    form.reset();
                    setIsAdding(false);
                  }}
                >
                  Abbrechen
                </Button>
                <Button type="submit" size="sm" disabled={isSaving}>
                  {isSaving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  Hinzufügen
                </Button>
              </div>
            </form>
          </Form>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full"
          onClick={() => setIsAdding(true)}
          disabled={isAtLimit}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Neuer Teilnehmer
        </Button>
      )}

      {/* Edit dialog */}
      {editingParticipant && (
        <ParticipantEditDialog
          participant={editingParticipant}
          open={!!editingParticipant}
          onOpenChange={(open) => !open && setEditingParticipant(null)}
          onSaved={() => {
            refetch();
            setEditingParticipant(null);
          }}
        />
      )}
    </div>
  );
}
