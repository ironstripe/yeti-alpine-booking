import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { useCreateGroupCourse, useUpdateGroupCourse } from '@/hooks/useGroupCourses';
import type { GroupCourseWithSchedules, GroupCourseFormData } from '@/types/group-courses';
import { SKILL_LEVELS, DISCIPLINES, DAYS_OF_WEEK, COURSE_COLORS } from '@/types/group-courses';

const formSchema = z.object({
  name: z.string().min(1, 'Name ist erforderlich'),
  description: z.string().optional(),
  skill_level: z.enum(['beginner', 'intermediate', 'advanced']),
  discipline: z.enum(['ski', 'snowboard', 'both']),
  min_age: z.number().nullable(),
  max_age: z.number().nullable(),
  max_participants: z.number().min(1).max(20),
  price_per_day: z.number().min(0),
  price_full_week: z.number().nullable(),
  meeting_point: z.string().optional(),
  color: z.string(),
  is_active: z.boolean(),
});

interface TrainingFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course?: GroupCourseWithSchedules | null;
}

export function TrainingFormModal({ open, onOpenChange, course }: TrainingFormModalProps) {
  const createCourse = useCreateGroupCourse();
  const updateCourse = useUpdateGroupCourse();
  const isEditing = !!course;

  // Separate state for schedule configuration
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri default
  const [timeSlots, setTimeSlots] = useState<{ start_time: string; end_time: string }[]>([
    { start_time: '10:00', end_time: '12:00' },
  ]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      skill_level: 'beginner',
      discipline: 'ski',
      min_age: null,
      max_age: null,
      max_participants: 8,
      price_per_day: 85,
      price_full_week: null,
      meeting_point: '',
      color: '#3B82F6',
      is_active: true,
    },
  });

  // Reset form when course changes
  useEffect(() => {
    if (course) {
      form.reset({
        name: course.name,
        description: course.description || '',
        skill_level: course.skill_level,
        discipline: course.discipline,
        min_age: course.min_age,
        max_age: course.max_age,
        max_participants: course.max_participants,
        price_per_day: Number(course.price_per_day),
        price_full_week: course.price_full_week ? Number(course.price_full_week) : null,
        meeting_point: course.meeting_point || '',
        color: course.color,
        is_active: course.is_active,
      });

      // Extract schedule info
      if (course.schedules.length > 0) {
        const days = [...new Set(course.schedules.map(s => s.day_of_week))];
        setSelectedDays(days);

        const slots = [...new Set(course.schedules.map(s => 
          JSON.stringify({ start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5) })
        ))].map(s => JSON.parse(s));
        setTimeSlots(slots);
      }
    } else {
      form.reset();
      setSelectedDays([1, 2, 3, 4, 5]);
      setTimeSlots([{ start_time: '10:00', end_time: '12:00' }]);
    }
  }, [course, form]);

  const toggleDay = (day: number) => {
    setSelectedDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day].sort()
    );
  };

  const addTimeSlot = () => {
    setTimeSlots(prev => [...prev, { start_time: '14:00', end_time: '16:00' }]);
  };

  const removeTimeSlot = (index: number) => {
    setTimeSlots(prev => prev.filter((_, i) => i !== index));
  };

  const updateTimeSlot = (index: number, field: 'start_time' | 'end_time', value: string) => {
    setTimeSlots(prev => prev.map((slot, i) => 
      i === index ? { ...slot, [field]: value } : slot
    ));
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    const formData: GroupCourseFormData = {
      name: values.name,
      description: values.description || '',
      skill_level: values.skill_level,
      discipline: values.discipline,
      min_age: values.min_age,
      max_age: values.max_age,
      max_participants: values.max_participants,
      price_per_day: values.price_per_day,
      price_full_week: values.price_full_week,
      meeting_point: values.meeting_point || '',
      color: values.color,
      is_active: values.is_active,
      schedules: {
        days: selectedDays,
        time_slots: timeSlots,
      },
    };

    try {
      if (isEditing && course) {
        await updateCourse.mutateAsync({ id: course.id, data: formData });
      } else {
        await createCourse.mutateAsync(formData);
      }
      onOpenChange(false);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const isPending = createCourse.isPending || updateCourse.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Training bearbeiten' : 'Neues Training erstellen'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic info */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">Grundinformationen</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Blauer Prinz" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Farbe</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue>
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-4 h-4 rounded-full" 
                                  style={{ backgroundColor: field.value }}
                                />
                                {COURSE_COLORS.find(c => c.value === field.value)?.label || 'Farbe wählen'}
                              </div>
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {COURSE_COLORS.map(color => (
                            <SelectItem key={color.value} value={color.value}>
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-4 h-4 rounded-full" 
                                  style={{ backgroundColor: color.value }}
                                />
                                {color.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Beschreibung</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Anfängerkurs für Kinder im Vorschulalter..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="skill_level"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Niveau *</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SKILL_LEVELS.map(level => (
                            <SelectItem key={level.value} value={level.value}>
                              {level.label}
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
                  name="discipline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Disziplin *</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DISCIPLINES.map(disc => (
                            <SelectItem key={disc.value} value={disc.value}>
                              {disc.label}
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
                  name="max_participants"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max. Teilnehmer *</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min={1} 
                          max={20}
                          {...field}
                          onChange={e => field.onChange(parseInt(e.target.value) || 8)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="min_age"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mindestalter</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min={0}
                          placeholder="Optional"
                          value={field.value ?? ''}
                          onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="max_age"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Höchstalter</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min={0}
                          placeholder="Optional"
                          value={field.value ?? ''}
                          onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Pricing */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">Preise</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="price_per_day"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preis pro Tag (CHF) *</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min={0}
                          step={5}
                          {...field}
                          onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="price_full_week"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preis Woche (CHF)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min={0}
                          step={5}
                          placeholder="Optional"
                          value={field.value ?? ''}
                          onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Meeting point */}
            <FormField
              control={form.control}
              name="meeting_point"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Treffpunkt</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Talstation Sareis, bei der grossen Uhr"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Schedule */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">Zeitplan (Wöchentlich)</h4>
              
              {/* Days selection */}
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map(day => (
                  <div key={day.value} className="flex items-center">
                    <Checkbox
                      id={`day-${day.value}`}
                      checked={selectedDays.includes(day.value)}
                      onCheckedChange={() => toggleDay(day.value)}
                    />
                    <label 
                      htmlFor={`day-${day.value}`}
                      className="ml-2 text-sm cursor-pointer"
                    >
                      {day.label}
                    </label>
                  </div>
                ))}
              </div>

              {/* Time slots */}
              <div className="space-y-2">
                {timeSlots.map((slot, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground w-20">Zeitslot {index + 1}:</span>
                    <Input
                      type="time"
                      value={slot.start_time}
                      onChange={e => updateTimeSlot(index, 'start_time', e.target.value)}
                      className="w-28"
                    />
                    <span>-</span>
                    <Input
                      type="time"
                      value={slot.end_time}
                      onChange={e => updateTimeSlot(index, 'end_time', e.target.value)}
                      className="w-28"
                    />
                    {timeSlots.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeTimeSlot(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addTimeSlot}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Zeitslot hinzufügen
                </Button>
              </div>
            </div>

            {/* Active toggle */}
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="!mt-0 cursor-pointer">Training ist aktiv</FormLabel>
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Speichern...' : isEditing ? 'Aktualisieren' : 'Training erstellen'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
