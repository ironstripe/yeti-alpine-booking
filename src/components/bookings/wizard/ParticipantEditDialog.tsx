import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { LEVEL_OPTIONS, getNextLevel } from "@/lib/level-utils";
import type { Tables } from "@/integrations/supabase/types";

const participantEditSchema = z.object({
  first_name: z.string().min(1, "Vorname ist erforderlich").max(100),
  birth_date: z.date({ required_error: "Geburtsdatum ist erforderlich" }),
  level_last_season: z.string().optional(),
  level_current_season: z.string().optional(),
  sport: z.string().default("ski"),
});

type ParticipantEditFormData = z.infer<typeof participantEditSchema>;

const sportOptions = [
  { value: "ski", label: "Ski" },
  { value: "snowboard", label: "Snowboard" },
];

interface ParticipantEditDialogProps {
  participant: Tables<"customer_participants">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function ParticipantEditDialog({
  participant,
  open,
  onOpenChange,
  onSaved,
}: ParticipantEditDialogProps) {
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: async (data: ParticipantEditFormData) => {
      const { error } = await supabase
        .from("customer_participants")
        .update({
          first_name: data.first_name,
          birth_date: format(data.birth_date, "yyyy-MM-dd"),
          level_last_season: data.level_last_season || null,
          level_current_season: data.level_current_season || null,
          sport: data.sport,
        })
        .eq("id", participant.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["customer-participants", participant.customer_id],
      });
      toast.success("Teilnehmer aktualisiert");
      onSaved();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Fehler beim Speichern");
      console.error("Update participant error:", error);
    },
  });

  const form = useForm<ParticipantEditFormData>({
    resolver: zodResolver(participantEditSchema),
    defaultValues: {
      first_name: participant.first_name,
      birth_date: new Date(participant.birth_date),
      level_last_season: participant.level_last_season || "",
      level_current_season: participant.level_current_season || "",
      sport: participant.sport || "ski",
    },
  });

  // Watch level_last_season to auto-suggest current season level
  const levelLastSeason = form.watch("level_last_season");

  useEffect(() => {
    if (levelLastSeason) {
      const suggestedLevel = getNextLevel(levelLastSeason);
      if (suggestedLevel && !form.getValues("level_current_season")) {
        form.setValue("level_current_season", suggestedLevel);
      }
    }
  }, [levelLastSeason, form]);

  const onSubmit = (data: ParticipantEditFormData) => {
    updateMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Teilnehmer bearbeiten</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="first_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Vorname <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Lisa" autoComplete="off" />
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

            <div className="grid grid-cols-2 gap-3">
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
                      <FormDescription className="text-xs">
                        💡 Vorschlag basierend auf letzter Saison
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Speichern
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
