import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizePhoneNumber, capitalizeName } from "@/lib/phone-utils";
import { useUpdateCustomer } from "@/hooks/useUpdateCustomer";
import type { Tables } from "@/integrations/supabase/types";

const customerEditSchema = z.object({
  first_name: z.string().max(100).optional(),
  last_name: z.string().min(1, "Nachname ist erforderlich").max(100),
  email: z.string().email("Ungültige E-Mail-Adresse").max(255),
  phone: z.string().max(50).optional(),
  street: z.string().max(200).optional(),
  zip: z.string().max(20).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  language: z.string().max(10).optional(),
  holiday_address: z.string().max(255).optional(),
});

type CustomerEditFormData = z.infer<typeof customerEditSchema>;

interface CustomerEditDialogProps {
  customer: Tables<"customers">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (customer: Tables<"customers">) => void;
}

const COUNTRY_OPTIONS = [
  { value: "CH", label: "Schweiz" },
  { value: "DE", label: "Deutschland" },
  { value: "AT", label: "Österreich" },
  { value: "LI", label: "Liechtenstein" },
  { value: "FR", label: "Frankreich" },
  { value: "IT", label: "Italien" },
];

const LANGUAGE_OPTIONS = [
  { value: "de", label: "Deutsch" },
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "it", label: "Italiano" },
];

export function CustomerEditDialog({
  customer,
  open,
  onOpenChange,
  onSaved,
}: CustomerEditDialogProps) {
  const updateCustomer = useUpdateCustomer(customer.id);

  const form = useForm<CustomerEditFormData>({
    resolver: zodResolver(customerEditSchema),
    defaultValues: {
      first_name: customer.first_name || "",
      last_name: customer.last_name || "",
      email: customer.email || "",
      phone: customer.phone || "",
      street: customer.street || "",
      zip: customer.zip || "",
      city: customer.city || "",
      country: customer.country || "",
      language: customer.language || "",
      holiday_address: customer.holiday_address || "",
    },
  });

  // Reset form when customer changes
  useEffect(() => {
    form.reset({
      first_name: customer.first_name || "",
      last_name: customer.last_name || "",
      email: customer.email || "",
      phone: customer.phone || "",
      street: customer.street || "",
      zip: customer.zip || "",
      city: customer.city || "",
      country: customer.country || "",
      language: customer.language || "",
      holiday_address: customer.holiday_address || "",
    });
  }, [customer, form]);

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

  const onSubmit = async (data: CustomerEditFormData) => {
    try {
      await updateCustomer.mutateAsync({
        first_name: data.first_name || null,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone || null,
        street: data.street || null,
        zip: data.zip || null,
        city: data.city || null,
        country: data.country || null,
        language: data.language || null,
        holiday_address: data.holiday_address || null,
      });

      // Return updated customer to update wizard state
      const updatedCustomer: Tables<"customers"> = {
        ...customer,
        first_name: data.first_name || null,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone || null,
        street: data.street || null,
        zip: data.zip || null,
        city: data.city || null,
        country: data.country || null,
        language: data.language || null,
        holiday_address: data.holiday_address || null,
      };

      onSaved(updatedCustomer);
      onOpenChange(false);
    } catch (error) {
      // Error is handled by the hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kundendaten bearbeiten</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Name Row */}
            <div className="grid grid-cols-2 gap-3">
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
                        autoComplete="off"
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
                        autoComplete="off"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Email */}
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
                      autoComplete="off"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Phone */}
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
                      autoComplete="off"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Street */}
            <FormField
              control={form.control}
              name="street"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Strasse</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Musterstrasse 12"
                      autoComplete="off"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ZIP / City Row */}
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="zip"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PLZ</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="8000"
                        autoComplete="off"
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
                      <Input
                        {...field}
                        placeholder="Zürich"
                        autoComplete="off"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Country / Language Row */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Land</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Land wählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {COUNTRY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
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
                name="language"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sprache</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sprache wählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LANGUAGE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Holiday Address */}
            <FormField
              control={form.control}
              name="holiday_address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ferienadresse / Hotel</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Hotel Malbun, Zimmer 204"
                      autoComplete="off"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={updateCustomer.isPending}>
                {updateCustomer.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Speichern
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
