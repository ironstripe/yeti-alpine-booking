import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCreateInstructor } from "@/hooks/useCreateInstructor";
import { normalizePhoneNumber } from "@/lib/phone-utils";
import {
  formatIBAN,
  isValidIBAN,
  formatAHVNumber,
  isValidAHVNumber,
  LEVEL_OPTIONS,
  STATUS_OPTIONS,
  SPECIALIZATION_OPTIONS,
} from "@/lib/instructor-utils";

const instructorSchema = z.object({
  first_name: z.string().min(1, "Vorname ist erforderlich"),
  last_name: z.string().min(1, "Nachname ist erforderlich"),
  email: z.string().email("Ungültige E-Mail-Adresse"),
  phone: z.string().min(1, "Telefon ist erforderlich"),
  birth_date: z.string().optional(),
  level: z.string().min(1, "Ausbildungsstufe ist erforderlich"),
  specialization: z.string().min(1, "Spezialisierung ist erforderlich"),
  hourly_rate: z
    .number({ invalid_type_error: "Stundenlohn ist erforderlich" })
    .min(20, "Mindestens 20 CHF")
    .max(100, "Maximal 100 CHF"),
  status: z.string().default("active"),
  bank_name: z.string().optional(),
  iban: z.string().optional(),
  ahv_number: z.string().optional(),
  notes: z.string().optional(),
});

type InstructorFormData = z.infer<typeof instructorSchema>;

interface NewInstructorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewInstructorModal({ open, onOpenChange }: NewInstructorModalProps) {
  const createInstructor = useCreateInstructor();
  const [ibanValue, setIbanValue] = useState("");
  const [ahvValue, setAhvValue] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<InstructorFormData>({
    resolver: zodResolver(instructorSchema),
    defaultValues: {
      status: "active",
      specialization: "ski",
      level: "",
      hourly_rate: undefined,
    },
  });

  const specialization = watch("specialization");
  const level = watch("level");
  const status = watch("status");

  const onSubmit = async (data: InstructorFormData) => {
    try {
      // Normalize phone number
      const normalizedPhone = normalizePhoneNumber(data.phone);

      await createInstructor.mutateAsync({
        first_name: data.first_name.trim(),
        last_name: data.last_name.trim(),
        email: data.email.trim().toLowerCase(),
        phone: normalizedPhone,
        birth_date: data.birth_date || null,
        level: data.level,
        specialization: data.specialization,
        hourly_rate: data.hourly_rate,
        status: data.status,
        bank_name: data.bank_name?.trim() || null,
        iban: ibanValue ? formatIBAN(ibanValue) : null,
        ahv_number: ahvValue ? formatAHVNumber(ahvValue) : null,
        notes: data.notes?.trim() || null,
        real_time_status: "unavailable",
      });

      toast.success("Skilehrer erfolgreich erstellt");
      handleClose();
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("Fehler beim Erstellen des Skilehrers");
      }
    }
  };

  const handleClose = () => {
    reset();
    setIbanValue("");
    setAhvValue("");
    onOpenChange(false);
  };

  const handleIbanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    setIbanValue(value);
  };

  const handleIbanBlur = () => {
    if (ibanValue) {
      setIbanValue(formatIBAN(ibanValue));
    }
  };

  const handleAhvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAhvValue(e.target.value);
  };

  const handleAhvBlur = () => {
    if (ahvValue) {
      setAhvValue(formatAHVNumber(ahvValue));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[600px] max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Neuer Skilehrer</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-140px)]">
          <form onSubmit={handleSubmit(onSubmit)} className="px-6 pb-6 space-y-6">
            {/* Section 1: Personal Data */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Persönliche Daten
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">
                    Vorname <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="first_name"
                    {...register("first_name")}
                    placeholder="Max"
                  />
                  {errors.first_name && (
                    <p className="text-xs text-destructive">{errors.first_name.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">
                    Nachname <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="last_name"
                    {...register("last_name")}
                    placeholder="Mustermann"
                  />
                  {errors.last_name && (
                    <p className="text-xs text-destructive">{errors.last_name.message}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="birth_date">Geburtsdatum</Label>
                <Input
                  id="birth_date"
                  type="date"
                  {...register("birth_date")}
                />
              </div>
            </div>

            <Separator />

            {/* Section 2: Contact Data */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Kontaktdaten
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">
                    E-Mail <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    {...register("email")}
                    placeholder="max@example.com"
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">
                    Telefon <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    {...register("phone")}
                    placeholder="079 123 45 67"
                  />
                  {errors.phone && (
                    <p className="text-xs text-destructive">{errors.phone.message}</p>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Section 3: Qualifications */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Qualifikationen
              </h3>
              <div className="space-y-2">
                <Label>
                  Ausbildungsstufe <span className="text-destructive">*</span>
                </Label>
                <Select value={level} onValueChange={(v) => setValue("level", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Stufe wählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVEL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.level && (
                  <p className="text-xs text-destructive">{errors.level.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>
                  Spezialisierung <span className="text-destructive">*</span>
                </Label>
                <RadioGroup
                  value={specialization}
                  onValueChange={(v) => setValue("specialization", v)}
                  className="flex gap-4"
                >
                  {SPECIALIZATION_OPTIONS.map((option) => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <RadioGroupItem value={option.value} id={`spec-${option.value}`} />
                      <Label htmlFor={`spec-${option.value}`} className="font-normal cursor-pointer">
                        {option.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                {errors.specialization && (
                  <p className="text-xs text-destructive">{errors.specialization.message}</p>
                )}
              </div>
            </div>

            <Separator />

            {/* Section 4: Employment */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Anstellung
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="hourly_rate">
                    Stundenlohn (CHF) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="hourly_rate"
                    type="number"
                    min={20}
                    max={100}
                    step={0.5}
                    {...register("hourly_rate", { valueAsNumber: true })}
                    placeholder="45"
                  />
                  {errors.hourly_rate && (
                    <p className="text-xs text-destructive">{errors.hourly_rate.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setValue("status", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Section 5: Banking */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Bankverbindung
              </h3>
              <div className="space-y-2">
                <Label htmlFor="bank_name">Bank</Label>
                <Input
                  id="bank_name"
                  {...register("bank_name")}
                  placeholder="Liechtensteinische Landesbank"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="iban">IBAN</Label>
                <div className="relative">
                  <Input
                    id="iban"
                    value={ibanValue}
                    onChange={handleIbanChange}
                    onBlur={handleIbanBlur}
                    placeholder="CH93 0076 2011 6238 5295 7"
                    className="pr-10"
                  />
                  {ibanValue && isValidIBAN(ibanValue) && (
                    <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                  )}
                </div>
                {ibanValue && !isValidIBAN(ibanValue) && (
                  <p className="text-xs text-muted-foreground">
                    Format: CH## #### #### #### #### #
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="ahv_number">AHV-Nummer</Label>
                <div className="relative">
                  <Input
                    id="ahv_number"
                    value={ahvValue}
                    onChange={handleAhvChange}
                    onBlur={handleAhvBlur}
                    placeholder="756.1234.5678.97"
                  />
                  {ahvValue && isValidAHVNumber(ahvValue) && (
                    <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                  )}
                </div>
                {ahvValue && !isValidAHVNumber(ahvValue) && (
                  <p className="text-xs text-muted-foreground">
                    Format: 756.XXXX.XXXX.XX
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Section 6: Notes */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Notizen
              </h3>
              <div className="space-y-2">
                <Label htmlFor="notes">Interne Notizen</Label>
                <Textarea
                  id="notes"
                  {...register("notes")}
                  placeholder="Besondere Fähigkeiten, Präferenzen, Anmerkungen..."
                  rows={3}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={handleClose}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={createInstructor.isPending}>
                {createInstructor.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Skilehrer erstellen
              </Button>
            </div>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
