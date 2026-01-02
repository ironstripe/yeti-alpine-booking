import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Mail,
  Phone,
  MapPin,
  MessageSquare,
  Check,
  X,
  Edit,
  Save,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CustomerDetail } from "@/hooks/useCustomerDetail";
import { useUpdateCustomer } from "@/hooks/useUpdateCustomer";
import { normalizePhoneNumber, capitalizeName } from "@/lib/phone-utils";
import { lookupPlz } from "@/lib/plz-lookup";
import { COUNTRY_FLAGS, LANGUAGE_OPTIONS } from "@/lib/participant-utils";

const editSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().min(1, "Nachname ist erforderlich"),
  email: z.string().email("Ungültige E-Mail-Adresse"),
  phone: z.string().optional(),
  street: z.string().optional(),
  zip: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  preferred_channel: z.string().optional(),
  language: z.string().optional(),
  marketing_consent: z.boolean().optional(),
  notes: z.string().optional(),
});

type EditFormData = z.infer<typeof editSchema>;

interface CustomerInfoCardProps {
  customer: CustomerDetail;
}

export function CustomerInfoCard({ customer }: CustomerInfoCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const updateCustomer = useUpdateCustomer(customer.id);

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
      first_name: customer.first_name || "",
      last_name: customer.last_name,
      email: customer.email,
      phone: customer.phone || "",
      street: customer.street || "",
      zip: customer.zip || "",
      city: customer.city || "",
      country: customer.country || "LI",
      preferred_channel: customer.preferred_channel || "email",
      language: customer.language || "de",
      marketing_consent: customer.marketing_consent || false,
      notes: customer.notes || "",
    },
  });

  const watchedChannel = watch("preferred_channel");
  const watchedMarketingConsent = watch("marketing_consent");

  const handleCancel = () => {
    reset();
    setIsEditing(false);
  };

  const onSubmit = async (data: EditFormData) => {
    await updateCustomer.mutateAsync({
      ...data,
      first_name: data.first_name || null,
      phone: data.phone || null,
      street: data.street || null,
      zip: data.zip || null,
      city: data.city || null,
      country: data.country || null,
      notes: data.notes || null,
    });
    setIsEditing(false);
  };

  const handlePhoneBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const normalized = normalizePhoneNumber(e.target.value);
    setValue("phone", normalized);
  };

  const handleNameBlur = (field: "first_name" | "last_name") => (
    e: React.FocusEvent<HTMLInputElement>
  ) => {
    const capitalized = capitalizeName(e.target.value);
    setValue(field, capitalized);
  };

  const handlePlzChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const plz = e.target.value;
    setValue("zip", plz);
    const plzEntry = lookupPlz(plz);
    if (plzEntry) {
      setValue("city", plzEntry.city);
      setValue("country", plzEntry.country);
    }
  };

  const fullName = [customer.first_name, customer.last_name]
    .filter(Boolean)
    .join(" ");

  const channelLabels: Record<string, string> = {
    email: "E-Mail",
    whatsapp: "WhatsApp",
    phone: "Telefon",
  };

  const languageInfo = LANGUAGE_OPTIONS[customer.language || "de"];

  if (isEditing) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Kontaktdaten bearbeiten</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">Vorname</Label>
                <Input
                  id="first_name"
                  {...register("first_name")}
                  onBlur={handleNameBlur("first_name")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Nachname *</Label>
                <Input
                  id="last_name"
                  {...register("last_name")}
                  onBlur={handleNameBlur("last_name")}
                />
                {errors.last_name && (
                  <p className="text-sm text-destructive">{errors.last_name.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-Mail *</Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Telefon</Label>
              <Input
                id="phone"
                type="tel"
                {...register("phone")}
                onBlur={handlePhoneBlur}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="street">Strasse</Label>
              <Input id="street" {...register("street")} />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="zip">PLZ</Label>
                <Input
                  id="zip"
                  {...register("zip")}
                  onChange={handlePlzChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">Ort</Label>
                <Input id="city" {...register("city")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Land</Label>
                <Select
                  value={watch("country") || "LI"}
                  onValueChange={(value) => setValue("country", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LI">🇱🇮 Liechtenstein</SelectItem>
                    <SelectItem value="CH">🇨🇭 Schweiz</SelectItem>
                    <SelectItem value="AT">🇦🇹 Österreich</SelectItem>
                    <SelectItem value="DE">🇩🇪 Deutschland</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Bevorzugter Kanal</Label>
              <RadioGroup
                value={watchedChannel}
                onValueChange={(value) => setValue("preferred_channel", value)}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="email" id="channel_email" />
                  <Label htmlFor="channel_email" className="font-normal">
                    E-Mail
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="whatsapp" id="channel_whatsapp" />
                  <Label htmlFor="channel_whatsapp" className="font-normal">
                    WhatsApp
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="phone" id="channel_phone" />
                  <Label htmlFor="channel_phone" className="font-normal">
                    Telefon
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">Sprache</Label>
              <Select
                value={watch("language") || "de"}
                onValueChange={(value) => setValue("language", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="de">🇩🇪 Deutsch</SelectItem>
                  <SelectItem value="en">🇬🇧 English</SelectItem>
                  <SelectItem value="fr">🇫🇷 Français</SelectItem>
                  <SelectItem value="it">🇮🇹 Italiano</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="marketing_consent"
                checked={watchedMarketingConsent}
                onCheckedChange={(checked) =>
                  setValue("marketing_consent", checked as boolean)
                }
              />
              <Label htmlFor="marketing_consent" className="font-normal">
                Kunde hat Marketingkommunikation zugestimmt
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notizen</Label>
              <Textarea
                id="notes"
                {...register("notes")}
                placeholder="Interne Bemerkungen zum Kunden..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={handleCancel}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={updateCustomer.isPending}>
                {updateCustomer.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                <Save className="mr-2 h-4 w-4" />
                Speichern
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Kontaktdaten</CardTitle>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsEditing(true)}
          className="h-8 w-8"
        >
          <Edit className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Mail className="h-4 w-4 mt-1 text-muted-foreground" />
            <div>
              <a
                href={`mailto:${customer.email}`}
                className="text-primary hover:underline"
              >
                {customer.email}
              </a>
            </div>
          </div>

          {customer.phone && (
            <div className="flex items-start gap-3">
              <Phone className="h-4 w-4 mt-1 text-muted-foreground" />
              <a
                href={`tel:${customer.phone}`}
                className="text-primary hover:underline"
              >
                {customer.phone}
              </a>
            </div>
          )}

          {(customer.street || customer.zip || customer.city) && (
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 mt-1 text-muted-foreground" />
              <div className="text-sm">
                {customer.street && <div>{customer.street}</div>}
                <div>
                  {[customer.zip, customer.city].filter(Boolean).join(" ")}
                  {customer.country && ` ${COUNTRY_FLAGS[customer.country] || ""}`}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <Badge variant="secondary">
              {channelLabels[customer.preferred_channel || "email"]}
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-lg">{languageInfo?.flag}</span>
            <span className="text-sm">{languageInfo?.label}</span>
          </div>

          <div className="flex items-center gap-3">
            {customer.marketing_consent ? (
              <>
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-600">Marketing-Einwilligung</span>
              </>
            ) : (
              <>
                <X className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Keine Marketing-Einwilligung
                </span>
              </>
            )}
          </div>

          {/* Kulanz Score */}
          <div className="pt-2">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-muted-foreground">Kulanz-Score</span>
              <span className="font-medium">{customer.kulanz_score || 0}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${((customer.kulanz_score || 0) + 10) * 5}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>-10</span>
              <span>0</span>
              <span>+10</span>
            </div>
          </div>

          {customer.notes && (
            <div className="pt-2 border-t">
              <p className="text-sm text-muted-foreground italic">
                {customer.notes}
              </p>
            </div>
          )}

          <div className="pt-2 border-t text-xs text-muted-foreground">
            Erstellt am{" "}
            {format(new Date(customer.created_at), "d. MMMM yyyy", {
              locale: de,
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
