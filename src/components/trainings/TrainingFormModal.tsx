import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, addWeeks, isSaturday } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Info, Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { useCreateGroupCourse, useUpdateGroupCourse } from '@/hooks/useGroupCourses';
import { useTrainingProducts } from '@/hooks/useProducts';
import { useChildSkiLevels, useChildSnowboardLevels } from '@/hooks/useSkillLevels';
import type { GroupCourseWithSchedules, GroupCourseFormData, CourseType } from '@/types/group-courses';
import { DISCIPLINES, DAYS_OF_WEEK, COURSE_COLORS, COURSE_TYPES } from '@/types/group-courses';
import { generateSaturdays, calculatePeriodEndDate } from '@/lib/dates/saturday-generator';
import { cn } from '@/lib/utils';

const formSchema = z.object({
  name: z.string().min(1, 'Name ist erforderlich'),
  description: z.string().optional(),
  skill_level_id: z.string().min(1, 'Niveau ist erforderlich'),
  discipline: z.enum(['ski', 'snowboard', 'both']),
  min_age: z.number().nullable(),
  max_age: z.number().nullable(),
  max_participants: z.number().min(1).max(20),
  product_id: z.string().nullable(),
  meeting_point: z.string().optional(),
  color: z.string(),
  is_active: z.boolean(),
  course_type: z.enum(['weekly', 'saturday_course', 'custom']),
  period_start_date: z.date().nullable(),
  period_end_date: z.date().nullable(),
});

interface TrainingFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course?: GroupCourseWithSchedules | null;
  mode?: 'create' | 'edit' | 'copy';
}

export function TrainingFormModal({ open, onOpenChange, course, mode }: TrainingFormModalProps) {
  const createCourse = useCreateGroupCourse();
  const updateCourse = useUpdateGroupCourse();
  const { data: trainingProducts, isLoading: productsLoading } = useTrainingProducts();
  const { data: skiLevels = [] } = useChildSkiLevels();
  const { data: snowboardLevels = [] } = useChildSnowboardLevels();
  
  // Determine actual mode: explicit mode prop takes precedence
  const actualMode = mode ?? (course ? 'edit' : 'create');
  const isEditing = actualMode === 'edit';

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
      skill_level_id: '',
      discipline: 'ski',
      min_age: null,
      max_age: null,
      max_participants: 8,
      product_id: null,
      meeting_point: '',
      color: '#3B82F6',
      is_active: true,
      course_type: 'weekly',
      period_start_date: null,
      period_end_date: null,
    },
  });

  const courseType = form.watch('course_type');
  const periodStartDate = form.watch('period_start_date');
  const periodEndDate = form.watch('period_end_date');

  // Generate preview of Saturdays
  const previewSaturdays = useMemo(() => {
    if (courseType !== 'saturday_course' || !periodStartDate || !periodEndDate) {
      return [];
    }
    return generateSaturdays(periodStartDate, periodEndDate);
  }, [courseType, periodStartDate, periodEndDate]);

  // Reset form when course changes or modal opens
  useEffect(() => {
    if (!open) return; // Skip reset when modal is closed
    
    if (course) {
      // For copy mode, append " (Kopie)" to the name
      const nameValue = actualMode === 'copy' ? `${course.name} (Kopie)` : course.name;
      
      form.reset({
        name: nameValue,
        description: course.description || '',
        skill_level_id: course.skill_level_id,
        discipline: course.discipline,
        min_age: course.min_age,
        max_age: course.max_age,
        max_participants: course.max_participants,
        product_id: course.product_id,
        meeting_point: course.meeting_point || '',
        color: course.color,
        is_active: course.is_active,
        course_type: (course.course_type as CourseType) || 'weekly',
        period_start_date: course.period_start_date ? new Date(course.period_start_date) : null,
        period_end_date: course.period_end_date ? new Date(course.period_end_date) : null,
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
  }, [open, course, form, actualMode]);

  // Auto-calculate end date when start date changes for Saturday courses
  useEffect(() => {
    if (courseType === 'saturday_course' && periodStartDate && !periodEndDate) {
      const calculatedEnd = calculatePeriodEndDate(periodStartDate);
      form.setValue('period_end_date', calculatedEnd);
    }
  }, [courseType, periodStartDate, periodEndDate, form]);

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
      skill_level_id: values.skill_level_id,
      discipline: values.discipline,
      min_age: values.min_age,
      max_age: values.max_age,
      max_participants: values.max_participants,
      product_id: values.product_id,
      meeting_point: values.meeting_point || '',
      color: values.color,
      is_active: values.is_active,
      course_type: values.course_type,
      period_start_date: values.period_start_date ? format(values.period_start_date, 'yyyy-MM-dd') : null,
      period_end_date: values.period_end_date ? format(values.period_end_date, 'yyyy-MM-dd') : null,
      schedules: {
        days: values.course_type === 'saturday_course' ? [6] : selectedDays, // Saturday = 6
        time_slots: values.course_type === 'saturday_course' 
          ? [{ start_time: '10:00', end_time: '14:00' }] // 4-hour blocks for Saturday courses
          : timeSlots,
      },
    };

    try {
      // For edit mode, update; for create and copy mode, create new
      if (actualMode === 'edit' && course) {
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
  const selectedProductId = form.watch('product_id');
  const selectedProduct = trainingProducts?.find(p => p.id === selectedProductId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {actualMode === 'edit' 
              ? 'Training bearbeiten' 
              : actualMode === 'copy' 
                ? 'Training duplizieren' 
                : 'Neues Training erstellen'}
          </DialogTitle>
          <DialogDescription>
            {actualMode === 'edit' 
              ? 'Bearbeite die Details dieses Trainings.' 
              : actualMode === 'copy' 
                ? 'Erstelle eine Kopie dieses Trainings mit angepassten Details.' 
                : 'Erstelle ein neues Training für Gruppenkurse.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Course Type Selection */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">Kurstyp</h4>
              <FormField
                control={form.control}
                name="course_type"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        className="flex gap-4"
                      >
                        {COURSE_TYPES.filter(t => t.value !== 'custom').map(type => (
                          <div key={type.value} className="flex items-center space-x-2">
                            <RadioGroupItem value={type.value} id={type.value} />
                            <label htmlFor={type.value} className="text-sm cursor-pointer">
                              {type.label}
                            </label>
                          </div>
                        ))}
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Saturday Course Period (only for saturday_course) */}
            {courseType === 'saturday_course' && (
              <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  <span className="font-medium">Kursperiode</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="period_start_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Erster Samstag</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, 'dd.MM.yyyy')
                                ) : (
                                  <span>Datum wählen</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value || undefined}
                              onSelect={(date) => {
                                field.onChange(date);
                                // Auto-calculate end date
                                if (date) {
                                  const endDate = calculatePeriodEndDate(date);
                                  form.setValue('period_end_date', endDate);
                                }
                              }}
                              disabled={(date) => !isSaturday(date) || date < new Date()}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="period_end_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Letzter Samstag</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, 'dd.MM.yyyy')
                                ) : (
                                  <span>Datum wählen</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value || undefined}
                              onSelect={field.onChange}
                              disabled={(date) => !isSaturday(date) || (periodStartDate ? date <= periodStartDate : false)}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Preview generated Saturdays */}
                {previewSaturdays.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">
                      Generierte Termine ({previewSaturdays.length} Samstage):
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {previewSaturdays.map((date, i) => (
                        <Badge key={i} variant="secondary">
                          {format(date, 'dd.MM.yyyy')}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Info className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    Samstagskurse laufen über 5 aufeinanderfolgende Samstage. 
                    Das Enddatum wird automatisch berechnet.
                  </span>
                </div>
              </div>
            )}

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
                {/* Skill Level Direct Link (NEW) */}
                <FormField
                  control={form.control}
                  name="skill_level_id"
                  render={({ field }) => {
                    // Get levels based on discipline
                    const discipline = form.watch('discipline');
                    const availableLevels = discipline === 'snowboard' 
                      ? snowboardLevels 
                      : skiLevels;
                    
                    return (
                      <FormItem>
                        <FormLabel>Skill Level (1:1) *</FormLabel>
                        <Select 
                          value={field.value || 'none'} 
                          onValueChange={(v) => field.onChange(v === 'none' ? null : v)}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Level wählen..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Kein Level</SelectItem>
                            {availableLevels.map(level => (
                              <SelectItem key={level.id} value={level.id}>
                                <div className="flex items-center gap-2">
                                  {level.color && (
                                    <div 
                                      className="w-3 h-3 rounded-full border" 
                                      style={{ backgroundColor: level.color }}
                                    />
                                  )}
                                  {level.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
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

            {/* Product Selection (replaces price fields) */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">Verknüpftes Produkt</h4>
              
              <div className="p-4 border rounded-lg bg-muted/30">
                <FormField
                  control={form.control}
                  name="product_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Produkt für Preisberechnung</FormLabel>
                      <Select 
                        value={field.value || ''} 
                        onValueChange={(v) => field.onChange(v || null)}
                        disabled={productsLoading}
                      >
                        <FormControl>
                          <SelectTrigger>
                            {productsLoading ? (
                              <div className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Laden...</span>
                              </div>
                            ) : (
                              <SelectValue placeholder="Produkt auswählen..." />
                            )}
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {trainingProducts?.map(product => (
                            <SelectItem key={product.id} value={product.id}>
                              <div className="flex justify-between items-center w-full gap-4">
                                <span>{product.name}</span>
                                <span className="text-muted-foreground">
                                  CHF {product.price.toFixed(2)}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {selectedProduct && (
                  <div className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                    <Info className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      Der Preis von <strong>CHF {selectedProduct.price.toFixed(2)}</strong> wird 
                      automatisch vom Produkt "{selectedProduct.name}" übernommen. 
                      Preisänderungen können unter Einstellungen → Produkte vorgenommen werden.
                    </span>
                  </div>
                )}
                
                {!selectedProduct && !productsLoading && trainingProducts?.length === 0 && (
                  <div className="mt-3 flex items-start gap-2 text-sm text-amber-600">
                    <Info className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      Keine Produkte für Trainings verfügbar. Bitte erstelle zuerst ein Gruppenkurs-Produkt 
                      unter Einstellungen → Produkte und aktiviere "Für Trainings verfügbar".
                    </span>
                  </div>
                )}
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

            {/* Schedule (only for weekly courses) */}
            {courseType === 'weekly' && (
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
            )}

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
