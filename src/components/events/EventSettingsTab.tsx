import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateEvent, type Event, type EventCategory } from "@/hooks/useEvents";

const settingsSchema = z.object({
  name: z.string().min(1, "Name erforderlich"),
  event_date: z.string().min(1, "Datum erforderlich"),
  status: z.string(),
  course_race_time: z.string(),
  guest_race_time: z.string(),
  result_ceremony_time: z.string(),
  guest_fee: z.coerce.number().min(0),
  total_numbers: z.coerce.number().min(1),
  reserve_per_group: z.coerce.number().min(0),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

interface EventSettingsTabProps {
  event: Event;
  categories: EventCategory[];
}

export function EventSettingsTab({ event, categories }: EventSettingsTabProps) {
  const updateEvent = useUpdateEvent();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: event.name,
      event_date: event.event_date,
      status: event.status,
      course_race_time: event.course_race_time || "10:00",
      guest_race_time: event.guest_race_time || "11:30",
      result_ceremony_time: event.result_ceremony_time || "15:30",
      guest_fee: event.guest_fee,
      total_numbers: event.total_numbers,
      reserve_per_group: event.reserve_per_group,
    },
  });

  const currentStatus = watch("status");

  const onSubmit = (data: SettingsFormData) => {
    updateEvent.mutate({
      id: event.id,
      ...data,
    });
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Grundeinstellungen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" {...register("name")} />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="event_date">Datum</Label>
                <Input id="event_date" type="date" {...register("event_date")} />
                {errors.event_date && (
                  <p className="text-sm text-destructive">
                    {errors.event_date.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={currentStatus}
                onValueChange={(v) => setValue("status", v, { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Entwurf</SelectItem>
                  <SelectItem value="registration_open">Anmeldung offen</SelectItem>
                  <SelectItem value="registration_closed">
                    Anmeldung geschlossen
                  </SelectItem>
                  <SelectItem value="in_progress">Läuft</SelectItem>
                  <SelectItem value="completed">Abgeschlossen</SelectItem>
                  <SelectItem value="cancelled">Abgesagt</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Time Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Zeitplan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="course_race_time">Kursrennen</Label>
                <Input
                  id="course_race_time"
                  type="time"
                  {...register("course_race_time")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest_race_time">Gästerennen</Label>
                <Input
                  id="guest_race_time"
                  type="time"
                  {...register("guest_race_time")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="result_ceremony_time">Siegerehrung</Label>
                <Input
                  id="result_ceremony_time"
                  type="time"
                  {...register("result_ceremony_time")}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pricing & Numbers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preise & Startnummern</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="guest_fee">Gästegebühr (CHF)</Label>
                <Input
                  id="guest_fee"
                  type="number"
                  step="0.50"
                  {...register("guest_fee")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="total_numbers">Startnummern total</Label>
                <Input
                  id="total_numbers"
                  type="number"
                  {...register("total_numbers")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reserve_per_group">Reserve pro Gruppe</Label>
                <Input
                  id="reserve_per_group"
                  type="number"
                  {...register("reserve_per_group")}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Categories Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kategorien ({categories.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {categories.length > 0 ? (
              <ul className="space-y-2">
                {categories.map((cat) => (
                  <li
                    key={cat.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    {cat.color && (
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                    )}
                    <span>{cat.name}</span>
                    <span className="text-muted-foreground">
                      ({cat.category_type === "course" ? "Kurs" : "Gäste"})
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">
                Noch keine Kategorien erstellt
              </p>
            )}
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button type="submit" disabled={!isDirty || updateEvent.isPending}>
            Änderungen speichern
          </Button>
        </div>
      </form>
    </div>
  );
}
