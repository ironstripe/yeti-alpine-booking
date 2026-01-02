import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Plus, Users, X, Loader2, CalendarIcon, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { Participant } from "@/hooks/useCustomerDetail";
import { useCreateParticipant } from "@/hooks/useParticipants";
import { ParticipantCard } from "./ParticipantCard";
import { LEVEL_OPTIONS } from "@/lib/participant-utils";

const MAX_PARTICIPANTS = 10;

const createSchema = z.object({
  first_name: z.string().min(1, "Vorname ist erforderlich"),
  last_name: z.string().optional(),
  birth_date: z.date({ required_error: "Geburtsdatum ist erforderlich" }),
  level_last_season: z.string().optional(),
  level_current_season: z.string().optional(),
  sport: z.string().default("ski"),
  notes: z.string().optional(),
});

type CreateFormData = z.infer<typeof createSchema>;

interface FamilyHubProps {
  customerId: string;
  customerLastName: string;
  participants: Participant[];
}

export function FamilyHub({
  customerId,
  customerLastName,
  participants,
}: FamilyHubProps) {
  const [isAdding, setIsAdding] = useState(false);
  const createParticipant = useCreateParticipant(customerId);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      first_name: "",
      last_name: customerLastName,
      sport: "ski",
      notes: "",
    },
  });

  const watchedBirthDate = watch("birth_date");
  const watchedSport = watch("sport");

  const isAtLimit = participants.length >= MAX_PARTICIPANTS;

  const handleCancel = () => {
    reset({
      first_name: "",
      last_name: customerLastName,
      sport: "ski",
      notes: "",
    });
    setIsAdding(false);
  };

  const onSubmit = async (data: CreateFormData) => {
    await createParticipant.mutateAsync({
      customer_id: customerId,
      first_name: data.first_name,
      last_name: data.last_name || null,
      birth_date: format(data.birth_date, "yyyy-MM-dd"),
      level_last_season: data.level_last_season || null,
      level_current_season: data.level_current_season || null,
      sport: data.sport || "ski",
      notes: data.notes || null,
    });
    handleCancel();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Familie</CardTitle>
          <Badge variant="secondary">{participants.length}</Badge>
        </div>
        {!isAdding && !isAtLimit && (
          <Button size="sm" onClick={() => setIsAdding(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Teilnehmer
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isAtLimit && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Maximum von {MAX_PARTICIPANTS} Teilnehmern erreicht.
            </AlertDescription>
          </Alert>
        )}

        {isAdding && (
          <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
            <div className="font-medium">Neuer Teilnehmer</div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new_first_name">Vorname *</Label>
                  <Input id="new_first_name" {...register("first_name")} />
                  {errors.first_name && (
                    <p className="text-sm text-destructive">
                      {errors.first_name.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new_last_name">Nachname</Label>
                  <Input id="new_last_name" {...register("last_name")} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Geburtsdatum *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !watchedBirthDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {watchedBirthDate
                        ? format(watchedBirthDate, "d. MMMM yyyy", { locale: de })
                        : "Datum wählen"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={watchedBirthDate}
                      onSelect={(date) => date && setValue("birth_date", date)}
                      disabled={(date) =>
                        date > new Date() || date < new Date("1900-01-01")
                      }
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                {errors.birth_date && (
                  <p className="text-sm text-destructive">
                    {errors.birth_date.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Level letzte Saison</Label>
                  <Select
                    value={watch("level_last_season") || ""}
                    onValueChange={(value) => setValue("level_last_season", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Level wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEVEL_OPTIONS.map((level) => (
                        <SelectItem key={level.value} value={level.value}>
                          {level.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Level diese Saison</Label>
                  <Select
                    value={watch("level_current_season") || ""}
                    onValueChange={(value) => setValue("level_current_season", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Level wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEVEL_OPTIONS.map((level) => (
                        <SelectItem key={level.value} value={level.value}>
                          {level.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Sport</Label>
                <RadioGroup
                  value={watchedSport}
                  onValueChange={(value) => setValue("sport", value)}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="ski" id="new_sport_ski" />
                    <Label htmlFor="new_sport_ski" className="font-normal">
                      ⛷️ Ski
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="snowboard" id="new_sport_snowboard" />
                    <Label htmlFor="new_sport_snowboard" className="font-normal">
                      🏂 Snowboard
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new_notes">Notizen</Label>
                <Textarea
                  id="new_notes"
                  {...register("notes")}
                  placeholder="Anmerkungen zum Teilnehmer..."
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={handleCancel}>
                  <X className="mr-1 h-4 w-4" />
                  Abbrechen
                </Button>
                <Button type="submit" disabled={createParticipant.isPending}>
                  {createParticipant.isPending && (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  )}
                  Speichern
                </Button>
              </div>
            </form>
          </div>
        )}

        {participants.length === 0 && !isAdding ? (
          <div className="text-center py-8">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <h3 className="mt-4 font-medium">Noch keine Teilnehmer</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Füge Familienmitglieder hinzu, die an Kursen teilnehmen
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setIsAdding(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Teilnehmer hinzufügen
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {participants.map((participant) => (
              <ParticipantCard
                key={participant.id}
                participant={participant}
                customerId={customerId}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
