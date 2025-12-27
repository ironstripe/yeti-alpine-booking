import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  ChevronDown,
  ChevronUp,
  Edit,
  Trash2,
  Save,
  X,
  Loader2,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Participant } from "@/hooks/useCustomerDetail";
import { useUpdateParticipant, useDeleteParticipant } from "@/hooks/useParticipants";
import {
  calculateAge,
  getInitials,
  getAvatarColor,
  getLevelInfo,
  LEVEL_OPTIONS,
} from "@/lib/participant-utils";

const editSchema = z.object({
  first_name: z.string().min(1, "Vorname ist erforderlich"),
  last_name: z.string().optional(),
  birth_date: z.date({ required_error: "Geburtsdatum ist erforderlich" }),
  level: z.string().optional(),
  sport: z.string().optional(),
  notes: z.string().optional(),
});

type EditFormData = z.infer<typeof editSchema>;

interface ParticipantCardProps {
  participant: Participant;
  customerId: string;
}

export function ParticipantCard({ participant, customerId }: ParticipantCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const updateParticipant = useUpdateParticipant(customerId);
  const deleteParticipant = useDeleteParticipant(customerId);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      first_name: participant.first_name,
      last_name: participant.last_name || "",
      birth_date: new Date(participant.birth_date),
      level: participant.level || "",
      sport: participant.sport || "ski",
      notes: participant.notes || "",
    },
  });

  const watchedBirthDate = watch("birth_date");
  const watchedSport = watch("sport");

  const age = calculateAge(participant.birth_date);
  const initials = getInitials(participant.first_name, participant.last_name);
  const avatarColor = getAvatarColor(participant.first_name);
  const levelInfo = getLevelInfo(participant.level);

  const fullName = [participant.first_name, participant.last_name]
    .filter(Boolean)
    .join(" ");

  const handleCancel = () => {
    reset();
    setIsEditing(false);
  };

  const onSubmit = async (data: EditFormData) => {
    await updateParticipant.mutateAsync({
      participantId: participant.id,
      data: {
        first_name: data.first_name,
        last_name: data.last_name || null,
        birth_date: format(data.birth_date, "yyyy-MM-dd"),
        level: data.level || null,
        sport: data.sport || "ski",
        notes: data.notes || null,
      },
    });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    await deleteParticipant.mutateAsync(participant.id);
  };

  if (isEditing) {
    return (
      <div className="border rounded-lg p-4 space-y-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor={`first_name_${participant.id}`}>Vorname *</Label>
              <Input
                id={`first_name_${participant.id}`}
                {...register("first_name")}
              />
              {errors.first_name && (
                <p className="text-sm text-destructive">
                  {errors.first_name.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`last_name_${participant.id}`}>Nachname</Label>
              <Input
                id={`last_name_${participant.id}`}
                {...register("last_name")}
              />
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

          <div className="space-y-2">
            <Label>Level</Label>
            <Select
              value={watch("level") || ""}
              onValueChange={(value) => setValue("level", value)}
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
            <Label>Sport</Label>
            <RadioGroup
              value={watchedSport}
              onValueChange={(value) => setValue("sport", value)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="ski" id={`sport_ski_${participant.id}`} />
                <Label
                  htmlFor={`sport_ski_${participant.id}`}
                  className="font-normal"
                >
                  ⛷️ Ski
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="snowboard"
                  id={`sport_snowboard_${participant.id}`}
                />
                <Label
                  htmlFor={`sport_snowboard_${participant.id}`}
                  className="font-normal"
                >
                  🏂 Snowboard
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`notes_${participant.id}`}>Notizen</Label>
            <Textarea
              id={`notes_${participant.id}`}
              {...register("notes")}
              placeholder="Anmerkungen zum Teilnehmer..."
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancel}
            >
              <X className="mr-1 h-4 w-4" />
              Abbrechen
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={updateParticipant.isPending}
            >
              {updateParticipant.isPending && (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              )}
              <Save className="mr-1 h-4 w-4" />
              Speichern
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
          <Avatar className={cn("h-10 w-10", avatarColor)}>
            <AvatarFallback className="text-primary-foreground font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{fullName}</span>
              <span className="text-sm text-muted-foreground">{age} Jahre</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={cn("text-xs", levelInfo.color)}>
                {levelInfo.label}
              </Badge>
              <span>{participant.sport === "snowboard" ? "🏂" : "⛷️"}</span>
            </div>
          </div>

          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="px-3 pb-3 pt-2 space-y-3 border-x border-b rounded-b-lg -mt-1">
          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Geburtsdatum:</span>
              <span>
                {format(new Date(participant.birth_date), "d. MMMM yyyy", {
                  locale: de,
                })}
              </span>
            </div>
            {participant.notes && (
              <div className="pt-2">
                <span className="text-muted-foreground">Notizen:</span>
                <p className="italic text-muted-foreground mt-1">
                  {participant.notes}
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
            >
              <Edit className="mr-1 h-4 w-4" />
              Bearbeiten
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Löschen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Teilnehmer löschen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Möchtest du {fullName} wirklich löschen? Diese Aktion kann
                    nicht rückgängig gemacht werden.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive hover:bg-destructive/90"
                  >
                    {deleteParticipant.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Löschen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
