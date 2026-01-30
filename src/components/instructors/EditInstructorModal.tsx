import { useEffect, useState } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Check, Loader2 } from "lucide-react";
import { useUpdateInstructor } from "@/hooks/useUpdateInstructor";
import { normalizePhoneNumber } from "@/lib/phone-utils";
import {
  formatIBAN,
  isValidIBAN,
  formatAHVNumber,
  isValidAHVNumber,
  LEVEL_OPTIONS,
  STATUS_OPTIONS,
} from "@/lib/instructor-utils";
import { RoleSelector, getDisciplineFromRoles, hasTeachingRole, getRolesFromSpecialization } from "./RoleSelector";
import type { Tables } from "@/integrations/supabase/types";

const GENDER_OPTIONS = [
  { value: "male", label: "Männlich" },
  { value: "female", label: "Weiblich" },
  { value: "other", label: "Divers" },
];

const COUNTRY_OPTIONS = [
  { value: "LI", label: "Liechtenstein" },
  { value: "CH", label: "Schweiz" },
  { value: "AT", label: "Österreich" },
  { value: "DE", label: "Deutschland" },
];

const instructorSchema = z.object({
  first_name: z.string().min(1, "Vorname ist erforderlich"),
  last_name: z.string().min(1, "Nachname ist erforderlich"),
  email: z.string().email("Ungültige E-Mail-Adresse"),
  phone: z.string().min(1, "Telefon ist erforderlich"),
  birth_date: z.string().optional(),
  gender: z.string().optional(),
  roles: z.array(z.string()).min(1, "Mindestens eine Rolle erforderlich"),
  level: z.string().optional(),
  hourly_rate: z
    .number({ invalid_type_error: "Stundenlohn ist erforderlich" })
    .min(20, "Mindestens 20 CHF")
    .max(100, "Maximal 100 CHF"),
  status: z.string().optional(),
  entry_date: z.string().optional(),
  street: z.string().optional(),
  zip: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  bank_name: z.string().optional(),
  iban: z.string().optional(),
  ahv_number: z.string().optional(),
  notes: z.string().optional(),
});

type InstructorFormData = z.infer<typeof instructorSchema>;

interface EditInstructorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instructor: Tables<"instructors">;
}

export function EditInstructorModal({
  open,
  onOpenChange,
  instructor,
}: EditInstructorModalProps) {
  const updateInstructor = useUpdateInstructor(instructor.id);
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
  });

  const roles = watch("roles");
  const level = watch("level");
  const status = watch("status");
  const gender = watch("gender");
  const country = watch("country");
  const isInstructor = hasTeachingRole(roles || []);

  // Reset form when modal opens or instructor changes
  useEffect(() => {
    if (open && instructor) {
      // Derive roles from existing data or use roles array
      const instructorRoles = (instructor as any).roles?.length > 0 
        ? (instructor as any).roles 
        : getRolesFromSpecialization(instructor.specialization);
      
      reset({
        first_name: instructor.first_name,
        last_name: instructor.last_name,
        email: instructor.email,
        phone: instructor.phone,
        birth_date: instructor.birth_date || "",
        gender: instructor.gender || "",
        roles: instructorRoles,
        level: instructor.level || "",
        hourly_rate: instructor.hourly_rate,
        status: instructor.status || "active",
        entry_date: instructor.entry_date || "",
        street: instructor.street || "",
        zip: instructor.zip || "",
        city: instructor.city || "",
        country: instructor.country || "LI",
        bank_name: instructor.bank_name || "",
        notes: instructor.notes || "",
      });
      setIbanValue(instructor.iban || "");
      setAhvValue(instructor.ahv_number || "");
    }
  }, [open, instructor, reset]);

  const onSubmit = async (data: InstructorFormData) => {
    const normalizedPhone = normalizePhoneNumber(data.phone);
    const specialization = getDisciplineFromRoles(data.roles);

    await updateInstructor.mutateAsync({
      first_name: data.first_name.trim(),
      last_name: data.last_name.trim(),
      email: data.email.trim().toLowerCase(),
      phone: normalizedPhone,
      birth_date: data.birth_date || null,
      gender: data.gender || null,
      roles: data.roles,
      level: isInstructor ? data.level : null,
      specialization: specialization,
      hourly_rate: data.hourly_rate,
      status: data.status || null,
      entry_date: data.entry_date || null,
      street: data.street?.trim() || null,
      zip: data.zip?.trim() || null,
      city: data.city?.trim() || null,
      country: data.country || null,
      bank_name: data.bank_name?.trim() || null,
      iban: ibanValue ? formatIBAN(ibanValue) : null,
      ahv_number: ahvValue ? formatAHVNumber(ahvValue) : null,
      notes: data.notes?.trim() || null,
    });

    onOpenChange(false);
  };

  const handleClose = () => {
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
          <DialogTitle>Skilehrer bearbeiten</DialogTitle>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="birth_date">Geburtsdatum</Label>
                  <Input
                    id="birth_date"
                    type="date"
                    {...register("birth_date")}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Geschlecht</Label>
                  <Select value={gender || ""} onValueChange={(v) => setValue("gender", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Auswählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map((option) => (
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

            {/* Section 3: Address */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Adresse
              </h3>
              <div className="space-y-2">
                <Label htmlFor="street">Strasse</Label>
                <Input
                  id="street"
                  {...register("street")}
                  placeholder="Musterstrasse 1"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="zip">PLZ</Label>
                  <Input
                    id="zip"
                    {...register("zip")}
                    placeholder="9490"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">Ort</Label>
                  <Input
                    id="city"
                    {...register("city")}
                    placeholder="Vaduz"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Land</Label>
                  <Select value={country || "LI"} onValueChange={(v) => setValue("country", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_OPTIONS.map((option) => (
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

            {/* Section 4: Roles & Qualifications */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Rollen & Qualifikationen
              </h3>
              <RoleSelector
                value={roles || []}
                onChange={(newRoles) => setValue("roles", newRoles)}
                error={errors.roles?.message}
              />
              
              {/* Only show instructor qualifications if has teaching role */}
              {isInstructor && (
                <div className="space-y-2">
                  <Label>Ausbildungsstufe</Label>
                  <Select value={level || ""} onValueChange={(v) => setValue("level", v)}>
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
                </div>
              )}
            </div>

            <Separator />

            {/* Section 5: Employment */}
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
                <Select value={status || "active"} onValueChange={(v) => setValue("status", v)}>
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
            <div className="space-y-2">
              <Label htmlFor="entry_date">Eintrittsdatum</Label>
              <Input
                id="entry_date"
                type="date"
                {...register("entry_date")}
              />
            </div>
          </div>

            <Separator />

            {/* Section 6: Banking */}
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

            {/* Section 7: Notes */}
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
              <Button type="submit" disabled={updateInstructor.isPending}>
                {updateInstructor.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Speichern
              </Button>
            </div>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
