import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  useCreateTaskTemplate,
  useUpdateTaskTemplate,
  type DailyTaskTemplate,
} from "@/hooks/useDailyTasks";
import { toast } from "sonner";

const WEEKDAYS = [
  { value: 1, label: "Mo" },
  { value: 2, label: "Di" },
  { value: 3, label: "Mi" },
  { value: 4, label: "Do" },
  { value: 5, label: "Fr" },
  { value: 6, label: "Sa" },
  { value: 0, label: "So" },
];

const LINKED_ACTIONS = [
  { value: "", label: "Keine Aktion" },
  { value: "print_lunch_list", label: "Mittagsliste drucken" },
  { value: "print_group_list", label: "Gruppenliste drucken" },
  { value: "print_instructor_schedule", label: "Lehrerplan drucken" },
  { value: "print_daily_overview", label: "Tagesübersicht drucken" },
];

interface DailyTaskFormProps {
  task?: DailyTaskTemplate | null;
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormData {
  title: string;
  due_time: string;
  recurrence: "daily" | "weekdays" | "weekly";
  weekdays: number[];
  linked_action: string;
}

export function DailyTaskForm({ task, onSuccess, onCancel }: DailyTaskFormProps) {
  const isEditing = !!task;
  const createMutation = useCreateTaskTemplate();
  const updateMutation = useUpdateTaskTemplate();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      title: task?.title || "",
      due_time: task?.due_time?.slice(0, 5) || "",
      recurrence: task?.recurrence || "weekdays",
      weekdays: task?.weekdays || [1, 2, 3, 4, 5],
      linked_action: task?.linked_action || "",
    },
  });

  const recurrence = watch("recurrence");
  const selectedWeekdays = watch("weekdays");

  const toggleWeekday = (day: number) => {
    const current = selectedWeekdays || [];
    if (current.includes(day)) {
      setValue(
        "weekdays",
        current.filter((d) => d !== day)
      );
    } else {
      setValue("weekdays", [...current, day].sort());
    }
  };

  const onSubmit = async (data: FormData) => {
    try {
      const payload = {
        title: data.title,
        due_time: data.due_time || null,
        recurrence: data.recurrence,
        weekdays: data.weekdays,
        linked_action: data.linked_action || null,
        is_active: true,
        sort_order: 0,
      };

      if (isEditing && task) {
        await updateMutation.mutateAsync({ id: task.id, ...payload });
        toast.success("Aufgabe aktualisiert");
      } else {
        await createMutation.mutateAsync(payload);
        toast.success("Aufgabe erstellt");
      }
      onSuccess();
    } catch (error) {
      toast.error("Fehler beim Speichern");
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">Bezeichnung *</Label>
        <Input
          id="title"
          {...register("title", { required: true })}
          placeholder="z.B. Mittagsliste drucken"
        />
        {errors.title && (
          <p className="text-sm text-destructive">Bezeichnung ist erforderlich</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="due_time">Fällig um</Label>
        <Input id="due_time" type="time" {...register("due_time")} />
      </div>

      <div className="space-y-2">
        <Label>Wiederholung</Label>
        <RadioGroup
          value={recurrence}
          onValueChange={(v) =>
            setValue("recurrence", v as "daily" | "weekdays" | "weekly")
          }
          className="flex gap-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="daily" id="daily" />
            <Label htmlFor="daily" className="font-normal cursor-pointer">
              Täglich
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="weekdays" id="weekdays" />
            <Label htmlFor="weekdays" className="font-normal cursor-pointer">
              Wochentage
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="weekly" id="weekly" />
            <Label htmlFor="weekly" className="font-normal cursor-pointer">
              Wöchentlich
            </Label>
          </div>
        </RadioGroup>
      </div>

      {recurrence !== "daily" && (
        <div className="space-y-2">
          <Label>Wochentage</Label>
          <div className="flex gap-1">
            {WEEKDAYS.map((day) => (
              <Button
                key={day.value}
                type="button"
                variant={selectedWeekdays?.includes(day.value) ? "default" : "outline"}
                size="sm"
                className={cn(
                  "w-10 h-10",
                  selectedWeekdays?.includes(day.value) && "bg-primary"
                )}
                onClick={() => toggleWeekday(day.value)}
              >
                {day.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="linked_action">Verknüpfte Aktion (optional)</Label>
        <Select
          value={watch("linked_action") || ""}
          onValueChange={(v) => setValue("linked_action", v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Aktion auswählen" />
          </SelectTrigger>
          <SelectContent>
            {LINKED_ACTIONS.map((action) => (
              <SelectItem key={action.value || "none"} value={action.value || "none"}>
                {action.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Öffnet direkt die entsprechende Funktion beim Klick
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Speichern..." : isEditing ? "Speichern" : "Erstellen"}
        </Button>
      </div>
    </form>
  );
}
