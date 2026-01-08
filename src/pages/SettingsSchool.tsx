import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Building2, Upload } from "lucide-react";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useSchoolSettings, useUpdateSchoolSettings } from "@/hooks/useSchoolSettings";
import { useEffect } from "react";

const formSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  slogan: z.string().optional(),
  street: z.string().optional(),
  zip: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Ungültige E-Mail").optional().or(z.literal("")),
  website: z.string().url("Ungültige URL").optional().or(z.literal("")),
  bank_name: z.string().optional(),
  iban: z.string().optional(),
  bic: z.string().optional(),
  account_holder: z.string().optional(),
  vat_number: z.string().optional(),
  lesson_morning_start: z.string().optional(),
  lesson_morning_end: z.string().optional(),
  lesson_afternoon_start: z.string().optional(),
  lesson_afternoon_end: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function SettingsSchool() {
  const { data: settings, isLoading } = useSchoolSettings();
  const updateSettings = useUpdateSchoolSettings();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      slogan: "",
      street: "",
      zip: "",
      city: "",
      country: "LI",
      phone: "",
      email: "",
      website: "",
      bank_name: "",
      iban: "",
      bic: "",
      account_holder: "",
      vat_number: "",
      lesson_morning_start: "10:00",
      lesson_morning_end: "12:00",
      lesson_afternoon_start: "14:00",
      lesson_afternoon_end: "16:00",
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        name: settings.name || "",
        slogan: settings.slogan || "",
        street: settings.street || "",
        zip: settings.zip || "",
        city: settings.city || "",
        country: settings.country || "LI",
        phone: settings.phone || "",
        email: settings.email || "",
        website: settings.website || "",
        bank_name: settings.bank_name || "",
        iban: settings.iban || "",
        bic: settings.bic || "",
        account_holder: settings.account_holder || "",
        vat_number: settings.vat_number || "",
        lesson_morning_start: settings.lesson_times?.morning?.start || "10:00",
        lesson_morning_end: settings.lesson_times?.morning?.end || "12:00",
        lesson_afternoon_start: settings.lesson_times?.afternoon?.start || "14:00",
        lesson_afternoon_end: settings.lesson_times?.afternoon?.end || "16:00",
      });
    }
  }, [settings, form]);

  const onSubmit = (data: FormData) => {
    updateSettings.mutate({
      name: data.name,
      slogan: data.slogan || null,
      street: data.street || null,
      zip: data.zip || null,
      city: data.city || null,
      country: data.country || null,
      phone: data.phone || null,
      email: data.email || null,
      website: data.website || null,
      bank_name: data.bank_name || null,
      iban: data.iban || null,
      bic: data.bic || null,
      account_holder: data.account_holder || null,
      vat_number: data.vat_number || null,
      lesson_times: {
        morning: { start: data.lesson_morning_start || "10:00", end: data.lesson_morning_end || "12:00" },
        afternoon: { start: data.lesson_afternoon_start || "14:00", end: data.lesson_afternoon_end || "16:00" },
      },
    });
  };

  if (isLoading) {
    return (
      <SettingsLayout title="Skischul-Profil" description="Grundeinstellungen deiner Skischule">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout title="Skischul-Profil" description="Grundeinstellungen deiner Skischule">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Logo Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Logo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="w-32 h-20 bg-muted rounded-lg flex items-center justify-center border-2 border-dashed border-border">
                  {settings?.logo_url ? (
                    <img src={settings.logo_url} alt="Logo" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <Building2 className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <Button type="button" variant="outline" size="sm" disabled>
                    <Upload className="h-4 w-4 mr-2" />
                    Logo hochladen
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    PNG oder SVG, max. 2MB. Empfohlen: 200x80px
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Grundinformationen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name der Skischule *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="slogan"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slogan / Untertitel</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Skifahren lernen mit Spass" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Contact */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Kontaktdaten</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="street"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Strasse</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex gap-2">
                  <FormField
                    control={form.control}
                    name="zip"
                    render={({ field }) => (
                      <FormItem className="w-24">
                        <FormLabel>PLZ</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel>Ort</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Land</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="LI">Liechtenstein</SelectItem>
                          <SelectItem value="CH">Schweiz</SelectItem>
                          <SelectItem value="AT">Österreich</SelectItem>
                          <SelectItem value="DE">Deutschland</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefon</FormLabel>
                      <FormControl>
                        <Input {...field} type="tel" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-Mail</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="website"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Website</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="https://" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Banking */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bankverbindung (für Rechnungen)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="bank_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="iban"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>IBAN</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="bic"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>BIC/SWIFT</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="account_holder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kontoinhaber</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="vat_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>MwSt-Nr. (optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="CHE-123.456.789" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Lesson Times */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Unterrichtszeiten</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium mb-2 block">Vormittag</Label>
                  <div className="flex items-center gap-2">
                    <FormField
                      control={form.control}
                      name="lesson_morning_start"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input {...field} type="time" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <span className="text-muted-foreground">-</span>
                    <FormField
                      control={form.control}
                      name="lesson_morning_end"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input {...field} type="time" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium mb-2 block">Nachmittag</Label>
                  <div className="flex items-center gap-2">
                    <FormField
                      control={form.control}
                      name="lesson_afternoon_start"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input {...field} type="time" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <span className="text-muted-foreground">-</span>
                    <FormField
                      control={form.control}
                      name="lesson_afternoon_end"
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input {...field} type="time" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={updateSettings.isPending}>
              {updateSettings.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Speichern
            </Button>
          </div>
        </form>
      </Form>
    </SettingsLayout>
  );
}
