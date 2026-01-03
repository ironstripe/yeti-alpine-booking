import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { normalizePhoneNumber, capitalizeName } from "@/lib/phone-utils";
import { useUpdateCustomer } from "@/hooks/useUpdateCustomer";
import type { Tables } from "@/integrations/supabase/types";

const customerEditSchema = z.object({
  first_name: z.string().max(100).optional(),
  last_name: z.string().min(1, "Nachname ist erforderlich").max(100),
  email: z.string().email("Ungültige E-Mail-Adresse").max(255),
  phone: z.string().max(50).optional(),
});

type CustomerEditFormData = z.infer<typeof customerEditSchema>;

interface CustomerEditDialogProps {
  customer: Tables<"customers">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (customer: Tables<"customers">) => void;
}

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
    },
  });

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
      });

      // Return updated customer to update wizard state
      const updatedCustomer: Tables<"customers"> = {
        ...customer,
        first_name: data.first_name || null,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone || null,
      };

      onSaved(updatedCustomer);
      onOpenChange(false);
    } catch (error) {
      // Error is handled by the hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kundendaten bearbeiten</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
