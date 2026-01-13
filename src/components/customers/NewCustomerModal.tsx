import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Trash2, Star, Building2, User } from "lucide-react";
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
import { lookupPlz, CityMatch } from "@/lib/plz-lookup";
import { CityAutocomplete } from "@/components/ui/city-autocomplete";

const PHONE_LABELS = ["Mutter", "Vater", "Arbeit", "Notfall", "Sonstige"] as const;
const EMAIL_LABELS = ["Mutter", "Vater", "Arbeit", "Sonstige"] as const;
const CONTACT_ROLES = ["Hauptkontakt", "Klassenlehrer/in", "Begleitlehrer/in", "Schulleitung", "Notfallkontakt"] as const;

const contactSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  role: z.string().default("Begleitlehrer/in"),
  phone: z.string().min(1, "Telefon ist erforderlich"),
  email: z.string().email("Ungültige E-Mail").optional().or(z.literal("")),
  is_primary: z.boolean().default(false),
});

const customerSchema = z.object({
  customer_type: z.enum(["private", "school"]).default("private"),
  // Private customer fields
  salutation: z.string().optional(),
  first_name: z.string().max(100).optional(),
  last_name: z.string().min(1, "Nachname ist erforderlich").max(100),
  // School fields
  organization_name: z.string().max(200).optional(),
  billing_email: z.string().email("Ungültige E-Mail").optional().or(z.literal("")),
  // Common fields
  email: z.string().email("Ungültige E-Mail-Adresse").max(255),
  phone: z.string().max(50).optional(),
  street: z.string().max(200).optional(),
  zip: z.string().max(10).optional(),
  city: z.string().max(100).optional(),
  country: z.string().default("LI"),
  holiday_address: z.string().max(200).optional(),
  additional_phones: z.array(z.object({
    label: z.string(),
    number: z.string().max(50),
  })).default([]),
  additional_emails: z.array(z.object({
    label: z.string(),
    email: z.string().email("Ungültige E-Mail-Adresse").max(255),
  })).default([]),
  preferred_channel: z.enum(["email", "whatsapp", "phone"]).default("email"),
  language: z.string().default("de"),
  marketing_consent: z.boolean().default(false),
  notes: z.string().max(1000).optional(),
  // Contacts for schools
  contacts: z.array(contactSchema).default([]),
}).refine((data) => {
  if (data.customer_type === "private") {
    return true; // last_name is already required
  }
  if (data.customer_type === "school") {
    return !!data.organization_name && data.organization_name.length > 0;
  }
  return true;
}, {
  message: "Organisationsname ist erforderlich",
  path: ["organization_name"],
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
      customer_type: "private",
      salutation: "",
      first_name: "",
      last_name: "",
      organization_name: "",
      billing_email: "",
      email: "",
      phone: "",
      street: "",
      zip: "",
      city: "",
      country: "LI",
      holiday_address: "",
      additional_phones: [],
      additional_emails: [],
      preferred_channel: "email",
      language: "de",
      marketing_consent: false,
      notes: "",
      contacts: [],
    },
  });

  const customerType = form.watch("customer_type");

  const { fields: phoneFields, append: appendPhone, remove: removePhone } = useFieldArray({
    control: form.control,
    name: "additional_phones",
  });

  const { fields: emailFields, append: appendEmail, remove: removeEmail } = useFieldArray({
    control: form.control,
    name: "additional_emails",
  });

  const { fields: contactFields, append: appendContact, remove: removeContact, update: updateContact } = useFieldArray({
    control: form.control,
    name: "contacts",
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

  const handleAdditionalPhoneBlur = (index: number) => (e: React.FocusEvent<HTMLInputElement>) => {
    const normalized = normalizePhoneNumber(e.target.value);
    if (normalized !== e.target.value) {
      form.setValue(`additional_phones.${index}.number`, normalized);
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
      toast.success(`${result.city} erkannt`, { duration: 1500 });
    }
  };

  const handleContactPhoneBlur = (index: number) => (e: React.FocusEvent<HTMLInputElement>) => {
    const normalized = normalizePhoneNumber(e.target.value);
    if (normalized !== e.target.value) {
      form.setValue(`contacts.${index}.phone`, normalized);
    }
  };

  const setPrimaryContact = (index: number) => {
    contactFields.forEach((_, i) => {
      form.setValue(`contacts.${i}.is_primary`, i === index);
    });
  };

  const onSubmit = async (data: CustomerFormData) => {
    try {
      const isSchool = data.customer_type === "school";
      
      const customerData = {
        customer_type: data.customer_type,
        first_name: isSchool ? null : (data.first_name || null),
        last_name: data.last_name,
        organization_name: isSchool ? data.organization_name : null,
        billing_email: isSchool && data.billing_email ? data.billing_email : null,
        email: data.email,
        phone: data.phone || null,
        street: data.street || null,
        zip: data.zip || null,
        city: data.city || null,
        country: data.country,
        holiday_address: data.holiday_address || "",
        additional_phones: data.additional_phones.length > 0 ? data.additional_phones : null,
        additional_emails: data.additional_emails.length > 0 ? data.additional_emails : null,
        preferred_channel: data.preferred_channel,
        language: data.language,
        marketing_consent: data.marketing_consent,
        notes: data.notes || null,
        contacts: isSchool ? data.contacts.map((c, i) => ({
          name: c.name,
          role: c.role,
          phone: c.phone,
          email: c.email || undefined,
          is_primary: c.is_primary ?? i === 0,
        })) : undefined,
      };

      const newCustomer = await createCustomer.mutateAsync(customerData);
      
      form.reset();
      setHasUnsavedChanges(false);
      onOpenChange(false);
      
      toast.success(isSchool ? "Schule erfolgreich erstellt" : "Kunde erfolgreich erstellt", {
        action: isSchool ? {
          label: "Skilager buchen",
          onClick: () => navigate(`/bookings/new/school-camp?customer=${newCustomer.id}`),
        } : {
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
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Neuer Kunde</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Customer Type Selector */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Kundentyp</h3>
              <FormField
                control={form.control}
                name="customer_type"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="flex gap-4"
                      >
                        <div className="flex items-center space-x-2 border rounded-lg p-3 flex-1 cursor-pointer hover:bg-muted/50" onClick={() => field.onChange("private")}>
                          <RadioGroupItem value="private" id="type_private" />
                          <User className="h-4 w-4 text-muted-foreground" />
                          <label htmlFor="type_private" className="text-sm cursor-pointer">Privatkunde</label>
                        </div>
                        <div className="flex items-center space-x-2 border rounded-lg p-3 flex-1 cursor-pointer hover:bg-muted/50" onClick={() => field.onChange("school")}>
                          <RadioGroupItem value="school" id="type_school" />
                          <Building2 className="h-4 w-4 text-orange-500" />
                          <label htmlFor="type_school" className="text-sm cursor-pointer">Schule / Organisation</label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* Kontaktdaten Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Kontaktdaten</h3>
              
              {/* School: Organization Name */}
              {customerType === "school" && (
                <FormField
                  control={form.control}
                  name="organization_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Organisationsname <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="z.B. Realschule Vaduz"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Private: Salutation */}
              {customerType === "private" && (
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
              )}

              {/* Private: First/Last Name */}
              {customerType === "private" && (
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
              )}

              {/* School: Last Name (Contact Family Name) */}
              {customerType === "school" && (
                <FormField
                  control={form.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Kontaktname <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          onBlur={handleNameBlur("last_name")}
                          placeholder="Müller (Ansprechpartner)"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

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
                        placeholder={customerType === "school" ? "sekretariat@schule.ch" : "max@beispiel.ch"}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* School: Billing Email */}
              {customerType === "school" && (
                <FormField
                  control={form.control}
                  name="billing_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rechnungs-E-Mail</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          placeholder="buchhaltung@schule.ch"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

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

            {/* Private: Weitere Kontakte Section */}
            {customerType === "private" && (
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">Weitere Kontakte</h3>
                
                {/* Additional Phones */}
                <div className="space-y-3">
                  {phoneFields.map((field, index) => (
                    <div key={field.id} className="flex items-end gap-2">
                      <FormField
                        control={form.control}
                        name={`additional_phones.${index}.label`}
                        render={({ field }) => (
                          <FormItem className="w-[120px]">
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Label" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {PHONE_LABELS.map((label) => (
                                  <SelectItem key={label} value={label}>
                                    {label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`additional_phones.${index}.number`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input
                                {...field}
                                type="tel"
                                placeholder="+41 79 xxx xx xx"
                                onBlur={handleAdditionalPhoneBlur(index)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removePhone(index)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => appendPhone({ label: "Mutter", number: "" })}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Telefon hinzufügen
                  </Button>
                </div>

                {/* Additional Emails */}
                <div className="space-y-3">
                  {emailFields.map((field, index) => (
                    <div key={field.id} className="flex items-end gap-2">
                      <FormField
                        control={form.control}
                        name={`additional_emails.${index}.label`}
                        render={({ field }) => (
                          <FormItem className="w-[120px]">
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Label" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {EMAIL_LABELS.map((label) => (
                                  <SelectItem key={label} value={label}>
                                    {label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`additional_emails.${index}.email`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input
                                {...field}
                                type="email"
                                placeholder="email@beispiel.ch"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeEmail(index)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => appendEmail({ label: "Mutter", email: "" })}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    E-Mail hinzufügen
                  </Button>
                </div>
              </div>
            )}

            {/* School: Ansprechpartner Section */}
            {customerType === "school" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Ansprechpartner</h3>
                    <p className="text-xs text-muted-foreground">Begleitlehrer und Kontaktpersonen mit Mobilnummer</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => appendContact({
                      name: "",
                      role: "Begleitlehrer/in",
                      phone: "",
                      email: "",
                      is_primary: contactFields.length === 0,
                    })}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Hinzufügen
                  </Button>
                </div>

                {contactFields.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground border rounded-lg border-dashed">
                    <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Noch keine Ansprechpartner erfasst</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {contactFields.map((field, index) => (
                      <div key={field.id} className="border rounded-lg p-4 space-y-3 bg-muted/30">
                        <div className="flex items-start gap-2">
                          {/* Primary star */}
                          <button
                            type="button"
                            onClick={() => setPrimaryContact(index)}
                            className={`mt-2 ${
                              form.watch(`contacts.${index}.is_primary`)
                                ? "text-yellow-500"
                                : "text-muted-foreground hover:text-yellow-400"
                            }`}
                            title={form.watch(`contacts.${index}.is_primary`) ? "Hauptkontakt" : "Als Hauptkontakt setzen"}
                          >
                            <Star className="h-4 w-4" fill={form.watch(`contacts.${index}.is_primary`) ? "currentColor" : "none"} />
                          </button>

                          <div className="flex-1 grid grid-cols-2 gap-3">
                            <FormField
                              control={form.control}
                              name={`contacts.${index}.name`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Input {...field} placeholder="Name *" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`contacts.${index}.role`}
                              render={({ field }) => (
                                <FormItem>
                                  <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Rolle" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {CONTACT_ROLES.map((role) => (
                                        <SelectItem key={role} value={role}>
                                          {role}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`contacts.${index}.phone`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      type="tel"
                                      placeholder="Telefon *"
                                      onBlur={handleContactPhoneBlur(index)}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`contacts.${index}.email`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Input {...field} type="email" placeholder="E-Mail (optional)" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="mt-1"
                            onClick={() => removeContact(index)}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

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
                        <CityAutocomplete
                          value={field.value || ""}
                          onChange={(value) => form.setValue("city", value)}
                          onSelect={(match: CityMatch) => {
                            form.setValue("city", match.city);
                            form.setValue("zip", match.plz);
                            form.setValue("country", match.country);
                            toast.success(`${match.city} (${match.plz}) erkannt`, { duration: 1500 });
                          }}
                          placeholder="Ort eingeben..."
                        />
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

            {/* Ferienadresse Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Ferienadresse</h3>

              <FormField
                control={form.control}
                name="holiday_address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Unterkunft <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="z.B. Hotel Gorfion, Malbun"
                      />
                    </FormControl>
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
