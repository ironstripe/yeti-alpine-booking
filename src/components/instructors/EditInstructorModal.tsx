import { useEffect, useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useIsSuperAdmin } from "@/hooks/useIsSuperAdmin";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Check, Loader2, Camera } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DEFAULT_WEBSITE_TEASER, WEBSITE_TEASER_MAX } from "@/lib/website-profile";
import { useUserRole } from "@/hooks/useUserRole";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
  hourly_rate: z.preprocess(
    (v) => (typeof v === "number" && Number.isNaN(v) ? undefined : v),
    z.number().min(20, "Mindestens 20 CHF").max(100, "Maximal 100 CHF").optional().nullable(),
  ),
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
  const isSuperAdmin = useIsSuperAdmin();
  const { isAdminOrOffice } = useUserRole();
  const canManageWebsite = isAdminOrOffice || isSuperAdmin;
  const updateInstructor = useUpdateInstructor(instructor.id);
  const queryClient = useQueryClient();
  const [ibanValue, setIbanValue] = useState("");
  const [ahvValue, setAhvValue] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [currentPhotoId, setCurrentPhotoId] = useState<string | null>(null);
  const [publicAvatarUrl, setPublicAvatarUrl] = useState<string | null>(instructor.avatar_url);
  const [websiteEnabled, setWebsiteEnabled] = useState(instructor.show_on_website ?? false);
  const [websiteTeaser, setWebsiteTeaser] = useState(instructor.website_teaser || DEFAULT_WEBSITE_TEASER);
  const [useCurrentPhotoOnWebsite, setUseCurrentPhotoOnWebsite] = useState(false);
  const [websiteConfirmOpen, setWebsiteConfirmOpen] = useState(false);
  const [isSavingWebsite, setIsSavingWebsite] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize avatar URL from instructor
  // Current portrait via staff-only short-lived signed URL (5 min); refreshed before expiry and on load error.
  const retriedFor = useRef<string | null>(null);
  const loadPhoto = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("instructor-photo-url", { body: { instructor_id: instructor.id } });
    setAvatarUrl(error ? instructor.avatar_url ?? null : data?.url ?? null);
    setCurrentPhotoId(!error && data?.private ? data.photo_id ?? null : null);
  }, [instructor.id, instructor.avatar_url]);
  useEffect(() => {
    if (!open) return;
    loadPhoto();
    const t = setInterval(loadPhoto, 4 * 60 * 1000);
    return () => clearInterval(t);
  }, [open, loadPhoto]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Bitte wähle eine Bilddatei aus.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Das Bild darf maximal 5 MB gross sein.");
      return;
    }

    setIsUploadingAvatar(true);
    try {
      // Convert to JPEG in the browser; the server strips metadata, keeps a private
      // manual_upload record (wins over Booking-Corner reimports) and sets the avatar.
      const bmp = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bmp.width; canvas.height = bmp.height;
      canvas.getContext("2d")!.drawImage(bmp, 0, 0);
      const jpeg: Blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.9));
      const fd = new FormData();
      fd.append("instructor_id", instructor.id);
      fd.append("file", new File([jpeg], "portrait.jpg", { type: "image/jpeg" }));
      const { data, error } = await supabase.functions.invoke("instructor-photo-upload", { body: fd });
      if (error || !data?.ok) throw error ?? new Error("upload");
      setAvatarUrl(data.signed_url ?? null);
      await loadPhoto();
      setUseCurrentPhotoOnWebsite(false);
      await queryClient.invalidateQueries({ queryKey: ["instructors"] });
      await queryClient.invalidateQueries({ queryKey: ["staff-instructor-photos"] });
      toast.success("Profilbild aktualisiert");
    } catch (err) {
      console.error("Avatar upload error:", err);
      toast.error("Fehler beim Hochladen des Profilbilds");
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const getInitials = () => {
    return `${instructor.first_name?.charAt(0) || ""}${instructor.last_name?.charAt(0) || ""}`.toUpperCase();
  };

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
      const instructorRoles = instructor.roles?.length > 0
        ? instructor.roles
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
      setPublicAvatarUrl(instructor.avatar_url);
      setWebsiteEnabled(instructor.show_on_website ?? false);
      setWebsiteTeaser(instructor.website_teaser || DEFAULT_WEBSITE_TEASER);
      setUseCurrentPhotoOnWebsite(false);
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

  const prepareWebsiteSave = () => {
    if (!canManageWebsite || isSavingWebsite) return;
    if (websiteEnabled) {
      if (instructor.status !== "active") {
        toast.error("Nur aktive Profile können auf der Website erscheinen.");
        return;
      }
      if (!websiteTeaser.trim() || websiteTeaser.trim().length > WEBSITE_TEASER_MAX) {
        toast.error("Bitte eine Kurzbeschreibung mit höchstens 280 Zeichen eingeben.");
        return;
      }
      if (!publicAvatarUrl && !currentPhotoId) {
        toast.error("Bitte zuerst oben ein Profilbild hochladen.");
        return;
      }
    }
    setWebsiteConfirmOpen(true);
  };

  const saveWebsite = async () => {
    setIsSavingWebsite(true);
    try {
      const publishPhoto = websiteEnabled && !!currentPhotoId &&
        (!publicAvatarUrl || useCurrentPhotoOnWebsite);
      const { data, error } = await supabase.functions.invoke("instructor-website-publish", {
        body: {
          instructor_id: instructor.id,
          show_on_website: websiteEnabled,
          website_teaser: websiteTeaser.trim(),
          ...(publishPhoto ? { source_photo_id: currentPhotoId } : {}),
        },
      });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || "website_save_failed");
      if (data.avatar_url) setPublicAvatarUrl(data.avatar_url);
      setWebsiteEnabled(!!data.published);
      setUseCurrentPhotoOnWebsite(false);
      await queryClient.invalidateQueries({ queryKey: ["instructor", instructor.id] });
      await queryClient.invalidateQueries({ queryKey: ["instructors"] });
      toast.success(data.published ? "Website-Profil freigegeben" : "Website-Profil ausgeblendet");
      setWebsiteConfirmOpen(false);
    } catch (err) {
      console.error("Website profile release failed:", err);
      toast.error("Website-Freigabe fehlgeschlagen. Bitte das Profil erneut prüfen.");
    } finally {
      setIsSavingWebsite(false);
    }
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
            {/* Avatar Upload */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <Avatar className="h-20 w-20 text-xl">
                  <AvatarImage src={avatarUrl || undefined} alt="Profilbild" onError={() => { if (avatarUrl && retriedFor.current !== avatarUrl) { retriedFor.current = avatarUrl; loadPhoto(); } }} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  {isUploadingAvatar ? (
                    <Loader2 className="h-5 w-5 text-white animate-spin" />
                  ) : (
                    <Camera className="h-5 w-5 text-white" />
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleAvatarUpload}
                  disabled={isUploadingAvatar}
                />
              </div>
              <p className="text-xs text-muted-foreground">Klicken um Foto zu ändern</p>
            </div>

            <Separator />

            {/* Website publishing is deliberately separate from the HR form. */}
            {canManageWebsite && <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Website</h3>
              <div className="flex items-start gap-3">
                <Checkbox
                  id="show_on_website"
                  checked={websiteEnabled}
                  onCheckedChange={(v) => setWebsiteEnabled(v === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor="show_on_website">Auf Website anzeigen</Label>
                  <p className="text-xs text-muted-foreground">
                    Die Änderung wird erst mit „Website-Freigabe speichern“ wirksam.
                    Ein internes Foto wird dabei nur nach deiner ausdrücklichen Bestätigung öffentlich.
                  </p>
                </div>
              </div>
              {websiteEnabled && !publicAvatarUrl && currentPhotoId && (
                <p className="text-xs text-amber-600">
                  Das vorhandene Foto ist bisher nur intern sichtbar. Bei der Freigabe
                  kannst du genau dieses Foto für die Website veröffentlichen.
                </p>
              )}
              {websiteEnabled && !publicAvatarUrl && !currentPhotoId && (
                <p className="text-xs text-amber-600">Es ist noch kein Foto vorhanden. Bitte oben ein Profilbild hochladen.</p>
              )}
              {websiteEnabled && instructor.status !== "active" && (
                <p className="text-xs text-amber-600">Das Profil muss zuerst als „Aktiv“ gespeichert werden.</p>
              )}
              {websiteEnabled && !!publicAvatarUrl && !!currentPhotoId && (
                <div className="flex items-start gap-3">
                  <Checkbox id="website-use-current-photo" checked={useCurrentPhotoOnWebsite}
                    onCheckedChange={(v) => setUseCurrentPhotoOnWebsite(v === true)} />
                  <Label htmlFor="website-use-current-photo" className="text-sm leading-snug">
                    Aktuelles internes Foto statt bisherigem Website-Foto verwenden
                  </Label>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="website_teaser">Kurzbeschreibung für die Website</Label>
                <Textarea id="website_teaser" rows={3} maxLength={WEBSITE_TEASER_MAX}
                  value={websiteTeaser} onChange={(e) => setWebsiteTeaser(e.target.value)} />
                <p className="text-xs text-muted-foreground text-right">
                  {websiteTeaser.length}/{WEBSITE_TEASER_MAX}
                </p>
              </div>
              <Button type="button" variant="outline" disabled={isSavingWebsite} onClick={prepareWebsiteSave}>
                {isSavingWebsite && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Website-Freigabe speichern
              </Button>
              <p className="text-xs text-muted-foreground">
                Unabhängig von „Speichern“ für die übrigen Personaldaten. Die Webseite aktualisiert die Teamliste mit bis zu fünf Minuten Verzögerung.
              </p>
            </div>}

            <Separator />

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
                {isSuperAdmin && (
<div className="space-y-2">
                  <Label htmlFor="hourly_rate">
                    Stundenlohn (CHF)
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
)}
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
            {isSuperAdmin && (
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
)}

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
        <AlertDialog open={websiteConfirmOpen} onOpenChange={setWebsiteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {websiteEnabled ? "Dieses Profil auf der Website veröffentlichen?" : "Dieses Profil von der Website nehmen?"}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>
                    {websiteEnabled
                      ? "Sichtbar für alle Besucher: Name, Rolle, dieses Foto und die folgende Kurzbeschreibung. Private Kontaktdaten, Notizen und Lohndaten werden nicht veröffentlicht."
                      : "Das Profil verschwindet aus der Teamliste. Ein bereits öffentliches Foto wird dadurch nicht automatisch gelöscht."}
                  </p>
                  <p className="font-medium text-foreground">{instructor.first_name} {instructor.last_name}</p>
                  {websiteEnabled && (
                    <>
                      <Avatar className="h-20 w-20">
                        <AvatarImage src={currentPhotoId && (!publicAvatarUrl || useCurrentPhotoOnWebsite)
                          ? avatarUrl ?? undefined : publicAvatarUrl ?? undefined} alt="Foto für Website" />
                        <AvatarFallback>{getInitials()}</AvatarFallback>
                      </Avatar>
                      <p className="whitespace-pre-wrap text-foreground">{websiteTeaser.trim()}</p>
                      {currentPhotoId && (!publicAvatarUrl || useCurrentPhotoOnWebsite) && (
                        <p>Das bislang private Foto wird als bereinigte Kopie öffentlich zugänglich. Importbilder können klein sein und später ersetzt werden.</p>
                      )}
                    </>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isSavingWebsite}>Abbrechen</AlertDialogCancel>
              <AlertDialogAction disabled={isSavingWebsite}
                onClick={(e) => { e.preventDefault(); void saveWebsite(); }}>
                {isSavingWebsite ? "Bitte warten…" : websiteEnabled ? "Dieses Profil veröffentlichen" : "Von Website nehmen"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
