import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

import { useCreateCustomer } from "@/hooks/useCreateCustomer";
import { normalizePhoneNumber, capitalizeName } from "@/lib/phone-utils";
import { lookupPlz } from "@/lib/plz-lookup";

const customerSchema = z.object({
  salutation: z.string().optional(),
  first_name: z.string().max(100).optional(),
  last_name: z.string().min(1, "Nachname ist erforderlich").max(100),
  email: z.string().email("Ungültige E-Mail-Adresse").max(255),
  phone: z.string().max(50).optional(),
  street: z.string().max(200).optional(),
  zip: z.string().max(10).optional(),
  city: z.string().max(100).optional(),
  country: z.string().default("LI"),
  preferred_channel: z.enum(["email", "whatsapp", "phone"]).default("email"),
  language: z.string().default("de"),
  marketing_consent: z.boolean().default(false),
  notes: z.string().max(1000).optional(),
});

type CustomerFormData = z.infer<typeof customerSchema>;

interface NewCustomerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewCustomerModal({ open, onOpenChange }: NewCustomerModalProps) {
  const navigate = useNavigate();
  const createCustomer = useCreateCustomer();
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      salutation: "",
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      street: "",
      zip: "",
      city: "",
      country: "LI",
      preferred_channel: "email",
      language: "de",
      marketing_consent: false,
      notes: "",
    },
  });

  const { isDirty } = form.formState;

  useEffect(() => {
    setHasUnsavedChanges(isDirty);
  }, [isDirty]);

  const handleOpenChange = (open: boolean) => {
    if (open) {
      onOpenChange(true);
      return;
    }
    
    // Closing - check for unsaved changes
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        "Du hast ungespeicherte Änderungen. Möchtest du wirklich schliessen?"
      );
      if (!confirmed) return;
    }
    
    form.reset();
    setHasUnsavedChanges(false);
    onOpenChange(false);
  };

  const handlePhoneBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const normalized = normalizePhoneNumber(e.target.value);
    if (normalized !== e.target.value) {
      form.setValue("phone", normalized);
    }
  };

  const handleNameBlur = (field: "first_name" | "last_name") => (
    e: React.FocusEvent<HTMLInputElement>
  ) => {
    const capitalized = capitalizeName(e.target.value);
    if (capitalized !== e.target.value) {
      form.setValue(field, capitalized);
    }
  };

  const handlePlzChange = (value: string) => {
    form.setValue("zip", value);
    const result = lookupPlz(value);
    if (result) {
      form.setValue("city", result.city);
      form.setValue("country", result.country);
    }
  };

  const onSubmit = async (data: CustomerFormData) => {
    try {
      const customerData = {
        first_name: data.first_name || null,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone || null,
        street: data.street || null,
        zip: data.zip || null,
        city: data.city || null,
        country: data.country,
        preferred_channel: data.preferred_channel,
        language: data.language,
        marketing_consent: data.marketing_consent,
        notes: data.notes || null,
      };

      const newCustomer = await createCustomer.mutateAsync(customerData);
      
      form.reset();
      setHasUnsavedChanges(false);
      onOpenChange(false);
      
      toast.success("Kunde erfolgreich erstellt", {
        action: {
          label: "Teilnehmer hinzufügen",
          onClick: () => navigate(`/customers/${newCustomer.id}`),
        },
      });
    } catch (error) {
      toast.error("Fehler beim Erstellen des Kunden");
      console.error("Error creating customer:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Neuer Kunde</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Kontaktdaten Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Kontaktdaten</h3>
              
              <FormField
                control={form.control}
                name="salutation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Anrede</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Auswählen..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="herr">Herr</SelectItem>
                        <SelectItem value="frau">Frau</SelectItem>
                        <SelectItem value="familie">Familie</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vorname</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          onBlur={handleNameBlur("first_name")}
                          placeholder="Max"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Nachname <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          onBlur={handleNameBlur("last_name")}
                          placeholder="Mustermann"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      E-Mail <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="max@beispiel.ch"
                      />
                    </FormControl>
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
                      <Input
                        {...field}
                        type="tel"
                        placeholder="+41 79 123 45 67"
                        onBlur={handlePhoneBlur}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* Adresse Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Adresse</h3>

              <FormField
                control={form.control}
                name="street"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Strasse</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Musterstrasse 123" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="zip"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PLZ</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="9490"
                          onChange={(e) => handlePlzChange(e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Ort</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Vaduz" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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
            </div>

            <Separator />

            {/* Einstellungen Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Einstellungen</h3>

              <FormField
                control={form.control}
                name="preferred_channel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bevorzugter Kanal</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="flex gap-4"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="email" id="email" />
                          <label htmlFor="email" className="text-sm">E-Mail</label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="whatsapp" id="whatsapp" />
                          <label htmlFor="whatsapp" className="text-sm">WhatsApp</label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="phone" id="phone-channel" />
                          <label htmlFor="phone-channel" className="text-sm">Telefon</label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sprache</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="de">Deutsch</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="fr">Français</SelectItem>
                        <SelectItem value="it">Italiano</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="marketing_consent"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="font-normal">
                        Kunde hat Marketingkommunikation zugestimmt
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* Notizen Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Notizen</h3>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Interne Bemerkungen zum Kunden..."
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={createCustomer.isPending}>
                {createCustomer.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Kunde erstellen
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
